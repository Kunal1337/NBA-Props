/**
 * Resolve a stat value from a game log entry, supporting combo stats.
 */
export function resolveStatValue(log, statKey) {
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

/** Map display stat type to the internal key used by resolveStatValue. */
export function mapStatType(displayType) {
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

/**
 * Compute weighted lock rate from hit rates.
 * @param {object} hitRates - { last5, last10, last20, season, h2h }
 * @param {object} weights - { last5: 0.4, last10: 0.35, last20: 0.25 } etc.
 * @returns {number|null}
 */
export function computeWeightedLockRate(hitRates, weights) {
  if (!hitRates) return null;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const val = hitRates[key];
    if (val != null) {
      weightedSum += val * weight;
      totalWeight += weight;
    }
  }
  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}

/**
 * Generate rule-based text insights from game logs.
 * @param {Array} gameLogs
 * @param {string} statKey - e.g. 'points', 'pts+ast'
 * @param {number|null} line - prop line to compare against
 * @returns {string[]}
 */
export function generateInsights(gameLogs, statKey, line) {
  if (!gameLogs || gameLogs.length === 0) return [];
  const insights = [];

  const getVal = (log) => resolveStatValue(log, statKey);
  const statLabel = statKey.includes('+') ? statKey.toUpperCase().replace(/\+/g, '+') : statKey.charAt(0).toUpperCase() + statKey.slice(1);

  // --- Line clearance rate ---
  if (line != null) {
    const last10 = gameLogs.slice(0, 10);
    const cleared = last10.filter((g) => getVal(g) > line).length;
    insights.push(`Cleared ${line} ${statLabel} in ${cleared}/${last10.length} recent games`);
  }

  // --- Trend detection (L5 avg vs L20 avg) ---
  const l5 = gameLogs.slice(0, 5);
  const l20 = gameLogs.slice(0, Math.min(20, gameLogs.length));
  if (l5.length >= 3 && l20.length >= 10) {
    const l5Avg = l5.reduce((s, g) => s + getVal(g), 0) / l5.length;
    const l20Avg = l20.reduce((s, g) => s + getVal(g), 0) / l20.length;
    const diff = l5Avg - l20Avg;
    if (diff > l20Avg * 0.1) {
      insights.push(`Trending up: ${l5Avg.toFixed(1)} avg over last ${l5.length} vs ${l20Avg.toFixed(1)} over last ${l20.length}`);
    } else if (diff < -l20Avg * 0.1) {
      insights.push(`Trending down: ${l5Avg.toFixed(1)} avg over last ${l5.length} vs ${l20Avg.toFixed(1)} over last ${l20.length}`);
    } else {
      insights.push(`Consistent: ${l5Avg.toFixed(1)} avg over last ${l5.length}, ${l20Avg.toFixed(1)} over last ${l20.length}`);
    }
  }

  // --- Opponent-specific ---
  const opponentGames = {};
  for (const g of gameLogs) {
    if (!g.opp) continue;
    if (!opponentGames[g.opp]) opponentGames[g.opp] = [];
    opponentGames[g.opp].push(g);
  }
  for (const [opp, games] of Object.entries(opponentGames)) {
    if (games.length >= 2 && line != null) {
      const hitCount = games.filter((g) => getVal(g) > line).length;
      const pct = Math.round((hitCount / games.length) * 100);
      if (pct <= 33) {
        insights.push(`Struggles vs ${opp}: cleared line in only ${hitCount}/${games.length} games`);
      } else if (pct >= 75) {
        insights.push(`Strong vs ${opp}: cleared line in ${hitCount}/${games.length} games`);
      }
    }
  }

  // --- Minute consistency ---
  const mins = gameLogs.slice(0, 10).map((g) => parseFloat(g.minutes) || 0).filter((m) => m > 0);
  if (mins.length >= 5) {
    const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
    const variance = mins.reduce((s, m) => s + (m - avg) ** 2, 0) / mins.length;
    const std = Math.sqrt(variance);
    if (std < 3) {
      insights.push(`Consistent minutes: ${avg.toFixed(0)} MPG (±${std.toFixed(1)})`);
    } else {
      insights.push(`Variable minutes: ${avg.toFixed(0)} MPG (±${std.toFixed(1)})`);
    }
  }

  return insights;
}
