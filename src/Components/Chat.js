import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { sendMessage, leaveRoom, setMessages } from "../store/chatSlice";
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

  const currentUser = useSelector((state) => state.chat.currentUser);
  const messages = useSelector((state) => state.chat.messages);

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
    process.env.REACT_APP_SOCKET_URL || "http://localhost:3001";

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

  const toggleEmojiPicker = () => {
    setShowEmojiPicker((prev) => !prev);
  };

  const addEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  // Always scroll to newest message

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  // Auto logout after inactivity

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

    const interval = setInterval(checkTimeout, 30000);

    return () => clearInterval(interval);
  }, [currentUser, dispatch, onLogout]);

  // Socket Connection

  useEffect(() => {
    if (!currentUser) return;

    const socket = io(socketURL, {
      transports: ["websocket", "polling"],
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join", currentUser.roomId);
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
      socket.emit("leave", currentUser.roomId);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [currentUser, dispatch, socketURL]);

  // Close image modal with keyboard

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
            Math.min(3, +(value + 0.25).toFixed(2))
          );
          break;

        case "-":
          setModalScale((value) =>
            Math.max(0.5, +(value - 0.25).toFixed(2))
          );
          break;

        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKey);

    return () =>
      window.removeEventListener("keydown", handleKey);
  }, [modalImage]);

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
        throw new Error("Unable to clear room.");
      }

      dispatch(setMessages([]));
    } catch (error) {
      console.error(error);
      alert("Unable to clear room.");
    } finally {
      setClearing(false);
    }
  };

  const openImage = (fileObject) => {
    if (!fileObject?.dataUrl) return;

    setModalImage(fileObject.dataUrl);
    setModalScale(1);
  };

  const closeModal = () => {
    setModalImage(null);
    setModalScale(1);
  };

 const handleSend = () => {
  const trimmed = text.trim();

  if (!trimmed && !file) return;

  const pushMessage = (filePayload = null) => {
    const message = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      senderName: currentUser.name,
      text: trimmed,
      file: filePayload,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    if (socketRef.current?.connected) {
      socketRef.current.emit("sendMessage", {
        room: currentUser.roomId,
        message,
      });

      localStorage.setItem(
        "lastMessageTime",
        Date.now().toString()
      );
    } else {
      dispatch(sendMessage(message));
    }

    setText("");
    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Send Image

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

          if (width > MAX_SIZE || height > MAX_SIZE) {
            const ratio = Math.min(
              MAX_SIZE / width,
              MAX_SIZE / height
            );

            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");

          ctx.drawImage(img, 0, 0, width, height);

          const compressedImage = canvas.toDataURL(
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

const handleKeyDown = (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    handleSend();
  }
};

const removeAttachment = () => {
  setFile(null);

  if (fileInputRef.current) {
    fileInputRef.current.value = "";
  }
};

const logout = () => {
  dispatch(leaveRoom());

  localStorage.removeItem("chatUser");
  localStorage.removeItem("lastMessageTime");

  onLogout();
};

const formatTime = (time) => {
  if (!time) return "";

  return time;
};



const isMine = (message) =>
  message.senderName === currentUser?.name;

return (
  <div className="w-full h-[100dvh] bg-gray-100 flex justify-center items-center p-0 md:p-6">

    <div className="w-full max-w-6xl h-full md:h-[95vh] bg-white shadow-2xl rounded-none md:rounded-3xl overflow-hidden flex flex-col">

      {/* ================= HEADER ================= */}

      <header className="sticky top-0 z-20 bg-white border-b px-4 py-3 flex flex-wrap items-center justify-between gap-4">

        <div className="flex items-center gap-3 min-w-0">

          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white flex items-center justify-center">

            <FiUser size={22} />

          </div>

          <div className="min-w-0">

            <h2 className="text-xl font-bold text-gray-800 truncate">
              Room Chat
            </h2>

            <p className="text-sm text-gray-500 truncate">
              Logged in as
              <span className="font-semibold text-purple-600 ml-1">
                {currentUser?.name}
              </span>
            </p>

          </div>

        </div>

        <div className="flex gap-2 w-full sm:w-auto">

          <button
            onClick={handleClearRoom}
            disabled={clearing}
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl border hover:bg-gray-50 transition disabled:opacity-50"
          >
            {clearing ? "Clearing..." : "Clear Chat"}
          </button>

          <button
            onClick={logout}
            className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-red-500 text-white hover:bg-red-600 transition flex items-center justify-center gap-2"
          >
            <FiLogOut />
            Logout
          </button>

        </div>

      </header>

      {/* ================= MESSAGES ================= */}

      <main className="flex-1 overflow-y-auto bg-gray-50 px-3 sm:px-5 py-5">

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

          messages.map((message) => (

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
                  rounded-2xl
                  shadow
                  px-4
                  py-3
                  ${
                    isMine(message)
                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                      : "bg-white"
                  }
                `}
              >

                <div
                  className={`font-semibold text-sm ${
                    isMine(message)
                      ? "text-purple-100"
                      : "text-purple-600"
                  }`}
                >
                  {message.senderName}
                </div>

                {message.text && (

                  <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">

                    {message.text}

                  </p>

                )}
{message.file ? (
  <div className="mt-2">
    {message.file.type?.startsWith("image/") && (
      <img
        src={message.file.dataUrl}
        alt={message.file.name}
        className="max-w-full md:max-w-sm rounded-lg cursor-pointer object-contain shadow"
        onClick={() => openImage(message.file)}
      />
    )}
  </div>
) : null}

                <div
                  className={`text-xs mt-3 text-right ${
                    isMine(message)
                      ? "text-purple-100"
                      : "text-gray-400"
                  }`}
                >
                  {formatTime(message.time)}
                </div>

              </div>

            </div>

          ))

        )}

        <div ref={messagesEndRef} />

      </main>

      {/* ================= INPUT ================= */}

      <footer className="sticky bottom-0 bg-white border-t p-4">

        <div className="flex items-end gap-3 relative">

          <label className="cursor-pointer">

            <FiImage
              size={22}
              className="text-gray-600 hover:text-purple-600 transition"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) =>
                setFile(e.target.files?.[0] || null)
              }
            />

          </label>

          <button
            onClick={toggleEmojiPicker}
            className="w-11 h-11 rounded-xl border hover:bg-gray-100 flex items-center justify-center"
          >
            <FiSmile size={20} />
          </button>

          {showEmojiPicker && (

            <div className="absolute bottom-16 left-0 w-72 max-w-[90vw] bg-white border rounded-2xl shadow-xl p-3 grid grid-cols-5 gap-2 z-30">

              {EMOJIS.map((emoji) => (

                <button
                  key={emoji}
                  onClick={() => addEmoji(emoji)}
                  className="text-2xl hover:bg-gray-100 rounded-lg p-2 transition"
                >
                  {emoji}
                </button>

              ))}

            </div>

          )}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Type your message..."
            className="flex-1 resize-none rounded-2xl border px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-32 overflow-y-auto"
          />

          <button
            onClick={handleSend}
            className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center transition"
          >
            <FiSend />
          </button>

        </div>
               {file && (
          <div className="mt-3 flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3">

            <div className="flex items-center gap-3 overflow-hidden">

              <FiImage className="text-purple-600 flex-shrink-0" />

              <div className="truncate text-sm text-gray-700">
                {file.name}
              </div>

            </div>

            <button
              onClick={removeAttachment}
              className="text-red-500 hover:text-red-700 text-sm font-medium"
            >
              Remove
            </button>

          </div>
        )}

      </footer>

      {/* ================= IMAGE MODAL ================= */}

      {modalImage && (

        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeModal}
        >

          <div
            className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
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
                  setModalScale((s) =>
                    Math.max(0.5, +(s - 0.25).toFixed(2))
                  )
                }
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
              >
                −
              </button>

              <div className="px-4 py-2 rounded-xl bg-purple-100 text-purple-700 font-medium">

                {Math.round(modalScale * 100)}%

              </div>

              <button
                onClick={() =>
                  setModalScale((s) =>
                    Math.min(3, +(s + 0.25).toFixed(2))
                  )
                }
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200"
              >
                +
              </button>

              <a
                href={modalImage}
                download="image"
                className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-600 text-white"
              >
                Download
              </a>

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