const TOTAL_ROUNDS = 12;
let currentLevel = 1;
let levelCorrectAnswers = 0;
let levelHasMistake = false;

const roundEl = document.getElementById("round");
const timerEl = document.getElementById("timer");
const streakEl = document.getElementById("streak");
const starsEl = document.getElementById("stars");
const bombsEl = document.getElementById("bombs");
const messageEl = document.getElementById("message");
const fireBadgeEl = document.getElementById("fireBadge");
const meteorLayerEl = document.getElementById("meteorLayer");
const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const questionCardEl = document.querySelector(".question-card");
const resultCardEl = document.getElementById("resultCard");
const boostCard = document.getElementById("boostCard");
const boostListEl = document.getElementById("boostList");
const rocketEl = document.getElementById("rocket");
const alienEl = document.getElementById("alien");
const startBtn = document.getElementById("startBtn");
const nextLevelBtn = document.getElementById("nextLevelBtn");
const pauseBtn = document.getElementById("pauseBtn");
const stopBtn = document.getElementById("stopBtn");
const restartBtn = document.getElementById("restartBtn");
const rulesCard = document.getElementById("rulesCard");

const SPEED_LEVELS = [
  { id: "base", icon: "🚀", name: "База", level: 1, bonus: 0, shortText: "10 сек" },
  { id: "pulse", icon: "⚡", name: "Ускорение", level: 2, bonus: 1, shortText: "8 сек" },
  { id: "plasma", icon: "🔥", name: "Турбо", level: 3, bonus: 2, shortText: "6 сек" },
  { id: "warp", icon: "🌠", name: "Рывок", level: 4, bonus: 3, shortText: "4 сек" },
];

let round = 0;
let streak = 0;
let rocketSteps = 0;
let alienSteps = 0;
let timeLeft = getLevelTimeLimit(currentLevel);
let timerId = null;
let currentCorrect = null;
let roundLocked = false;
let gameStarted = false;
let isPaused = false;
let stars = 0;
let bombs = 0;
let roundStartMs = 0;
let speedBonus = 0;
let rocketBoostTimeoutId = null;
let alienJumpTimeoutId = null;
let audioCtx = null;
let activeOscillators = [];
let activeGains = [];
let meteorTimerId = null;

function getLevelTimeLimit(level) {
  if (level <= 1) return 10;
  if (level === 2) return 8;
  if (level === 3) return 6;
  return 4;
}

function ensureAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function stopAllSounds() {
  activeOscillators.forEach((osc) => {
    try {
      osc.stop();
    } catch (error) {
      // oscillator may already be stopped
    }
  });
  activeOscillators = [];
  activeGains = [];
}

function playTone({ frequency, durationSec, type = "sine", volume = 0.09, offsetSec = 0 }) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const startAt = ctx.currentTime + offsetSec;
  const endAt = startAt + durationSec;

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(endAt + 0.01);

  activeOscillators.push(osc);
  activeGains.push(gain);

  osc.onended = () => {
    activeOscillators = activeOscillators.filter((item) => item !== osc);
    activeGains = activeGains.filter((item) => item !== gain);
  };
}

function playCorrectSound() {
  stopAllSounds();
  playTone({ frequency: 980, durationSec: 0.12, type: "sine", volume: 0.085 });
}

function playWrongSound() {
  stopAllSounds();
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const startAt = ctx.currentTime;
  const durationSec = 0.18;
  const endAt = startAt + durationSec;

  // Более заметный "буп": средне-низкий тон с небольшим падением частоты.
  osc.type = "triangle";
  osc.frequency.setValueAtTime(360, startAt);
  osc.frequency.exponentialRampToValueAtTime(250, endAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(endAt + 0.01);

  activeOscillators.push(osc);
  activeGains.push(gain);

  osc.onended = () => {
    activeOscillators = activeOscillators.filter((item) => item !== osc);
    activeGains = activeGains.filter((item) => item !== gain);
  };
}

function playWinMelody() {
  stopAllSounds();
  playTone({ frequency: 740, durationSec: 0.08, type: "sine", volume: 0.08, offsetSec: 0 });
  playTone({ frequency: 880, durationSec: 0.08, type: "sine", volume: 0.08, offsetSec: 0.1 });
  playTone({ frequency: 1047, durationSec: 0.1, type: "sine", volume: 0.09, offsetSec: 0.2 });
}

function playAlienRushSound() {
  stopAllSounds();
  playTone({ frequency: 330, durationSec: 0.08, type: "triangle", volume: 0.11, offsetSec: 0 });
  playTone({ frequency: 250, durationSec: 0.1, type: "triangle", volume: 0.1, offsetSec: 0.08 });
}

function scheduleMeteor() {
  if (!meteorLayerEl) return;
  const delayMs = 2000 + Math.random() * 2000; // 1 раз в 2-4 сек
  meteorTimerId = window.setTimeout(() => {
    spawnMeteor();
    scheduleMeteor();
  }, delayMs);
}

function spawnMeteor() {
  if (!meteorLayerEl) return;

  const meteor = document.createElement("span");
  meteor.className = "meteor";
  meteor.style.top = `${8 + Math.random() * 42}%`;
  meteor.style.left = `${102 + Math.random() * 8}%`;
  meteor.style.setProperty("--meteor-size", `${2 + Math.random() * 2.2}px`);
  meteor.style.setProperty("--meteor-duration", `${520 + Math.random() * 220}ms`);
  meteor.style.setProperty("--meteor-dx", `${-(66 + Math.random() * 28)}vw`);
  meteor.style.setProperty("--meteor-dy", `${24 + Math.random() * 20}vh`);

  meteorLayerEl.appendChild(meteor);
  meteor.addEventListener("animationend", () => {
    meteor.remove();
  });
}

function renderBoosts() {
  const shownLevel = Math.min(Math.max(currentLevel, 1), 4);
  boostListEl.innerHTML = "";
  SPEED_LEVELS.forEach((level) => {
    const active = level.level === shownLevel;
    const card = document.createElement("div");
    card.className = `boost-item${active ? " active" : " inactive"}`;
    const stateText = level.shortText;
    card.innerHTML = `
      <span class="boost-icon">${level.icon}</span>
      <p class="boost-name">${level.name}</p>
      <p class="boost-meta">${stateText}</p>
    `;
    boostListEl.appendChild(card);
  });
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function setButtonsDisabled(disabled) {
  const buttons = answersEl.querySelectorAll(".answer-btn");
  buttons.forEach((btn) => {
    btn.disabled = disabled;
  });
}

function clearAnswerHighlight() {
  const buttons = answersEl.querySelectorAll(".answer-btn");
  buttons.forEach((btn) => btn.classList.remove("correct", "wrong"));
}

function generateRound() {
  const a = randInt(1, 10);
  const b = randInt(1, 10);
  const correct = a * b;
  const wrongSet = new Set();

  while (wrongSet.size < 2) {
    const delta = randInt(-8, 8);
    const wrong = correct + delta;
    if (wrong > 0 && wrong !== correct) {
      wrongSet.add(wrong);
    }
  }

  const options = shuffle([correct, ...wrongSet]);
  return { text: `${a} × ${b} = ?`, correct, options };
}

function updatePositions() {
  // 96% чтобы эмодзи не "упирались" в край трека.
  const rocketPercent = Math.min((rocketSteps / TOTAL_ROUNDS) * 96, 96);
  const alienPercent = Math.min((alienSteps / TOTAL_ROUNDS) * 96, 96);
  rocketEl.style.transform = `translateX(${rocketPercent}%)`;
  alienEl.style.transform = `translateX(${alienPercent}%)`;
}

function setMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.classList.remove("message-good", "message-bad");
  if (type) {
    messageEl.classList.add(type);
  }
}

function startTimer(resetTime = true) {
  clearInterval(timerId);
  if (resetTime) {
    timeLeft = getLevelTimeLimit(currentLevel);
  }
  timerEl.textContent = timeLeft;

  timerId = setInterval(() => {
    timeLeft -= 1;
    timerEl.textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(timerId);
      handleTimeout();
    }
  }, 1000);
}

function renderOptions(options) {
  answersEl.innerHTML = "";
  options.forEach((value) => {
    const btn = document.createElement("button");
    btn.className = "answer-btn";
    btn.textContent = String(value);
    btn.addEventListener("click", () => handleAnswer(value, btn));
    answersEl.appendChild(btn);
  });
}

function loadNextRound() {
  round += 1;
  roundEl.textContent = round;
  streakEl.textContent = streak;
  roundLocked = false;
  fireBadgeEl.classList.add("hidden");
  clearAnswerHighlight();
  setButtonsDisabled(false);

  const data = generateRound();
  currentCorrect = data.correct;
  questionEl.textContent = data.text;
  renderOptions(data.options);
  roundStartMs = Date.now();

  setMessage("Выбери правильный ответ!");
  startTimer();
}

function finishGame() {
  clearInterval(timerId);
  setButtonsDisabled(true);
  gameStarted = false;
  isPaused = false;
  fireBadgeEl.classList.add("hidden");
  questionCardEl.classList.add("hidden");
  resultCardEl.classList.remove("hidden");
  resultCardEl.classList.remove("result-win");

  const levelPassed = levelCorrectAnswers === TOTAL_ROUNDS;

  if (levelPassed) {
    setMessage("Ты готов к следующему уровню", "message-good");
    resultCardEl.classList.add("result-win");
    playWinMelody();
    nextLevelBtn.textContent = "Перейти дальше";
    nextLevelBtn.dataset.mode = "next";
  } else {
    setMessage("Попробуй ещё раз", "message-bad");
    nextLevelBtn.textContent = "Продолжить";
    nextLevelBtn.dataset.mode = "retry";
  }
  resultCardEl.innerHTML = `
    <p><strong>Итоги миссии</strong></p>
    <p>🧭 Уровень: <strong>${currentLevel}</strong></p>
    <p>⭐ Правильных ответов: <strong>${stars}</strong></p>
    <p>💣 Ошибок: <strong>${bombs}</strong></p>
    <p>✅ Верных в уровне: <strong>${levelCorrectAnswers}</strong> / ${TOTAL_ROUNDS}</p>
  `;
  renderBoosts();

  pauseBtn.classList.add("hidden");
  pauseBtn.textContent = "Пауза";
  stopBtn.classList.add("hidden");
  nextLevelBtn.classList.remove("hidden");
  restartBtn.classList.remove("hidden");
  startBtn.classList.add("hidden");
}

function stopGame() {
  clearInterval(timerId);
  isPaused = false;
  stopAllSounds();
  prepareStartScreen("Игра остановлена. Нажми «Начать игру»");
}

function startNextLevel() {
  const mode = nextLevelBtn.dataset.mode || "retry";
  if (mode === "next") {
    currentLevel += 1;
  }

  gameStarted = true;
  isPaused = false;

  // Сбрасываем только параметры уровня/раундов.
  round = 0;
  streak = 0;
  levelCorrectAnswers = 0;
  levelHasMistake = false;
  rocketSteps = 0;
  alienSteps = 0;
  roundLocked = false;

  roundEl.textContent = "0";
  streakEl.textContent = "0";
  starsEl.textContent = String(stars);
  bombsEl.textContent = String(bombs);
  timerEl.textContent = getLevelTimeLimit(currentLevel);

  startBtn.classList.add("hidden");
  nextLevelBtn.classList.add("hidden");
  nextLevelBtn.dataset.mode = "";
  pauseBtn.classList.remove("hidden");
  pauseBtn.textContent = "Пауза";
  stopBtn.classList.remove("hidden");
  restartBtn.classList.add("hidden");

  fireBadgeEl.classList.add("hidden");
  questionCardEl.classList.remove("hidden");
  resultCardEl.classList.add("hidden");
  resultCardEl.classList.remove("result-win");
  resultCardEl.innerHTML = "";

  updatePositions();
  loadNextRound();
}

function togglePause() {
  if (!gameStarted || roundLocked) return;

  if (!isPaused) {
    isPaused = true;
    clearInterval(timerId);
    setButtonsDisabled(true);
    pauseBtn.textContent = "Продолжить";
    setMessage("Пауза");
    return;
  }

  isPaused = false;
  setButtonsDisabled(false);
  pauseBtn.textContent = "Пауза";
  setMessage("Выбери правильный ответ!");
  startTimer(false);
}

function nextRoundOrFinish() {
  if (round >= TOTAL_ROUNDS) {
    finishGame();
    return;
  }

  setTimeout(() => {
    loadNextRound();
  }, 800);
}

function applyRocketMove() {
  // Скорость зависит от серии и уровня реактивного ускорителя.
  // Серия 3+ = ускорение, серия 5+ = суперускорение.
  const streakBoost = streak >= 5 ? 2 : streak >= 3 ? 1 : 0;
  const step = 1 + streakBoost + speedBonus;

  // Визуально показываем ускорение через более быстрый ease-out.
  const moveDurationMs = streak >= 5 ? 260 : streak >= 3 ? 380 : 550;
  rocketEl.style.transition = `transform ${moveDurationMs}ms ease-out, filter 0.35s ease`;

  if (rocketBoostTimeoutId) {
    clearTimeout(rocketBoostTimeoutId);
  }
  rocketEl.classList.remove("boosted", "super-boosted");
  if (streak >= 5) {
    rocketEl.classList.add("super-boosted");
  } else if (streak >= 3) {
    rocketEl.classList.add("boosted");
  }

  rocketSteps += step;
  updatePositions();

  rocketBoostTimeoutId = setTimeout(() => {
    rocketEl.classList.remove("boosted", "super-boosted");
    rocketEl.style.transition = "transform 550ms ease-out, filter 0.35s ease";
  }, moveDurationMs + 80);
}

function applyAlienMove(boosted = false) {
  const step = boosted ? 2 : 1;
  const maxSafeStep = TOTAL_ROUNDS - 0.5;
  alienSteps = Math.min(alienSteps + step, maxSafeStep);

  if (boosted) {
    if (alienJumpTimeoutId) {
      clearTimeout(alienJumpTimeoutId);
    }
    alienEl.classList.remove("alien-jump");
    // Reflow to restart jump animation reliably.
    void alienEl.offsetWidth;
    alienEl.classList.add("alien-jump");
    playAlienRushSound();
    alienJumpTimeoutId = setTimeout(() => {
      alienEl.classList.remove("alien-jump");
    }, 280);
  }

  updatePositions();
}

function revealCorrectAnswer() {
  const buttons = answersEl.querySelectorAll(".answer-btn");
  buttons.forEach((btn) => {
    if (Number(btn.textContent) === currentCorrect) {
      btn.classList.add("correct");
    }
  });
}

function lockRound() {
  roundLocked = true;
  setButtonsDisabled(true);
  clearInterval(timerId);
}

function handleAnswer(value, buttonEl) {
  if (roundLocked || !gameStarted || isPaused) return;
  lockRound();

  const isCorrect = value === currentCorrect;

  if (isCorrect) {
    streak += 1;
    stars += 1;
    levelCorrectAnswers += 1;
    starsEl.textContent = stars;
    setMessage("Верно", "message-good");
    if (Date.now() - roundStartMs <= 1000) {
      fireBadgeEl.classList.remove("hidden");
    }
  } else {
    streak = 0;
    bombs += 1;
    levelHasMistake = true;
    bombsEl.textContent = bombs;
    fireBadgeEl.classList.add("hidden");
    setMessage("Ошибка", "message-bad");
  }

  streakEl.textContent = streak;

  // Синхронизация отклика: звук + анимация кнопки + движение в одном кадре.
  requestAnimationFrame(() => {
    if (isCorrect) {
      buttonEl.classList.add("correct");
      playCorrectSound();
      applyRocketMove();
    } else {
      buttonEl.classList.add("wrong");
      revealCorrectAnswer();
      applyAlienMove(true);
    }
  });

  nextRoundOrFinish();
}

function handleTimeout() {
  if (roundLocked || !gameStarted || isPaused) return;
  lockRound();

  streak = 0;
  bombs += 1;
  levelHasMistake = true;
  streakEl.textContent = streak;
  bombsEl.textContent = bombs;
  fireBadgeEl.classList.add("hidden");
  setMessage("Ошибка: время вышло", "message-bad");
  revealCorrectAnswer();
  applyAlienMove(true);

  nextRoundOrFinish();
}

function resetGameAndStart() {
  gameStarted = true;
  isPaused = false;
  round = 0;
  streak = 0;
  stars = 0;
  bombs = 0;
  speedBonus = 0;
  levelCorrectAnswers = 0;
  levelHasMistake = false;
  rocketSteps = 0;
  alienSteps = 0;
  roundEl.textContent = "0";
  streakEl.textContent = "0";
  starsEl.textContent = "0";
  bombsEl.textContent = "0";
  timerEl.textContent = getLevelTimeLimit(currentLevel);
  startBtn.classList.add("hidden");
  nextLevelBtn.classList.add("hidden");
  nextLevelBtn.dataset.mode = "";
  pauseBtn.classList.remove("hidden");
  pauseBtn.textContent = "Пауза";
  stopBtn.classList.remove("hidden");
  restartBtn.classList.add("hidden");
  fireBadgeEl.classList.add("hidden");
  questionCardEl.classList.remove("hidden");
  resultCardEl.classList.add("hidden");
  resultCardEl.classList.remove("result-win");
  resultCardEl.innerHTML = "";
  renderBoosts();
  updatePositions();
  loadNextRound();
}

function fullResetAndStart() {
  currentLevel = 1;
  resetGameAndStart();
}

function prepareStartScreen(statusText = "Готова к полету") {
  clearInterval(timerId);
  gameStarted = false;
  isPaused = false;
  round = 0;
  streak = 0;
  stars = 0;
  bombs = 0;
  speedBonus = 0;
  levelCorrectAnswers = 0;
  levelHasMistake = false;
  rocketSteps = 0;
  alienSteps = 0;
  roundLocked = true;

  roundEl.textContent = "0";
  streakEl.textContent = "0";
  starsEl.textContent = "0";
  bombsEl.textContent = "0";
  timerEl.textContent = getLevelTimeLimit(currentLevel);
  fireBadgeEl.classList.add("hidden");
  questionCardEl.classList.remove("hidden");
  resultCardEl.classList.add("hidden");
  resultCardEl.classList.remove("result-win");
  resultCardEl.innerHTML = "";
  questionEl.textContent = "Нажми «Начать игру»";
  answersEl.innerHTML = `
    <button class="answer-btn" disabled>?</button>
    <button class="answer-btn" disabled>?</button>
    <button class="answer-btn" disabled>?</button>
  `;
  setButtonsDisabled(true);
  setMessage(statusText);
  startBtn.classList.remove("hidden");
  nextLevelBtn.classList.add("hidden");
  nextLevelBtn.dataset.mode = "";
  pauseBtn.classList.add("hidden");
  pauseBtn.textContent = "Пауза";
  stopBtn.classList.add("hidden");
  restartBtn.classList.add("hidden");
  renderBoosts();
  updatePositions();
}

rocketEl.textContent = "🚀";
renderBoosts();
startBtn.addEventListener("click", resetGameAndStart);
nextLevelBtn.addEventListener("click", startNextLevel);
pauseBtn.addEventListener("click", togglePause);
stopBtn.addEventListener("click", stopGame);
restartBtn.addEventListener("click", fullResetAndStart);

prepareStartScreen();
scheduleMeteor();
