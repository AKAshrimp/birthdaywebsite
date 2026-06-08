import { fetchTopScores, submitScore } from "./leaderboard.js";

export const VEGETABLES = ["🥦", "🥕", "🍆", "🌽", "🥬", "🫑", "🍅"];
export const OBSTACLE_IMAGE_SRCS = [
  "./assets/wall1.png?v=2",
  "./assets/wall2.png?v=2",
  "./assets/wall3.png?v=2",
  "./assets/wall4.png?v=2",
  "./assets/wall5.png?v=2",
  "./assets/wall6.png?v=1",
  "./assets/wall7.png?v=1",
];

export function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function insetRect(rect, insetX, insetY = insetX) {
  return {
    x: rect.x + insetX,
    y: rect.y + insetY,
    width: Math.max(0, rect.width - insetX * 2),
    height: Math.max(0, rect.height - insetY * 2),
  };
}

export function circleOverlapsRect(circle, rect) {
  const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

export function isSafeVegetableSpawn(x, viewportWidth) {
  const center = viewportWidth / 2;
  const protectedRadius = Math.min(230, viewportWidth * 0.32);
  return Math.abs(x - center) > protectedRadius;
}

export function getRenderDpr(devicePixelRatio = 1) {
  return Math.min(Number(devicePixelRatio) || 1, 1.35);
}

export class BirthdayAudio {
  constructor() {
    this.context = null;
    this.musicTimer = null;
    this.musicPlaying = false;
  }

  ensureContext() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    this.context ||= new AudioContextClass();
    return this.context;
  }

  async toggleMusic() {
    if (this.musicPlaying) {
      this.stopMusic();
      return false;
    }

    const context = this.ensureContext();
    if (!context) {
      return false;
    }
    if (context.state === "suspended") {
      await context.resume();
    }
    this.musicPlaying = true;
    this.playBirthdayMelody();
    return true;
  }

  stopMusic() {
    this.musicPlaying = false;
    clearTimeout(this.musicTimer);
  }

  playEffect(type) {
    const frequencies = {
      flap: [520, 720],
      score: [660, 880, 1175],
      hit: [170, 95],
      over: [320, 230, 160],
    };
    this.playNotes(frequencies[type] || [440], 0.065, "square", 0.06);
  }

  playBirthdayMelody() {
    if (!this.musicPlaying) {
      return;
    }

    const notes = [
      264, 264, 297, 264, 352, 330, 264, 264, 297, 264, 396, 352, 264, 264, 528, 440, 352, 330, 297,
      466, 466, 440, 352, 396, 352,
    ];
    notes.forEach((frequency, index) => this.playTone(frequency, index * 0.28, 0.22, "sine", 0.045));
    this.musicTimer = setTimeout(() => this.playBirthdayMelody(), notes.length * 280 + 750);
  }

  playNotes(notes, duration, type, gain) {
    notes.forEach((frequency, index) => this.playTone(frequency, index * duration, duration, type, gain));
  }

  playTone(frequency, delay, duration, type, gainLevel) {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(gainLevel, context.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + duration + 0.03);
  }
}

class FlappyGame {
  constructor(canvas, elements, audio) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.elements = elements;
    this.audio = audio;
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.state = "ready";
    this.score = 0;
    this.finalScore = 0;
    this.best = 0;
    this.lastTime = 0;
    this.obstacleTimer = 0;
    this.scoreSubmitted = false;
    this.obstacleImages = OBSTACLE_IMAGE_SRCS.map((src) => {
      const image = new Image();
      image.src = src;
      return image;
    });
    this.obstacles = [];
    this.particles = [];
    this.player = { x: 0, y: 0, size: 54, velocity: 0, rotation: 0 };
    this.resize();
  }

  resize() {
    this.dpr = getRenderDpr(globalThis.devicePixelRatio || 1);
    this.width = globalThis.innerWidth || 960;
    this.height = globalThis.innerHeight || 640;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.player.x = this.width * 0.28;
    this.player.size = Math.max(42, Math.min(68, this.width * 0.09));
    if (this.state === "ready") {
      this.player.y = this.height * 0.45;
    }
  }

  reset() {
    this.state = "playing";
    this.score = 0;
    this.obstacleTimer = 0;
    this.obstacles = [];
    this.particles = [];
    this.scoreSubmitted = false;
    this.elements.submitScore.disabled = false;
    this.player.y = this.height * 0.45;
    this.player.velocity = -6.8;
    this.elements.score.textContent = "0";
    this.hideOverlay();
    this.audio.playEffect("flap");
  }

  flap() {
    if (this.state === "ready") {
      this.reset();
      return;
    }
    if (this.state !== "playing") {
      return;
    }
    this.player.velocity = -8.5;
    this.player.rotation = -0.45;
    this.particles.push({ x: this.player.x - 10, y: this.player.y + 15, life: 1 });
    this.audio.playEffect("flap");
  }

  update(delta) {
    if (this.state !== "playing") {
      return;
    }

    const gravity = 24;
    this.player.velocity += gravity * delta;
    this.player.y += this.player.velocity * delta * 60;
    this.player.rotation = Math.min(0.9, this.player.rotation + delta * 1.9);

    this.obstacleTimer -= delta;
    if (this.obstacleTimer <= 0) {
      this.spawnObstacle();
      this.obstacleTimer = Math.max(1.05, 1.65 - this.score * 0.018);
    }

    const speed = 205 + Math.min(160, this.score * 5);
    this.obstacles.forEach((obstacle) => {
      obstacle.x -= speed * delta;
      if (!obstacle.scored && obstacle.x + obstacle.width < this.player.x) {
        obstacle.scored = true;
        this.score += 1;
        this.best = Math.max(this.best, this.score);
        this.elements.score.textContent = String(this.score);
        this.elements.best.textContent = String(this.best);
        this.audio.playEffect("score");
      }
    });
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.x + obstacle.width > -80);
    this.particles = this.particles
      .map((particle) => ({ ...particle, x: particle.x - 90 * delta, life: particle.life - delta * 1.8 }))
      .filter((particle) => particle.life > 0);

    if (this.hasCollision()) {
      this.endGame();
    }
  }

  spawnObstacle() {
    const gap = Math.max(170, Math.min(235, this.height * 0.31 - this.score * 0.8));
    const margin = 76;
    const topHeight = margin + Math.random() * Math.max(80, this.height - gap - margin * 2);
    this.obstacles.push({
      x: this.width + 50,
      width: Math.max(82, Math.min(118, this.width * 0.105)),
      topHeight,
      gap,
      vegetable: VEGETABLES[Math.floor(Math.random() * VEGETABLES.length)],
      imageIndex: Math.floor(Math.random() * this.obstacleImages.length),
      decorationOffset: Math.random() * 100,
      scored: false,
    });
  }

  hasCollision() {
    const playerCircle = {
      x: this.player.x,
      y: this.player.y,
      radius: this.player.size * 0.26,
    };

    if (playerCircle.y - playerCircle.radius < 0 || playerCircle.y + playerCircle.radius > this.height) {
      return true;
    }

    return this.obstacles.some((obstacle) => {
      const topRect = insetRect({ x: obstacle.x, y: 0, width: obstacle.width, height: obstacle.topHeight }, 14, 10);
      const bottomRect = insetRect({
        x: obstacle.x,
        y: obstacle.topHeight + obstacle.gap,
        width: obstacle.width,
        height: this.height - obstacle.topHeight - obstacle.gap,
      }, 14, 10);
      return circleOverlapsRect(playerCircle, topRect) || circleOverlapsRect(playerCircle, bottomRect);
    });
  }

  endGame() {
    this.state = "over";
    this.finalScore = this.score;
    this.audio.playEffect("hit");
    setTimeout(() => this.audio.playEffect("over"), 180);
    this.showOverlay("Game Over", "Submit your score, then try again with better birthday energy.", "Restart");
    this.elements.finalScore.textContent = String(this.finalScore);
    setTimeout(() => this.elements.dialog.showModal(), 350);
  }

  draw() {
    this.drawBackground();
    this.drawObstacles();
    this.drawParticles();
    this.drawPlayer();
    if (this.state !== "playing") {
      this.drawPrompt();
    }
  }

  drawBackground() {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#1d1248");
    gradient.addColorStop(0.62, "#623369");
    gradient.addColorStop(1, "#894a42");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < 22; i += 1) {
      const x = (i * 97 + performance.now() * 0.012) % this.width;
      const y = 42 + ((i * 53) % Math.max(120, this.height * 0.55));
      this.ctx.beginPath();
      this.ctx.arc(x, y, 1.6 + (i % 3), 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  drawObstacles() {
    this.obstacles.forEach((obstacle) => {
      this.drawVegetableWall(obstacle.x, 0, obstacle.width, obstacle.topHeight, obstacle.imageIndex, true);
      this.drawVegetableWall(
        obstacle.x,
        obstacle.topHeight + obstacle.gap,
        obstacle.width,
        this.height - obstacle.topHeight - obstacle.gap,
        obstacle.imageIndex,
        false,
      );
    });
  }

  drawVegetableWall(x, y, width, height, imageIndex, invert) {
    if (height <= 0) {
      return;
    }
    const obstacleImage = this.obstacleImages[imageIndex];
    if (obstacleImage?.complete && obstacleImage.naturalWidth > 0) {
      this.ctx.save();
      if (invert) {
        this.ctx.translate(Math.round(x), Math.round(y + height));
        this.ctx.scale(1, -1);
        this.drawObstacleImage(obstacleImage, 0, 0, width, height);
      } else {
        this.drawObstacleImage(obstacleImage, Math.round(x), Math.round(y), width, height);
      }
      this.ctx.restore();
      return;
    }

    const radius = Math.min(18, width * 0.4, height * 0.5);
    this.drawRoundedRectOnContext(this.ctx, x, y, width, height, radius);
    this.ctx.fillStyle = "rgba(76, 183, 92, 0.55)";
    this.ctx.fill();
  }

  drawObstacleImage(image, x, y, width, height) {
    const imageRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = image.naturalWidth;
    let sourceHeight = image.naturalHeight;

    if (targetRatio > imageRatio) {
      sourceHeight = sourceWidth / targetRatio;
      sourceY = (image.naturalHeight - sourceHeight) / 2;
    } else {
      sourceWidth = sourceHeight * targetRatio;
      sourceX = (image.naturalWidth - sourceWidth) / 2;
    }

    this.ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }

  drawRoundedRectOnContext(context, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + safeRadius, y);
    context.lineTo(x + width - safeRadius, y);
    context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    context.lineTo(x + width, y + height - safeRadius);
    context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
    context.lineTo(x + safeRadius, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    context.lineTo(x, y + safeRadius);
    context.quadraticCurveTo(x, y, x + safeRadius, y);
    context.closePath();
  }

  drawParticles() {
    this.particles.forEach((particle) => {
      this.ctx.globalAlpha = particle.life;
      this.ctx.fillStyle = "#ffbf3f";
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, 7 * particle.life, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalAlpha = 1;
    });
  }

  drawPlayer() {
    this.ctx.save();
    this.ctx.translate(this.player.x, this.player.y);
    this.ctx.rotate(this.player.rotation);
    this.ctx.shadowColor = "rgba(255,191,63,0.5)";
    this.ctx.shadowBlur = 22;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, this.player.size / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = "#9edbff";
    this.ctx.fill();
    this.ctx.clip();
    this.ctx.fillStyle = "#ffe0c2";
    this.ctx.beginPath();
    this.ctx.arc(0, -5, this.player.size * 0.23, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = "#222";
    this.ctx.beginPath();
    this.ctx.arc(-8, -9, 2.2, 0, Math.PI * 2);
    this.ctx.arc(8, -9, 2.2, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = "#ff6f9f";
    this.ctx.beginPath();
    this.ctx.arc(0, 4, 4, 0, Math.PI);
    this.ctx.fill();
    this.ctx.restore();

    this.ctx.save();
    this.ctx.translate(this.player.x - 2, this.player.y - this.player.size * 0.62);
    this.ctx.rotate(-0.12);
    this.ctx.font = `${this.player.size * 0.46}px serif`;
    this.ctx.textAlign = "center";
    this.ctx.fillText("👑", 0, 0);
    this.ctx.restore();
  }

  drawPrompt() {
    this.ctx.fillStyle = "rgba(255,255,255,0.8)";
    this.ctx.font = "700 16px Inter, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Space / Click / Tap to flap", this.width / 2, this.height - 34);
  }

  loop = (time) => {
    const delta = Math.min(0.034, (time - this.lastTime || 16) / 1000);
    this.lastTime = time;
    this.update(delta);
    this.draw();
    requestAnimationFrame(this.loop);
  };

  showOverlay(title, message, buttonText) {
    this.elements.overlayTitle.textContent = title;
    this.elements.overlayMessage.textContent = message;
    this.elements.overlayButton.textContent = buttonText;
    this.elements.overlay.classList.remove("hidden");
  }

  hideOverlay() {
    this.elements.overlay.classList.add("hidden");
  }
}

class LandingVegetableAnimator {
  constructor(elements) {
    this.elements = elements;
    this.items = [];
    this.lastTime = 0;
    this.spawnTimer = 0;
  }

  spawn() {
    if (this.items.length >= 18 || this.elements.landing.classList.contains("hidden")) {
      return;
    }

    const width = globalThis.innerWidth || 960;
    const height = globalThis.innerHeight || 640;
    const side = Math.floor(Math.random() * 4);
    const margin = 70;
    const starts = [
      { x: Math.random() * width, y: -margin },
      { x: width + margin, y: Math.random() * height },
      { x: Math.random() * width, y: height + margin },
      { x: -margin, y: Math.random() * height },
    ];
    const start = starts[side];
    const target = this.getAvatarCircle();
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const distance = Math.hypot(dx, dy) || 1;
    const speed = 110 + Math.random() * 70;
    const element = document.createElement("span");
    element.className = "floating-vegetable";
    element.textContent = VEGETABLES[Math.floor(Math.random() * VEGETABLES.length)];
    element.style.setProperty("--size", `${28 + Math.random() * 24}px`);
    this.elements.vegetableField.append(element);

    this.items.push({
      element,
      x: start.x,
      y: start.y,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
      rotation: Math.random() * 360,
      spin: -180 + Math.random() * 360,
      bounced: false,
    });
  }

  getAvatarCircle() {
    const avatar = document.querySelector("#avatar");
    const rect = avatar.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      radius: rect.width / 2 + 26,
    };
  }

  update(delta) {
    if (this.elements.landing.classList.contains("hidden")) {
      return;
    }

    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      this.spawn();
      this.spawnTimer = 0.28 + Math.random() * 0.18;
    }

    const avatar = this.getAvatarCircle();
    const width = globalThis.innerWidth || 960;
    const height = globalThis.innerHeight || 640;
    this.items = this.items.filter((item) => {
      item.x += item.vx * delta;
      item.y += item.vy * delta;
      item.rotation += item.spin * delta;

      const dx = item.x - avatar.x;
      const dy = item.y - avatar.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (!item.bounced && distance < avatar.radius) {
        const nx = dx / distance;
        const ny = dy / distance;
        const dot = item.vx * nx + item.vy * ny;
        item.vx = (item.vx - 2 * dot * nx) * 1.28 + nx * 80;
        item.vy = (item.vy - 2 * dot * ny) * 1.28 + ny * 80;
        item.spin += 420 * (Math.random() > 0.5 ? 1 : -1);
        item.bounced = true;
      }

      item.element.style.setProperty("--x", `${item.x}px`);
      item.element.style.setProperty("--y", `${item.y}px`);
      item.element.style.setProperty("--rotation", `${item.rotation}deg`);

      const alive = item.x > -120 && item.x < width + 120 && item.y > -120 && item.y < height + 120;
      if (!alive) {
        item.element.remove();
      }
      return alive;
    });
  }

  loop = (time) => {
    const delta = Math.min(0.034, (time - this.lastTime || 16) / 1000);
    this.lastTime = time;
    this.update(delta);
    requestAnimationFrame(this.loop);
  };
}

function enterGame(elements, game) {
  elements.landing.classList.add("hidden");
  elements.gameScreen.classList.remove("hidden");
  game.resize();
  game.showOverlay("Tap to Fly", "Dodge the veggies.", "Go!");
}

function renderLeaderboard(elements, entries) {
  const topEntries = entries.slice(0, 10);
  elements.leaderboardList.replaceChildren(
    ...topEntries.map((entry, index) => {
      const row = document.createElement("tr");
      const rank = document.createElement("td");
      const name = document.createElement("td");
      const score = document.createElement("td");
      const time = document.createElement("td");

      rank.textContent = String(index + 1);
      name.textContent = entry.name;
      score.textContent = String(entry.score);
      time.textContent = formatScoreTime(entry.created_at);

      row.append(rank, name, score, time);
      return row;
    }),
  );
}

function formatScoreTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  return date.toLocaleDateString([], { month: "2-digit", day: "2-digit" });
}

function returnToLanding(elements, game) {
  elements.dialog.close();
  elements.gameScreen.classList.add("hidden");
  elements.landing.classList.remove("hidden");
  game.state = "ready";
  game.obstacles = [];
  game.particles = [];
  game.showOverlay("Tap to Fly", "Dodge the veggies.", "Go!");
}

async function refreshLeaderboard(elements) {
  try {
    const entries = await fetchTopScores();
    renderLeaderboard(elements, entries);
  } catch (error) {
    elements.leaderboardStatus.textContent = error.message;
    elements.leaderboardStatus.classList.add("error");
  }
}

function bootstrap() {
  const elements = {
    landing: document.querySelector("#landing"),
    gameScreen: document.querySelector("#gameScreen"),
    vegetableField: document.querySelector("#vegetableField"),
    musicToggle: document.querySelector("#musicToggle"),
    startGame: document.querySelector("#startGame"),
    backHome: document.querySelector("#backHome"),
    canvas: document.querySelector("#gameCanvas"),
    score: document.querySelector("#scoreValue"),
    best: document.querySelector("#bestValue"),
    overlay: document.querySelector("#gameOverlay"),
    overlayTitle: document.querySelector("#overlayTitle"),
    overlayMessage: document.querySelector("#overlayMessage"),
    overlayButton: document.querySelector("#overlayButton"),
    dialog: document.querySelector("#leaderboardDialog"),
    form: document.querySelector("#scoreForm"),
    finalScore: document.querySelector("#finalScore"),
    playerName: document.querySelector("#playerName"),
    submitScore: document.querySelector("#submitScore"),
    skipScore: document.querySelector("#skipScore"),
    leaderboardStatus: document.querySelector("#leaderboardStatus"),
    leaderboardList: document.querySelector("#leaderboardList"),
  };

  const audio = new BirthdayAudio();
  const game = new FlappyGame(elements.canvas, elements, audio);
  const landingAnimator = new LandingVegetableAnimator(elements);

  elements.musicToggle.addEventListener("click", async () => {
    const playing = await audio.toggleMusic();
    elements.musicToggle.textContent = playing ? "❚❚" : "▶";
    elements.musicToggle.setAttribute("aria-label", playing ? "Pause birthday music" : "Play birthday music");
  });

  elements.startGame.addEventListener("click", async () => {
    audio.ensureContext();
    enterGame(elements, game);
  });

  elements.backHome.addEventListener("click", () => {
    returnToLanding(elements, game);
  });

  elements.overlayButton.addEventListener("click", () => game.reset());
  elements.canvas.addEventListener("pointerdown", () => game.flap());
  globalThis.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.code === "ArrowUp") {
      event.preventDefault();
      game.flap();
    }
  });
  globalThis.addEventListener("resize", () => game.resize());

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (game.scoreSubmitted) {
      return;
    }
    game.scoreSubmitted = true;
    elements.submitScore.disabled = true;
    elements.leaderboardStatus.classList.remove("error");
    elements.leaderboardStatus.textContent = "Submitting score...";
    try {
      const result = await submitScore({ name: elements.playerName.value, score: game.finalScore });
      elements.leaderboardStatus.textContent = result.message;
      renderLeaderboard(elements, result.entries);
      returnToLanding(elements, game);
    } catch (error) {
      game.scoreSubmitted = false;
      elements.leaderboardStatus.textContent = error.message;
      elements.leaderboardStatus.classList.add("error");
      await refreshLeaderboard(elements);
      elements.submitScore.disabled = false;
    } finally {
      if (!game.scoreSubmitted) {
        elements.submitScore.disabled = false;
      }
    }
  });

  elements.skipScore.addEventListener("click", () => {
    elements.dialog.close();
    game.reset();
  });

  requestAnimationFrame(landingAnimator.loop);
  refreshLeaderboard(elements);
  requestAnimationFrame(game.loop);
}

if (typeof document !== "undefined") {
  bootstrap();
}
