const { fetchAllProps } = require('./oddsService');
const nbaService = require('./nbaService');
const wnbaService = require('./wnbaService');
const matchupService = require('./matchupService');
const wnbaMatchupService = require('./wnbaMatchupService');

const LEAGUES = ['nba', 'wnba'];

function statsServiceFor(league) {
  return league === 'wnba' ? wnbaService : nbaService;
}
function matchupServiceFor(league) {
  return league === 'wnba' ? wnbaMatchupService : matchupService;
}

/* ---- In-memory cache, per league ---- */
const enrichedCache = { nba: null, wnba: null };
const refreshing = { nba: false, wnba: false };

function getEnrichedProps(league = 'nba') {
  return enrichedCache[league] ?? enrichedCache.nba;
}

/* ---- Helpers (moved from routes/props.js) ---- */

const STAT_MAP = {
  Points: 'points',
  Assists: 'assists',
  Rebounds: 'rebounds',
  Threes: 'tpm',
  'Pts+Ast': 'pts+ast',
  'Pts+Reb': 'pts+reb',
  'Reb+Ast': 'reb+ast',
  'Pts+Ast+Reb': 'pts+ast+reb',
};

function mapStatType(displayType) {
  return STAT_MAP[displayType] || 'points';
}

function computeMatchupRating(hitRates) {
  const vals = [hitRates.last5, hitRates.last10, hitRates.last20].filter(
    (v) => v !== null,
  );
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function computeBestLine(odds) {
  if (!odds || Object.keys(odds).length === 0) return null;
  let best = Infinity;
  for (const bk of Object.values(odds)) {
    if (bk.line != null && bk.line < best) best = bk.line;
  }
  return best === Infinity ? null : best;
}

function computeBestOver(odds) {
  if (!odds || Object.keys(odds).length === 0) return null;
  let bestBook = null;
  let bestPrice = -Infinity;
  for (const [bk, v] of Object.entries(odds)) {
    if (v.over != null && v.over > bestPrice) {
      bestPrice = v.over;
      bestBook = bk;
    }
  }
  return bestBook ? { book: bestBook, price: bestPrice } : null;
}

function separateOdds(odds) {
  const overOdds = {};
  const underOdds = {};
  if (!odds) return { overOdds, underOdds };
  for (const [bk, v] of Object.entries(odds)) {
    if (v.over != null) overOdds[bk] = v.over;
    if (v.under != null) underOdds[bk] = v.under;
  }
  return { overOdds, underOdds };
}

/* ---- Enrich a single prop (with timeout) ---- */

async function enrichProp(prop, league) {
  const { getPlayerGameLogs, calculateHitRate, calculateH2HHitRate, getPersonId } = statsServiceFor(league);
  const { getMatchupRating } = matchupServiceFor(league);

  let hitRates = { last5: null, last10: null, last20: null, season: null, h2h: null };
  let matchupRating = null;
  let opponentRankVsPosition = null;
  let position = null;

  try {
    const logs = await Promise.race([
      getPlayerGameLogs(prop.player, null, [prop.homeTeam, prop.awayTeam]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ]);
    if (logs.length > 0) {
      const statKey = mapStatType(prop.statType);
      hitRates = calculateHitRate(logs, statKey, prop.line);
      matchupRating = computeMatchupRating(hitRates);
      position = logs[0].position || null;

      const opponent = prop.awayTeam || prop.homeTeam;
      hitRates.h2h = calculateH2HHitRate(logs, opponent, statKey, prop.line);

      if (opponent && position) {
        try {
          opponentRankVsPosition = await getMatchupRating(opponent, position);
        } catch (_) {}
      }
    }
  } catch (_) {
    // Swallow — hit rates stay null
  }

  const { overOdds, underOdds } = separateOdds(prop.odds);

  return {
    player: prop.player,
    personId: getPersonId(prop.player),
    homeTeam: prop.homeTeam,
    awayTeam: prop.awayTeam,
    statType: prop.statType,
    line: prop.line,
    bestLine: computeBestLine(prop.odds),
    bestOver: computeBestOver(prop.odds),
    odds: prop.odds,
    overOdds,
    underOdds,
    hitRates,
    matchupRating,
    opponentRankVsPosition,
    position,
    commenceTime: prop.commenceTime,
  };
}

/* ---- Full refresh (concurrency-limited) ---- */

async function refreshEnrichedProps(league = 'nba') {
  if (refreshing[league]) return;
  refreshing[league] = true;
  console.log(`[enrichment:${league}] Starting props refresh...`);
  const start = Date.now();

  try {
    const rawProps = await fetchAllProps(league);
    const enriched = [];
    const BATCH = 5;

    for (let i = 0; i < rawProps.length; i += BATCH) {
      const batch = rawProps.slice(i, i + BATCH);
      const results = await Promise.allSettled(batch.map((p) => enrichProp(p, league)));
      for (const r of results) {
        if (r.status === 'fulfilled') enriched.push(r.value);
      }
    }

    enrichedCache[league] = enriched;
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[enrichment:${league}] Refresh complete: ${enriched.length} props in ${elapsed}s`);
  } catch (err) {
    console.error(`[enrichment:${league}] Refresh failed:`, err.message);
  } finally {
    refreshing[league] = false;
  }

  return enrichedCache[league];
}

/* ---- Pre-warm matchups cache ---- */

async function refreshMatchups(league = 'nba') {
  console.log(`[enrichment:${league}] Pre-warming matchups cache...`);
  try {
    await matchupServiceFor(league).getDefensiveRankings();
    console.log(`[enrichment:${league}] Matchups cache ready`);
  } catch (err) {
    console.error(`[enrichment:${league}] Matchups pre-warm failed:`, err.message);
  }
}

module.exports = {
  LEAGUES,
  getEnrichedProps,
  refreshEnrichedProps,
  refreshMatchups,
};
