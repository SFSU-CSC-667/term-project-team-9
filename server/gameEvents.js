const gameEvents = (io, socket, game, players, db) => {
  const Deck = require('../poker/deck.js');

  socket.on('create game request', data => {
    db.one('INSERT INTO Games (GameName, MaxPlayers, MinBid, MinChips) VALUES' +
    `('${ data.gameName }', 4, 50, 500) RETURNING GameId`)
    .then(response => {
      socket.emit('create game response', {
        success: 1,
        gameId: response.gameid,
        gameName: data.gameName
      });
     })
     .catch(response => {
       console.log(response);
       socket.emit('create game response', { success: 0 });
     });
  });

  socket.on('game viewer', data => {
    socket.leave('lobby');
    if (data.gameId) {
      socket.join(data.gameId);
      socket.gameId = data.gameId;
    } else {
      socket.join(1);
      socket.gameId = 1;
    }
    getUpdate(socket, data);
  });

  socket.on('join request', data => {
    if (!players[socket.gameId])
      players[socket.gameId] = [];
    if (players[socket.gameId].indexOf(socket) > -1)
      return;
    if (!game[socket.gameId]) {
      game[socket.gameId] = {
        deck: new Deck(), ready: 0,
        seatsOccupied: [], currentPot: 0,
        currentCallMinimum: 100, turn: 0, round: 0,
        gameStarted: false, blindIncrement: -1
      };
    }
    acceptRequest(socket, data);
  });

  socket.on('player ready', data => {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    Game.ready++;
    socket.broadcast.to(socket.gameId).emit('player is ready', { seat: socket.seat });
    if (Players.length > 1 && Game.ready === Players.length && !Game.gameStarted) {
      Game.ready = 0;
      startGame(socket);
    }
  });

  socket.on('game list request', () => {
    db.query('SELECT * FROM games')
    .then(response => {
      socket.emit('game list response', { games: response });
    });
  });

  socket.on('update server seatsOccupied', data => {
    if (game[socket.gameId]) {
      let Game = game[socket.gameId];
      Game.seatsOccupied = data.seatsOccupied;
    }
  });

  socket.on('skip turn', data => {
    let Game = game[socket.gameId];
    if (Game) {
      if (Game.seatsOccupied[Game.turn] === data.seat) {
        nextTurn(socket);
      }
    }
  });

  socket.on('action button', data => {
    switch(data.action) {
      case 'check':
        nextTurn(socket);
        break;
      case 'call':
        playerCall(socket);
        break;
      case 'raise':
        playerRaise(socket);
        break;
      case 'fold':
        playerFold(socket);
        break;
      case 'all in':
        playerAllIn(socket);
        break;
    }
  });

  function nextTurn(socket) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    if (Players[Game.turn + 1] && Players[Game.turn + 1].fold) {
      Game.turn++;
      nextTurn(socket);
    } else if (Players[Game.turn + 1]) {
      Game.turn++;
      io.to(socket.gameId).emit('turn flag', { seat: Game.seatsOccupied[Game.turn] });
      Players[Game.turn].emit('player turn', { turn: Game.turn, callMinimum: Game.currentCallMinimum });
    } else {
      if (dealerCheck(Game.round, socket)) { return; }
      console.log("Round over");
      Game.turn = 0;
      if (Players[Game.turn].fold) { nextTurn(socket); return; }
      io.to(socket.gameId).emit('turn flag', { seat: Game.seatsOccupied[Game.turn] });
      Players[Game.turn].emit('player turn', { turn: Game.turn, callMinimum: Game.currentCallMinimum });
    }
  }

  function playerCall(socket) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    updatePlayerBid(socket, Game.currentCallMinimum - socket.bid);
    nextTurn(socket);
  }

  function playerFold(socket) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    socket.fold = 1;
    io.to(socket.gameId).emit('a player folds', { seat: socket.seat });
    if (!checkIfAllFold(socket)) {
      nextTurn(socket);
      return;
    }
    playerWins(socket);
    startGame(socket);
  }

  function playerRaise(socket, raise) {
    let Game = game[socket.gameId];
    let callAmount = (Game.currentCallMinimum - socket.bid);
    raise = 200; /////////////// Hard coded player raise //////////////////
    updatePlayerBid(socket, callAmount + raise);
    Game.currentCallMinimum += raise;
    reorderTurns(socket, Game.turn);
    nextTurn(socket);
  }

  function playerAllIn(socket) {
    let Game = game[socket.gameId];
    let callAmount = (Game.currentCallMinimum - socket.bid);
    let allIn = socket.pot - callAmount;
    Game.currentCallMinimum += allIn;
    updatePlayerBid(socket, callAmount + allIn);
    console.log("minimum ", Game.currentCallMinimum);
    reorderTurns(socket, Game.turn);
    nextTurn(socket);
  }

  function playerWins(socket) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    let index = getSeatIndex(socket, Game.winner);
    Players[index].pot += Game.winnerPot;
    console.log("We got a winner! ", Game.winner, Game.winnerPot);
    Players.forEach(player => {
      if (player.userName) {
        let netGainOrLoss = player.bid + player.pot - player.buyInAmount;
        db.none(`UPDATE Users SET chips = chips + ${ netGainOrLoss } WHERE email = '${ player.userName }'`);
      }
    });
    io.to(socket.gameId).emit('update player statistics', {
      seat: Game.winner,
      playerBid: 0,
      playerPot: Players[index].pot,
    });
  }

  function getSeatIndex(socket, seat) {
    let Game = game[socket.gameId];
    return Game.seatsOccupied.indexOf(seat);
  }

  function reorderTurns(socket, currentTurn) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    let newOccupiedOrder = [];
    let newPlayerOrder = [];
    let restarted = 0;
    for (let i = 0; i < Game.seatsOccupied.length; i++) {
      if (Game.seatsOccupied[currentTurn + i] && !restarted) {
        newOccupiedOrder.push(Game.seatsOccupied[currentTurn + i]);
        newPlayerOrder.push(Players[currentTurn + i]);
      } else {
        currentTurn = 0;
        newOccupiedOrder.push(Game.seatsOccupied[currentTurn + restarted]);
        newPlayerOrder.push(Players[currentTurn + restarted]);
        restarted++;
      }
    }
    Game.turn = 0;
    game[socket.gameId].seatsOccupied = newOccupiedOrder;
    players[socket.gameId] = newPlayerOrder;
    io.to(socket.gameId).emit('updated seatsOccupied', {
      seatsOccupied: newOccupiedOrder
    });
  }

  function checkIfAllFold(socket) {
    let gameId = socket.gameId;
    let Game = game[gameId];
    let Players = players[gameId];
    let possibleWinner;
    let count = 0;
    Players.forEach(player => {
      if (!player.fold) {
        possibleWinner = player.seat;
        count++;
      }
    });
    if (count === 1) {
      Game.winner = possibleWinner;
      return true;
    }
    return false;
  }

  function getUpdate(socket, data) {
    if (!game[socket.gameId] || !players[socket.gameId]) {
      return;
    }
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    socket.emit('game update', {
      cards: Game.cards,
      seatsOccupied: Game.seatsOccupied,
      gameStarted: Game.gameStarted
    });
  }

  function acceptRequest(socket, data) {
    let gameId = socket.gameId;
    let Game = game[gameId];
    let Players = players[gameId];
    if (!socket.displayName) { socket.displayName = 'Guest'; }
    if (Game.gameStarted) { socket.fold = 1; }
    makeSeatOccupied(socket, data.seat);
    socket.isPlayer = 1;
    socket.seat = data.seat;
    socket.bid = 0;
    socket.buyInAmount = 1000; /////////////// Hard coded player buy-in //////////////////
    socket.pot = 1000; /////////////// Hard coded player pot //////////////////
    io.to(gameId).emit('new player', {
      seat: data.seat,
      bid: socket.bid,
      pot: socket.pot,
      seatsOccupied: Game.seatsOccupied,
      html: "<p>Name: " + socket.displayName + "</p>"
    });
    socket.emit('enable ready button', {
      seat: socket.seat
    });
    console.log("Players " + Players.length);
  }

  function makeSeatOccupied(socket, seat) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    Game.seatsOccupied.push(seat);
    Players.push(socket);
  }

  function sortSeats(socket) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    let tempPlayers = [];
    Game.seatsOccupied.sort();
    for (let i = 0; i < Game.seatsOccupied.length; i++) {
      Players.forEach(player => {
        if (player.seat === Game.seatsOccupied[i]) {
          tempPlayers.push(player);
        }
      });
    }
    players[socket.gameId] = tempPlayers;
    io.to(socket.gameId).emit('updated seatsOccupied', { seatsOccupied: Game.seatsOccupied });
  }

  function startGame(socket) {
    console.log("New Game");
    sortSeats(socket);
    incrementBlinds(socket);
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    io.to(socket.gameId).emit('remove all cards');
    Players.forEach(player => {
      player.fold = 0;
      player.bid = 0;
      io.to(socket.gameId).emit('update player statistics', {
        seat: player.seat,
        playerBid: player.bid,
        playerPot: player.pot,
      });
    });
    Game.gameStarted = 1;
    Game.turn = 0;
    Game.round = 0;
    Game.winnerPot = 0;
    Game.deck.shuffle();
    smallBigBlinds(socket);
    if (Players[Game.turn + 1]) { Game.turn++; } else {  Game.turn = 0; }
    io.to(socket.gameId).emit('turn flag', { seat: Game.seatsOccupied[Game.turn] });
    Players[Game.turn].emit('player turn', { turn: Game.turn, callMinimum: Game.currentCallMinimum });
  }

  function dealerCheck(round, socket) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    switch (round) {
      case 0:
        drawPlayerCards(socket);
        Game.round++;
        break;
      case 1:
        drawFlopCards(socket);
        Game.round++;
        break;
      case 2:
        drawTurnCard(socket);
        Game.round++;
        break;
      case 3:
        drawRiverCard(socket);
        Game.round++;
        break;
      case 4:
        showAllCards(socket);
        //
        // Define winner and give pot;
        //
        console.log("Total pot:", Game.winnerPot);
        setTimeout(() => { startGame(socket); }, 2000);
        return 1;
    }
  }

  function incrementBlinds(socket) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    if (Players[Game.blindIncrement + 1]) {
      Game.blindIncrement++;
      reorderTurns(Players[Game.blindIncrement], Game.blindIncrement);
    } else {
      Game.blindIncrement = 0;
      reorderTurns(Players[Game.blindIncrement], Game.blindIncrement);
    }
    console.log('blind', Game.blindIncrement);
  }

  function smallBigBlinds(socket) {
    let Game = game[socket.gameId];
    let Players = players[socket.gameId];
    updatePlayerBid(Players[Game.turn], 50);
    if (Players[Game.turn + 1]) {
      Game.turn++;
      updatePlayerBid(Players[Game.turn], 100);
    } else {
      Game.turn = 0;
      updatePlayerBid(Players[Game.turn], 100);
    }
    Game.currentCallMinimum = 100;
  }

  function updatePlayerBid(socket, additionalAmount) {
    let Game = game[socket.gameId];
    socket.pot -= additionalAmount;
    socket.bid += additionalAmount;
    Game.winnerPot += additionalAmount;
    io.to(socket.gameId).emit('update player statistics', {
      seat: socket.seat,
      playerPot: socket.pot,
      playerBid: socket.bid
    });
    if (socket.userName) {
      db.none(`UPDATE Users SET chips = chips - ${ additionalAmount } WHERE email = '${ socket.userName }'`);
    }
  }

  function drawFlopCards(socket, data) {
    let Game = game[socket.gameId];
    Game.cards = [Game.deck.draw(), Game.deck.draw(), Game.deck.draw()];
    io.to(socket.gameId).emit('draw flop cards', {
      first: Game.cards[0],
      second: Game.cards[1],
      third: Game.cards[2]
    });
  }

  function drawPlayerCards(socket, data) {
    let Game = game[socket.gameId];
    players[socket.gameId].forEach(player => {
      player.cards = [Game.deck.draw(), Game.deck.draw()];
      player.emit('player cards', {
        status: player.status,
        seat: player.seat,
        first: player.cards[0],
        second: player.cards[1]
      });
    });
  }

  function drawTurnCard(socket, data) {
    let Game = game[socket.gameId];
    Game.cards.push(Game.deck.draw());
    io.to(socket.gameId).emit('draw turn card', {
      turnCard: Game.cards[3]
    });
  }

  function drawRiverCard(socket, data) {
    let Game = game[socket.gameId];
    Game.cards.push(Game.deck.draw());
    io.to(socket.gameId).emit('draw river card', {
      riverCard: Game.cards[4]
    });
  }

  function showAllCards(socket) {
    let Players = players[socket.gameId];
    let playerCards = {};
    Players.forEach(player => {
      playerCards[player.seat] = { cards: player.cards };
    });
    io.to(socket.gameId).emit('show all cards', { playerCards: playerCards });
  }

};


module.exports = gameEvents;
