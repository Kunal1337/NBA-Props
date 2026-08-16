const express = require('express');
const router = express.Router();
const { getEnrichedProps } = require('../services/enrichmentService');

/**
 * GET /api/props?league=nba|wnba
 * Returns pre-computed enriched props from the background cache.
 * If the cache hasn't been populated yet (server just started), returns a loading indicator.
 */
router.get('/props', (req, res) => {
  const league = req.query.league === 'wnba' ? 'wnba' : 'nba';
  const cached = getEnrichedProps(league);
  if (cached) {
    return res.json(cached);
  }
  // Cache not ready yet — tell the frontend to wait
  res.json({ loading: true, data: [] });
});

module.exports = router;
