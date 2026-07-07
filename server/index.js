const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const DB_PATH = process.env.DATABASE_URL || path.join(__dirname, 'chat.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB connection error:', err);
  else console.log('Connected to SQLite database');
});

// Initialize DB schema
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT NOT NULL,
      senderName TEXT NOT NULL,
      text TEXT,
      file TEXT,
      time TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('join', (room) => {
    if (!room) return;
    socket.join(room);
    
    // Fetch message history from DB
    db.all(`SELECT * FROM messages WHERE room = ? ORDER BY created_at ASC`, [room], (err, rows) => {
      if (err) {
        console.error('Error fetching history:', err);
        socket.emit('history', []);
      } else {
        const history = rows.map(r => ({
          id: r.id,
          senderName: r.senderName,
          text: r.text,
          file: r.file ? JSON.parse(r.file) : null,
          time: r.time
        }));
        socket.emit('history', history);
      }
    });
    console.log(`socket ${socket.id} joined ${room}`);
  });

  socket.on('leave', (room) => {
    socket.leave(room);
    console.log(`socket ${socket.id} left ${room}`);
  });

  socket.on('sendMessage', ({ room, message }) => {
    if (!room || !message) return;
    
    // Store in DB
    db.run(
      `INSERT INTO messages (room, senderName, text, file, time) VALUES (?, ?, ?, ?, ?)`,
      [room, message.senderName, message.text, message.file ? JSON.stringify(message.file) : null, message.time],
      (err) => {
        if (err) {
          console.error('Error inserting message:', err);
        } else {
          // Broadcast to room
          io.to(room).emit('message', message);
        }
      }
    );
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

app.get('/', (req, res) => res.send('Socket.IO server running'));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server listening on ${PORT}`));

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) console.error('DB close error:', err);
    console.log('Database closed');
    process.exit(0);
  });
});
