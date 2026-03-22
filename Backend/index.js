require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const healthRoutes = require('./routes/health');
const propsRoutes = require('./routes/props');
const playerRoutes = require('./routes/player');
const matchupsRoutes = require('./routes/matchups');
const { fetchAllProps } = require('./services/oddsService');
const { getPlayerGameLogs, calculateHitRate, calculateH2HHitRate } = require('./services/nbaService');
const { getMatchupRating } = require('./services/matchupService');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

app.use(cors());
app.use(express.json());

// Routes
app.use('/api', healthRoutes);
app.use('/api', propsRoutes);
app.use('/api', playerRoutes);
app.use('/api', matchupsRoutes);

// Socket.io — push enriched props every 10 minutes
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

const STAT_MAP = { Points: 'points', Assists: 'assists', Rebounds: 'rebounds', Threes: 'tpa' };

async function buildEnrichedProps() {
  const rawProps = await fetchAllProps();
  return Promise.all(
    rawProps.map(async (prop) => {
      let hitRates = { last5: null, last10: null, last20: null, season: null, h2h: null };
      let matchupRating = null;
      let opponentRankVsPosition = null;
      let position = null;
      try {
        const logs = await getPlayerGameLogs(prop.player);
        if (logs.length > 0) {
          const statKey = STAT_MAP[prop.statType] || 'points';
          hitRates = calculateHitRate(logs, statKey, prop.line);
          const vals = [hitRates.last5, hitRates.last10, hitRates.last20].filter((v) => v !== null);
          matchupRating = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
          position = logs[0].position || null;
          const opp = prop.awayTeam || prop.homeTeam;
          hitRates.h2h = calculateH2HHitRate(logs, opp, statKey, prop.line);
          if (opp && position) {
            try { opponentRankVsPosition = await getMatchupRating(opp, position); } catch (_) {}
          }
        }
      } catch (_) {}
      // Best line + separated odds
      let bestLine = null;
      const overOdds = {};
      const underOdds = {};
      if (prop.odds) {
        let best = Infinity;
        for (const [bk, v] of Object.entries(prop.odds)) {
          if (v.line != null && v.line < best) best = v.line;
          if (v.over != null) overOdds[bk] = v.over;
          if (v.under != null) underOdds[bk] = v.under;
        }
        if (best !== Infinity) bestLine = best;
      }
      return {
        player: prop.player, homeTeam: prop.homeTeam, awayTeam: prop.awayTeam,
        statType: prop.statType, line: prop.line, bestLine,
        odds: prop.odds, overOdds, underOdds,
        hitRates, matchupRating, opponentRankVsPosition, position,
        commenceTime: prop.commenceTime,
      };
    }),
  );
}

setInterval(async () => {
  try {
    const enriched = await buildEnrichedProps();
    io.emit('props_update', enriched);
  } catch (err) {
    console.error('Socket props refresh error:', err.message);
  }
}, 600_000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
