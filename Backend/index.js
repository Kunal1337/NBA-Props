require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const healthRoutes = require('./routes/health');
const propsRoutes = require('./routes/props');
const playerRoutes = require('./routes/player');
const matchupsRoutes = require('./routes/matchups');
const { refreshEnrichedProps, refreshMatchups, getEnrichedProps } = require('./services/enrichmentService');

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
  // Send current cache immediately on connect
  const cached = getEnrichedProps();
  if (cached) socket.emit('props_update', cached);
  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

// Background refresh every 10 minutes — pushes to all connected clients
setInterval(async () => {
  try {
    const enriched = await refreshEnrichedProps();
    if (enriched) io.emit('props_update', enriched);
  } catch (err) {
    console.error('Background refresh error:', err.message);
  }
}, 600_000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Pre-warm caches in background (non-blocking)
  refreshEnrichedProps().catch((err) => console.error('Initial props refresh failed:', err.message));
  refreshMatchups().catch((err) => console.error('Initial matchups refresh failed:', err.message));
});
