import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Lobby from './components/Lobby';
import GameBoard from './components/GameBoard';
import './App.css';

const SERVER_URL = 'http://localhost:3001';

function App() {
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState(null);
  const [playerCards, setPlayerCards] = useState([]);
  const [trumpSuit, setTrumpSuit] = useState(null);
  const [error, setError] = useState(null);
  const [hasJoined, setHasJoined] = useState(false);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  const handleJoinRoom = (room, name) => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);
    setPlayerName(name);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      newSocket.emit('join-room', { roomId: room, playerName: name });
    });

    newSocket.on('joined-room', ({ roomId, playerId }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      setHasJoined(true);
      setError(null);
    });

    newSocket.on('room-full', () => {
      setError('Room is full! Maximum 4 players allowed.');
    });

    newSocket.on('game-update', (state) => {
      setGameState(state);
      if (state.trumpSuit) {
        setTrumpSuit(state.trumpSuit);
      }
    });

    newSocket.on('your-cards', (cards) => {
      setPlayerCards(cards);
    });

    newSocket.on('game-started', () => {
      console.log('Game started!');
    });

    newSocket.on('disconnect', () => {
      setError('Disconnected from server');
    });

    newSocket.on('error', (err) => {
      setError(err.message || 'An error occurred');
    });
  };

  const handlePlayCard = (cardId) => {
    if (socket && roomId) {
      socket.emit('play-card', { roomId, cardId });
    }
  };

  const handleLeaveGame = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setRoomId(null);
    setPlayerId(null);
    setGameState(null);
    setPlayerCards([]);
    setTrumpSuit(null);
    setError(null);
    setHasJoined(false);
  };

  // Always show the join screen first; only move on after a successful join
  if (!hasJoined) {
    return (
      <div>
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}
        <Lobby onJoinRoom={handleJoinRoom} />
      </div>
    );
  }

  return (
    <div className="App">
      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      <div className="game-controls">
        <div className="room-info">
          Room: <strong>{roomId}</strong> | Player: <strong>{playerName}</strong>
        </div>
        <button onClick={handleLeaveGame} className="leave-btn">
          Leave Game
        </button>
      </div>
      {gameState.gameState === 'waiting' && (
        <div className="waiting-screen">
          <h2>Waiting for players...</h2>
          <p>Current players: {gameState.players.length} / 4</p>
          <div className="players-list">
            {gameState.players.map((player) => (
              <div key={player.id} className="player-item">
                {player.name} {player.id === playerId && '(You)'}
              </div>
            ))}
          </div>
        </div>
      )}
      {gameState.gameState === 'playing' && (
        <GameBoard
          gameState={gameState}
          playerCards={playerCards}
          onPlayCard={handlePlayCard}
          playerId={playerId}
          trumpSuit={trumpSuit}
        />
      )}
      {gameState.gameState === 'finished' && (
        <div className="finished-screen">
          <h2>Game Finished!</h2>
          <div className="final-scores">
            {gameState.players
              .sort((a, b) => b.score - a.score)
              .map((player, index) => (
                <div key={player.id} className="score-item">
                  <span className="rank">#{index + 1}</span>
                  <span className="name">{player.name} {player.id === playerId && '(You)'}</span>
                  <span className="score">{player.score} points</span>
                </div>
              ))}
          </div>
          <button onClick={handleLeaveGame} className="leave-btn">
            Return to Lobby
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
