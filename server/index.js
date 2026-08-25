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

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in environment');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});
pool.query('SELECT NOW()')
  .then(result => {
    console.log('✅ PostgreSQL connected:', result.rows[0]);
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection error:', err.message);
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
  await pool.query(`
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS message_id TEXT;
`);
  console.log('PostgreSQL schema initialized');
};

const normalizeMessage = (row) => {
  // ensure senderName is present regardless of column casing
  const senderName = row.sendername || row.senderName || 'Unknown';

  // file may be returned as an object or a JSON string depending on how it was stored
  let file = row.file || null;
  if (file && typeof file === 'string') {
    try {
      file = JSON.parse(file);
    } catch (err) {
      // leave as string if parsing fails
      console.warn('Failed to parse file JSON from DB row', err && err.message);
    }
  }
  
  // ensure file has expected shape if it exists
  if (file && typeof file === 'object') {
    file = {
      name: file.name || 'file',
      type: file.type || 'application/octet-stream',
      dataUrl: file.dataUrl || null,
    };
  }

  return {
    id: row.message_id || row.id,
    senderName,
    text: row.text,
    file,
    time: row.time,
  };
};

app.use(express.json());

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on("deleteMessage", async ({ room, id }) => {

    try{

        await pool.query(
            "DELETE FROM messages WHERE message_id=$1",
            [id]
        );

        io.to(room).emit("messageDeleted", id);

    }catch(err){

        console.log(err);

    }

});

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
  if (!room || !message) {
    console.log('❌ Missing room or message');
    return;
  }

  try {
    const fileParam = message.file
      ? JSON.stringify(message.file)
      : null;

    console.log('📥 Saving message:', {
      id: message.id,
      room,
      senderName: message.senderName,
      text: message.text
    });

    const result = await pool.query(
      `INSERT INTO messages
       (message_id, room, senderName, text, file, time)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        message.id,
        room,
        message.senderName,
        message.text || null,
        fileParam,
        message.time
      ]
    );

    console.log('✅ Message saved to PostgreSQL');

    io.to(room).emit('message', message);

  } catch (err) {
    console.error('❌ Error inserting message:', err);
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
