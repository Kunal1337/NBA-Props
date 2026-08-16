const { runWnbaScript } = require('./pythonRunner');
const { calculateHitRate, calculateH2HHitRate, resolveStatValue } = require('./nbaService');

/* ---- Caching (mirrors nbaService.js's pattern) ---- */
const cache = {};
const CACHE_TTL = 5 * 60 * 1000;
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

function storeResult(name, result) {
  const key = name.toLowerCase().trim();
  playerIndex[key] = {
    personId: result.personId,
    teamAbbr: result.teamAbbr,
    position: result.position,
  };
  const logs = result.games || [];
  setCache(`wnba:logs:${key}`, logs);
  return logs;
}

const BATCH_CHUNK_SIZE = 15;
const BATCH_TIMEOUT_MS = 90_000;

/**
 * Pre-fetch game logs for many players via as few Python process spawns
 * as possible (see game-logs-batch in wnba_stats.py). A fresh Python
 * process pays nba_api's numpy/pandas import cost every time, which is
 * cheap locally but timed out under Render's free-tier 0.1 CPU when the
 * app spawned one process per player concurrently. Batching — and running
 * batches sequentially, not in parallel — keeps process count and CPU
 * contention low. Call this before enriching a set of props so the
 * per-prop loop hits cache instead of spawning per-player processes.
 */
async function prefetchGameLogs(names) {
  const unique = [...new Set(names.map((n) => n.toLowerCase().trim()))]
    .filter((key) => !getCached(`wnba:logs:${key}`, CACHE_TTL));
  if (unique.length === 0) return;

  // Preserve original-cased names for the python script / error messages.
  const byKey = {};
  for (const n of names) byKey[n.toLowerCase().trim()] = n;
  const pending = unique.map((key) => byKey[key]);

  for (let i = 0; i < pending.length; i += BATCH_CHUNK_SIZE) {
    const chunk = pending.slice(i, i + BATCH_CHUNK_SIZE);
    try {
      const results = await runWnbaScript(['game-logs-batch'], {
        stdin: JSON.stringify(chunk),
        timeoutMs: BATCH_TIMEOUT_MS,
      });
      for (const name of chunk) {
        const r = results[name];
        if (!r || r.error) {
          console.error(`[wnbaService] game-logs-batch: "${name}" -> ${r?.error || 'missing from response'}`);
          continue;
        }
        storeResult(name, r);
      }
    } catch (err) {
      console.error(`[wnbaService] game-logs-batch failed for chunk [${chunk.join(', ')}]:`, err.message);
    }
  }
}

/**
 * Fetch game logs for a WNBA player via nba_api (LeagueID='10').
 * Signature matches nbaService.getPlayerGameLogs for interface parity —
 * teamHint/teamCandidates are unused here since nba_api's static player
 * lookup by name doesn't need a team disambiguation fallback.
 */
async function getPlayerGameLogs(name) {
  const key = name.toLowerCase().trim();
  const cached = getCached(`wnba:logs:${key}`, CACHE_TTL);
  if (cached) return cached;

  let result;
  try {
    result = await runWnbaScript(['game-log', name]);
  } catch (err) {
    console.error(`[wnbaService] game-log failed for "${name}":`, err.message);
    return [];
  }

  return storeResult(name, result);
}

async function searchPlayer(name) {
  const logs = await getPlayerGameLogs(name);
  if (logs.length === 0) return null;
  const idx = playerIndex[name.toLowerCase().trim()];
  return { name, teamAbbr: idx?.teamAbbr || null, position: idx?.position || null };
}

module.exports = {
  getPlayerGameLogs,
  prefetchGameLogs,
  getPersonId,
  searchPlayer,
  calculateHitRate,
  calculateH2HHitRate,
  resolveStatValue,
};
