const axios = require('axios');

/* ------------------------------------------------------------------ */
/*  Pure NBA CDN approach — no external API keys needed                */
/*    • CDN schedule    → team game IDs                               */
/*    • CDN box scores  → per-player stats per game                   */
/*    • Player→team map built from box scores we’ve already fetched    */
/* ------------------------------------------------------------------ */
const CDN_BASE = 'https://cdn.nba.com/static/json';

/* ---- Caching ---- */
const cache = {};
function getCached(key, ttl = 5 * 60 * 1000) {
  const e = cache[key];
  if (e && Date.now() - e.ts < ttl) return e.data;
  return null;
}
function setCache(key, data) { cache[key] = { data, ts: Date.now() }; }

/* ---- Persistent player→team index built from observed box scores ---- */
const playerIndex = {}; // lowercased name → { teamAbbr, personId }

function indexPlayersFromBox(box) {
  for (const side of ['homeTeam', 'awayTeam']) {
    const team = box[side];
    if (!team) continue;
    for (const p of team.players || []) {
      if (!p.name) continue;
      playerIndex[p.name.toLowerCase()] = {
        teamAbbr: team.teamTricode,
        personId: p.personId,
      };
    }
  }
}

/** Look up a player's NBA personId (for headshot URLs). */
function getPersonId(name) {
  return playerIndex[name.toLowerCase().trim()]?.personId || null;
}

/**
 * Resolve a player name to their team abbreviation.
 * Uses: 1) explicit teamHint  2) playerIndex from previous box scores
 *       3) BallDontLie player search (fallback, best-effort)
 */
async function resolvePlayerTeam(name, teamHint) {
  // Ensure schedule is loaded so teamNameToAbbr is populated
  await getSchedule();
  if (teamHint) {
    const resolved = normalizeTeamAbbr(teamHint);
    if (resolved) return resolved;
    // If it's a 3-letter code already, use as-is
    if (teamHint.length === 3) return teamHint.toUpperCase();
  }
  const key = name.toLowerCase().trim();
  if (playerIndex[key]) return playerIndex[key].teamAbbr;

  // Fallback: BallDontLie player search (free tier, may rate-limit)
  try {
    const cacheKey = `bdl:${key}`;
    const cached = getCached(cacheKey, 60 * 60 * 1000);
    if (cached) return cached;
    const headers = { Authorization: process.env.BALLDONTLIE_API_KEY };
    const { data } = await axios.get('https://api.balldontlie.io/nba/v1/players', {
      params: { search: name }, headers, timeout: 8000,
    });
    const p = data.data?.[0];
    if (p?.team?.abbreviation) {
      setCache(cacheKey, p.team.abbreviation);
      return p.team.abbreviation;
    }
  } catch (_) { /* swallow — rate limit or network error */ }
  return null;
}

async function searchPlayer(name) {
  const teamAbbr = await resolvePlayerTeam(name);
  if (!teamAbbr) return null;
  return { name, teamAbbr, position: null };
}

/* ---- NBA CDN schedule (cached 4 hours) ---- */
let scheduleCache = { data: null, ts: 0 };
const SCHEDULE_TTL = 4 * 60 * 60 * 1000;
const teamNameToAbbr = {}; // "Los Angeles Lakers" → "LAL"

async function getSchedule() {
  if (scheduleCache.data && Date.now() - scheduleCache.ts < SCHEDULE_TTL) {
    return scheduleCache.data;
  }
  const { data } = await axios.get(`${CDN_BASE}/staticData/scheduleLeagueV2.json`, {
    timeout: 15000,
  });
  const allGames = data.leagueSchedule.gameDates.flatMap((d) => d.games);
  // Build team name → abbreviation mapping from schedule
  for (const g of allGames) {
    for (const side of ['homeTeam', 'awayTeam']) {
      const t = g[side];
      if (t?.teamName && t?.teamTricode) {
        // "Lakers" → "LAL", "Los Angeles Lakers" → "LAL"
        const full = `${t.teamCity || ''} ${t.teamName}`.trim().toLowerCase();
        teamNameToAbbr[full] = t.teamTricode;
        teamNameToAbbr[t.teamName.toLowerCase()] = t.teamTricode;
        teamNameToAbbr[t.teamTricode.toLowerCase()] = t.teamTricode;
      }
    }
  }
  scheduleCache = { data: allGames, ts: Date.now() };
  return allGames;
}

/** Resolve a team name/abbreviation to the 3-letter code. */
function normalizeTeamAbbr(nameOrAbbr) {
  if (!nameOrAbbr) return null;
  const key = nameOrAbbr.trim().toLowerCase();
  if (key.length === 3 && key === key.toUpperCase?.()) return nameOrAbbr.toUpperCase();
  return teamNameToAbbr[key] || null;
}

/**
 * Get the last N completed game IDs for a team.
 * Completed = regular-season games with a date before now.
 */
async function getTeamRecentGameIds(teamAbbr, count = 25) {
  const schedule = await getSchedule();
  const now = new Date();
  return schedule
    .filter((g) => {
      const isTeam =
        g.homeTeam?.teamTricode === teamAbbr ||
        g.awayTeam?.teamTricode === teamAbbr;
      if (!isTeam) return false;
      const gameDate = new Date(g.gameDateTimeUTC);
      return gameDate < now && g.gameId?.startsWith('002'); // 002 = regular season
    })
    .sort((a, b) => new Date(b.gameDateTimeUTC) - new Date(a.gameDateTimeUTC))
    .slice(0, count)
    .map((g) => ({
      gameId: g.gameId,
      date: g.gameDateTimeUTC,
      homeAbbr: g.homeTeam?.teamTricode,
      awayAbbr: g.awayTeam?.teamTricode,
    }));
}

/**
 * Fetch a single box score from the NBA CDN. Cached 24h.
 * Also indexes all player→team mappings from the box score.
 */
async function getBoxScore(gameId) {
  const cacheKey = `box:${gameId}`;
  const cached = getCached(cacheKey, 24 * 60 * 60 * 1000);
  if (cached) return cached;

  const { data } = await axios.get(
    `${CDN_BASE}/liveData/boxscore/boxscore_${gameId}.json`,
    { timeout: 10000 },
  );
  const game = data.game;
  indexPlayersFromBox(game); // build player→team index
  setCache(cacheKey, game);
  return game;
}

/**
 * Extract a player's stats from a box score by matching name.
 */
function extractPlayerStats(boxScore, playerName) {
  const nameLower = playerName.toLowerCase();
  const allPlayers = [
    ...(boxScore.homeTeam?.players || []),
    ...(boxScore.awayTeam?.players || []),
  ];
  return allPlayers.find(
    (p) => p.name && p.name.toLowerCase() === nameLower,
  ) || null;
}

/** Parse "PT37M52.00S" → 38 (minutes as integer) */
function parseMinutes(min) {
  if (!min) return 0;
  if (typeof min === 'number') return min;
  const m = min.match(/PT(\d+)M/);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Fetch game logs for a player name.
 * Returns array (newest first) of { points, assists, rebounds, minutes, fga, fta, tpa, fouls, date, opp, playerTeam, position }.
 */
async function getPlayerGameLogs(name, teamHint, teamCandidates) {
  const cacheKey = `logs:${name.toLowerCase().trim()}`;
  const cached = getCached(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;

  let teamAbbr = await resolvePlayerTeam(name, teamHint);

  // If no team resolved yet, try candidate teams (from odds data)
  if (!teamAbbr && teamCandidates) {
    for (const candidate of teamCandidates) {
      const abbr = normalizeTeamAbbr(candidate);
      if (!abbr) continue;
      // Fetch a recent box score for this team to populate playerIndex
      const games = await getTeamRecentGameIds(abbr, 1);
      if (games.length > 0) {
        try { await getBoxScore(games[0].gameId); } catch (_) {}
      }
      // Check if player now appears in index
      if (playerIndex[name.toLowerCase().trim()]) {
        teamAbbr = playerIndex[name.toLowerCase().trim()].teamAbbr;
        break;
      }
    }
  }

  if (!teamAbbr) return [];

  const recentGames = await getTeamRecentGameIds(teamAbbr, 25);
  if (recentGames.length === 0) return [];

  // Fetch box scores in parallel (limit concurrency to 5)
  const logs = [];
  for (let i = 0; i < recentGames.length; i += 5) {
    const batch = recentGames.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map((g) => getBoxScore(g.gameId)),
    );
    for (let j = 0; j < results.length; j++) {
      if (results[j].status !== 'fulfilled') continue;
      const box = results[j].value;
      const gInfo = batch[j];
      const pStats = extractPlayerStats(box, name);
      if (!pStats || !pStats.statistics) continue;
      const s = pStats.statistics;
      const opp = gInfo.homeAbbr === teamAbbr ? gInfo.awayAbbr : gInfo.homeAbbr;
      logs.push({
        points: s.points || 0,
        assists: s.assists || 0,
        rebounds: s.reboundsTotal || 0,
        minutes: parseMinutes(s.minutesCalculated || s.minutes),
        fga: s.fieldGoalsAttempted || 0,
        fta: s.freeThrowsAttempted || 0,
        tpa: s.threePointersAttempted || 0,
        fouls: s.foulsPersonal || 0,
        date: gInfo.date,
        opp,
        playerTeam: teamAbbr,
        position: playerIndex[name.toLowerCase()]?.position || null,
      });
    }
  }

  setCache(cacheKey, logs);
  return logs;
}

/**
 * Resolve a stat value from a game log entry, supporting combo stats.
 * e.g. 'points', 'pts+ast', 'pts+reb', 'reb+ast', 'pts+ast+reb'
 */
function resolveStatValue(log, statKey) {
  const FIELD_MAP = {
    points: 'points', pts: 'points',
    assists: 'assists', ast: 'assists',
    rebounds: 'rebounds', reb: 'rebounds',
    threes: 'tpa', tpa: 'tpa',
  };
  if (statKey.includes('+')) {
    return statKey.split('+').reduce((sum, part) => {
      const field = FIELD_MAP[part.trim()] || part.trim();
      return sum + (log[field] || 0);
    }, 0);
  }
  const field = FIELD_MAP[statKey] || statKey;
  return log[field] || 0;
}

/**
 * Calculate hit rates for a stat over different windows.
 * @param {Array} gameLogs — array from getPlayerGameLogs
 * @param {string} statKey — e.g. 'points', 'assists', 'pts+ast'
 * @param {number} line — the prop line to compare against
 * @returns {{ last5, last10, last20, season }}
 */
function calculateHitRate(gameLogs, statKey, line) {
  const compute = (slice) => {
    if (slice.length === 0) return 0;
    const hits = slice.filter((g) => resolveStatValue(g, statKey) > line).length;
    return Math.round((hits / slice.length) * 100);
  };

  return {
    last5: compute(gameLogs.slice(0, 5)),
    last10: compute(gameLogs.slice(0, 10)),
    last20: compute(gameLogs.slice(0, 20)),
    season: compute(gameLogs),
  };
}

/**
 * Calculate H2H hit rate — filters logs by opponent, then computes hit rate.
 */
function calculateH2HHitRate(gameLogs, opponent, statKey, line) {
  if (!opponent) return null;
  const oppLower = opponent.toLowerCase();
  const h2hLogs = gameLogs.filter(
    (g) => g.opp && g.opp.toLowerCase().includes(oppLower),
  );
  if (h2hLogs.length === 0) return null;
  const hits = h2hLogs.filter((g) => resolveStatValue(g, statKey) > line).length;
  return Math.round((hits / h2hLogs.length) * 100);
}

module.exports = {
  getPlayerGameLogs,
  calculateHitRate,
  calculateH2HHitRate,
  resolveStatValue,
  searchPlayer,
  getPersonId,
};
