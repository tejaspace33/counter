import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { sendMessage, leaveRoom, setMessages } from '../store/chatSlice';
import { FiSend, FiImage, FiLogOut, FiUser } from 'react-icons/fi';
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
  const socketRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

    return () => {
      if (socketRef.current) {
        socketRef.current.emit('leave', currentUser.roomId);
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [currentUser, dispatch]);

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
      // convert file to data URL so it can be persisted in localStorage
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result;
        const filePayload = { name: file.name, type: file.type, dataUrl };
        pushMessage(filePayload);
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

  const otherUser = currentUser?.roomId ? 'Friend' : 'Friend';
  return (
    <div className="max-w-3xl mx-auto card-bg p-6 rounded-2xl">
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <FiUser className="w-7 h-7 text-ig-purple" />
          <div>
            <h1 className="text-2xl font-bold text-ig-purple">Chat</h1>
            <div className="text-sm text-gray-600">Logged in as <span className="font-semibold">{currentUser?.name}</span></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { dispatch(leaveRoom()); onLogout(); }} className="px-3 py-2 rounded-lg border flex items-center gap-2"><FiLogOut /> Logout</button>
        </div>
      </header>

      <div className="h-80 overflow-y-auto bg-white p-4 rounded-lg shadow-sm mb-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-600">Start the conversation by sending a message.</div>
        ) : (
          messages.map((message) => {
            const isMe = message.senderName === currentUser?.name;
            return (
              <div key={message.id} className={`mb-3 max-w-[78%] p-3 rounded-2xl ${isMe ? 'ml-auto bg-gradient-to-r from-ig-purple to-ig-pink text-white' : 'mr-auto bg-gray-100 text-gray-800'}`}>
                <div className="font-semibold text-sm">{message.senderName}</div>
                {message.text ? <div className="mt-1">{message.text}</div> : null}
                {message.file ? (
                  <div className="mt-2">
                    {message.file.type && message.file.type.startsWith('image/') ? (
                      <img src={message.file.dataUrl} alt={message.file.name} className="max-w-xs rounded-md cursor-pointer" onClick={() => openImage(message.file)} />
                    ) : (
                      <a href={message.file.dataUrl} download={message.file.name} className="text-blue-600">Download: {message.file.name}</a>
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
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer text-gray-600">
            <FiImage className="w-5 h-5" />
            <input id="file-input" ref={fileInputRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <div className="flex-1">
            <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={handleKeyDown} placeholder="Type your message..." className="w-full p-3 rounded-xl border" rows={2} />
          </div>
          <button onClick={handleSend} className="px-4 py-3 bg-ig-purple text-white rounded-xl flex items-center gap-2"><FiSend /> Send</button>
        </div>
        {file && (
          <div className="flex items-center justify-between bg-white p-2 rounded-lg border">
            <div className="text-sm">Attached: {file.name}</div>
            <button onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-sm text-red-600">Remove</button>
          </div>
        )}
      </div>

      {modalImage ? (
        <div className="image-modal" onClick={closeModal}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={modalImage} alt="preview" style={{ transform: `scale(${modalScale})` }} />
            <div className="mt-2 text-center">
              <button onClick={() => setModalScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))} className="px-3 py-1 border rounded-md mr-2">-</button>
              <button onClick={() => setModalScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))} className="px-3 py-1 border rounded-md">+</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Chat;