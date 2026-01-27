import React, { useState } from 'react';
import './Lobby.css';

function Lobby({ onJoinRoom }) {
  const [roomId, setRoomId] = useState('');
  const [playerName, setPlayerName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (roomId.trim() && playerName.trim()) {
      onJoinRoom(roomId.trim(), playerName.trim());
    }
  };

  const generateRoomId = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(id);
  };

  return (
    <div className="lobby">
      <div className="lobby-container">
        <h1>🎴 Omi Game</h1>
        <p className="subtitle">
          Create or join a room to play with 4 players. Rooms are made automatically when you join.
        </p>
        
        <form onSubmit={handleSubmit} className="lobby-form">
          <div className="form-group">
            <label htmlFor="playerName">Your Name</label>
            <input
              id="playerName"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              required
              maxLength={20}
            />
          </div>

          <div className="form-group">
            <label htmlFor="roomId">Room ID</label>
            <div className="room-input-group">
              <input
                id="roomId"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="Enter room ID"
                required
                maxLength={6}
              />
              <button type="button" onClick={generateRoomId} className="generate-btn">
                Generate
              </button>
            </div>
            <p className="helper-text">
              Share this ID with friends. If the room doesn't exist yet, we'll create it when you join.
            </p>
          </div>

          <button type="submit" className="join-btn">
            Create / Join Room
          </button>
        </form>
      </div>
    </div>
  );
}

export default Lobby;
