const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;

// HTTP сервер для отдачи файлов
const server = http.createServer((req, res) => {
  let filePath = '.' + req.url;
  if (filePath === './') filePath = './index.html';

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`HTTP Server running on port ${PORT}`);
});

// --- WebSocket server ---

const wss = new WebSocket.Server({ server });

let rooms = new Map(); // key: roomId, value: room object

// Helper to generate random codes (for private rooms)
function randomCode(len = 5) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < len; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Words database by difficulty (for demo, limited, but можно расширить)
const wordsByDifficulty = {
  easy: ['cat', 'dog', 'sun', 'car', 'tree', 'fish', 'ball', 'cup', 'bird', 'hat'],
  medium: ['giraffe', 'bicycle', 'elephant', 'castle', 'mountain', 'airplane', 'computer', 'pumpkin', 'umbrella', 'violin'],
  hard: ['astronaut', 'kangaroo', 'microscope', 'restaurant', 'scissors', 'volcano', 'xylophone', 'zeppelin', 'chameleon', 'boulevard'],
};

function pickWord(difficulty) {
  const list = wordsByDifficulty[difficulty] || wordsByDifficulty['medium'];
  return list[Math.floor(Math.random() * list.length)];
}

function broadcast(room, data) {
  room.players.forEach(p => {
    if (p.ws && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify(data));
    }
  });
}

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function createRoom(data, ws) {
  const id = randomCode(6);
  const isPrivate = !!data.isPrivate;
  const room = {
    id,
    name: data.roomName || (isPrivate ? 'Приватная комната' : 'Публичная комната'),
    difficulty: data.difficulty || 'medium',
    isPrivate,
    code: isPrivate ? randomCode(5) : null,
    players: [],
    roundActive: false,
    drawerIndex: 0,
    currentWord: null,
    roundTimeout: null,
  };

  rooms.set(id, room);
  addPlayerToRoom(ws, room, data.lang || 'Rus');
  return room;
}

function addPlayerToRoom(ws, room, lang) {
  // Уникальное имя (Player1, Player2 и т.п.)
  const baseName = 'Player';
  let count = 1;
  let name = baseName + count;
  while (room.players.find(p => p.name === name)) {
    count++;
    name = baseName + count;
  }

  room.players.push({ ws, name, lang });
  ws.roomId = room.id;
  ws.playerName = name;
  sendLobbyUpdate(room);
}

function removePlayerFromRoom(ws) {
  if (!ws.roomId) return;
  const room = rooms.get(ws.roomId);
  if (!room) return;

  room.players = room.players.filter(p => p.ws !== ws);
  if (room.players.length === 0) {
    // удаляем комнату, если никого нет
    rooms.delete(room.id);
  } else {
    if (room.roundActive) {
      // Если игрок был рисующим, заканчиваем раунд
      if (room.players[room.drawerIndex] && room.players[room.drawerIndex].ws === ws) {
        endRound(room, null);
      } else if (room.drawerIndex >= room.players.length) {
        room.drawerIndex = 0;
      }
    }
    sendLobbyUpdate(room);
  }
}

function sendLobbyUpdate(room) {
  const info = {
    type: 'lobby',
    roomId: room.id,
    roomName: room.name,
    isPrivate: room.isPrivate,
    code: room.code,
    difficulty: room.difficulty,
    players: room.players.map(p => p.name),
    roundActive: room.roundActive,
    drawer: room.roundActive && room.players[room.drawerIndex] ? room.players[room.drawerIndex].name : null,
  };
  broadcast(room, info);
}

function startRound(room) {
  if (room.roundActive || room.players.length < 2) return;

  room.roundActive = true;
  room.currentWord = pickWord(room.difficulty);
  room.drawerIndex = (room.drawerIndex) % room.players.length;

  const drawer = room.players[room.drawerIndex];
  const roundData = {
    type: 'roundStart',
    drawer: drawer.name,
    word: room.currentWord,
    duration: 300, // 5 минут в секундах
  };

  broadcast(room, roundData);

  // Таймер раунда
  room.roundTimeout = setTimeout(() => {
    endRound(room, null);
  }, 5 * 60 * 1000);
}

function endRound(room, winnerName) {
  room.roundActive = false;
  room.currentWord = null;
  if (room.roundTimeout) {
    clearTimeout(room.roundTimeout);
    room.roundTimeout = null;
  }

  const endData = {
    type: 'roundEnd',
    winner: winnerName,
  };
  broadcast(room, endData);
  sendLobbyUpdate(room);

  // Следующий рисующий
  room.drawerIndex = (room.drawerIndex + 1) % room.players.length;
}

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === 'createRoom') {
      const room = createRoom(data, ws);
      send(ws, {
        type: 'roomCreated',
        roomId: room.id,
        code: room.code,
      });
    }

    else if (data.type === 'joinRoom') {
      // Приватные комнаты подключаются по коду, публичные - по id
      let room = null;
      if (data.code) {
        for (let r of rooms.values()) {
          if (r.isPrivate && r.code === data.code.toUpperCase()) {
            room = r;
            break;
          }
        }
      }
      else if (data.roomId) {
        room = rooms.get(data.roomId);
      }

      if (room) {
        addPlayerToRoom(ws, room, data.lang || 'Rus');
      } else {
        send(ws, { type: 'message', message: 'Комната не найдена' });
      }
    }

    else if (data.type === 'startRound') {
      if (!ws.roomId) return;
      const room = rooms.get(ws.roomId);
      if (!room) return;
      if (room.players[room.drawerIndex].ws !== ws) return; // только рисующий может стартовать
      startRound(room);
    }

    else if (data.type === 'draw') {
      if (!ws.roomId) return;
      const room = rooms.get(ws.roomId);
      if (!room || !room.roundActive) return;

      if (room.players[room.drawerIndex].ws !== ws) return;

      broadcast(room, {
        type: 'drawing',
        data: data.data,
      });
    }

    else if (data.type === 'clear') {
      if (!ws.roomId) return;
      const room = rooms.get(ws.roomId);
      if (!room) return;

      if (room.players[room.drawerIndex].ws !== ws) return;

      broadcast(room, { type: 'clear' });
    }

    else if (data.type === 'guess') {
      if (!ws.roomId) return;
      const room = rooms.get(ws.roomId);
      if (!room || !room.roundActive) return;

      const guesser = ws.playerName;
      const drawer = room.players[room.drawerIndex];
      const guess = data.guess.trim().toLowerCase();
      const correctWord = room.currentWord.toLowerCase();

      if (guess === correctWord) {
        endRound(room, guesser);
        broadcast(room, { type: 'guess', player: guesser, guess: data.guess });
      } else {
        broadcast(room, { type: 'guess', player: guesser, guess: data.guess });
      }
    }

    else if (data.type === 'getPublicRooms') {
      // Отправляем список публичных комнат
      const list = [];
      for (let room of rooms.values()) {
        if (!room.isPrivate) {
          list.push({
            id: room.id,
            name: room.name,
            playersCount: room.players.length,
            difficulty: room.difficulty,
          });
        }
      }
      send(ws, { type: 'publicRooms', rooms: list });
    }
  });

  ws.on('close', () => {
    removePlayerFromRoom(ws);
  });
});
