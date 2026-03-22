const express = require('express');
const router = express.Router();
const { getEnrichedProps } = require('../services/enrichmentService');

/**
 * GET /api/props
 * Returns pre-computed enriched props from the background cache.
 * If the cache hasn't been populated yet (server just started), returns a loading indicator.
 */
router.get('/props', (_req, res) => {
  const cached = getEnrichedProps();
  if (cached) {
    return res.json(cached);
  }
  // Cache not ready yet — tell the frontend to wait
  res.json({ loading: true, data: [] });
});

module.exports = router;
