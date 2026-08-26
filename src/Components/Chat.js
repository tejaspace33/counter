import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  sendMessage,
  leaveRoom,
  setMessages,
} from "../store/chatSlice";
import {
  FiSend,
  FiImage,
  FiLogOut,
  FiUser,
  FiSmile,
  FiCheck,
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);

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

  /* =========================
     EMOJI
  ========================= */

  const toggleEmojiPicker = () => {
    setShowEmojiPicker((prev) => !prev);
  };

  const addEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  /* =========================
     AUTO SCROLL
  ========================= */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  /* =========================
     AUTO LOGOUT
  ========================= */

  useEffect(() => {
    if (!currentUser) return;

    const checkTimeout = () => {
      const lastActivity = Number(
        localStorage.getItem("lastMessageTime") || 0
      );

      if (!lastActivity) return;

      const inactive =
        Date.now() - lastActivity >= 10 * 60 * 1000;

      if (!inactive) return;

      alert("Session expired due to inactivity.");

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

  /* =========================
     SOCKET CONNECTION
  ========================= */

  useEffect(() => {
    if (!currentUser) return;

    const socket = io(socketURL, {
      transports: ["polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log(
        "✅ CONNECTED TO RAILWAY:",
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

    socket.on("history", (history = []) => {
      dispatch(setMessages(history));
    });

    socket.on("message", (message) => {
      dispatch(sendMessage(message));
    });

    socket.on("clearRoom", () => {
      dispatch(setMessages([]));
    });

    return () => {
      socket.emit(
        "leave",
        currentUser.roomId
      );

      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    currentUser,
    dispatch,
    socketURL,
  ]);

  /* =========================
     IMAGE MODAL KEYBOARD
  ========================= */

  useEffect(() => {
    if (!modalImage) return;

    const handleKey = (event) => {
      switch (event.key) {
        case "Escape":
          closeModal();
          break;

        case "+":
        case "=":
          setModalScale((value) =>
            Math.min(
              3,
              +(value + 0.25).toFixed(2)
            )
          );
          break;

        case "-":
          setModalScale((value) =>
            Math.max(
              0.5,
              +(value - 0.25).toFixed(2)
            )
          );
          break;

        default:
          break;
      }
    };

    window.addEventListener(
      "keydown",
      handleKey
    );

    return () =>
      window.removeEventListener(
        "keydown",
        handleKey
      );
  }, [modalImage]);

  /* =========================
     CLEAR ROOM
  ========================= */

  const handleClearRoom = async () => {
    if (!currentUser?.roomId) return;

    const confirmed = window.confirm(
      "Clear this room for everyone?"
    );

    if (!confirmed) return;

    setClearing(true);

    try {
      const response = await fetch(
        `${socketURL}/clear-room`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            room: currentUser.roomId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(
          "Unable to clear room."
        );
      }

      dispatch(setMessages([]));
    } catch (error) {
      console.error(
        "Clear room error:",
        error
      );

      alert("Unable to clear room.");
    } finally {
      setClearing(false);
    }
  };

  /* =========================
     IMAGE MODAL
  ========================= */

  const openImage = (fileObject) => {
    if (!fileObject?.dataUrl) return;

    setModalImage(fileObject.dataUrl);
    setModalScale(1);
  };

  const closeModal = () => {
    setModalImage(null);
    setModalScale(1);
  };

  /* =========================
     SEND MESSAGE
  ========================= */

  const handleSend = () => {
    const trimmed = text.trim();

    if (!trimmed && !file) return;

    const pushMessage = (
      filePayload = null
    ) => {
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

      if (socketRef.current?.connected) {
        console.log(
          "📤 Sending to Railway:",
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
      } else {
        console.error(
          "❌ SOCKET NOT CONNECTED TO RAILWAY"
        );
      }

      setText("");
      setFile(null);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };

    /* =========================
       IMAGE
    ========================= */

    if (file) {
      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result;

        if (file.type.startsWith("image/")) {
          const img = new Image();

          img.onload = () => {
            let width = img.width;
            let height = img.height;

            const MAX_SIZE = 1200;

            if (
              width > MAX_SIZE ||
              height > MAX_SIZE
            ) {
              const ratio = Math.min(
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
              dataUrl: compressedImage,
            });
          };

          img.src = dataUrl;
        } else {
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

    pushMessage();
  };

  /* =========================
     ENTER KEY
  ========================= */

  const handleKeyDown = (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      handleSend();
    }
  };

  /* =========================
     REMOVE FILE
  ========================= */

  const removeAttachment = () => {
    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  /* =========================
     LOGOUT
  ========================= */

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

  /* =========================
     HELPERS
  ========================= */

  const formatTime = (time) => {
    if (!time) return "";
    return time;
  };

  const isMine = (message) =>
    message.senderName ===
    currentUser?.name;

  /* =========================
     UI
  ========================= */

  return (
    <div className="fixed inset-0 bg-[#0f172a]">

      <div className="w-full h-full bg-[#111827] flex flex-col">

        {/* ================= HEADER ================= */}

        <header className="flex-shrink-0 bg-[#172033] border-b border-[#293548] px-4 py-3">

          <div className="px-3 sm:px-5 py-3 flex items-center justify-between gap-3">

            <div className="flex items-center gap-3 min-w-0">

              {/* PROFILE */}

              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">

                <FiUser
                  size={21}
                />

              </div>

              {/* ROOM + NAME */}

              <div className="min-w-0">

                <h1 className="text-2xl font-bold text-purple-400">
                  {currentUser?.roomId} Room
                </h1>

                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-white/80">

                  <span className="w-2 h-2 rounded-full bg-green-300" />

                  <span className="truncate">
                    {currentUser?.name}
                  </span>

                  <span className="hidden sm:inline">
                    •
                  </span>

                  <span className="hidden sm:inline">
                    Connected
                  </span>

                </div>

              </div>

            </div>

            {/* HEADER BUTTONS */}

            <div className="flex items-center gap-2 flex-shrink-0">

              <button
                onClick={handleClearRoom}
                disabled={clearing}
                className="px-3 sm:px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs sm:text-sm font-medium transition disabled:opacity-50"
              >
                {clearing
                  ? "Clearing..."
                  : "Clear"}
              </button>

              <button
                onClick={logout}
                className="px-3 sm:px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs sm:text-sm font-medium transition flex items-center gap-1.5"
              >
                <FiLogOut size={15} />

                <span className="hidden sm:inline">
                  Logout
                </span>
              </button>

            </div>

          </div>

        </header>

        {/* ================= MESSAGES ================= */}

        <main className="flex-1 overflow-y-auto min-h-0 bg-[#0f172a] px-3 sm:px-5 py-5">

          {messages.length === 0 ? (

            <div className="h-full flex items-center justify-center">

              <div className="text-center bg-white/70 backdrop-blur-sm rounded-2xl px-7 py-6 shadow-sm">

                <div className="text-5xl mb-3">
                  💬
                </div>

                <h3 className="text-lg font-semibold text-gray-700">
                  No messages yet
                </h3>

                <p className="text-sm text-gray-400 truncate">
                  Start the conversation!
                </p>

              </div>

            </div>

          ) : (

            messages.map((message) => {

              const mine =
                isMine(message)


              return (
                <div
                  key={message.id}
                  className={`flex mb-2.5 ${
                    mine
                      ? "justify-end"
                      : "justify-start"
                  }`}
                >

                  <div
                    className={`
                      relative
                      max-w-[88%]
                      sm:max-w-[75%]
                      lg:max-w-[60%]
                      px-3
                      py-2
                      shadow-sm
                      ${
                        mine
                          ? "bg-[#d9fdd3] rounded-2xl rounded-tr-md"
                          : "bg-[#1e293b] text-white rounded-bl-md border border-[#334155]"
                      }
                    `}
                  >

                    {/* NAME */}

                    <div
                      className={`
                        text-[11px]
                        font-semibold
                        leading-tight
                        mb-0.5
                        ${
                          mine
                            ? "text-[#128c7e]"
                            : "text-[#075e54]"
                        }
                      `}
                    >
                      {message.senderName}
                    </div>

                    {/* TEXT + TIME */}

                    {message.text && (

                      <div className="flex items-end gap-2">

                        <p className="text-[14px] sm:text-[15px] text-gray-900 whitespace-pre-wrap break-words leading-[1.3]">
                          {message.text}
                        </p>

                        {/* TIME */}

                        <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">

                          <span className="text-[10px] text-gray-500 whitespace-nowrap">
                            {formatTime(
                              message.time
                            )}
                          </span>

                          {mine && (
                            <FiCheck
                              size={11}
                              className="text-[#34b7f1]"
                            />
                          )}

                        </div>

                      </div>

                    )}

                    {/* IMAGE */}

                    {message.file && (
                      <div
                        className={
                          message.text
                            ? "mt-1.5"
                            : "mt-0.5"
                        }
                      >

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
                            className="
                              max-w-full
                              sm:max-w-sm
                              max-h-[350px]
                              rounded-xl
                              cursor-pointer
                              object-cover
                              shadow-sm
                            "
                            onClick={() =>
                              openImage(
                                message.file
                              )
                            }
                          />

                        )}

                      </div>
                    )}

                    {/* TIME FOR IMAGE-ONLY MESSAGE */}

                    {!message.text &&
                      message.file && (

                        <div className="flex justify-end items-center gap-1 mt-1">

                          <span className="text-[10px] text-gray-500">
                            {formatTime(
                              message.time
                            )}
                          </span>

                          {mine && (
                            <FiCheck
                              size={11}
                              className="text-[#34b7f1]"
                            />
                          )}

                        </div>

                      )}

                  </div>

                </div>
              );
            })

          )}

          <div ref={messagesEndRef} />

        </main>

        {/* ================= ATTACHMENT PREVIEW ================= */}

        {file && (

          <div className="flex-shrink-0 px-3 pt-2 bg-[#f0f2f5]">

            <div className="flex items-center justify-between rounded-xl bg-white border px-3 py-2 shadow-sm">

              <div className="flex items-center gap-2 min-w-0">

                <FiImage
                  className="text-[#128c7e] flex-shrink-0"
                />

                <span className="text-sm text-gray-700 truncate">
                  {file.name}
                </span>

              </div>

              <button
                onClick={removeAttachment}
                className="text-red-500 hover:text-red-700 text-sm font-medium ml-3"
              >
                Remove
              </button>

            </div>

          </div>

        )}

        {/* ================= INPUT ================= */}

        <footer className="flex-shrink-0 bg-[#f0f2f5] border-t border-gray-200 px-2 sm:px-4 py-2">

          <div className="relative flex items-end gap-2">

            {/* EMOJI PICKER */}

            {showEmojiPicker && (

              <div className="
                absolute
                bottom-14
                left-0
                w-72
                max-w-[90vw]
                bg-white
                border
                rounded-2xl
                shadow-xl
                p-3
                grid
                grid-cols-5
                gap-1
                z-30
              ">

                {EMOJIS.map(
                  (emoji) => (

                    <button
                      key={emoji}
                      onClick={() =>
                        addEmoji(
                          emoji
                        )
                      }
                      className="
                        text-2xl
                        hover:bg-gray-100
                        rounded-lg
                        p-2
                        transition
                      "
                    >
                      {emoji}
                    </button>

                  )
                )}

              </div>

            )}

            {/* IMAGE */}

            <label className="
              w-11
              h-11
              rounded-full
              flex
              items-center
              justify-center
              cursor-pointer
              text-gray-600
              hover:bg-gray-200
              transition
              flex-shrink-0
            ">

              <FiImage size={21} />

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
              className="
                w-11
                h-11
                rounded-full
                flex
                items-center
                justify-center
                text-gray-600
                hover:bg-gray-200
                transition
                flex-shrink-0
              "
            >
              <FiSmile
                size={21}
              />
            </button>

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
              placeholder="Type a message"
              className="
                flex-1
                resize-none
                rounded-2xl
                bg-white
                border
                border-gray-200
                px-4
                py-2.5
                text-sm
                sm:text-base
                focus:outline-none
                focus:border-[#128c7e]
                max-h-32
                overflow-y-auto
                shadow-sm
              "
            />

            {/* SEND */}

            <button
              onClick={handleSend}
              className="
                w-11
                h-11
                rounded-full
                bg-[#128c7e]
                hover:bg-[#075e54]
                text-white
                flex
                items-center
                justify-center
                shadow-sm
                transition
                flex-shrink-0
              "
            >
              <FiSend
                size={18}
              />
            </button>

          </div>

        </footer>

        {/* ================= IMAGE MODAL ================= */}

        {modalImage && (

          <div
            className="
              fixed
              inset-0
              z-50
              bg-black/80
              backdrop-blur-sm
              flex
              items-center
              justify-center
              p-3
            "
            onClick={closeModal}
          >

            <div
              className="
                bg-white
                rounded-2xl
                shadow-2xl
                max-w-5xl
                w-full
                max-h-[94vh]
                overflow-hidden
              "
              onClick={(e) =>
                e.stopPropagation()
              }
            >

              {/* MODAL HEADER */}

              <div className="flex items-center justify-between border-b px-4 py-3">

                className="font-semibold text-purple-400 ml-1"
                  Image Preview
                </h3>

                <button
                  onClick={closeModal}
                  className="text-gray-500 hover:text-red-500 text-xl"
                >
                  ✕
                </button>

              </div>

              {/* IMAGE */}

              <div className="flex justify-center items-center bg-gray-100 overflow-auto p-5">

                <img
                  src={modalImage}
                  alt="Preview"
                  className="
                    max-w-full
                    max-h-[70vh]
                    object-contain
                    transition-transform
                    duration-200
                  "
                  style={{
                    transform: `scale(${modalScale})`,
                  }}
                />

              </div>

              {/* CONTROLS */}

              <div className="border-t px-4 py-3 flex justify-center items-center gap-3">

                <button
                  onClick={() =>
                    setModalScale(
                      (s) =>
                        Math.max(
                          0.5,
                          +(
                            s - 0.25
                          ).toFixed(2)
                        )
                    )
                  }
                  className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  −
                </button>

                <div className="px-4 py-2 rounded-xl bg-green-50 text-green-700 font-medium text-sm">
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
                          ).toFixed(2)
                        )
                    )
                  }
                  className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200"
                >
                  +
                </button>

              </div>

              <div className="pb-3 text-center text-[11px] text-gray-400">
                ESC to close • + / - to zoom
              </div>

            </div>

          </div>

        )}

      </div>

    </div>
  );
}

export default Chat;