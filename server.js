// server.js
const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Налаштування сесій (для збереження стану гри)
app.use(session({
  secret: 'tictactoe-secret',
  resave: false,
  saveUninitialized: true,
}));

// Обслуговування статичних файлів (якщо потрібні, напр.: CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// Логіка гри (функції)
// ============================

/**
 * Перевіряє, чи є переможець для заданого знаку.
 */
function checkWinner(board, sign) {
  const wins = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],  // рядки
    [0, 3, 6], [1, 4, 7], [2, 5, 8],  // стовпці
    [0, 4, 8], [2, 4, 6]              // діагоналі
  ];
  for (let combo of wins) {
    if (
      board[combo[0]] === sign &&
      board[combo[1]] === sign &&
      board[combo[2]] === sign
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Перевіряє, чи заповнене поле
 */
function isBoardFull(board) {
  return board.every(cell => cell !== '');
}

/**
 * Повертає випадковий індекс вільної клітинки.
 */
function getRandomFreeCell(board) {
  const free = [];
  board.forEach((cell, idx) => {
    if (cell === '') free.push(idx);
  });
  if (free.length === 0) return -1;
  return free[Math.floor(Math.random() * free.length)];
}

/**
 * Визначає найкращий хід для комп’ютера.
 * Спочатку перевіряє, чи може бот виграти, потім чи треба блокувати хід користувача,
 * потім повертає центр, якщо він вільний, або випадкову вільну клітинку.
 */
function getBestMove(board, compSign, playerSign) {
  // Перевірка: чи може комп'ютер виграти безпосередньо
  for (let i = 0; i < board.length; i++) {
    if (board[i] === '') {
      let copy = board.slice();
      copy[i] = compSign;
      if (checkWinner(copy, compSign)) {
        return i;
      }
    }
  }
  // Блокування: чи може користувач виграти на наступному ході
  for (let i = 0; i < board.length; i++) {
    if (board[i] === '') {
      let copy = board.slice();
      copy[i] = playerSign;
      if (checkWinner(copy, playerSign)) {
        return i;
      }
    }
  }
  // Якщо центр вільний – займаємо його
  if (board[4] === '') return 4;
  // В іншому випадку повертаємо випадкову вільну клітинку
  return getRandomFreeCell(board);
}

/**
 * Ініціалізує гру в сесії.
 * Рандомно вибирається знак для користувача.
 * Якщо користувач має знак "X", він ходить першим, інакше першим ходить комп'ютер.
 */
function initGame(sess) {
  if (!sess.game) {
    const playerSign = Math.random() < 0.5 ? 'X' : 'O';
    const compSign = playerSign === 'X' ? 'O' : 'X';
    let currentTurn = (playerSign === 'X') ? 'player' : 'computer';
    sess.game = {
      board: Array(9).fill(''), // Ігрове поле – 9 клітинок
      playerSign,
      compSign,
      currentTurn, // 'player' або 'computer'
      result: null // Результат гри: "Перемога", "Програш", "Нічия"
    };
    // Якщо комп'ютер має ходити першим
    if (currentTurn === 'computer') {
      const move = getBestMove(sess.game.board, compSign, playerSign);
      sess.game.board[move] = compSign;
      sess.game.currentTurn = 'player';
    }
  }
}

// ============================
// Маршрути гри
// ============================

// Головна сторінка – повертає HTML-інтерфейс гри
app.get('/', (req, res) => {
  initGame(req.session);
  res.sendFile(path.join(__dirname, 'index.html'));
});

// API для отримання поточного стану гри
app.get('/api/game', (req, res) => {
  initGame(req.session);
  res.json(req.session.game);
});

// API для ходу користувача
app.post('/api/move', (req, res) => {
  initGame(req.session);
  const game = req.session.game;
  const move = req.body.move;
  
  if (typeof move === 'undefined' || move < 0 || move > 8) {
    return res.status(400).json({ error: "Некоректний індекс клітинки." });
  }
  
  if (game.board[move] !== '') {
    return res.status(400).json({ error: "Клітинка вже зайнята." });
  }
  
  // Хід користувача
  game.board[move] = game.playerSign;
  
  // Перевірка перемоги користувача
  if (checkWinner(game.board, game.playerSign)) {
    game.result = "Перемога";
    return res.json(game);
  }
  
  // Якщо поле заповнене – нічия
  if (isBoardFull(game.board)) {
    game.result = "Нічия";
    return res.json(game);
  }
  
  // Затримка комп'ютерного ходу на 1 секунду
  setTimeout(() => {
    const compMove = getBestMove(game.board, game.compSign, game.playerSign);
    // Якщо різних варіантів більше немає – нічия
    if (compMove === -1) {
      game.result = "Нічия";
      return res.json(game);
    }
    game.board[compMove] = game.compSign;
    
    // Перевірка перемоги комп'ютера
    if (checkWinner(game.board, game.compSign)) {
      game.result = "Програш";
    } else if (isBoardFull(game.board)) {
      game.result = "Нічия";
    } else {
      game.currentTurn = 'player';
    }
    
    return res.json(game);
  }, 1000);
});

// API для скидання гри (новий старт)
app.post('/api/reset', (req, res) => {
  req.session.game = null;
  initGame(req.session);
  res.json(req.session.game);
});

app.listen(PORT, () => {
  console.log(`Tic Tac Toe запущено на порті ${PORT}`);
});
