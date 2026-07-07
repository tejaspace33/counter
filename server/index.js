const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      room TEXT NOT NULL,
      senderName TEXT NOT NULL,
      text TEXT,
      file JSONB,
      time TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('PostgreSQL schema initialized');
};

const normalizeMessage = (row) => ({
  id: row.id,
  senderName: row.sendername,
  text: row.text,
  file: row.file || null,
  time: row.time
});

app.use(express.json());

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join', async (room) => {
    if (!room) return;
    socket.join(room);

    try {
      const result = await pool.query(
        'SELECT * FROM messages WHERE room = $1 ORDER BY created_at ASC',
        [room]
      );
      const history = result.rows.map(normalizeMessage);
      socket.emit('history', history);
    } catch (err) {
      console.error('Error fetching history:', err);
      socket.emit('history', []);
    }

    console.log(`socket ${socket.id} joined ${room}`);
  });

  socket.on('leave', (room) => {
    socket.leave(room);
    console.log(`socket ${socket.id} left ${room}`);
  });

  socket.on('sendMessage', async ({ room, message }) => {
    if (!room || !message) return;

    try {
      await pool.query(
        `INSERT INTO messages (room, senderName, text, file, time) VALUES ($1, $2, $3, $4, $5)`,
        [room, message.senderName, message.text, message.file || null, message.time]
      );
      io.to(room).emit('message', message);
    } catch (err) {
      console.error('Error inserting message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

app.get('/', (req, res) => res.send('Socket.IO server running'));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/clear-room', async (req, res) => {
  const { room } = req.body;
  if (!room) {
    return res.status(400).json({ error: 'room is required' });
  }

  try {
    await pool.query('DELETE FROM messages WHERE room = $1', [room]);
    io.to(room).emit('clearRoom');
    return res.json({ room, cleared: true });
  } catch (err) {
    console.error('Error clearing room:', err);
    return res.status(500).json({ error: 'Unable to clear room' });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  await initDb();
  console.log(`Server listening on ${PORT}`);
});

const shutdown = async () => {
  try {
    await pool.end();
    console.log('PostgreSQL pool closed');
  } catch (err) {
    console.error('Error closing PostgreSQL pool:', err);
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
