const express = require('express');
const router = express.Router();
const { fetchAllProps } = require('../services/oddsService');
const {
  getPlayerGameLogs,
  calculateHitRate,
  calculateH2HHitRate,
  getPersonId,
} = require('../services/nbaService');
const { getMatchupRating } = require('../services/matchupService');

/**
 * GET /api/props
 * Returns player prop objects enriched with hit rates, best line, and matchup data.
 */
router.get('/props', async (_req, res) => {
  try {
    const rawProps = await fetchAllProps();

    const enriched = await Promise.all(
      rawProps.map(async (prop) => {
        let hitRates = { last5: null, last10: null, last20: null, season: null, h2h: null };
        let matchupRating = null;
        let opponentRankVsPosition = null;
        let position = null;

        try {
          const logs = await getPlayerGameLogs(
            prop.player,
            null,
            [prop.homeTeam, prop.awayTeam], // pass both teams for lookup
          );
          if (logs.length > 0) {
            const statKey = mapStatType(prop.statType);
            hitRates = calculateHitRate(logs, statKey, prop.line);
            matchupRating = computeMatchupRating(hitRates);
            position = logs[0].position || null;

            // H2H hit rate against today's opponent
            const opponent = prop.awayTeam || prop.homeTeam;
            hitRates.h2h = calculateH2HHitRate(logs, opponent, statKey, prop.line);

            // Defensive matchup rating
            if (opponent && position) {
              try {
                opponentRankVsPosition = await getMatchupRating(opponent, position);
              } catch (_) {}
            }
          }
        } catch (err) {
          // Swallow — hit rates will be null
        }

        // Compute best line (lowest over line across bookmakers)
        const bestLine = computeBestLine(prop.odds);
        // Separate over/under odds
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
      }),
    );

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/props error:', err.message);
    res.status(500).json({ error: 'Failed to fetch props' });
  }
});

/** Map display stat type back to the game-log field name. */
function mapStatType(displayType) {
  const map = {
    Points: 'points',
    Assists: 'assists',
    Rebounds: 'rebounds',
    Threes: 'tpa',
    'Pts+Ast': 'pts+ast',
    'Pts+Reb': 'pts+reb',
    'Reb+Ast': 'reb+ast',
    'Pts+Ast+Reb': 'pts+ast+reb',
  };
  return map[displayType] || 'points';
}

/** Simple matchup rating based on hit-rate average (0-100). */
function computeMatchupRating(hitRates) {
  const vals = [hitRates.last5, hitRates.last10, hitRates.last20].filter(
    (v) => v !== null,
  );
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Find the lowest (best) over line across all bookmakers. */
function computeBestLine(odds) {
  if (!odds || Object.keys(odds).length === 0) return null;
  let best = Infinity;
  for (const bk of Object.values(odds)) {
    if (bk.line != null && bk.line < best) best = bk.line;
  }
  return best === Infinity ? null : best;
}

/** Find the best (highest/most favorable) over price across bookmakers. */
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

/** Separate odds into best over/under across bookmakers. */
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

module.exports = router;
