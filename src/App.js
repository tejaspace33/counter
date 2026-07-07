import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { joinRoom, leaveRoom, setMessages } from './store/chatSlice';
import Chat from './Components/Chat';

function App() {
  const dispatch = useDispatch();
  const currentUser = useSelector((s) => s.chat.currentUser);
  const messages = useSelector((s) => s.chat.messages);
  const [roomId, setRoomId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: enter room id, 2: enter name

  // persist messages for the current room
  useEffect(() => {
    if (!currentUser) return;
    const key = `chatRoom:${currentUser.roomId}`;
    localStorage.setItem(key, JSON.stringify(messages));
  }, [messages, currentUser]);

  // listen for updates to this room from other tabs/windows
  useEffect(() => {
    if (!currentUser) return;
    const key = `chatRoom:${currentUser.roomId}`;
    const handler = (e) => {
      if (e.key !== key) return;
      try {
        const newMsgs = JSON.parse(e.newValue || '[]');
        dispatch(setMessages(newMsgs));
      } catch (err) {
        console.warn('Failed to parse storage event for', key, err);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [currentUser]);

  // Step 1: user enters room id and clicks Join
  const handleJoin = () => {
    const id = roomId.trim();
    if (!id) {
      setError('Please enter a room id (key).');
      return;
    }
    setError('');
    setStep(2);
  };

  // Step 2: user enters display name and enters the room
  const handleEnterRoom = () => {
    const id = roomId.trim();
    const name = displayName.trim();
    if (!id) {
      setError('Room id missing.');
      setStep(1);
      return;
    }
    if (!name) {
      setError('Please enter your display name.');
      return;
    }
    dispatch(joinRoom({ roomId: id, name }));
    setError('');
  };

  const handleLogout = () => {
    dispatch(leaveRoom());
    setRoomId('');
    setDisplayName('');
    setStep(1);
  };

  return (
    <div className="Container mt-12">
      {currentUser ? (
        <Chat onLogout={handleLogout} />
      ) : (
        <div className="App ChatApp max-w-3xl mx-auto card-bg p-6 rounded-2xl">
          <header>
            <h1 className="text-3xl font-extrabold text-ig-purple">lets chat</h1>
          </header>
          <div className="hero-panel p-6 rounded-xl mb-6 card-bg">
            <div>
              <p className="text-xs uppercase tracking-widest text-ig-purple font-semibold">Private two-person rooms</p>
              <p className="mt-2 text-sm text-gray-700">Create or join a secure room with a shared key, then chat instantly with another person. Messages and attachments stay in your browser while the room is active.</p>
            </div>
          </div>
          <div className="login-box card-bg p-6 rounded-xl">
            {step === 1 ? (
              // Step 1: enter room id only
              <>
                <label className="block text-sm font-medium text-gray-700 text-left mb-1" htmlFor="room-id">Room id (key)</label>
                <input
                  id="room-id"
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Enter room id"
                  className="w-full px-4 py-3 rounded-xl border"
                />

                <div className="mt-4 flex gap-3">
                  <button onClick={handleJoin} className="px-5 py-3 rounded-xl bg-ig-purple text-white font-bold">Join Room</button>
                  <button onClick={() => { setRoomId(Math.random().toString(36).slice(2,8)); setError(''); }} className="px-4 py-3 rounded-xl border">Generate</button>
                </div>
                {error && <div className="text-red-600 font-semibold mt-2">{error}</div>}
                <div className="text-sm text-gray-600 mt-2 text-left">Enter a room id to join or create a room.</div>
              </>
            ) : (
              // Step 2: enter display name and confirm room
              <>
                <div className="text-left mb-3">
                  <h2 className="text-xl font-bold">Enter your name</h2>
                  <div className="text-sm text-gray-600 mt-1">Room: <span className="font-semibold">{roomId}</span></div>
                </div>
                <label className="block text-sm font-medium text-gray-700 text-left mb-1" htmlFor="display-name">Display name</label>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 rounded-xl border"
                />
                <div className="mt-4 flex gap-3">
                  <button onClick={handleEnterRoom} className="px-5 py-3 rounded-xl bg-ig-purple text-white font-bold">Enter Room</button>
                  <button onClick={() => { setStep(1); setError(''); }} className="px-4 py-3 rounded-xl border">Back</button>
                </div>
                {error && <div className="text-red-600 font-semibold mt-2">{error}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
