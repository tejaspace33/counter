import { createSlice } from '@reduxjs/toolkit';

const USER_KEY = "chatUser";

const loadUser = () => {
  try {
    const user = JSON.parse(localStorage.getItem(USER_KEY));

    if (!user) return null;

    const lastActivity = Number(localStorage.getItem("lastMessageTime") || 0);

    // Logout if inactive for more than 10 minutes
    if (lastActivity && Date.now() - lastActivity > 10 * 60 * 1000) {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem("lastMessageTime");
      return null;
    }

    return user;
  } catch {
    return null;
  }
};

const initialUser = loadUser();

const persistKey = (roomId) => `chatRoom:${roomId}`;

const initialState = {
  currentUser: initialUser,
  messages:
    initialUser && initialUser.roomId
      ? JSON.parse(
          localStorage.getItem(persistKey(initialUser.roomId)) || "[]"
        )
      : [],
};

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    joinRoom(state, action) {
      const { roomId, name } = action.payload;
      
      // Normalize to lowercase for case-insensitive matching
      const normalizedRoomId = roomId.toLowerCase();
      const normalizedName = name.toLowerCase();

      let stored = [];

      try {
        stored = JSON.parse(
          localStorage.getItem(persistKey(normalizedRoomId)) || "[]"
        );
      } catch {
        stored = [];
      }

      state.currentUser = { roomId: normalizedRoomId, name: normalizedName };
      state.messages = stored;

      localStorage.setItem(
        USER_KEY,
        JSON.stringify({ roomId: normalizedRoomId, name: normalizedName })
      );

      localStorage.setItem(
        "lastMessageTime",
        Date.now().toString()
      );
    },

    leaveRoom(state) {
      state.currentUser = null;
      state.messages = [];

      localStorage.removeItem(USER_KEY);
      localStorage.removeItem("lastMessageTime");
    },

    setMessages(state, action) {
      state.messages = action.payload || [];
    },

    clearRoom(state) {
      state.messages = [];

      if (state.currentUser?.roomId) {
        localStorage.removeItem(persistKey(state.currentUser.roomId));
      }
    },

    sendMessage(state, action) {
      const msg = action.payload;

      state.messages.push(msg);

      if (state.currentUser) {
        try {
          localStorage.setItem(
            persistKey(state.currentUser.roomId),
            JSON.stringify(state.messages)
          );

          // Reset inactivity timer whenever a message is sent
          localStorage.setItem(
            "lastMessageTime",
            Date.now().toString()
          );
        } catch (err) {
          console.warn(err);
        }
      }
    },
  },
});

export const {
  joinRoom,
  leaveRoom,
  setMessages,
  clearRoom,
  sendMessage,
} = chatSlice.actions;

export default chatSlice.reducer;