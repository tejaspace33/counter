import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sendMessage, leaveRoom, setMessages } from '../store/chatSlice';
import { FiSend, FiImage, FiLogOut, FiUser, FiSmile } from 'react-icons/fi';
import { io } from 'socket.io-client';

function Chat({ onLogout }) {
  const dispatch = useDispatch();
  const currentUser = useSelector((s) => s.chat.currentUser);
  const messages = useSelector((s) => s.chat.messages);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [modalImage, setModalImage] = useState(null);
  const [modalScale, setModalScale] = useState(1);
  const [clearing, setClearing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const socketRef = useRef(null);

  const EMOJIS = ['😀', '😂', '😍', '😎', '🙌', '👍', '🎉', '✨', '🔥', '🥳', '💬', '❤️', '🙈', '🤖', '🫶'];

  const toggleEmojiPicker = () => {
    setShowEmojiPicker((current) => !current);
  };

  const addEmoji = (emoji) => {
    setText((prev) => prev + emoji);
    setShowEmojiPicker(false);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto logout after 10 minutes without sending a message
useEffect(() => {
  if (!currentUser) return;

  const checkTimeout = () => {
    const last = Number(localStorage.getItem("lastMessageTime") || 0);

    if (!last) return;

    if (Date.now() - last >= 10 * 60 * 1000) {
      alert("Session expired due to inactivity.");

      dispatch(leaveRoom());

      localStorage.removeItem("chatUser");
      localStorage.removeItem("lastMessageTime");

      onLogout();
    }
  };

  checkTimeout();

  const interval = setInterval(checkTimeout, 30000);

  return () => clearInterval(interval);

}, [currentUser, dispatch, onLogout]);

  // connect to socket when currentUser joins
  useEffect(() => {
    if (!currentUser) return;
    const url = process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001';
    const socket = io(url, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', currentUser.roomId);
    });

    socket.on('history', (history) => {
      dispatch(setMessages(history || []));
    });

    socket.on('message', (message) => {
      dispatch(sendMessage(message));
    });

    socket.on('clearRoom', () => {
      dispatch(setMessages([]));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave', currentUser.roomId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [currentUser, dispatch]);

  const handleClearRoom = async () => {
    if (!currentUser?.roomId) return;
    if (!window.confirm('Clear this room for everyone? This will delete the stored chat history.')) return;

    setClearing(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_SOCKET_URL || 'http://localhost:3001'}/clear-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: currentUser.roomId }),
      });

      if (!response.ok) {
        throw new Error('Unable to clear room');
      }

      dispatch(setMessages([]));
    } catch (error) {
      console.error('Clear room failed:', error);
      alert('Could not clear room. Please try again.');
    } finally {
      setClearing(false);
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && !file) return;

    const pushMessage = (filePayload = null) => {
      const nextMessage = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        senderName: currentUser.name,
        text: trimmed,
        file: filePayload,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      // send to server; server will broadcast message back to all clients including sender
      if (socketRef.current && socketRef.current.connected && currentUser) {
        socketRef.current.emit('sendMessage', { room: currentUser.roomId, message: nextMessage });
        // User is active because they sent a message
localStorage.setItem(
    "lastMessageTime",
    Date.now().toString()
);
      } else {
        // fallback to local dispatch
        dispatch(sendMessage(nextMessage));
      }
      setText('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    if (file) {
      // convert file to data URL and compress if it's an image
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        
        // If it's an image, compress it before sending
        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.onload = () => {
            // Create canvas and compress
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            // Limit max dimensions
            const maxDim = 1200;
            if (width > maxDim || height > maxDim) {
              const ratio = Math.min(maxDim / width, maxDim / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // Compress to JPEG with quality 0.8
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            const filePayload = { name: file.name, type: 'image/jpeg', dataUrl: compressedDataUrl };
            pushMessage(filePayload);
          };
          img.src = dataUrl;
        } else {
          const filePayload = { name: file.name, type: file.type, dataUrl };
          pushMessage(filePayload);
        }
      };
      reader.readAsDataURL(file);
    } else {
      pushMessage(null);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSend();
    }
  };

  const openImage = (fileObj) => {
    if (!fileObj) return;
    if (fileObj.dataUrl) {
      setModalImage(fileObj.dataUrl);
      setModalScale(1);
    }
  };

  const closeModal = () => {
    setModalImage(null);
    setModalScale(1);
  };

  useEffect(() => {
    if (!modalImage) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModal();
      if (e.key === '+' || e.key === '=') setModalScale((s) => Math.min(3, +(s + 0.25).toFixed(2)));
      if (e.key === '-') setModalScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalImage]);

  return (
    <div className="max-w-3xl mx-auto card-bg p-2 md:p-6 rounded-2xl h-screen md:h-auto md:max-h-screen overflow-hidden md:overflow-visible flex flex-col">
      <header className="flex items-center justify-between mb-2 md:mb-4 gap-2 md:gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
          <FiUser className="w-5 h-5 md:w-7 md:h-7 text-ig-purple flex-shrink-0" />
          <div>
            <h1 className="text-2xl font-bold text-ig-purple">Chat</h1>
            <div className="text-sm text-gray-600">Logged in as <span className="font-semibold truncate">{currentUser?.name}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <button onClick={handleClearRoom} disabled={clearing} className="flex-1 md:flex-none px-3 py-2 rounded-lg border bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm md:text-base">
            Clear Chat
          </button>
          <button onClick={() => { dispatch(leaveRoom()); onLogout(); }} className="flex-1 md:flex-none px-3 py-2 rounded-lg border flex items-center justify-center gap-2 text-sm md:text-base"><FiLogOut /> Logout</button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-white p-3 md:p-4 rounded-lg shadow-sm mb-4 min-h-0">
        {messages.length === 0 ? (
          <div className="text-center text-gray-600">Start the conversation by sending a message.</div>
        ) : (
          messages.map((message) => {
            const isMe = message.senderName === currentUser?.name;
            return (
              <div key={message.id} className={`mb-3 max-w-[85%] md:max-w-[78%] p-2 md:p-3 rounded-2xl text-sm md:text-base ${isMe ? 'ml-auto bg-gradient-to-r from-ig-purple to-ig-pink text-white' : 'mr-auto bg-gray-100 text-gray-800'}`}>
                <div className="font-semibold text-xs md:text-sm">{message.senderName}</div>
                {message.text ? <div className="mt-1 break-words">{message.text}</div> : null}
                {message.file ? (
                  <div className="mt-2">
                    {message.file.type && message.file.type.startsWith('image/') ? (
                      <img 
                        src={message.file.dataUrl} 
                        alt={message.file.name} 
                        className="max-w-sm md:max-w-md rounded-md cursor-pointer object-contain max-h-64 w-auto shadow-sm" 
                        onClick={() => openImage(message.file)} 
                      />
                    ) : (
                      <a href={message.file.dataUrl} download={message.file.name} className="text-blue-600 underline break-all">Download: {message.file.name}</a>
                    )}
                  </div>
                ) : null}
                <div className="text-xs text-right mt-2 opacity-80">{message.time}</div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 md:gap-3 relative flex-wrap md:flex-nowrap">
          <label className="flex items-center gap-2 cursor-pointer text-gray-600 hover:text-gray-800">
            <FiImage className="w-5 h-5 flex-shrink-0" />
            <input id="file-input" ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button type="button" onClick={toggleEmojiPicker} className="flex items-center justify-center w-10 h-10 rounded-xl border bg-white text-gray-600 hover:bg-gray-100 flex-shrink-0">
            <FiSmile className="w-5 h-5" />
          </button>
          {showEmojiPicker ? (
            <div className="absolute left-0 top-14 z-10 w-64 rounded-xl bg-white shadow-lg border p-3 grid grid-cols-5 gap-2 md:left-auto">
              {EMOJIS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => addEmoji(emoji)} className="text-2xl leading-none hover:bg-gray-100 rounded-lg p-1">
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex-1 min-w-0">
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type your message..." className="w-full p-2 md:p-3 rounded-xl border text-sm md:text-base" rows={2} />
          </div>
          <button onClick={handleSend} className="px-3 md:px-4 py-2 md:py-3 bg-ig-purple text-white rounded-xl flex items-center justify-center gap-1 md:gap-2 text-sm md:text-base flex-shrink-0"><FiSend className="w-4 h-4 md:w-5 md:h-5" /> <span className="hidden md:inline">Send</span></button>
        </div>
        {file && (
          <div className="flex items-center justify-between bg-white p-2 rounded-lg border">
            <div className="text-sm">Attached: {file.name}</div>
            <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-sm text-red-600">Remove</button>
          </div>
        )}
      </div>

      {modalImage ? (
        <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="bg-white rounded-lg p-4 max-w-2xl w-full max-h-96 md:max-h-[600px] flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img 
              src={modalImage} 
              alt="preview" 
              className="max-w-full max-h-80 md:max-h-[500px] object-contain rounded-md" 
              style={{ transform: `scale(${modalScale})` }} 
            />
            <div className="mt-4 flex gap-2 flex-wrap justify-center">
              <button onClick={() => setModalScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))} className="px-4 py-2 border rounded-md bg-gray-100 hover:bg-gray-200 text-sm">−</button>
              <span className="px-4 py-2 text-sm text-gray-600">{Math.round(modalScale * 100)}%</span>
              <button onClick={() => setModalScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))} className="px-4 py-2 border rounded-md bg-gray-100 hover:bg-gray-200 text-sm">+</button>
              <button onClick={closeModal} className="px-4 py-2 border rounded-md bg-red-100 hover:bg-red-200 text-sm">Close</button>
            </div>
            <div className="mt-2 text-xs text-gray-500 text-center">Use +/− keys or buttons to zoom • ESC to close</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Chat;