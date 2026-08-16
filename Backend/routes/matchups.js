const express = require('express');
const router = express.Router();
const matchupService = require('../services/matchupService');
const wnbaMatchupService = require('../services/wnbaMatchupService');

/**
 * GET /api/matchups?league=nba|wnba
 * Returns defensive rankings grouped by team and position.
 */
router.get('/matchups', async (req, res) => {
  try {
    const league = req.query.league === 'wnba' ? 'wnba' : 'nba';
    const service = league === 'wnba' ? wnbaMatchupService : matchupService;
    const rankings = await service.getDefensiveRankings();
    res.json(rankings);
  } catch (err) {
    console.error('GET /api/matchups error:', err.message);
    res.status(500).json({ error: 'Failed to fetch matchup data' });
  }
});

module.exports = router;
