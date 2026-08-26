import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useDispatch, useSelector } from "react-redux";

import {
  sendMessage,
  leaveRoom,
  setMessages,
  clearRoom,
} from "../store/chatSlice";

import {
  FiSend,
  FiImage,
  FiLogOut,
  FiUser,
  FiSmile,
} from "react-icons/fi";

import { io } from "socket.io-client";

function Chat({ onLogout }) {
  const dispatch = useDispatch();

  const currentUser = useSelector(
    (state) => state.chat.currentUser
  );

  const messages = useSelector(
    (state) => state.chat.messages
  );

  const [text, setText] = useState("");
  const [file, setFile] = useState(null);

  const [modalImage, setModalImage] = useState(null);
  const [modalScale, setModalScale] = useState(1);

  const [clearing, setClearing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] =
    useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);

  /*
   * IMPORTANT:
   * Set this in Netlify Environment Variables:
   *
   * REACT_APP_SOCKET_URL
   *
   * Value:
   * https://counter-production-5447.up.railway.app
   */

  const socketURL =
    process.env.REACT_APP_SOCKET_URL ||
    "http://localhost:3001";

  const EMOJIS = useMemo(
    () => [
      "😀",
      "😂",
      "😍",
      "😎",
      "🙌",
      "👍",
      "🎉",
      "✨",
      "🔥",
      "🥳",
      "💬",
      "❤️",
      "🙈",
      "🤖",
      "🫶",
    ],
    []
  );

  /*
   * Scroll to newest message
   */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  /*
   * Auto logout after 10 minutes inactivity
   */

  useEffect(() => {
    if (!currentUser) return;

    const checkTimeout = () => {
      const lastActivity = Number(
        localStorage.getItem(
          "lastMessageTime"
        ) || 0
      );

      if (!lastActivity) return;

      const inactive =
        Date.now() - lastActivity >=
        10 * 60 * 1000;

      if (!inactive) return;

      alert(
        "Session expired due to inactivity."
      );

      dispatch(leaveRoom());

      localStorage.removeItem("chatUser");
      localStorage.removeItem("lastMessageTime");

      onLogout();
    };

    checkTimeout();

    const interval = setInterval(
      checkTimeout,
      30000
    );

    return () => clearInterval(interval);
  }, [currentUser, dispatch, onLogout]);

  /*
   * SOCKET CONNECTION
   */

  useEffect(() => {
    if (!currentUser?.roomId) return;

    console.log(
      "🔌 Connecting to:",
      socketURL
    );

    const socket = io(socketURL, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      withCredentials: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log(
        "✅ SOCKET CONNECTED:",
        socket.id
      );

      socket.emit(
        "join",
        currentUser.roomId
      );
    });

    socket.on("connect_error", (error) => {
      console.error(
        "❌ SOCKET ERROR:",
        error.message
      );
    });

    socket.on("disconnect", (reason) => {
      console.log(
        "🔌 SOCKET DISCONNECTED:",
        reason
      );
    });

    /*
     * Receive old messages from PostgreSQL
     */

    socket.on("history", (history = []) => {
      console.log(
        "📚 Received history:",
        history.length
      );

      dispatch(setMessages(history));
    });

    /*
     * Receive new message
     */

    socket.on("message", (message) => {
      console.log(
        "📨 New message:",
        message
      );

      dispatch(sendMessage(message));
    });

    /*
     * Receive clear-room event
     */

    socket.on("clearRoom", () => {
      console.log(
        "🧹 Room cleared by server"
      );

      dispatch(clearRoom());
    });

    return () => {
      if (socket.connected) {
        socket.emit(
          "leave",
          currentUser.roomId
        );
      }

      socket.disconnect();

      socketRef.current = null;
    };
  }, [
    currentUser,
    dispatch,
    socketURL,
  ]);

  /*
   * Emoji
   */

  const toggleEmojiPicker = () => {
    setShowEmojiPicker(
      (previous) => !previous
    );
  };

  const addEmoji = (emoji) => {
    setText(
      (previous) => previous + emoji
    );

    setShowEmojiPicker(false);
  };

  /*
   * IMAGE MODAL KEYBOARD
   */

  useEffect(() => {
    if (!modalImage) return;

    const handleKey = (event) => {
      if (event.key === "Escape") {
        closeModal();
      }

      if (
        event.key === "+" ||
        event.key === "="
      ) {
        setModalScale((value) =>
          Math.min(
            3,
            +(value + 0.25).toFixed(2)
          )
        );
      }

      if (event.key === "-") {
        setModalScale((value) =>
          Math.max(
            0.5,
            +(value - 0.25).toFixed(2)
          )
        );
      }
    };

    window.addEventListener(
      "keydown",
      handleKey
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKey
      );
    };
  }, [modalImage]);

  /*
   * CLEAR ROOM
   */

  const handleClearRoom = async () => {
    if (!currentUser?.roomId) {
      alert("Room ID is missing.");
      return;
    }

    const confirmed = window.confirm(
      "Clear this room for everyone?"
    );

    if (!confirmed) return;

    setClearing(true);

    try {
      console.log(
        "🧹 Clearing room:",
        currentUser.roomId
      );

      const response = await fetch(
        `${socketURL}/clear-room`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            room: currentUser.roomId,
          }),
        }
      );

      const data = await response.json();

      console.log(
        "🧹 Clear room response:",
        response.status,
        data
      );

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to clear room."
        );
      }

      /*
       * Clear Redux + localStorage
       */

      dispatch(clearRoom());

      console.log(
        "✅ Room cleared successfully"
      );
    } catch (error) {
      console.error(
        "❌ CLEAR ROOM ERROR:",
        error
      );

      alert(
        "Unable to clear room. Check Railway logs."
      );
    } finally {
      setClearing(false);
    }
  };

  /*
   * IMAGE MODAL
   */

  const openImage = (fileObject) => {
    if (!fileObject?.dataUrl) return;

    setModalImage(fileObject.dataUrl);
    setModalScale(1);
  };

  const closeModal = () => {
    setModalImage(null);
    setModalScale(1);
  };

  /*
   * SEND MESSAGE
   */

  const handleSend = () => {
    const trimmed = text.trim();

    if (!trimmed && !file) return;

    const pushMessage = (
      filePayload = null
    ) => {
      if (
        !socketRef.current?.connected
      ) {
        console.error(
          "❌ SOCKET NOT CONNECTED"
        );

        alert(
          "Not connected to chat server."
        );

        return;
      }

      const message = {
        id:
          Date.now() +
          Math.floor(
            Math.random() * 1000
          ),

        senderName:
          currentUser.name,

        text: trimmed,

        file: filePayload,

        time: new Date().toLocaleTimeString(
          [],
          {
            hour: "2-digit",
            minute: "2-digit",
          }
        ),
      };

      console.log(
        "📤 Sending message:",
        message
      );

      socketRef.current.emit(
        "sendMessage",
        {
          room: currentUser.roomId,
          message,
        }
      );

      localStorage.setItem(
        "lastMessageTime",
        Date.now().toString()
      );

      setText("");
      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    /*
     * IMAGE / FILE
     */

    if (file) {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result;

        /*
         * IMAGE
         */

        if (
          file.type.startsWith(
            "image/"
          )
        ) {
          const img = new Image();

          img.onload = () => {
            let width = img.width;
            let height = img.height;

            const MAX_SIZE = 1200;

            if (
              width > MAX_SIZE ||
              height > MAX_SIZE
            ) {
              const ratio =
                Math.min(
                  MAX_SIZE / width,
                  MAX_SIZE / height
                );

              width = Math.round(
                width * ratio
              );

              height = Math.round(
                height * ratio
              );
            }

            const canvas =
              document.createElement(
                "canvas"
              );

            canvas.width = width;
            canvas.height = height;

            const ctx =
              canvas.getContext("2d");

            ctx.drawImage(
              img,
              0,
              0,
              width,
              height
            );

            const compressedImage =
              canvas.toDataURL(
                "image/jpeg",
                0.8
              );

            pushMessage({
              name: file.name,
              type: "image/jpeg",
              dataUrl:
                compressedImage,
            });
          };

          img.src = dataUrl;
        } else {
          /*
           * Other file
           */

          pushMessage({
            name: file.name,
            type: file.type,
            dataUrl,
          });
        }
      };

      reader.readAsDataURL(file);

      return;
    }

    /*
     * TEXT MESSAGE
     */

    pushMessage();
  };

  /*
   * ENTER TO SEND
   */

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      handleSend();
    }
  };

  /*
   * REMOVE ATTACHMENT
   */

  const removeAttachment = () => {
    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /*
   * LOGOUT
   */

  const logout = () => {
    dispatch(leaveRoom());

    localStorage.removeItem(
      "chatUser"
    );

    localStorage.removeItem(
      "lastMessageTime"
    );

    onLogout();
  };

  /*
   * TIME
   */

  const formatTime = (time) => {
    if (!time) return "";

    return time;
  };

  /*
   * MESSAGE OWNER
   */

  const isMine = (message) =>
    message.senderName ===
    currentUser?.name;

  /*
   * UI
   */

  return (
    <div className="fixed inset-0 bg-gray-100">
      <div className="w-full h-full bg-white flex flex-col">

        {/* HEADER */}

        <header className="flex-shrink-0 bg-white border-b px-4 py-3">

          <div className="flex items-center justify-between gap-3 flex-wrap">

            <div className="flex items-center gap-3 min-w-0">

              <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-center flex-shrink-0">
                <FiUser size={22} />
              </div>
<div className="min-w-0">

  {/* Room ID - TOP */}
  <h1 className="text-2xl font-bold text-purple-700 truncate">
    {currentUser?.roomId} Room
  </h1>

  {/* Name - DOWN */}
  <p className="text-sm text-gray-500 truncate mt-1">
    Logged in as
    <span className="font-semibold text-purple-600 ml-1">
      {currentUser?.name}
    </span>
  </p>

</div>

            </div>

            <div className="flex gap-2 w-full sm:w-auto">

              <button
                onClick={
                  handleClearRoom
                }
                disabled={clearing}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl border hover:bg-gray-50 transition disabled:opacity-50"
              >
                {clearing
                  ? "Clearing..."
                  : "Clear Chat"}
              </button>

              <button
                onClick={logout}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition flex items-center justify-center gap-2"
              >
                <FiLogOut />
                Logout
              </button>

            </div>

          </div>

        </header>

        {/* MESSAGES */}

        <main className="flex-1 overflow-y-auto min-h-0 bg-gray-50 px-3 sm:px-5 py-5">

          {messages.length === 0 ? (

            <div className="h-full flex items-center justify-center">

              <div className="text-center">

                <div className="text-6xl mb-4">
                  💬
                </div>

                <h3 className="text-xl font-semibold text-gray-700">
                  No messages yet
                </h3>

                <p className="text-gray-500 mt-2">
                  Start the conversation!
                </p>

              </div>

            </div>

          ) : (

            messages.map(
              (message) => (

                <div
                  key={message.id}
                  className={`flex mb-4 ${
                    isMine(message)
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >

                  <div
                    className={`
                      w-fit
                      max-w-[92%]
                      sm:max-w-[80%]
                      lg:max-w-[60%]
                      rounded-3xl
                      shadow-sm
                      px-4
                      py-3
                      ${
                        isMine(message)
                          ? "bg-[#DCF8C6] text-black rounded-br-md border border-green-200"
                          : "bg-white text-black rounded-bl-md border border-gray-200"
                      }
                    `}
                  >

                    <div
                      className={`font-bold text-sm ${
                        isMine(message)
                          ? "text-green-700"
                          : "text-blue-700"
                      }`}
                    >
                      {message.senderName}
                    </div>

                    {message.text && (
                      <p className="mt-2 text-black whitespace-pre-wrap break-words leading-relaxed">
                        {message.text}
                      </p>
                    )}

                    {message.file && (
                      <div className="mt-2">

                        {message.file.type?.startsWith(
                          "image/"
                        ) && (

                          <img
                            src={
                              message.file.dataUrl
                            }
                            alt={
                              message.file.name
                            }
                            className="max-w-full md:max-w-sm rounded-lg cursor-pointer object-contain shadow"
                            onClick={() =>
                              openImage(
                                message.file
                              )
                            }
                          />

                        )}

                      </div>
                    )}

                    <div className="text-xs mt-3 text-right text-gray-500">
                      {formatTime(
                        message.time
                      )}
                    </div>

                  </div>

                </div>

              )
            )

          )}

          <div
            ref={messagesEndRef}
          />

        </main>

        {/* INPUT */}

        <footer className="flex-shrink-0 bg-white border-t p-4">

          <div className="flex items-end gap-3 relative">

            {/* IMAGE */}

            <label className="flex items-center justify-center w-12 h-12 rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer shadow-sm transition">

              <FiImage className="w-5 h-5 text-gray-600" />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) =>
                  setFile(
                    e.target.files?.[0] ||
                      null
                  )
                }
              />

            </label>

            {/* EMOJI */}

            <button
              onClick={
                toggleEmojiPicker
              }
              className="w-11 h-11 rounded-xl border hover:bg-gray-100 flex items-center justify-center"
            >
              <FiSmile size={20} />
            </button>

            {showEmojiPicker && (

              <div className="absolute bottom-16 left-0 w-72 max-w-[90vw] bg-white border rounded-2xl shadow-xl p-3 grid grid-cols-5 gap-2 z-30">

                {EMOJIS.map(
                  (emoji) => (

                    <button
                      key={emoji}
                      onClick={() =>
                        addEmoji(
                          emoji
                        )
                      }
                      className="text-2xl hover:bg-gray-100 rounded-lg p-2 transition"
                    >
                      {emoji}
                    </button>

                  )
                )}

              </div>

            )}

            {/* TEXT */}

            <textarea
              value={text}
              onChange={(e) =>
                setText(e.target.value)
              }
              onKeyDown={
                handleKeyDown
              }
              rows={1}
              placeholder="Type your message..."
              className="flex-1 resize-none rounded-2xl border px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-32 overflow-y-auto"
            />

            {/* SEND */}

            <button
              onClick={handleSend}
              className="w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-md transition flex items-center justify-center"
            >
              <FiSend />
            </button>

          </div>

          {/* ATTACHMENT */}

          {file && (

            <div className="mt-3 flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3">

              <div className="flex items-center gap-3 overflow-hidden">

                <FiImage className="text-purple-600 flex-shrink-0" />

                <div className="truncate text-sm text-gray-700">
                  {file.name}
                </div>

              </div>

              <button
                onClick={
                  removeAttachment
                }
                className="text-red-500 hover:text-red-700 text-sm font-medium"
              >
                Remove
              </button>

            </div>

          )}

        </footer>

        {/* IMAGE MODAL */}

        {modalImage && (

          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={closeModal}
          >

            <div
              className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) =>
                e.stopPropagation()
              }
            >

              <div className="flex items-center justify-between border-b px-5 py-4">

                <h3 className="font-semibold text-gray-700">
                  Image Preview
                </h3>

                <button
                  onClick={closeModal}
                  className="text-gray-500 hover:text-red-500 text-xl"
                >
                  ✕
                </button>

              </div>

              <div className="flex justify-center items-center bg-gray-100 overflow-auto p-6">

                <img
                  src={modalImage}
                  alt="Preview"
                  className="max-w-full max-h-[70vh] object-contain transition-transform duration-200"
                  style={{
                    transform: `scale(${modalScale})`,
                  }}
                />

              </div>

              <div className="border-t px-5 py-4 flex flex-wrap justify-center gap-3">

                <button
                  onClick={() =>
                    setModalScale(
                      (s) =>
                        Math.max(
                          0.5,
                          +(
                            s - 0.25
                          ).toFixed(
                            2
                          )
                        )
                    )
                  }
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  −
                </button>

                <div className="px-4 py-2 rounded-xl bg-purple-100 text-purple-700 font-medium">
                  {Math.round(
                    modalScale * 100
                  )}
                  %
                </div>

                <button
                  onClick={() =>
                    setModalScale(
                      (s) =>
                        Math.min(
                          3,
                          +(
                            s + 0.25
                          ).toFixed(
                            2
                          )
                        )
                    )
                  }
                  className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  +
                </button>

              </div>

              <div className="pb-4 text-center text-xs text-gray-400">
                ESC to close • + / - keys to zoom
              </div>

            </div>

          </div>

        )}

      </div>
    </div>
  );
}

export default Chat;