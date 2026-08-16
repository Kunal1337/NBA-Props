const { runWnbaScript } = require('./pythonRunner');
const { normalizePosToBaseBucket } = require('./matchupService');

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
let rankingsCache = { data: null, ts: 0 };

/**
 * Get cached defensive rankings, built from real opponent-points-allowed
 * data via nba_api (LeagueID='10'), not a proxy like the NBA path's
 * BallDontLie fallback.
 */
async function getDefensiveRankings() {
  if (rankingsCache.data && Date.now() - rankingsCache.ts < CACHE_TTL) {
    return rankingsCache.data;
  }
  try {
    const data = await runWnbaScript(['opponent-stats']);
    rankingsCache = { data, ts: Date.now() };
    return data;
  } catch (err) {
    console.error('[wnbaMatchupService] opponent-stats failed:', err.message);
    return rankingsCache.data || {};
  }
}

/**
 * Get matchup rating for a specific opponent/position combo.
 * @returns 'favorable' | 'neutral' | 'unfavorable' | null
 */
async function getMatchupRating(opponentTeam, playerPosition) {
  const rankings = await getDefensiveRankings();
  if (!rankings || !opponentTeam) return null;

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

module.exports = { getDefensiveRankings, getMatchupRating };
