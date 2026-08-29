import React, { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  sendMessage,
  leaveRoom,
  setMessages,
  removeMessage,
} from "../store/chatSlice";
import {
  FiSend,
  FiImage,
  FiCamera,
  FiLogOut,
  FiUser,
  FiSmile,
  FiX,
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
  const [onlineCount, setOnlineCount] = useState(0);

  const [modalImage, setModalImage] = useState(null);
  const [modalScale, setModalScale] = useState(1);

  const [clearing, setClearing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] =
    useState(false);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
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
      "🤣",
      "😊",
      "👏",
      "💯",
      "😇",
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

      alert(
        "Session expired due to inactivity."
      );

      dispatch(leaveRoom());

      localStorage.removeItem("chatUser");
      localStorage.removeItem(
        "lastMessageTime"
      );

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
        "✅ CONNECTED:",
        socket.id
      );

      socket.emit(
        "join",
        currentUser.roomId
      );
    });

    socket.on(
      "connect_error",
      (error) => {
        console.error(
          "❌ SOCKET ERROR:",
          error.message
        );
      }
    );

    socket.on(
      "history",
      (history = []) => {
        dispatch(setMessages(history));
      }
    );
   socket.on(
  "roomUserCount",
  (count) => {
    setOnlineCount(count);
  }
);
    socket.on(
      "message",
      (message) => {
        dispatch(sendMessage(message));
      }
    );

    socket.on(
      "clearRoom",
      () => {
        dispatch(setMessages([]));
      }
    );

  socket.on("messageDeleted", (messageId) => {
  dispatch(removeMessage(messageId));
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

      if (!response.ok) {
        throw new Error(
          "Unable to clear room."
        );
      }

      dispatch(setMessages([]));

      localStorage.removeItem(
        `chatRoom:${currentUser.roomId}`
      );
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
          "📤 Sending:",
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
          "❌ SOCKET NOT CONNECTED"
        );

        alert(
          "Connection lost. Please try again."
        );

        return;
      }

      setText("");
      setFile(null);
      setShowEmojiPicker(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      if (cameraInputRef.current) {
        cameraInputRef.current.value = "";
      }
    };

    /* =========================
       IMAGE / CAMERA
    ========================= */

    if (file) {
      const actualFile =
        file?.file || file;

      const fromCamera =
        file?.fromCamera === true;

      const reader = new FileReader();

      reader.onload = () => {
        const dataUrl = reader.result;

        if (
          actualFile.type?.startsWith(
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
              name: actualFile.name,
              type: "image/jpeg",
              dataUrl:
                compressedImage,

              // Camera = Snap
              isSnap: fromCamera,
            });
          };

          img.src = dataUrl;
        } else {
          pushMessage({
            name: actualFile.name,
            type: actualFile.type,
            dataUrl,
            isSnap: false,
          });
        }
      };

      reader.readAsDataURL(
        actualFile
      );

      return;
    }

    /* =========================
       TEXT MESSAGE
    ========================= */

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
     GALLERY
  ========================= */

  const handleGalleryChange = (
    event
  ) => {
    const selectedFile =
      event.target.files?.[0];

    if (!selectedFile) return;

    setFile({
      file: selectedFile,
      fromCamera: false,
    });
  };

  /* =========================
     CAMERA
  ========================= */

  const handleCameraChange = (
    event
  ) => {
    const cameraFile =
      event.target.files?.[0];

    if (!cameraFile) return;

    setFile({
      file: cameraFile,
      fromCamera: true,
    });
  };

  /* =========================
     REMOVE ATTACHMENT
  ========================= */

  const removeAttachment = () => {
    setFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
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
     TIME
  ========================= */

  const formatTime = (time) => {
    if (!time) return "";

    return time;
  };

  /* =========================
     MY MESSAGE
  ========================= */

  const isMine = (message) =>
    message.senderName ===
    currentUser?.name;

  return (
    <div className="fixed inset-0 bg-[#efeae2]">

      <div className="w-full h-full bg-white flex flex-col">

        {/* ================= HEADER ================= */}

        <header className="flex-shrink-0 bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 text-white px-4 py-3 shadow-md">

          <div className="flex items-center justify-between gap-3">

            <div className="flex items-center gap-3 min-w-0">

              <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center flex-shrink-0">

                <FiUser size={21} />

              </div>

              <div className="min-w-0">

                {/* ROOM FIRST */}

                <h1 className="text-xl sm:text-2xl font-bold truncate">

                  {currentUser?.roomId}

                </h1>

                <p className="text-sm text-white/80 truncate">

                  Room

                  <span className="mx-1">
                    •
                  </span>

                  {currentUser?.name}

                </p>
               
    <span className="ml-2 text-sm font-semibold">
      {onlineCount}
    </span>
              </div>

            </div>

            <div className="flex items-center gap-2 flex-shrink-0">

              <button
                onClick={
                  handleClearRoom
                }
                disabled={clearing}
                className="px-3 sm:px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 transition text-sm font-medium disabled:opacity-50"
              >
                {clearing
                  ? "Clearing..."
                  : "Clear"}
              </button>

              <button
                onClick={logout}
                className="px-3 sm:px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 transition flex items-center justify-center gap-2 text-sm font-medium"
              >
                <FiLogOut />
                <span className="hidden sm:inline">
                  Logout
                </span>
              </button>

            </div>

          </div>

        </header>

        {/* ================= MESSAGES ================= */}

        <main className="flex-1 overflow-y-auto min-h-0 bg-[#efeae2] px-3 sm:px-5 py-5">

          {messages.length === 0 ? (

            <div className="h-full flex items-center justify-center">

              <div className="text-center">

                <div className="w-20 h-20 mx-auto rounded-full bg-white shadow flex items-center justify-center text-4xl mb-4">
                  💬
                </div>

                <h3 className="text-xl font-semibold text-gray-700">
                  No messages yet
                </h3>

                <p className="text-gray-500 mt-1">
                  Start the conversation!
                </p>

              </div>

            </div>

          ) : (

            messages.map(
              (message) => {

                const mine =
                  isMine(message);

                return (
                  <div
                    key={message.id}
                    className={`flex mb-2 ${
                      mine
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
                        px-3.5
                        py-2
                        shadow-sm
                        rounded-2xl
                        ${
                          mine
                            ? "bg-[#d9fdd3] rounded-br-md"
                            : "bg-white rounded-bl-md"
                        }
                      `}
                    >

                      {/* NAME */}

                      <div
                        className={`text-xs font-bold mb-0.5 ${
                          mine
                            ? "text-green-700"
                            : "text-purple-700"
                        }`}
                      >
                        {message.senderName}
                      </div>

                      {/* TEXT */}

                      {message.text && (
                        <p className="text-[15px] text-gray-900 whitespace-pre-wrap break-words leading-snug">
                          {message.text}
                        </p>
                      )}

                      {/* FILE */}

                      {message.file && (
                        <div
                          className={
                            message.text
                              ? "mt-1"
                              : "mt-0"
                          }
                        >

                          {/* SNAP HEADING */}

                          {message.file
                            .isSnap && (
                            <div className="text-sm font-bold text-purple-600 mb-1">
                              📸 Snap
                            </div>
                          )}

                          {/* IMAGE */}

                          {message.file.type?.startsWith(
                            "image/"
                          ) && (
                            <img
                              src={
                                message.file
                                  .dataUrl
                              }
                              alt={
                                message.file
                                  .name ||
                                "Image"
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

                      {/* TIME */}

                      <div className="text-[10px] text-gray-500 text-right mt-1">
                        {formatTime(
                          message.time
                        )}
                      </div>

                    </div>

                  </div>
                );
              }
            )

          )}

          <div ref={messagesEndRef} />

        </main>

        {/* ================= INPUT ================= */}

        <footer className="flex-shrink-0 bg-white border-t border-gray-200 p-3 sm:p-4">

          <div className="relative flex items-end gap-2">

            {/* GALLERY */}

            <label className="w-11 h-11 rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer flex items-center justify-center flex-shrink-0 transition">

              <FiImage
                className="text-gray-600"
                size={20}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={
                  handleGalleryChange
                }
              />

            </label>

            {/* CAMERA */}

            <label className="w-11 h-11 rounded-full border border-gray-300 bg-gray-50 hover:bg-gray-100 cursor-pointer flex items-center justify-center flex-shrink-0 transition">

              <FiCamera
                className="text-gray-600"
                size={20}
              />

              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={
                  handleCameraChange
                }
              />

            </label>

            {/* EMOJI */}

            <button
              type="button"
              onClick={
                toggleEmojiPicker
              }
              className="w-11 h-11 rounded-full border border-gray-300 hover:bg-gray-100 flex items-center justify-center flex-shrink-0 transition"
            >
              <FiSmile
                size={20}
                className="text-gray-600"
              />
            </button>

            {/* EMOJI PICKER */}

            {showEmojiPicker && (
              <div className="absolute bottom-14 left-0 w-72 max-w-[90vw] bg-white border border-gray-200 rounded-2xl shadow-xl p-3 grid grid-cols-5 gap-1 z-30">

                {EMOJIS.map(
                  (emoji) => (
                    <button
                      key={emoji}
                      type="button"
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
                setText(
                  e.target.value
                )
              }
              onKeyDown={
                handleKeyDown
              }
              rows={1}
              placeholder="Type a message..."
              className="flex-1 resize-none rounded-2xl border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 max-h-32 overflow-y-auto text-sm sm:text-base"
            />

            {/* SEND */}

            <button
              type="button"
              onClick={handleSend}
              disabled={
                !text.trim() && !file
              }
              className="w-11 h-11 rounded-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white flex items-center justify-center shadow-md transition flex-shrink-0"
            >
              <FiSend size={19} />
            </button>

          </div>

          {/* ATTACHMENT PREVIEW */}

          {file && (
            <div className="mt-2 flex items-center justify-between rounded-xl border bg-gray-50 px-3 py-2">

              <div className="flex items-center gap-2 min-w-0">

                {file.fromCamera ? (
                  <FiCamera className="text-purple-600 flex-shrink-0" />
                ) : (
                  <FiImage className="text-purple-600 flex-shrink-0" />
                )}

                <div className="truncate text-sm text-gray-700">

                  {file.fromCamera
                    ? "📸 Camera Snap"
                    : file.file?.name ||
                      file.name ||
                      "Attachment"}

                </div>

              </div>

              <button
                type="button"
                onClick={
                  removeAttachment
                }
                className="ml-3 w-7 h-7 rounded-full hover:bg-red-100 text-red-500 flex items-center justify-center flex-shrink-0"
              >
                <FiX />
              </button>

            </div>
          )}

        </footer>

        {/* ================= IMAGE MODAL ================= */}

        {modalImage && (
          <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
            onClick={closeModal}
          >

            <div
              className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden"
              onClick={(e) =>
                e.stopPropagation()
              }
            >

              {/* MODAL HEADER */}

              <div className="flex items-center justify-between border-b px-4 py-3">

                <h3 className="font-semibold text-gray-700">
                  Image Preview
                </h3>

                <button
                  type="button"
                  onClick={
                    closeModal
                  }
                  className="w-9 h-9 rounded-full hover:bg-gray-100 text-gray-500 hover:text-red-500 flex items-center justify-center"
                >
                  <FiX />
                </button>

              </div>

              {/* IMAGE */}

              <div className="flex justify-center items-center bg-gray-100 overflow-auto p-4 sm:p-6 max-h-[75vh]">

                <img
                  src={modalImage}
                  alt="Preview"
                  className="max-w-full max-h-[65vh] object-contain transition-transform duration-200"
                  style={{
                    transform: `scale(${modalScale})`,
                  }}
                />

              </div>

              {/* ZOOM */}

              <div className="border-t px-4 py-3 flex justify-center items-center gap-3">

                <button
                  type="button"
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
                  type="button"
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

              <div className="pb-3 text-center text-xs text-gray-400">
                ESC to close • + / − to zoom
              </div>

            </div>

          </div>
        )}

      </div>

    </div>
  );
}

export default Chat;