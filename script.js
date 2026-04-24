const TOTAL_ROUNDS = 12;
const MAX_LEVEL = 4;
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
const gameEl = document.querySelector(".game");
const questionEl = document.getElementById("question");
const answersEl = document.getElementById("answers");
const questionTimerTextEl = document.getElementById("questionTimerText");
const questionTimerBarFillEl = document.getElementById("questionTimerBarFill");
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
let timeLeft = getTimeForLevel(currentLevel);
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

function updateMobileGameState() {
  if (!gameEl) return;
  gameEl.classList.toggle("mobile-playing", gameStarted);
  gameEl.classList.toggle("start-state", !gameStarted && !gameEl.classList.contains("mobile-finished"));
}

function getTimeForLevel(level) {
  if (level <= 1) return 10;
  if (level === 2) return 8;
  if (level === 3) return 6;
  return 4;
}

function getLevelTimeLimit(level) {
  return getTimeForLevel(level);
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

function spawnLevelCelebration(isFinal = false) {
  if (!meteorLayerEl) return;
  const amount = isFinal ? 46 : 28;
  for (let i = 0; i < amount; i += 1) {
    const star = document.createElement("span");
    star.className = "level-star";
    if (isFinal) {
      star.classList.add("level-star-final");
    }
    star.style.left = `${8 + Math.random() * 84}%`;
    star.style.top = `${-8 - Math.random() * 18}px`;
    if (isFinal) {
      star.style.setProperty("--star-size", `${10 + Math.random() * 12}px`);
      star.style.setProperty("--star-duration", `${1400 + Math.random() * 700}ms`);
      star.style.setProperty("--star-drift", `${-42 + Math.random() * 84}px`);
      star.style.animationDelay = `${Math.random() * 280}ms`;
    } else {
      star.style.setProperty("--star-size", `${7 + Math.random() * 8}px`);
      star.style.setProperty("--star-duration", `${1000 + Math.random() * 500}ms`);
      star.style.setProperty("--star-drift", `${-28 + Math.random() * 56}px`);
      star.style.animationDelay = `${Math.random() * 220}ms`;
    }
    meteorLayerEl.appendChild(star);
    star.addEventListener("animationend", () => {
      star.remove();
    });
  }
}

function renderBoosts() {
  if (!boostCard || !boostListEl) return;
  boostCard.classList.remove("hidden");
  boostListEl.innerHTML = "";

  const shownLevel = Math.min(Math.max(currentLevel, 1), 4);
  SPEED_LEVELS.forEach((level) => {
    const active = level.level === shownLevel;
    const card = document.createElement("div");
    card.className = `boost-item${active ? " active" : " inactive"}`;
    card.innerHTML = `
      <span class="boost-icon">${level.icon}</span>
      <span class="boost-line">${level.name} • ${level.shortText}</span>
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
  messageEl.classList.remove("message-good", "message-bad", "message-level-win", "message-final-win");
  if (type) {
    messageEl.classList.add(type);
  }
}

function updateQuestionTimerVisual() {
  const levelTime = getTimeForLevel(currentLevel);
  const safeTime = Math.max(0, Math.min(timeLeft, levelTime));
  const percent = levelTime > 0 ? (safeTime / levelTime) * 100 : 0;

  if (questionTimerTextEl) {
    if (gameStarted) {
      questionTimerTextEl.textContent = `Осталось: ${safeTime} сек`;
    } else {
      questionTimerTextEl.textContent = `На каждый ответ даётся ${getTimeForLevel(currentLevel)} секунд`;
    }
  }

  if (questionTimerBarFillEl) {
    questionTimerBarFillEl.style.width = `${percent}%`;
    questionTimerBarFillEl.classList.remove("warning", "danger");
    if (safeTime <= 3) {
      questionTimerBarFillEl.classList.add("danger");
    } else if (safeTime <= 5) {
      questionTimerBarFillEl.classList.add("warning");
    }
  }
}

function startTimer(resetTime = true) {
  clearInterval(timerId);
  if (resetTime) {
    timeLeft = getLevelTimeLimit(currentLevel);
  }
  timerEl.textContent = timeLeft;
  updateQuestionTimerVisual();

  timerId = setInterval(() => {
    timeLeft -= 1;
    timerEl.textContent = timeLeft;
    updateQuestionTimerVisual();

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
  updateMobileGameState();
  fireBadgeEl.classList.add("hidden");
  questionCardEl.classList.add("hidden");
  resultCardEl.classList.remove("hidden");
  resultCardEl.classList.remove("result-win");
  resultCardEl.classList.remove("result-final-win");

  const levelPassed = levelCorrectAnswers === TOTAL_ROUNDS;
  const isFinalVictory = levelPassed && currentLevel >= MAX_LEVEL;

  if (isFinalVictory) {
    setMessage("Победа! Ты прошёл все уровни! 🚀⭐", "message-good");
    messageEl.classList.add("message-final-win");
    resultCardEl.classList.add("result-win");
    resultCardEl.classList.add("result-final-win");
    playWinMelody();
    spawnLevelCelebration(true);
    nextLevelBtn.classList.add("hidden");
    nextLevelBtn.dataset.mode = "";
    startBtn.textContent = "Начать игру";
    startBtn.dataset.action = "start";
  } else if (levelPassed) {
    setMessage("Уровень пройден! 🚀", "message-good");
    messageEl.classList.add("message-level-win");
    resultCardEl.classList.add("result-win");
    playWinMelody();
    spawnLevelCelebration();
    nextLevelBtn.textContent = "На следующий уровень 🚀";
    nextLevelBtn.dataset.mode = "next";
    startBtn.textContent = "На следующий уровень 🚀";
    startBtn.dataset.action = "next-level";
  } else {
    setMessage("Попробуй ещё раз", "message-bad");
    nextLevelBtn.textContent = "Продолжить";
    nextLevelBtn.dataset.mode = "retry";
    startBtn.textContent = "Начать игру";
    startBtn.dataset.action = "start";
  }
  resultCardEl.innerHTML = `
    <p><strong>Итоги миссии</strong></p>
    <p>🧭 Уровень: <strong>${currentLevel}</strong></p>
    <p>⭐ Правильных ответов: <strong>${stars}</strong></p>
    <p>💣 Ошибок: <strong>${bombs}</strong></p>
    <p>✅ Верных в уровне: <strong>${levelCorrectAnswers}</strong> / ${TOTAL_ROUNDS}</p>
    ${levelPassed && !isFinalVictory ? `<p><strong>Следующий уровень: ${getTimeForLevel(currentLevel + 1)} сек на ответ</strong></p>` : ""}
    ${isFinalVictory ? "<p class='final-mission-text'><strong>Миссия завершена! Ты выучил таблицу умножения!</strong></p>" : ""}
  `;
  renderBoosts();

  pauseBtn.classList.add("hidden");
  pauseBtn.textContent = "Пауза";
  stopBtn.classList.add("hidden");
  if (!isFinalVictory) {
    nextLevelBtn.classList.remove("level-cta-show");
    void nextLevelBtn.offsetWidth;
    nextLevelBtn.classList.add("level-cta-show");
    nextLevelBtn.classList.remove("hidden");
  } else {
    nextLevelBtn.classList.add("hidden");
    nextLevelBtn.dataset.mode = "";
  }
  restartBtn.classList.remove("hidden");
  startBtn.classList.remove("hidden");
  if (gameEl) {
    gameEl.classList.add("mobile-finished");
  }
}

function stopGame() {
  clearInterval(timerId);
  isPaused = false;
  gameStarted = false;
  updateMobileGameState();
  stopAllSounds();
  prepareStartScreen("Игра остановлена. Нажми «Начать игру»");
}

function nextLevel() {
  const mode = nextLevelBtn.dataset.mode || "retry";
  if (mode === "next") {
    currentLevel += 1;
  }

  gameStarted = true;
  isPaused = false;
  updateMobileGameState();
  if (gameEl) {
    gameEl.classList.remove("mobile-finished");
  }

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
  timeLeft = getLevelTimeLimit(currentLevel);
  updateQuestionTimerVisual();

  startBtn.classList.add("hidden");
  startBtn.dataset.action = "start";
  startBtn.textContent = "Начать игру";
  nextLevelBtn.classList.add("hidden");
  nextLevelBtn.classList.remove("level-cta-show");
  nextLevelBtn.dataset.mode = "";
  pauseBtn.classList.remove("hidden");
  pauseBtn.textContent = "Пауза";
  stopBtn.classList.remove("hidden");
  restartBtn.classList.add("hidden");

  fireBadgeEl.classList.add("hidden");
  questionCardEl.classList.remove("hidden");
  resultCardEl.classList.add("hidden");
  resultCardEl.classList.remove("result-win");
  resultCardEl.classList.remove("result-final-win");
  resultCardEl.innerHTML = "";

  // Для режима retry оставляем подсветку текущего уровня,
  // для режима next уже применена новая подсветка выше.
  renderBoosts();
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
  const step = 1 + streakBoost;

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
  updateMobileGameState();
  if (gameEl) {
    gameEl.classList.remove("mobile-finished");
  }
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
  timeLeft = getLevelTimeLimit(currentLevel);
  updateQuestionTimerVisual();
  startBtn.classList.add("hidden");
  startBtn.dataset.action = "start";
  startBtn.textContent = "Начать игру";
  nextLevelBtn.classList.add("hidden");
  nextLevelBtn.classList.remove("level-cta-show");
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
  speedBonus = 0;
  resetGameAndStart();
}

function prepareStartScreen(statusText = "Готова к полету") {
  clearInterval(timerId);
  gameStarted = false;
  isPaused = false;
  updateMobileGameState();
  if (gameEl) {
    gameEl.classList.remove("mobile-finished");
  }
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
  timeLeft = getLevelTimeLimit(currentLevel);
  updateQuestionTimerVisual();
  fireBadgeEl.classList.add("hidden");
  questionCardEl.classList.remove("hidden");
  resultCardEl.classList.add("hidden");
  resultCardEl.classList.remove("result-win");
  resultCardEl.innerHTML = "";
  questionEl.innerHTML = `
    <span class="start-rule-main">Отвечай правильно —<br>и долети до планеты 🚀</span>
    <span class="start-rule-sub">12 заданий без ошибок — чтобы пройти уровень</span>
  `;
  answersEl.innerHTML = `
    <div class="start-scene" aria-hidden="true">
      <div class="start-lane">
        <span class="start-runner start-runner-rocket">🚀</span>
        <div class="start-scene-line"></div>
        <span class="start-goal">🪐</span>
      </div>
      <div class="start-lane">
        <span class="start-runner start-runner-alien">👽</span>
        <div class="start-scene-line"></div>
        <span class="start-goal">🪐</span>
      </div>
    </div>
    <p class="start-mission-text">Нажми «Начать игру», чтобы начать миссию</p>
  `;
  setMessage(statusText);
  startBtn.classList.remove("hidden");
  startBtn.dataset.action = "start";
  startBtn.textContent = "Начать игру";
  nextLevelBtn.classList.add("hidden");
  nextLevelBtn.classList.remove("level-cta-show");
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
updateQuestionTimerVisual();
startBtn.addEventListener("click", () => {
  if (startBtn.dataset.action === "next-level") {
    nextLevel();
    return;
  }
  resetGameAndStart();
});
nextLevelBtn.addEventListener("click", nextLevel);
pauseBtn.addEventListener("click", togglePause);
stopBtn.addEventListener("click", stopGame);
restartBtn.addEventListener("click", fullResetAndStart);

prepareStartScreen();
scheduleMeteor();
