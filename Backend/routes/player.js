const express = require('express');
const router = express.Router();
const nbaService = require('../services/nbaService');
const wnbaService = require('../services/wnbaService');

/**
 * GET /api/player/:name
 * Returns game logs for the given player (up to 25 games).
 * Query params: ?league=nba|wnba (default nba) &statType=points&line=22.5 (optional)
 */
router.get('/player/:name', async (req, res) => {
  try {
    const league = req.query.league === 'wnba' ? 'wnba' : 'nba';
    const service = league === 'wnba' ? wnbaService : nbaService;
    const teamHint = req.query.team || null;
    const logs = await service.getPlayerGameLogs(req.params.name, teamHint);
    if (logs.length === 0) {
      return res.status(404).json({ error: 'Player not found or no game logs' });
    }
    res.json({ player: req.params.name, gameLogs: logs });
  } catch (err) {
    console.error(`GET /api/player/${req.params.name} error:`, err.message);
    res.status(500).json({ error: 'Failed to fetch player game logs' });
  }
});

module.exports = router;
