import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  currentUser: null,
  messages: [],
};

const persistKey = (roomId) => `chatRoom:${roomId}`;

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    joinRoom(state, action) {
      const { roomId, name } = action.payload;
      let stored = [];
      try {
        stored = JSON.parse(localStorage.getItem(persistKey(roomId)) || '[]');
      } catch (e) {
        stored = [];
      }
      state.currentUser = { roomId, name };
      state.messages = stored;
    },
    leaveRoom(state) {
      state.currentUser = null;
      state.messages = [];
    },
    setMessages(state, action) {
      state.messages = action.payload || [];
    },
    sendMessage(state, action) {
      const msg = action.payload;
      state.messages.push(msg);
      if (state.currentUser && state.currentUser.roomId) {
        try {
          localStorage.setItem(persistKey(state.currentUser.roomId), JSON.stringify(state.messages));
          // also emit storage event to other tabs
          window.localStorage.setItem(persistKey(state.currentUser.roomId), JSON.stringify(state.messages));
        } catch (e) {
          console.warn('Failed to persist messages', e);
        }
      }
    }
  }
});

export const { joinRoom, leaveRoom, setMessages, sendMessage } = chatSlice.actions;
export default chatSlice.reducer;
