import React from 'react';
import './GameBoard.css';

function GameBoard({ gameState, playerCards, onPlayCard, playerId, trumpSuit }) {
  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayer && currentPlayer.id === playerId;
  const leadSuit = gameState.leadSuit || null;

  const canPlayCard = (card) => {
    if (!isMyTurn) return false;
    if (!leadSuit) return true;
    const hasLeadSuit = playerCards.some((c) => c.suit === leadSuit);
    if (!hasLeadSuit) return true;
    return card.suit === leadSuit;
  };

  const handleCardClick = (cardId) => {
    const card = playerCards.find((c) => c.id === cardId);
    if (card && canPlayCard(card) && onPlayCard) {
      onPlayCard(cardId);
    }
  };

  const getSuitSymbol = (suit) => {
    const symbols = {
      hearts: '♥',
      diamonds: '♦',
      clubs: '♣',
      spades: '♠'
    };
    return symbols[suit] || suit[0].toUpperCase();
  };

  const getSuitColor = (suit) => {
    return (suit === 'hearts' || suit === 'diamonds') ? 'red' : 'black';
  };

  return (
    <div className="game-board">
      <div className="game-header">
        <div className="trump-display">
          <span className="trump-label">Trump:</span>
          <span className={`trump-suit ${getSuitColor(trumpSuit)}`}>
            {getSuitSymbol(trumpSuit)}
          </span>
        </div>
        <div className="round-info">Round {gameState.round}</div>
        <div className="team-tokens-header">
          <span className="team-tok t0">Team 1: {gameState.teamTokens?.[0] ?? 0}</span>
          <span className="team-tok t1">Team 2: {gameState.teamTokens?.[1] ?? 0}</span>
        </div>
        {isMyTurn && <div className="turn-indicator">Your turn</div>}
      </div>

      <div className="players-area">
        {gameState.players.map((player, index) => {
          const position = ['top', 'right', 'bottom', 'left'][index];
          const isCurrentPlayer = player.id === playerId;
          
          return (
            <div key={player.id} className={`player-area player-${position} ${player.id === currentPlayer?.id ? 'active' : ''} team-${player.teamIndex ?? 0}`}>
              <div className="player-info">
                <div className="player-name">{isCurrentPlayer ? 'You' : player.name}</div>
                <div className="player-cards-count">{Math.min(player.cardCount ?? 0, 8)} cards</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="trick-area">
        <h3>Current Trick</h3>
        <div className="trick-cards">
          {gameState.trick && gameState.trick.length > 0 ? (
            gameState.trick.map((trickCard, index) => {
              const isMyCard = trickCard.playerId === playerId;
              const player = gameState.players.find(p => p.id === trickCard.playerId);
              return (
                <div key={index} className="trick-card-wrapper">
                  <div className={`trick-card ${getSuitColor(trickCard.card.suit)}`}>
                    <div className="card-rank">{trickCard.card.rank}</div>
                    <div className="card-suit">{getSuitSymbol(trickCard.card.suit)}</div>
                  </div>
                  <div className="trick-player-name">{isMyCard ? 'You' : player?.name}</div>
                </div>
              );
            })
          ) : (
            <div className="no-trick">No cards played yet</div>
          )}
        </div>
      </div>

      <div className="my-cards-area">
        <h3>Your hand ({playerCards.length}/8)</h3>
        {leadSuit && (
          <p className="lead-suit-hint">Follow suit: {getSuitSymbol(leadSuit)} if you have it</p>
        )}
        <div className="cards-hand">
          {playerCards.slice(0, 8).map((card) => {
            const playable = canPlayCard(card);
            return (
              <div
n                key={card.id}
                className={`card ${getSuitColor(card.suit)} ${playable ? 'playable' : 'disabled'} ${card.suit === trumpSuit ? 'trump' : ''}`}
                onClick={() => playable && handleCardClick(card.id)}
              >
                <div className="card-rank">{card.rank}</div>
                <div className="card-suit-large">{getSuitSymbol(card.suit)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default GameBoard;
