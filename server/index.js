const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Game state management
const games = new Map();
const MAX_PLAYERS = 4;

// Omi game logic
class OmiGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.deck = [];
    this.currentPlayerIndex = 0;
    this.gameState = 'waiting'; // waiting, playing, finished
    this.trick = [];
    this.trumpSuit = null;
    this.scores = {};
    this.round = 1;
    this.dealerIndex = 0;
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= MAX_PLAYERS) {
      return false;
    }
    this.players.push({ id: playerId, name: playerName, cards: [], score: 0 });
    this.scores[playerId] = 0;
    return true;
  }

  startGame() {
    if (this.players.length !== MAX_PLAYERS) {
      return false;
    }
    this.gameState = 'playing';
    this.dealCards();
    this.setTrump();
    return true;
  }

  createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    
    for (let suit of suits) {
      for (let rank of ranks) {
        deck.push({ suit, rank, id: `${suit}-${rank}` });
      }
    }
    
    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    return deck;
  }

  dealCards() {
    this.deck = this.createDeck();
    const cardsPerPlayer = 13;
    
    this.players.forEach((player, index) => {
      player.cards = this.deck.slice(index * cardsPerPlayer, (index + 1) * cardsPerPlayer);
      player.cards.sort((a, b) => {
        const suitOrder = { 'hearts': 0, 'diamonds': 1, 'clubs': 2, 'spades': 3 };
        const rankOrder = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
        if (suitOrder[a.suit] !== suitOrder[b.suit]) {
          return suitOrder[a.suit] - suitOrder[b.suit];
        }
        return rankOrder[a.rank] - rankOrder[b.rank];
      });
    });
  }

  setTrump() {
    // Simple trump selection - can be enhanced
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    this.trumpSuit = suits[Math.floor(Math.random() * suits.length)];
  }

  playCard(playerId, cardId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.currentPlayerIndex !== this.players.findIndex(p => p.id === playerId)) {
      return false;
    }

    const cardIndex = player.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return false;
    }

    const card = player.cards.splice(cardIndex, 1)[0];
    this.trick.push({ playerId, card });

    // Move to next player
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

    // If trick is complete (4 cards)
    if (this.trick.length === 4) {
      this.evaluateTrick();
    }

    return true;
  }

  evaluateTrick() {
    // Determine winner based on Omi rules
    // First card sets the suit to follow
    const leadSuit = this.trick[0].card.suit;
    let winningCard = this.trick[0];
    let winningIndex = 0;

    for (let i = 1; i < this.trick.length; i++) {
      const card = this.trick[i].card;
      // Trump cards beat non-trump
      if (card.suit === this.trumpSuit && winningCard.card.suit !== this.trumpSuit) {
        winningCard = this.trick[i];
        winningIndex = i;
      }
      // Same suit comparison
      else if (card.suit === winningCard.card.suit) {
        const rankOrder = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
        if (rankOrder[card.rank] > rankOrder[winningCard.card.rank]) {
          winningCard = this.trick[i];
          winningIndex = i;
        }
      }
    }

    // Winner starts next trick
    const winnerId = winningCard.playerId;
    this.currentPlayerIndex = this.players.findIndex(p => p.id === winnerId);
    this.trick = [];

    // Check if round is over
    if (this.players.every(p => p.cards.length === 0)) {
      this.endRound();
    }
  }

  endRound() {
    // Calculate scores and start new round
    this.round++;
    if (this.round > 13) {
      this.gameState = 'finished';
    } else {
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
      this.dealCards();
      this.setTrump();
      this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
    }
  }

  getGameState() {
    return {
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.cards.length,
        score: p.score
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      gameState: this.gameState,
      trick: this.trick,
      trumpSuit: this.trumpSuit,
      round: this.round
    };
  }

  getPlayerCards(playerId) {
    const player = this.players.find(p => p.id === playerId);
    return player ? player.cards : [];
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', ({ roomId, playerName }) => {
    if (!games.has(roomId)) {
      games.set(roomId, new OmiGame(roomId));
    }

    const game = games.get(roomId);
    if (game.addPlayer(socket.id, playerName)) {
      socket.join(roomId);
      socket.emit('joined-room', { roomId, playerId: socket.id });
      io.to(roomId).emit('game-update', game.getGameState());
      
      // Auto-start if 4 players
      if (game.players.length === MAX_PLAYERS && game.gameState === 'waiting') {
        game.startGame();
        io.to(roomId).emit('game-started');
        io.to(roomId).emit('game-update', game.getGameState());
        
        // Send each player their cards
        game.players.forEach(player => {
          io.to(player.id).emit('your-cards', game.getPlayerCards(player.id));
        });
      }
    } else {
      socket.emit('room-full');
    }
  });

  socket.on('play-card', ({ roomId, cardId }) => {
    const game = games.get(roomId);
    if (game && game.playCard(socket.id, cardId)) {
      // Send updated cards to the player
      socket.emit('your-cards', game.getPlayerCards(socket.id));
      // Broadcast game state to all players
      io.to(roomId).emit('game-update', game.getGameState());
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Handle player disconnection
    games.forEach((game, roomId) => {
      const playerIndex = game.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        game.players.splice(playerIndex, 1);
        io.to(roomId).emit('game-update', game.getGameState());
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
