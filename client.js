(() => {
  // Элементы DOM
  const elements = {
    radioPublic: document.getElementById('radioPublic'),
    radioPrivate: document.getElementById('radioPrivate'),
    roomName: document.getElementById('roomName'),
    difficulty: document.getElementById('difficulty'),
    privateCode: document.getElementById('privateCode'),
    btnCreateRoom: document.getElementById('btnCreateRoom'),
    joinCode: document.getElementById('joinCode'),
    btnJoinRoom: document.getElementById('btnJoinRoom'),
    publicRoomsList: document.getElementById('publicRoomsList'),
    btnRefreshPublicRooms: document.getElementById('btnRefreshPublicRooms'),
    setupDiv: document.getElementById('setup'),
    gameDiv: document.getElementById('game'),
    roomInfo: document.getElementById('roomInfo'),
    canvas: document.getElementById('canvas'),
    btnPen: document.getElementById('btnPen'),
    btnEraser: document.getElementById('btnEraser'),
    btnClear: document.getElementById('btnClear'),
    btnStartRound: document.getElementById('btnStartRound'),
    playersDiv: document.getElementById('players'),
    chatInput: document.getElementById('chatInput'),
    chat: document.getElementById('chat'),
    btnSend: document.getElementById('btnSend'),
    btnLangRus: document.getElementById('btnLangRus'),
    btnLangEng: document.getElementById('btnLangEng'),
    privateCodeWrapper: document.getElementById('privateCodeWrapper'),
    joinPrivateWrapper: document.getElementById('joinPrivateWrapper'),
    joinPublicWrapper: document.getElementById('joinPublicWrapper'),
  };

  // Язык по умолчанию
  let lang = 'rus';

  // Переменные состояния
  let ws;
  let roomId = null;
  let isDrawer = false;
  let drawerName = null;
  let roundActive = false;
  let currentWord = null;

  // Переводы
  const translations = {
    rus: {
      createRoomTitle: "Создать комнату",
      roomNameLabel: "Название комнаты:",
      difficultyLabel: "Сложность слова:",
      easy: "Лёгкая",
      medium: "Средняя",
      hard: "Сложная",
      publicRoom: "Публичная комната",
      privateRoom: "Приватная комната",
      privateCodeLabel: "Код комнаты (5 символов):",
      createRoomBtn: "Создать комнату",
      joinRoomTitle: "Войти в комнату",
      publicRoomsListTitle: "Публичные комнаты",
      refreshRoomsBtn: "Обновить список",
      joinPrivateCodeLabel: "Введите код приватной комнаты:",
      joinRoomBtn: "Войти",
      pen: "Карандаш",
      eraser: "Ластик",
      clear: "Очистить",
      startRound: "Начать раунд",
      send: "Отправить",
      yourTurnToDraw: "Ваша очередь рисовать! Слово:",
      waitingForDrawer: "Ждём рисующего:",
      roundEnded: "Раунд завершён! Победитель:",
      chatPlaceholder: "Введите сообщение...",
      noPublicRooms: "Публичных комнат нет",
      onlyDrawerStart: "Только рисующий может начать раунд",
      invalidPrivateCode: "Введите корректный код из 5 символов",
    },
    eng: {
      createRoomTitle: "Create Room",
      roomNameLabel: "Room Name:",
      difficultyLabel: "Word Difficulty:",
      easy: "Easy",
      medium: "Medium",
      hard: "Hard",
      publicRoom: "Public Room",
      privateRoom: "Private Room",
      privateCodeLabel: "Room Code (5 chars):",
      createRoomBtn: "Create Room",
      joinRoomTitle: "Join Room",
      publicRoomsListTitle: "Public Rooms",
      refreshRoomsBtn: "Refresh List",
      joinPrivateCodeLabel: "Enter private room code:",
      joinRoomBtn: "Join",
      pen: "Pen",
      eraser: "Eraser",
      clear: "Clear",
      startRound: "Start Round",
      send: "Send",
      yourTurnToDraw: "Your turn to draw! Word:",
      waitingForDrawer: "Waiting for drawer:",
      roundEnded: "Round ended! Winner:",
      chatPlaceholder: "Enter message...",
      noPublicRooms: "No public rooms",
      onlyDrawerStart: "Only the drawer can start the round",
      invalidPrivateCode: "Please enter a valid 5 character code",
    },
  };

  // Функция для локализации текста на странице
  function translatePage() {
    // Пример: перевести текст в элементах по атрибуту data-lang-key
    document.querySelectorAll('[data-lang-key]').forEach(el => {
      const key = el.getAttribute('data-lang-key');
      if (translations[lang][key]) {
        el.textContent = translations[lang][key];
      }
    });
    // Плейсхолдер для чата
    elements.chatInput.placeholder = translations[lang].chatPlaceholder;
  }

  // Переключение языка
  elements.btnLangRus.addEventListener('click', () => {
    lang = 'rus';
    elements.btnLangRus.classList.add('active');
    elements.btnLangEng.classList.remove('active');
    translatePage();
  });

  elements.btnLangEng.addEventListener('click', () => {
    lang = 'eng';
    elements.btnLangEng.classList.add('active');
    elements.btnLangRus.classList.remove('active');
    translatePage();
  });

  translatePage();

  // Показывать/прятать поля для приватного кода в настройках и при входе
  function updateRoomTypeUI() {
    if (elements.radioPrivate.checked) {
      elements.privateCodeWrapper.style.display = 'block';
      elements.joinPrivateWrapper.style.display = 'block';
      elements.joinPublicWrapper.style.display = 'none';
    } else {
      elements.privateCodeWrapper.style.display = 'none';
      elements.joinPrivateWrapper.style.display = 'none';
      elements.joinPublicWrapper.style.display = 'block';
    }
  }
  elements.radioPrivate.addEventListener('change', updateRoomTypeUI);
  elements.radioPublic.addEventListener('change', updateRoomTypeUI);
  updateRoomTypeUI();

  // WebSocket подключение
  function connectWS() {
    ws = new WebSocket(`ws://${location.host}`);

    ws.onopen = () => {
      // При открытии запрашиваем публичные комнаты, если выбрана публичная комната
      if (elements.radioPublic.checked) {
        requestPublicRooms();
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'roomCreated':
          roomId = data.roomId;
          isDrawer = false;
          drawerName = null;
          roundActive = false;
          currentWord = null;
          showGame();
          break;
        case 'lobby':
          roomId = data.roomId;
          drawerName = data.drawer;
          roundActive = data.roundActive;
          currentWord = data.word || null;
          isDrawer = (drawerName === data.you);
          updateRoomInfo(data);
          renderPlayers(data.players);
          break;
        case 'publicRooms':
          renderPublicRooms(data.rooms);
          break;
        case 'roundStart':
          roundActive = true;
          currentWord = data.word;
          drawerName = data.drawer;
          isDrawer = (drawerName === data.you);
          updateRoomInfo(data);
          clearCanvas();
          addChatMessage(`${drawerName} ${lang === 'rus' ? 'начал рисовать' : 'started drawing'}`);
          break;
        case 'roundEnd':
          roundActive = false;
          currentWord = null;
          updateRoomInfo(data);
          addChatMessage(`${translations[lang].roundEnded} ${data.winner}`);
          break;
        case 'drawing':
          drawFromData(data.data);
          break;
        case 'clear':
          clearCanvas();
          break;
        case 'guess':
          addChatMessage(`${data.player}: ${data.guess}`);
          break;
        case 'message':
          alert(data.message);
          break;
      }
    };

    ws.onclose = () => {
      alert('Connection closed. Please reload the page.');
    };
  }

  connectWS();

  // Создание комнаты
  elements.btnCreateRoom.onclick = () => {
    const roomName = elements.roomName.value.trim() || null;
    const difficulty = elements.difficulty.value;
    const isPrivate = elements.radioPrivate.checked;
    const code = elements.privateCode.value.trim().toUpperCase();

    if (isPrivate && (code.length !== 5)) {
      alert(translations[lang].invalidPrivateCode);
      return;
    }

    ws.send(JSON.stringify({
      type: 'createRoom',
      roomName,
      difficulty,
      isPrivate,
      code: isPrivate ? code : null,
      lang,
    }));
  };

  // Вход в комнату по коду (приватная)
  elements.btnJoinRoom.onclick = () => {
    const code = elements.joinCode.value.trim().toUpperCase();
    if (code.length !== 5) {
      alert(translations[lang].invalidPrivateCode);
      return;
    }
    ws.send(JSON.stringify({ type: 'joinRoom', code, lang }));
  };

  // Запрос списка публичных комнат
  function requestPublicRooms() {
    ws.send(JSON.stringify({ type: 'getPublicRooms' }));
  }

  elements.btnRefreshPublicRooms.onclick = requestPublicRooms;

  // Отрисовка списка публичных комнат
  function renderPublicRooms(rooms) {
    elements.publicRoomsList.innerHTML = '';
    if (rooms.length === 0) {
      const li = document.createElement('li');
      li.textContent = translations[lang].noPublicRooms;
      elements.publicRoomsList.appendChild(li);
      return;
    }
    rooms.forEach(room => {
      const li = document.createElement('li');
      li.textContent = `${room.name} (${room.playersCount} ${lang === 'rus' ? 'игроков' : 'players'}) - ${room.difficulty}`;
      li.onclick = () => {
        ws.send(JSON.stringify({ type: 'joinRoom', roomId: room.id, lang }));
      };
      elements.publicRoomsList.appendChild(li);
    });
  }

  // Показать экран игры
  function showGame() {
    elements.setupDiv.style.display = 'none';
    elements.gameDiv.style.display = 'flex';
    clearCanvas();
    updateRoomInfo();
  }

  // Обновить инфо о комнате и раунде
  function updateRoomInfo(data = {}) {
    const roomName = data.roomName || '';
    const difficulty = data.difficulty || '';
    let info = `${lang === 'rus' ? 'Комната:' : 'Room:'} ${roomName} (${difficulty})`;

    if (roundActive) {
      if (isDrawer) {
        info += ` — ${translations[lang].yourTurnToDraw} ${currentWord || ''}`;
      } else {
        info += ` — ${translations[lang].waitingForDrawer} ${drawerName}`;
      }
    } else {
      info += ` — ${lang === 'rus' ? 'Раунд не начался' : 'Round not started'}`;
    }
    elements.roomInfo.textContent = info;
  }

  // Отрисовка списка игроков
  function renderPlayers(players) {
    elements.playersDiv.textContent = `${lang === 'rus' ? 'Игроки:' : 'Players:'} ${players.join(', ')}`;
  }

  // --- Canvas рисование ---

  const canvas = elements.canvas;
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let erasing = false;
  let lastX = 0;
  let lastY = 0;

  elements.btnPen.onclick = () => {
    erasing = false;
    setToolActive(elements.btnPen);
  };

  elements.btnEraser.onclick = () => {
    erasing = true;
    setToolActive(elements.btnEraser);
  };

  elements.btnClear.onclick = () => {
    clearCanvas();
    if (isDrawer) {
      ws.send(JSON.stringify({ type: 'clear' }));
    }
  };

  elements.btnStartRound.onclick = () => {
    if (!isDrawer) {
      alert(translations[lang].onlyDrawerStart);
      return;
    }
    ws.send(JSON.stringify({ type: 'startRound' }));
  };

  // Установить активную кнопку инструмента
  function setToolActive(activeBtn) {
    [elements.btnPen, elements.btnEraser].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  // Обработка мыши на canvas
  canvas.onmousedown = (e) => {
    if (!isDrawer || !roundActive) return;
    drawing = true;
    [lastX, lastY] = [e.offsetX, e.offsetY];
  };

  canvas.onmouseup = () => {
    drawing = false;
  };

  canvas.onmouseout = () => {
    drawing = false;
  };

  canvas.onmousemove = (e) => {
    if (!drawing) return;
    const [x, y] = [e.offsetX, e.offsetY];
    drawLine(lastX, lastY, x, y, erasing ? 'white' : 'black', erasing ? 20 : 3, true);
    [lastX, lastY] = [x, y];
  };

  // Рисование линии локально и отправка на сервер
  function drawLine(x1, y1, x2, y2, color, width, emit) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.closePath();

    if (!emit) return;

    ws.send(JSON.stringify({
      type: 'drawing',
      data: { x1, y1, x2, y2, color, width },
    }));
  }

  // Рисование по данным с сервера
  function drawFromData(data) {
    drawLine(data.x1, data.y1, data.x2, data.y2, data.color, data.width, false);
  }

  // Очистка canvas
  function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // Добавление сообщения в чат
  function addChatMessage(msg) {
    const li = document.createElement('li');
    li.textContent = msg;
    elements.chat.appendChild(li);
    elements.chat.scrollTop = elements.chat.scrollHeight;
  }

  // Отправка сообщения (угадывание) из чата
  elements.btnSend.onclick = () => {
    const msg = elements.chatInput.value.trim();
    if (!msg) return;
    ws.send(JSON.stringify({ type: 'guess', guess: msg }));
    elements.chatInput.value = '';
  };

  // Отправка сообщения по Enter
  elements.chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      elements.btnSend.click();
    }
  });

})();
