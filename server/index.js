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
const CARDS_PER_PLAYER = 8;  // Sri Lankan Omi: 8 cards each
const TARGET_TOKENS = 10;    // First partnership to 10 tokens wins

// Sri Lankan Omi rank order (32-card deck: 7 through A)
const RANK_ORDER = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7 };

function getTeamIndex(playerIndex) {
  return playerIndex % 2; // 0,2 = team 0; 1,3 = team 1
}

// Omi game logic (Sri Lankan rules)
class OmiGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];
    this.deck = [];
    this.currentPlayerIndex = 0;
    this.gameState = 'waiting'; // waiting, playing, finished
    this.trick = [];
    this.trumpSuit = null;
    this.trumpChooserIndex = 0;  // Player who chose trumps (dealer's right)
    this.teamTokens = [0, 0];    // Team 0 (players 0,2) and Team 1 (players 1,3)
    this.round = 1;
    this.dealerIndex = 0;
    this.tricksWonThisRound = [0, 0]; // [team0, team1]
    this.extraTokenNext = false;      // 4-4 tie: next hand winner gets +1 token
  }

  addPlayer(playerId, playerName) {
    if (this.players.length >= MAX_PLAYERS) {
      return false;
    }
    this.players.push({ id: playerId, name: playerName, cards: [] });
    return true;
  }

  startGame() {
    if (this.players.length !== MAX_PLAYERS) {
      return false;
    }
    this.gameState = 'playing';
    this.teamTokens = [0, 0];
    this.round = 1;
    this.dealerIndex = 0;
    this.extraTokenNext = false;
    this.dealCards();
    this.setTrump();
    this.tricksWonThisRound = [0, 0];
    return true;
  }

  // Sri Lankan Omi: 32-card deck (7, 8, 9, 10, J, Q, K, A in each suit)
  createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (let suit of suits) {
      for (let rank of ranks) {
        deck.push({ suit, rank, id: `${suit}-${rank}` });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  dealCards() {
    this.deck = this.createDeck();
    const total = CARDS_PER_PLAYER * MAX_PLAYERS; // 32
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const start = i * CARDS_PER_PLAYER;
      const slice = this.deck.slice(start, start + CARDS_PER_PLAYER);
      this.players[i].cards = slice.slice(); // exactly 8 cards, never more
    }
    const suitOrder = { hearts: 0, diamonds: 1, clubs: 2, spades: 3 };
    this.players.forEach((player) => {
      player.cards.sort((a, b) => {
        if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
        return (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0);
      });
    });
  }

  setTrump() {
    // Player to dealer's right chooses trump (we pick random without choice UI)
    this.trumpChooserIndex = (this.dealerIndex + 1) % MAX_PLAYERS;
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    this.trumpSuit = suits[Math.floor(Math.random() * suits.length)];
    this.currentPlayerIndex = this.trumpChooserIndex; // Trump chooser leads first
  }

  getLeadSuit() {
    return this.trick.length > 0 ? this.trick[0].card.suit : null;
  }

  canPlayCard(player, card) {
    const leadSuit = this.getLeadSuit();
    if (!leadSuit) return true;
    const hasLeadSuit = player.cards.some((c) => c.suit === leadSuit);
    if (!hasLeadSuit) return true;
    return card.suit === leadSuit;
  }

  playCard(playerId, cardId) {
    const playerIndex = this.players.findIndex((p) => p.id === playerId);
    const player = this.players[playerIndex];
    if (!player || this.currentPlayerIndex !== playerIndex) {
      return false;
    }
    if (player.cards.length > CARDS_PER_PLAYER) {
      player.cards = player.cards.slice(0, CARDS_PER_PLAYER);
    }
    const cardIndex = player.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return false;

    const card = player.cards[cardIndex];
    if (!this.canPlayCard(player, card)) return false;

    player.cards.splice(cardIndex, 1);
    this.trick.push({ playerId, card });

    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

    if (this.trick.length === 4) {
      this.evaluateTrick();
    }

    return true;
  }

  evaluateTrick() {
    const leadSuit = this.trick[0].card.suit;
    let winningCard = this.trick[0];
    let winningIndex = 0;

    for (let i = 1; i < this.trick.length; i++) {
      const card = this.trick[i].card;
      if (card.suit === this.trumpSuit && winningCard.card.suit !== this.trumpSuit) {
        winningCard = this.trick[i];
        winningIndex = i;
      } else if (card.suit === winningCard.card.suit) {
        const a = RANK_ORDER[card.rank] ?? 0;
        const b = RANK_ORDER[winningCard.card.rank] ?? 0;
        if (a > b) {
          winningCard = this.trick[i];
          winningIndex = i;
        }
      }
    }

    const winnerPlayerIndex = this.players.findIndex((p) => p.id === winningCard.playerId);
    const winnerTeam = getTeamIndex(winnerPlayerIndex);
    this.tricksWonThisRound[winnerTeam]++;

    this.currentPlayerIndex = winnerPlayerIndex;
    this.trick = [];

    if (this.players.every((p) => p.cards.length === 0)) {
      this.endRound();
    }
  }

  endRound() {
    const [t0, t1] = this.tricksWonThisRound;
    const trumpChooserTeam = getTeamIndex(this.trumpChooserIndex);
    let tokensToAdd = 0;
    let winningTeam = -1;

    if (t0 === 4 && t1 === 4) {
      this.extraTokenNext = true;
    } else {
      if (t0 === 8 || t1 === 8) {
        tokensToAdd = 3;
        winningTeam = t0 === 8 ? 0 : 1;
      } else if (t0 > 4 || t1 > 4) {
        winningTeam = t0 > t1 ? 0 : 1;
        if (winningTeam === trumpChooserTeam) {
          tokensToAdd = 1;
        } else {
          tokensToAdd = 2;
        }
      }
      if (winningTeam >= 0) {
        this.teamTokens[winningTeam] += tokensToAdd;
        if (this.extraTokenNext) {
          this.teamTokens[winningTeam]++;
          this.extraTokenNext = false;
        }
      }
    }

    if (this.teamTokens[0] >= TARGET_TOKENS || this.teamTokens[1] >= TARGET_TOKENS) {
      this.gameState = 'finished';
      return;
    }

    this.round++;
    this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    this.tricksWonThisRound = [0, 0];
    this.dealCards();
    this.setTrump();
  }

  getGameState() {
    const leadSuit = this.getLeadSuit();
    return {
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        cardCount: Math.min(p.cards.length, CARDS_PER_PLAYER),
        teamIndex: getTeamIndex(this.players.findIndex((pl) => pl.id === p.id))
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      gameState: this.gameState,
      trick: this.trick,
      trumpSuit: this.trumpSuit,
      round: this.round,
      teamTokens: this.teamTokens.slice(),
      leadSuit: leadSuit || null,
      tricksWonThisRound: this.tricksWonThisRound.slice()
    };
  }

  getPlayerCards(playerId) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return [];
    const cards = player.cards.slice(0, CARDS_PER_PLAYER);
    return cards;
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
