const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");

require("dotenv").config();

const app = express();
const server = http.createServer(app);

const NETLIFY_URL =
  "https://counter344.netlify.app";

/*
 * =========================
 * EXPRESS CORS
 * =========================
 */

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin === NETLIFY_URL) {
    res.header(
      "Access-Control-Allow-Origin",
      NETLIFY_URL
    );
  }

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
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

/*
 * =========================
 * SOCKET.IO
 * =========================
 */

const io = new Server(server, {
  cors: {
    origin: NETLIFY_URL,

    methods: [
      "GET",
      "POST",
    ],

    credentials: true,
  },
});
// Track connected users in each room
const roomUsers = new Map();

const updateRoomUserCount = (room) => {
  if (!room) return;

  const count = roomUsers.get(room)?.size || 0;

  io.to(room).emit(
    "roomUserCount",
    count
  );
};

/*
 * =========================
 * DATABASE
 * =========================
 */

const DATABASE_URL =
  process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(
    "❌ DATABASE_URL is missing"
  );

  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },
});

/*
 * Test PostgreSQL
 */

pool
  .query("SELECT NOW()")
  .then((result) => {
    console.log(
      "✅ PostgreSQL connected:",
      result.rows[0]
    );
  })
  .catch((error) => {
    console.error(
      "❌ PostgreSQL connection error:",
      error.message
    );
  });

/*
 * =========================
 * CREATE TABLE
 * =========================
 */

const initDb = async () => {
  try {
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

    console.log(
      "✅ PostgreSQL schema initialized"
    );
  } catch (error) {
    console.error(
      "❌ Database initialization error:",
      error
    );

    throw error;
  }
};

/*
 * =========================
 * NORMALIZE MESSAGE
 * =========================
 */

const normalizeMessage = (row) => {
  const senderName =
    row.sendername ||
    row.senderName ||
    "Unknown";

  let file = row.file || null;

  if (
    file &&
    typeof file === "string"
  ) {
    try {
      file = JSON.parse(file);
    } catch (error) {
      console.warn(
        "Failed to parse file JSON:",
        error.message
      );
    }
  }

  if (
    file &&
    typeof file === "object"
  ) {
    file = {
      name:
        file.name || "file",

      type:
        file.type ||
        "application/octet-stream",

      dataUrl:
        file.dataUrl || null,
    };
  }

  return {
    id:
      row.message_id ||
      row.id,

    senderName,

    text:
      row.text || "",

    file,

    time:
      row.time,
  };
};

/*
 * =========================
 * SOCKET EVENTS
 * =========================
 */
const socketRooms = new Map();

io.on(
  "connection",
  (socket) => {
    console.log(
      "🔌 Socket connected:",
      socket.id
    );

    /*
     * JOIN ROOM
     */

    socket.on(
      "join",
      async (room) => {
        if (!room) return;

        socket.join(room);
        if (!roomUsers.has(room)) {
  roomUsers.set(
    room,
    new Set()
  );
}

roomUsers
  .get(room)
  .add(socket.id);

  socketRooms.set(
  socket.id,
  room
);

updateRoomUserCount(room);

        console.log(
          `👤 ${socket.id} joined room: ${room}`
        );

        try {
          const result =
            await pool.query(
              `
              SELECT *
              FROM messages
              WHERE room = $1
              ORDER BY created_at ASC
              `,
              [room]
            );

          const history =
            result.rows.map(
              normalizeMessage
            );

          socket.emit(
            "history",
            history
          );

          console.log(
            `📚 Sent ${history.length} messages to ${socket.id}`
          );
        } catch (error) {
          console.error(
            "❌ Error fetching history:",
            error
          );

          socket.emit(
            "history",
            []
          );
        }
      }
    );

    /*
     * LEAVE ROOM
     */

  socket.on(
  "leave",
  (room) => {
    if (!room) return;

    socket.leave(room);

    const users =
      roomUsers.get(room);

    if (users) {
      users.delete(socket.id);

      if (users.size === 0) {
        roomUsers.delete(room);
      } else {
        updateRoomUserCount(room);
      }
    }

    console.log(
      `👋 ${socket.id} left room: ${room}`
    );
  }
);

    /*
     * SEND MESSAGE
     */

    socket.on(
      "sendMessage",
      async ({
        room,
        message,
      }) => {
        if (
          !room ||
          !message
        ) {
          console.log(
            "❌ Missing room or message"
          );

          return;
        }

        try {
          const fileParam =
            message.file
              ? JSON.stringify(
                  message.file
                )
              : null;

          console.log(
            "📥 Saving message:",
            {
              id: message.id,
              room,
              senderName:
                message.senderName,
              text:
                message.text,
            }
          );

          await pool.query(
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
            `,
            [
              String(
                message.id
              ),

              room,

              message.senderName,

              message.text ||
                null,

              fileParam,

              message.time,
            ]
          );

          console.log(
            "✅ Message saved to PostgreSQL"
          );

          /*
           * Send message to everyone
           * in this room
           */

          io.to(room).emit(
            "message",
            message
          );
        } catch (error) {
          console.error(
            "❌ Error inserting message:",
            error
          );
        }
      }
    );

    /*
     * DISCONNECT
     */

   socket.on(
  "disconnect",
  (reason) => {
    const room =
      socketRooms.get(socket.id);

    if (room) {
      const users =
        roomUsers.get(room);

      if (users) {
        users.delete(socket.id);

        if (users.size === 0) {
          roomUsers.delete(room);
        } else {
          updateRoomUserCount(room);
        }
      }

      socketRooms.delete(
        socket.id
      );
    }

    console.log(
      "🔌 Socket disconnected:",
      socket.id,
      reason
    );
  }
);
  }
);

/*
 * =========================
 * CLEAR ROOM
 * =========================
 */

app.post(
  "/clear-room",
  async (req, res) => {
    const room =
      req.body?.room;

    console.log(
      "🧹 CLEAR ROOM REQUEST:",
      room
    );

    if (!room) {
      console.log(
        "❌ Room is missing"
      );

      return res
        .status(400)
        .json({
          error:
            "room is required",
        });
    }

    try {
      const result =
        await pool.query(
          `
          DELETE FROM messages
          WHERE room = $1
          `,
          [room]
        );

      console.log(
        `🗑️ Deleted ${result.rowCount} messages from room ${room}`
      );

      /*
       * Tell every connected user
       * in this room to clear UI
       */

      io.to(room).emit(
        "clearRoom"
      );

      return res.json({
        room,
        cleared: true,
        deleted:
          result.rowCount,
      });
    } catch (error) {
      console.error(
        "❌ Error clearing room:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "Unable to clear room",
        });
    }
  }
);

/*
 * =========================
 * HEALTH ROUTES
 * =========================
 */

app.get(
  "/",
  (req, res) => {
    res.send(
      "Socket.IO server running"
    );
  }
);

app.get(
  "/health",
  (req, res) => {
    res.json({
      status: "ok",
    });
  }
);

/*
 * =========================
 * SERVER START
 * =========================
 */

const PORT =
  process.env.PORT || 3001;

const startServer =
  async () => {
    try {
      await initDb();

      server.listen(
        PORT,
        () => {
          console.log(
            `🚀 Server listening on port ${PORT}`
          );
        }
      );
    } catch (error) {
      console.error(
        "❌ Server startup failed:",
        error
      );

      process.exit(1);
    }
  };

startServer();

/*
 * =========================
 * SHUTDOWN
 * =========================
 */

const shutdown =
  async () => {
    try {
      await pool.end();

      console.log(
        "✅ PostgreSQL pool closed"
      );
    } catch (error) {
      console.error(
        "❌ Error closing PostgreSQL pool:",
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