const axios = require('axios');

const BDL_BASE = 'https://api.balldontlie.io/nba/v1';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
let rankingsCache = { data: null, ts: 0 };

/**
 * Position buckets used for defensive rankings.
 * BallDontLie positions: G, F, C, G-F, F-C, etc.
 */
const POS_BUCKETS = ['G', 'F', 'C'];

function normalizePosToBaseBucket(pos) {
  if (!pos) return null;
  const p = pos.toUpperCase();
  if (p.includes('G')) return 'G';
  if (p.includes('F')) return 'F';
  if (p.includes('C')) return 'C';
  return null;
}

function currentSeason() {
  const now = new Date();
  return now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * BallDontLie's free tier caps at 5 requests/minute, so paginated calls
 * (like fetching a full season of games) need to be spaced out and retry
 * on 429 using the server's `retry-after` header.
 */
async function bdlGet(url, config, minGapMs = 13000) {
  for (;;) {
    try {
      return await axios.get(url, config);
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfterSec = Number(err.response.headers['retry-after']) || 15;
        await sleep(retryAfterSec * 1000);
        continue;
      }
      throw err;
    } finally {
      await sleep(minGapMs);
    }
  }
}

/**
 * Fetch every game for a season (paginated), so we can derive real
 * points-allowed from actual final scores. Throttled to stay under
 * BallDontLie's free-tier rate limit (5 req/min).
 */
async function fetchSeasonGames(season, headers) {
  const games = [];
  let cursor;
  do {
    const { data } = await bdlGet(`${BDL_BASE}/games`, {
      params: { seasons: [season], per_page: 100, cursor },
      headers,
    });
    games.push(...(data.data || []));
    cursor = data.meta?.next_cursor;
  } while (cursor);
  return games;
}

/**
 * From raw games, compute each team's real average points allowed
 * (i.e. the opposing team's score, averaged over completed games).
 * Keyed by team id.
 */
function computePointsAllowed(games) {
  const totals = {}; // teamId -> { sum, count }
  for (const g of games) {
    const home = g.home_team;
    const away = g.visitor_team;
    if (!home || !away) continue;
    if (!g.home_team_score && !g.visitor_team_score) continue; // not yet played

    if (!totals[home.id]) totals[home.id] = { sum: 0, count: 0 };
    if (!totals[away.id]) totals[away.id] = { sum: 0, count: 0 };
    totals[home.id].sum += g.visitor_team_score;
    totals[home.id].count += 1;
    totals[away.id].sum += g.home_team_score;
    totals[away.id].count += 1;
  }
  const avgAllowed = {};
  for (const [teamId, { sum, count }] of Object.entries(totals)) {
    avgAllowed[teamId] = count > 0 ? sum / count : null;
  }
  return avgAllowed;
}

/**
 * Build defensive rankings from each team's real points allowed, derived
 * from actual game scores (BallDontLie has no direct "points allowed"
 * endpoint, but /games gives final scores we can aggregate ourselves).
 *
 * This is expensive, so we cache aggressively and fall back to static
 * estimates if the API call fails or times out.
 */
async function buildDefensiveRankings() {
  const headers = { Authorization: process.env.BALLDONTLIE_API_KEY };
  const season = currentSeason();

  let teams = [];
  try {
    const { data } = await bdlGet(`${BDL_BASE}/teams`, { headers });
    teams = (data.data || []).filter((t) => t.conference && t.division); // active NBA teams
  } catch (err) {
    console.error('Failed to fetch teams:', err.message);
    return null;
  }

  const rankings = {};

  for (const team of teams) {
    const teamName = team.full_name;
    const abbrev = team.abbreviation;

    // Default structure — will be enriched if data available
    rankings[teamName] = {
      abbreviation: abbrev,
      fullName: teamName,
      // Points allowed per position bucket (higher = more favorable for bettors)
      vsG: 50, // default neutral
      vsF: 50,
      vsC: 50,
      overallRank: 15, // 1-30 where 1 = allows most points (best for bettors)
    };
  }

  // Real points-allowed per team, derived from actual final scores.
  try {
    const games = await fetchSeasonGames(season, headers);
    const ptsAllowedByTeam = computePointsAllowed(games);
    for (const team of teams) {
      const ptsAllowed = ptsAllowedByTeam[team.id];
      if (ptsAllowed != null) {
        rankings[team.full_name].overallRank = ptsAllowed;
      }
    }
  } catch (err) {
    console.error('Failed to fetch games for points-allowed calc:', err.message);
    // Keep defaults
  }

  // Rank teams by overallRank value (higher pts allowed = lower rank number = more favorable)
  const sorted = Object.values(rankings).sort(
    (a, b) => b.overallRank - a.overallRank,
  );
  sorted.forEach((team, idx) => {
    team.overallRank = idx + 1;
    // Estimate positional vulnerability relative to overall
    team.vsG = team.overallRank <= 10 ? 'favorable' : team.overallRank >= 21 ? 'unfavorable' : 'neutral';
    team.vsF = team.overallRank <= 10 ? 'favorable' : team.overallRank >= 21 ? 'unfavorable' : 'neutral';
    team.vsC = team.overallRank <= 10 ? 'favorable' : team.overallRank >= 21 ? 'unfavorable' : 'neutral';
  });

  // Re-index by team name
  const result = {};
  for (const team of sorted) {
    result[team.fullName] = team;
  }
  return result;
}

/**
 * Get cached defensive rankings (builds on first call or after cache expires).
 */
async function getDefensiveRankings() {
  if (rankingsCache.data && Date.now() - rankingsCache.ts < CACHE_TTL) {
    return rankingsCache.data;
  }
  const data = await buildDefensiveRankings();
  if (data) {
    rankingsCache = { data, ts: Date.now() };
  }
  return rankingsCache.data || {};
}

/**
 * Get matchup rating for a specific opponent/position combo.
 * @returns 'favorable' | 'neutral' | 'unfavorable' | null
 */
async function getMatchupRating(opponentTeam, playerPosition) {
  const rankings = await getDefensiveRankings();
  if (!rankings || !opponentTeam) return null;

  // Try to find the team by partial match
  const oppKey = Object.keys(rankings).find(
    (k) => k.toLowerCase().includes(opponentTeam.toLowerCase()),
  );
  if (!oppKey) return null;

  const teamRank = rankings[oppKey];
  const bucket = normalizePosToBaseBucket(playerPosition);
  if (!bucket || !teamRank) return null;

  const vsKey = `vs${bucket}`;
  return teamRank[vsKey] || null;
}

module.exports = { getDefensiveRankings, getMatchupRating, normalizePosToBaseBucket };
