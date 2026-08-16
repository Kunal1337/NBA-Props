const { runWnbaScript } = require('./pythonRunner');
const { calculateHitRate, calculateH2HHitRate, resolveStatValue } = require('./nbaService');

/* ---- Caching (mirrors nbaService.js's pattern) ---- */
const cache = {};
function getCached(key, ttl) {
  const e = cache[key];
  if (e && Date.now() - e.ts < ttl) return e.data;
  return null;
}
function setCache(key, data) { cache[key] = { data, ts: Date.now() }; }

/* ---- Player index, populated as game logs are fetched ---- */
const playerIndex = {}; // lowercased name -> { personId, teamAbbr, position }

function getPersonId(name) {
  return playerIndex[name.toLowerCase().trim()]?.personId || null;
}

/**
 * Fetch game logs for a WNBA player via nba_api (LeagueID='10').
 * Signature matches nbaService.getPlayerGameLogs for interface parity —
 * teamHint/teamCandidates are unused here since nba_api's static player
 * lookup by name doesn't need a team disambiguation fallback.
 */
async function getPlayerGameLogs(name) {
  const key = name.toLowerCase().trim();
  const cacheKey = `wnba:logs:${key}`;
  const cached = getCached(cacheKey, 5 * 60 * 1000);
  if (cached) return cached;

  let result;
  try {
    result = await runWnbaScript(['game-log', name]);
  } catch (err) {
    console.error(`[wnbaService] game-log failed for "${name}":`, err.message);
    return [];
  }

  playerIndex[key] = {
    personId: result.personId,
    teamAbbr: result.teamAbbr,
    position: result.position,
  };

  const logs = result.games || [];
  setCache(cacheKey, logs);
  return logs;
}

async function searchPlayer(name) {
  const logs = await getPlayerGameLogs(name);
  if (logs.length === 0) return null;
  const idx = playerIndex[name.toLowerCase().trim()];
  return { name, teamAbbr: idx?.teamAbbr || null, position: idx?.position || null };
}

module.exports = {
  getPlayerGameLogs,
  getPersonId,
  searchPlayer,
  calculateHitRate,
  calculateH2HHitRate,
  resolveStatValue,
};
