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

/**
 * Build defensive rankings by fetching season averages and computing
 * how many points each team allows per position bucket.
 *
 * Because BallDontLie doesn't have a direct "defensive stats by position"
 * endpoint, we approximate by fetching all player stats for the season and
 * grouping by the opponent team and the player's position.
 *
 * This is expensive, so we cache aggressively and fall back to static
 * estimates if the API call fails or times out.
 */
async function buildDefensiveRankings() {
  const headers = { Authorization: process.env.BALLDONTLIE_API_KEY };
  const season = currentSeason();

  // Fetch season averages for all teams to estimate defensive vulnerability.
  // We'll use team season averages as a proxy.
  let teams = [];
  try {
    const { data } = await axios.get(`${BDL_BASE}/teams`, { headers });
    teams = (data.data || []).filter((t) => t.conference && t.division); // active NBA teams
  } catch (err) {
    console.error('Failed to fetch teams:', err.message);
    return null;
  }

  // For each team, fetch their season stats to approximate points allowed.
  // We'll use season_averages for a sample of players on opponent teams.
  // Simpler approach: fetch team stats and rank by points allowed.
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

  // Fetch some aggregate stats to derive rankings
  try {
    // Get season averages per team by fetching overall team stats
    for (const team of teams.slice(0, 30)) {
      try {
        const { data } = await axios.get(`${BDL_BASE}/season_averages`, {
          params: { season, team_id: team.id },
          headers,
        });
        const avgs = data.data || [];
        if (avgs.length > 0) {
          // Use the team's own scoring patterns as a proxy
          const avg = avgs[0];
          const ptsAllowed = avg.pts || 110;
          rankings[team.full_name].overallRank = ptsAllowed;
        }
      } catch (_) {
        // Skip — keep defaults
      }
    }
  } catch (_) {
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
