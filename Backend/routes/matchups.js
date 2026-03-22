const express = require('express');
const router = express.Router();
const { getDefensiveRankings } = require('../services/matchupService');

/**
 * GET /api/matchups
 * Returns defensive rankings grouped by team and position.
 */
router.get('/matchups', async (_req, res) => {
  try {
    const rankings = await getDefensiveRankings();
    res.json(rankings);
  } catch (err) {
    console.error('GET /api/matchups error:', err.message);
    res.status(500).json({ error: 'Failed to fetch matchup data' });
  }
});

module.exports = router;
