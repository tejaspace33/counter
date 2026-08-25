import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  joinRoom,
  leaveRoom,
  setMessages,
} from "./store/chatSlice";

import Chat from "./Components/Chat";

function App() {
  const dispatch = useDispatch();

  const currentUser = useSelector(
    (state) => state.chat.currentUser
  );

  const messages = useSelector(
    (state) => state.chat.messages
  );

  const [roomId, setRoomId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");

  /* ------------------------------
     Save room messages
  ------------------------------ */

  useEffect(() => {
    if (!currentUser) return;

    localStorage.setItem(
      `chatRoom:${currentUser.roomId}`,
      JSON.stringify(messages)
    );
  }, [messages, currentUser]);

  /* ------------------------------
     Listen for storage changes
  ------------------------------ */

  useEffect(() => {
    if (!currentUser) return;

    const roomKey = `chatRoom:${currentUser.roomId}`;

    const handleStorage = (event) => {
      if (event.key !== roomKey) return;

      try {
        const updatedMessages = JSON.parse(
          event.newValue || "[]"
        );

        dispatch(setMessages(updatedMessages));
      } catch (error) {
        console.error(error);
      }
    };

    window.addEventListener(
      "storage",
      handleStorage
    );

    return () =>
      window.removeEventListener(
        "storage",
        handleStorage
      );
  }, [currentUser, dispatch]);

  /* ------------------------------
     Handle Join Room
  ------------------------------ */

  const handleJoin = () => {
    const id = roomId.trim();
    const name = displayName.trim();

    if (!id) {
      setError("Please enter a Room ID.");
      return;
    }

    if (!name) {
      setError("Please enter your name.");
      return;
    }

    dispatch(
      joinRoom({
        roomId: id.toLowerCase(),
        name: name.toLowerCase(),
      })
    );

    setError("");
  };

  /* ------------------------------
     Logout
  ------------------------------ */

  const handleLogout = () => {
    dispatch(leaveRoom());

    setRoomId("");
    setDisplayName("");
    setError("");
  };

  /* ------------------------------
     Generate Room ID
  ------------------------------ */

  const generateRoomId = () => {
    const id = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    setRoomId(id);
    setError("");
  };

 return ( 
  

    {currentUser ? (

      <Chat onLogout={handleLogout} />

    ) : (
       <div className="min-h-screen bg-gradient-to-br from-violet-100 via-white to-pink-100 flex items-center justify-center p-4 sm:p-6">

      <div className="w-full max-w-md lg:max-w-lg bg-white rounded-3xl shadow-2xl border border-violet-100 overflow-hidden">

        {/* Header */}

        <div className="bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white px-8 py-10 text-center">
             
          <div className="text-5xl mb-3">
            💬
          </div>

          <h1 className="text-4xl font-bold">
            Let's Chat
          </h1>

          <p className="mt-3 text-violet-100 text-sm sm:text-base">
            Secure private chat rooms for two people.
          </p>

        </div>

        {/* Body */}

        <div className="p-6 sm:p-8">

          <>

            <div className="mb-6">

              <label className="block text-sm font-semibold text-gray-700 mb-2">

                Room ID

              </label>

              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room ID"
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none"
              />

            </div>

            <div className="mb-6">

              <label className="block text-sm font-semibold text-gray-700 mb-2">

                Display Name

              </label>

              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-2xl border border-gray-300 px-4 py-3 focus:ring-2 focus:ring-violet-500 outline-none"
              />

            </div>

            <div className="grid grid-cols-2 gap-3">

              <button
                onClick={handleJoin}
                className="rounded-2xl bg-violet-600 hover:bg-violet-700 text-white py-3 font-semibold transition"
              >
                Join Room
              </button>

              <button
                onClick={generateRoomId}
                className="rounded-2xl border border-violet-200 hover:bg-violet-50 py-3 font-semibold transition"
              >
                Generate
              </button>

            </div>

          </>

          {error && (

            <div className="mt-5 rounded-xl bg-red-50 border border-red-200 text-red-600 px-4 py-3 text-sm">

              {error}

            </div>

          )}

         

        </div>

      </div>
     </div>
    )}

  
);
}
export default App;