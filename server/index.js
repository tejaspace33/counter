const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  "https://counter298.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
];


// ======================================================
// EXPRESS CORS
// ======================================================
app.use((req, res, next) => {
  res.header(
    "Access-Control-Allow-Origin",
    "https://counter298.netlify.app"
  );

  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  res.header(
    "Access-Control-Allow-Credentials",
    "true"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});


app.use(express.json());


// ======================================================
// SOCKET.IO
// ======================================================

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },

  transports: ["polling", "websocket"],
});


// ======================================================
// POSTGRESQL
// ======================================================

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL is missing");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },
});


// Test PostgreSQL connection
const testDatabase = async () => {
  try {
    const result = await pool.query("SELECT NOW()");

    console.log(
      "✅ PostgreSQL connected:",
      result.rows[0]
    );
  } catch (error) {
    console.error(
      "❌ PostgreSQL connection failed:",
      error.message
    );

    throw error;
  }
};


// ======================================================
// DATABASE INITIALIZATION
// ======================================================

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
    ADD COLUMN IF NOT EXISTS message_id TEXT
  `);

  console.log("✅ PostgreSQL schema initialized");
};


// ======================================================
// NORMALIZE MESSAGE
// ======================================================

const normalizeMessage = (row) => {
  let file = row.file || null;

  if (file && typeof file === "string") {
    try {
      file = JSON.parse(file);
    } catch (error) {
      console.warn(
        "Could not parse file JSON:",
        error.message
      );
    }
  }

  if (file && typeof file === "object") {
    file = {
      name: file.name || "file",
      type:
        file.type ||
        "application/octet-stream",
      dataUrl: file.dataUrl || null,
    };
  }

  return {
    id: row.message_id || row.id,

    senderName:
      row.sendername ||
      row.senderName ||
      "Unknown",

    text: row.text || "",

    file,

    time: row.time || "",
  };
};


// ======================================================
// SOCKET CONNECTION
// ======================================================

io.on("connection", (socket) => {
  socket.on("clearRoom", async ({ room }) => {
  console.log("🧹 CLEAR ROOM SOCKET REQUEST:", room);

  if (!room) {
    console.log("❌ No room received");
    return;
  }

  try {
    const result = await pool.query(
      "DELETE FROM messages WHERE room = $1",
      [room]
    );

    console.log(
      `✅ Room ${room} cleared. Deleted ${result.rowCount} messages.`
    );

    io.to(room).emit("clearRoom");

  } catch (err) {
    console.error("❌ CLEAR ROOM ERROR:", err);
  }
});
  console.log(
    "🟢 Socket connected:",
    socket.id
  );


  // ====================================================
  // JOIN ROOM
  // ====================================================

  socket.on("join", async (room) => {
    if (!room) {
      console.log("❌ Join failed: no room");
      return;
    }

    const normalizedRoom = room
      .trim()
      .toLowerCase();

    socket.join(normalizedRoom);

    console.log(
      `👤 ${socket.id} joined room: ${normalizedRoom}`
    );

    try {
      const result = await pool.query(
        `
        SELECT *
        FROM messages
        WHERE room = $1
        ORDER BY created_at ASC
        `,
        [normalizedRoom]
      );

      const history =
        result.rows.map(normalizeMessage);

      console.log(
        `📚 Loaded ${history.length} messages for ${normalizedRoom}`
      );

      socket.emit("history", history);

    } catch (error) {
      console.error(
        "❌ Error loading history:",
        error.message
      );

      socket.emit("history", []);
    }
  });


  // ====================================================
  // LEAVE ROOM
  // ====================================================

  socket.on("leave", (room) => {
    if (!room) return;

    const normalizedRoom = room
      .trim()
      .toLowerCase();

    socket.leave(normalizedRoom);

    console.log(
      `👋 ${socket.id} left ${normalizedRoom}`
    );
  });


  // ====================================================
  // SEND MESSAGE
  // ====================================================

  socket.on(
    "sendMessage",
    async ({ room, message }) => {

      if (!room || !message) {
        console.log(
          "❌ Missing room or message"
        );

        return;
      }

      const normalizedRoom = room
        .trim()
        .toLowerCase();

      try {

        const fileParam = message.file
          ? JSON.stringify(message.file)
          : null;


        console.log("📥 Saving message:", {
          id: message.id,
          room: normalizedRoom,
          senderName:
            message.senderName,
          text: message.text,
        });


        // SAVE TO POSTGRESQL
        const result = await pool.query(
          `
          INSERT INTO messages
          (
            message_id,
            room,
            senderName,
            text,
            file,
            time
          )
          VALUES
          (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          RETURNING *
          `,
          [
            String(message.id),
            normalizedRoom,
            message.senderName,
            message.text || null,
            fileParam,
            message.time,
          ]
        );


        console.log(
          "✅ Message saved to PostgreSQL:",
          result.rows[0].id
        );


        // IMPORTANT:
        // Only send the message to clients AFTER
        // PostgreSQL successfully saved it.

        io.to(normalizedRoom).emit(
          "message",
          message
        );

      } catch (error) {

        console.error(
          "❌ PostgreSQL INSERT ERROR:",
          error
        );

        socket.emit(
          "messageError",
          "Message could not be saved."
        );
      }
    }
  );


  // ====================================================
  // DELETE MESSAGE
  // ====================================================

  socket.on(
    "deleteMessage",
    async ({ room, id }) => {

      if (!room || !id) return;

      try {

        const result = await pool.query(
          `
          DELETE FROM messages
          WHERE message_id = $1
          `,
          [String(id)]
        );

        console.log(
          `🗑️ Deleted ${result.rowCount} message(s)`
        );

        io.to(room).emit(
          "messageDeleted",
          id
        );

      } catch (error) {

        console.error(
          "❌ Delete error:",
          error.message
        );
      }
    }
  );


  // ====================================================
  // DISCONNECT
  // ====================================================

  socket.on("disconnect", () => {
    console.log(
      "🔴 Socket disconnected:",
      socket.id
    );
  });
});


// ======================================================
// HTTP ROUTES
// ======================================================

app.get("/", (req, res) => {
  res.status(200).send(
    "Socket.IO server running"
  );
});


app.get("/health", async (req, res) => {

  try {

    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
    });

  } catch (error) {

    res.status(500).json({
      status: "error",
      database: "disconnected",
      error: error.message,
    });
  }
});


// ======================================================
// CLEAR ROOM
// ======================================================

app.post('/clear-room', async (req, res) => {
  console.log("🧹 CLEAR ROOM REQUEST RECEIVED");
  console.log("BODY:", req.body);

  const { room } = req.body;

  if (!room) {
    console.log("❌ ROOM IS MISSING");
    return res.status(400).json({
      error: "room is required"
    });
  }

  try {
    console.log("🧹 Deleting room:", room);

    const result = await pool.query(
      "DELETE FROM messages WHERE room = $1",
      [room]
    );

    console.log("✅ DELETE SUCCESS");
    console.log("🗑️ ROWS DELETED:", result.rowCount);

    io.to(room).emit("clearRoom");

    return res.status(200).json({
      success: true,
      room: room,
      deleted: result.rowCount
    });

  } catch (err) {
    console.error("❌ CLEAR ROOM DATABASE ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// ======================================================
// START SERVER
// ======================================================

const startServer = async () => {

  try {

    await testDatabase();

    await initDb();

    server.listen(PORT, () => {

      console.log(
        `🚀 Server running on port ${PORT}`
      );

    });

  } catch (error) {

    console.error(
      "❌ Server startup failed:",
      error
    );

    process.exit(1);
  }
};


startServer();


// ======================================================
// SHUTDOWN
// ======================================================

const shutdown = async () => {

  console.log(
    "🛑 Shutting down server..."
  );

  try {

    await pool.end();

    console.log(
      "✅ PostgreSQL pool closed"
    );

  } catch (error) {

    console.error(
      "❌ Error closing PostgreSQL:",
      error
    );
  }

  process.exit(0);
};


process.on(
  "SIGINT",
  shutdown
);

process.on(
  "SIGTERM",
  shutdown
);
