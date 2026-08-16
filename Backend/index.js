require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const healthRoutes = require('./routes/health');
const propsRoutes = require('./routes/props');
const playerRoutes = require('./routes/player');
const matchupsRoutes = require('./routes/matchups');
const { LEAGUES, refreshEnrichedProps, refreshMatchups, getEnrichedProps } = require('./services/enrichmentService');

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

// Socket.io
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  // Send current cache immediately on connect, for each league that has one
  for (const league of LEAGUES) {
    const cached = getEnrichedProps(league);
    if (cached) socket.emit('props_update', { league, props: cached });
  }
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Background refresh every 10 minutes — pushes to all connected clients
setInterval(async () => {
  for (const league of LEAGUES) {
    try {
      const enriched = await refreshEnrichedProps(league);
      if (enriched) io.emit('props_update', { league, props: enriched });
    } catch (err) {
      console.error(`Background refresh error (${league}):`, err.message);
    }
  }
}, 600_000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Pre-warm caches in background (non-blocking), for every league
  for (const league of LEAGUES) {
    refreshEnrichedProps(league).catch((err) => console.error(`Initial props refresh failed (${league}):`, err.message));
    refreshMatchups(league).catch((err) => console.error(`Initial matchups refresh failed (${league}):`, err.message));
  }
});
