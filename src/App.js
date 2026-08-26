import React, { useState } from "react";
import {
  useSelector,
  useDispatch,
} from "react-redux";

import {
  joinRoom,
  leaveRoom,
} from "./store/chatSlice";

import Chat from "./Components/Chat";

function App() {
  const dispatch = useDispatch();

  const currentUser =
    useSelector(
      (state) =>
        state.chat.currentUser
    );

  const [name, setName] =
    useState("");

  const [roomId, setRoomId] =
    useState("");

  const handleLogout = () => {
    dispatch(leaveRoom());

    localStorage.removeItem(
      "currentUser"
    );
  };

  const handleJoin = (event) => {
    event.preventDefault();

    const trimmedName =
      name.trim();

    const trimmedRoom =
      roomId.trim();

    if (
      !trimmedName ||
      !trimmedRoom
    ) {
      return;
    }

    dispatch(
      joinRoom({
        name: trimmedName,
        roomId: trimmedRoom,
      })
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-100 via-white to-pink-100 flex items-center justify-center p-4 sm:p-6">

      {currentUser ? (

        <Chat
          onLogout={
            handleLogout
          }
        />

      ) : (

        <div className="w-full max-w-md lg:max-w-lg bg-white rounded-3xl shadow-2xl border border-violet-100 overflow-hidden">

          <div className="p-6 sm:p-8">

            <div className="text-center mb-6">

              <p className="text-sm uppercase tracking-[0.3em] text-violet-500 font-semibold">
                Welcome
              </p>

              <h1 className="mt-3 text-3xl font-bold text-slate-800">
                Join the room
              </h1>

            </div>

            <form
              onSubmit={handleJoin}
              className="space-y-4"
            >

             

              <div>

                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Room ID
                </label>

                <input
                  type="text"
                  value={roomId}
                  onChange={(e) =>
                    setRoomId(
                      e.target.value
                    )
                  }
                  placeholder="Enter room code"
                  className="w-full px-4 py-3 rounded-2xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />

              </div>

               <div>

                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Your name
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(e) =>
                    setName(
                      e.target.value
                    )
                  }
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 rounded-2xl border border-violet-200 focus:outline-none focus:ring-2 focus:ring-violet-400"
                />

              </div>

              <button
                type="submit"
                className="w-full bg-violet-600 text-white font-semibold py-3 rounded-2xl hover:bg-violet-700 transition"
              >
                Join room
              </button>

            </form>

          </div>

        </div>

      )}

    </div>
  );
}

export default App;