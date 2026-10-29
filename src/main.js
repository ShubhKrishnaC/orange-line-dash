(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const screens = {
    menu: $("menuScreen"),
    pause: $("pauseScreen"),
    over: $("overScreen")
  };
  const hud = $("hud");
  const photo = new Image();
  photo.src = "assets/characters/runner.png";
  const coinPhoto = new Image();
  coinPhoto.src = "assets/collectibles/coin-photo.png";
  const obstaclePhotos = ["assets/obstacles/nehru.png", "assets/obstacles/constitution.png"]
    .map((src) => {
      const image = new Image();
      image.src = src;
      return image;
    });
  const gameOverAudio = new Audio("assets/audio/game-over.mp3");
  gameOverAudio.preload = "auto";

  const state = {
    mode: "menu",
    lane: 1,
    targetLane: 1,
    jump: 0,
    slide: 0,
    elapsed: 0,
    distance: 0,
    score: 0,
    coins: 0,
    speed: 0.34,
    spawnIn: 0.7,
    objects: [],
    particles: [],
    magnet: 0,
    shield: 0,
    shake: 0,
    best: loadBest(),
    sound: true,
    lastTime: 0
  };

  const colors = {
    orange: "#ff7b32",
    gold: "#ffd166",
    dark: "#18243a",
    road: "#4b5360",
    rail: "#b8bec1"
  };

  function loadBest() {
    try {
      return Number(localStorage.getItem("orange-line-best")) || 0;
    } catch (error) {
      console.warn("Local score storage is unavailable.", error);
      return 0;
    }
  }

  function saveBest(value) {
    try {
      localStorage.setItem("orange-line-best", String(value));
    } catch (error) {
      console.warn("Could not save the personal best score.", error);
    }
  }

  function showScreen(name) {
    Object.entries(screens).forEach(([key, element]) => {
      element.hidden = key !== name;
    });
    hud.hidden = name !== null && name !== "pause";
  }

  function updateBestUI() {
    $("bestTop").textContent = state.best.toLocaleString();
    $("bestMenu").textContent = state.best.toLocaleString();
    $("bestFinal").textContent = state.best.toLocaleString();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function dimensions() {
    return { width: canvas.clientWidth, height: canvas.clientHeight };
  }

  function laneX(lane, progress) {
    const { width } = dimensions();
    const horizon = width * 0.5;
    const spread = width * (0.105 + 0.19 * progress);
    return horizon + (lane - 1) * spread;
  }

  function horizonY() {
    return dimensions().height * 0.285;
  }

  function playerY() {
    return dimensions().height * 0.81;
  }

  function depthAt(progress) {
    return Math.pow(Math.max(0, progress), 1.12);
  }

  function startGame() {
    gameOverAudio.pause();
    gameOverAudio.currentTime = 0;
    state.mode = "playing";
    state.lane = 1;
    state.targetLane = 1;
    state.jump = 0;
    state.slide = 0;
    state.elapsed = 0;
    state.distance = 0;
    state.score = 0;
    state.coins = 0;
    state.speed = 0.34;
    state.spawnIn = 0.65;
    state.objects = [];
    state.particles = [];
    state.magnet = 0;
    state.shield = 0;
    state.shake = 0;
    $("score").textContent = "0";
    $("coins").textContent = "0";
    $("distance").textContent = "0";
    $("powerIndicator").hidden = true;
    showScreen(null);
    playTone(420, 0.08, "sine");
  }

  function pauseGame() {
    if (state.mode !== "playing") return;
    state.mode = "paused";
    showScreen("pause");
  }

  function resumeGame() {
    if (state.mode !== "paused") return;
    state.mode = "playing";
    showScreen(null);
    state.lastTime = performance.now();
  }

  function endGame() {
    if (state.mode !== "playing") return;
    state.mode = "over";
    state.shake = 0.35;
    playGameOverAudio();
    $("finalScore").textContent = Math.floor(state.score).toLocaleString();
    $("finalDistance").textContent = Math.floor(state.distance).toLocaleString();
    $("finalCoins").textContent = state.coins.toLocaleString();
    if (state.score > state.best) {
      state.best = Math.floor(state.score);
      saveBest(state.best);
      updateBestUI();
    }
    showScreen("over");
  }

  function moveLane(direction) {
    if (state.mode !== "playing") return;
    state.targetLane = Math.max(0, Math.min(2, state.targetLane + direction));
  }

  function jump() {
    if (state.mode === "playing" && state.jump <= 0.01 && state.slide <= 0) {
      state.jump = 1;
      playTone(520, 0.1, "triangle");
    }
  }

  function slide() {
    if (state.mode === "playing" && state.jump <= 0 && state.slide <= 0) {
      state.slide = 0.7;
      playTone(220, 0.09, "triangle");
    }
  }

  function spawnRow() {
    const lane = Math.floor(Math.random() * 3);
    const type = Math.random() < 0.42 ? "barrier" : Math.random() < 0.55 ? "overhead" : "crate";
    state.objects.push({
      kind: "obstacle",
      type,
      lane,
      progress: 0,
      imageIndex: Math.floor(Math.random() * obstaclePhotos.length)
    });

    if (Math.random() < 0.55) {
      const coinLane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
      for (let i = 0; i < 4; i++) {
        state.objects.push({ kind: "coin", lane: coinLane, progress: -i * 0.075 });
      }
    } else {
      const coinLane = Math.floor(Math.random() * 3);
      for (let i = 0; i < 4; i++) {
        state.objects.push({ kind: "coin", lane: coinLane, progress: i * 0.08 });
      }
    }

    if (state.distance > 180 && Math.random() < 0.09) {
      const freeLane = (lane + 1 + Math.floor(Math.random() * 2)) % 3;
      state.objects.push({ kind: "power", lane: freeLane, progress: -0.15, type: "magnet" });
    }
  }

  function addParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const force = 35 + Math.random() * 120;
      state.particles.push({
        x, y, vx: Math.cos(angle) * force, vy: Math.sin(angle) * force,
        life: 0.45 + Math.random() * 0.4, maxLife: 0.85, color,
        size: 2 + Math.random() * 4
      });
    }
  }

  function collect(obj) {
    obj.collected = true;
    const x = laneX(obj.lane, 0.94);
    const y = horizonY() + (playerY() - horizonY()) * 0.94;
    if (obj.kind === "coin") {
      state.coins += 1;
      state.score += 25;
      addParticles(x, y, colors.gold, 6);
      playTone(780, 0.07, "sine");
    } else {
      state.magnet = 8;
      addParticles(x, y, "#5ee7d0", 15);
      playTone(680, 0.18, "sine");
    }
    $("coins").textContent = state.coins;
  }

  function update(dt) {
    if (state.mode !== "playing") return;
    state.elapsed += dt;
    state.distance += dt * (18 + Math.min(state.elapsed * 0.8, 24));
    state.speed = 0.34 + Math.min(state.elapsed * 0.0025, 0.18);
    state.score += dt * (10 + state.speed * 8);
    state.lane += (state.targetLane - state.lane) * Math.min(1, dt * 13);
    state.jump = Math.max(0, state.jump - dt * 1.45);
    state.slide = Math.max(0, state.slide - dt);
    state.magnet = Math.max(0, state.magnet - dt);
    state.shield = Math.max(0, state.shield - dt);
    state.shake = Math.max(0, state.shake - dt);

    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      spawnRow();
      state.spawnIn = Math.max(0.58, 1.13 - state.elapsed * 0.004) + Math.random() * 0.35;
    }

    for (const obj of state.objects) {
      obj.progress += state.speed * dt;
      if (obj.kind === "coin" && state.magnet > 0 && obj.progress > 0.73 && obj.progress < 0.98) {
        obj.lane = state.targetLane;
      }
      if (obj.progress > 0.89 && obj.progress < 1.02 && obj.lane === Math.round(state.lane)) {
        if (obj.kind === "coin" || obj.kind === "power") {
          collect(obj);
        } else if (!obj.hit) {
          const avoided = (obj.type === "barrier" && state.jump > 0.12) ||
            (obj.type === "overhead" && state.slide > 0.08);
          obj.hit = true;
          if (!avoided) {
            if (state.shield > 0) {
              state.shield = 0;
              addParticles(laneX(obj.lane, 1), playerY(), "#5ee7d0", 18);
            } else {
              endGame();
              break;
            }
          }
        }
      }
    }
    state.objects = state.objects.filter((obj) => obj.progress < 1.12 && !obj.collected);

    for (const particle of state.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 170 * dt;
      particle.life -= dt;
    }
    state.particles = state.particles.filter((particle) => particle.life > 0);

    $("score").textContent = Math.floor(state.score).toLocaleString();
    $("distance").textContent = Math.floor(state.distance).toLocaleString();
    $("powerIndicator").hidden = state.magnet <= 0;
    $("powerTime").textContent = Math.ceil(state.magnet);
  }

  function roundedRect(x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawBackground(w, h) {
    const horizon = horizonY();
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, "#b7d1d1");
    sky.addColorStop(1, "#f2c99e");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon + 3);

    ctx.fillStyle = "#495866";
    ctx.beginPath();
    ctx.moveTo(0, horizon * 0.69);
    for (let x = 0; x <= w + 20; x += 35) {
      const height = 15 + Math.abs(Math.sin(x * 0.061)) * horizon * 0.2;
      ctx.lineTo(x, horizon * 0.77 - height);
      ctx.lineTo(x + 15, horizon * 0.77 - height);
      ctx.lineTo(x + 30, horizon * 0.77);
    }
    ctx.lineTo(w, horizon);
    ctx.lineTo(0, horizon);
    ctx.closePath();
    ctx.fill();

    const ground = ctx.createLinearGradient(0, horizon, 0, h);
    ground.addColorStop(0, "#59636a");
    ground.addColorStop(1, "#283442");
    ctx.fillStyle = ground;
    ctx.fillRect(0, horizon, w, h - horizon);

    ctx.fillStyle = "#35414d";
    ctx.beginPath();
    ctx.moveTo(w * 0.34, horizon);
    ctx.lineTo(w * 0.66, horizon);
    ctx.lineTo(w * 0.99, h);
    ctx.lineTo(w * 0.01, h);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(228,231,221,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.36, horizon);
    ctx.lineTo(w * 0.13, h);
    ctx.moveTo(w * 0.64, horizon);
    ctx.lineTo(w * 0.87, h);
    ctx.stroke();

    for (let i = 0; i < 11; i++) {
      const p = ((i / 11) + (state.distance * 0.013 % 1)) % 1;
      const y = horizon + Math.pow(p, 1.45) * (h - horizon);
      const scale = 0.2 + p * 1.8;
      ctx.fillStyle = i % 2 ? "#c4ab83" : "#c4c9bf";
      ctx.fillRect(w * 0.5 - 2 * scale, y, 4 * scale, 2 * scale);
      ctx.fillRect(w * 0.5 - 13 * scale, y + 4 * scale, 7 * scale, 2 * scale);
      ctx.fillRect(w * 0.5 + 6 * scale, y + 4 * scale, 7 * scale, 2 * scale);
      ctx.strokeStyle = "#dce0db";
      ctx.lineWidth = Math.max(1, scale);
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - 7 * scale, y - 4 * scale);
      ctx.lineTo(w * 0.5 - 9 * scale, y + 8 * scale);
      ctx.moveTo(w * 0.5 + 7 * scale, y - 4 * scale);
      ctx.lineTo(w * 0.5 + 9 * scale, y + 8 * scale);
      ctx.stroke();
    }

    const stripeOffset = (state.distance * 9) % 70;
    for (let y = horizon + stripeOffset; y < h; y += 70) {
      const p = (y - horizon) / (h - horizon);
      const half = w * (0.16 + p * 0.35);
      ctx.strokeStyle = "rgba(227,220,199,.1)";
      ctx.lineWidth = 1 + p * 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.5 - half, y);
      ctx.lineTo(w * 0.5 + half, y);
      ctx.stroke();
    }

    drawTrackside(w, h, horizon);
  }

  function drawTrackside(w, h, horizon) {
    for (let i = 0; i < 5; i++) {
      const p = ((i / 5) + (state.distance * 0.006 % 1)) % 1;
      const y = horizon + p * p * (h - horizon);
      const scale = 0.35 + p * 1.7;
      for (const side of [-1, 1]) {
        const x = w * (0.5 + side * (0.37 + p * 0.29));
        ctx.fillStyle = "#263346";
        ctx.fillRect(x - 8 * scale, y - 47 * scale, 16 * scale, 47 * scale);
        ctx.fillStyle = i % 2 ? "#ff8c43" : "#efcf9d";
        ctx.fillRect(x - 6 * scale, y - 42 * scale, 12 * scale, 8 * scale);
      }
    }
  }

  function drawCoin(obj, x, y, scale) {
    const spin = 0.38 + Math.abs(Math.sin(state.elapsed * 8 + obj.progress * 10)) * 0.62;
    const radius = 15 * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(spin, 1);
    ctx.shadowColor = "rgba(12,18,28,.4)";
    ctx.shadowBlur = 5 * scale;
    ctx.shadowOffsetY = 3 * scale;
    ctx.fillStyle = "#a96718";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const rim = ctx.createLinearGradient(-radius, -radius, radius, radius);
    rim.addColorStop(0, "#fff1a7");
    rim.addColorStop(0.5, "#e79a28");
    rim.addColorStop(1, "#b86b16");
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.86, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.73, 0, Math.PI * 2);
    ctx.clip();
    if (coinPhoto.complete && coinPhoto.naturalWidth > 0) {
      const crop = Math.min(coinPhoto.naturalWidth, coinPhoto.naturalHeight);
      const sx = (coinPhoto.naturalWidth - crop) / 2;
      const sy = (coinPhoto.naturalHeight - crop) / 2;
      ctx.drawImage(coinPhoto, sx, sy, crop, crop, -radius, -radius, radius * 2, radius * 2);
    } else {
      ctx.fillStyle = colors.gold;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255,244,190,.9)";
    ctx.lineWidth = Math.max(0.7, scale);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.73, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPhotoPanel(image, x, y, width, height, scale) {
    ctx.fillStyle = "#18243a";
    ctx.fillRect(x - width / 2 - 4 * scale, y - height - 4 * scale, width + 8 * scale, height + 8 * scale);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height, width, height, 3 * scale);
    ctx.clip();
    if (image.complete && image.naturalWidth > 0) {
      const sourceRatio = image.naturalWidth / image.naturalHeight;
      const targetRatio = width / height;
      let sx = 0;
      let sy = 0;
      let sw = image.naturalWidth;
      let sh = image.naturalHeight;
      if (sourceRatio > targetRatio) {
        sw = sh * targetRatio;
        sx = (image.naturalWidth - sw) / 2;
      } else {
        sh = sw / targetRatio;
        sy = (image.naturalHeight - sh) / 2;
      }
      ctx.drawImage(image, sx, sy, sw, sh, x - width / 2, y - height, width, height);
    } else {
      ctx.fillStyle = "#263346";
      ctx.fillRect(x - width / 2, y - height, width, height);
    }
    ctx.restore();
    ctx.strokeStyle = "#fff0d6";
    ctx.lineWidth = Math.max(1.5, 2.5 * scale);
    ctx.strokeRect(x - width / 2, y - height, width, height);
  }

  function drawObstacle(obj, x, y, scale) {
    const laneWidth = dimensions().width * (0.105 + 0.19 * depthAt(obj.progress));
    const width = Math.min(138 * scale, laneWidth * 0.76);
    const height = 126 * scale;
    const image = obstaclePhotos[obj.imageIndex];
    const side = Math.max(4 * scale, width * 0.1);
    const shadowWidth = width * 0.7;

    ctx.save();
    ctx.fillStyle = "rgba(10,17,28,.32)";
    ctx.beginPath();
    ctx.ellipse(x + side * 0.28, y + 2 * scale, shadowWidth, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (obj.type === "barrier") {
      const faceHeight = height * 0.72;
      ctx.fillStyle = "#733c2a";
      ctx.beginPath();
      ctx.moveTo(x + width / 2, y - faceHeight);
      ctx.lineTo(x + width / 2 + side, y - faceHeight - side * 0.35);
      ctx.lineTo(x + width / 2 + side, y - side * 0.35);
      ctx.lineTo(x + width / 2, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#d9a16c";
      ctx.beginPath();
      ctx.moveTo(x - width / 2, y - faceHeight);
      ctx.lineTo(x - width / 2 + side, y - faceHeight - side * 0.35);
      ctx.lineTo(x + width / 2 + side, y - faceHeight - side * 0.35);
      ctx.lineTo(x + width / 2, y - faceHeight);
      ctx.closePath();
      ctx.fill();
      drawPhotoPanel(image, x, y, width, faceHeight, scale);
      ctx.fillStyle = "#252b33";
      ctx.fillRect(x - width * 0.43, y - 10 * scale, width * 0.16, 10 * scale);
      ctx.fillRect(x + width * 0.27, y - 10 * scale, width * 0.16, 10 * scale);
    } else if (obj.type === "overhead") {
      const postWidth = Math.max(4 * scale, width * 0.08);
      const beamY = y - height * 0.64;
      ctx.fillStyle = "#202d3b";
      ctx.fillRect(x - width * 0.52, beamY, postWidth, y - beamY);
      ctx.fillRect(x + width * 0.44, beamY, postWidth, y - beamY);
      ctx.fillStyle = "#59636a";
      ctx.fillRect(x - width * 0.55, y - 5 * scale, postWidth * 1.7, 5 * scale);
      ctx.fillRect(x + width * 0.4, y - 5 * scale, postWidth * 1.7, 5 * scale);
      ctx.fillStyle = "#d9a16c";
      ctx.fillRect(x - width * 0.56 + side, beamY - side * 0.3, width * 1.02, side * 0.3);
      drawPhotoPanel(image, x, beamY, width * 0.92, height * 0.48, scale);
    } else {
      const faceWidth = width * 0.88;
      const faceHeight = height * 0.82;
      ctx.fillStyle = "#513a31";
      ctx.beginPath();
      ctx.moveTo(x + faceWidth / 2, y - faceHeight);
      ctx.lineTo(x + faceWidth / 2 + side, y - faceHeight - side * 0.35);
      ctx.lineTo(x + faceWidth / 2 + side, y - side * 0.35);
      ctx.lineTo(x + faceWidth / 2, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#c89262";
      ctx.beginPath();
      ctx.moveTo(x - faceWidth / 2, y - faceHeight);
      ctx.lineTo(x - faceWidth / 2 + side, y - faceHeight - side * 0.35);
      ctx.lineTo(x + faceWidth / 2 + side, y - faceHeight - side * 0.35);
      ctx.lineTo(x + faceWidth / 2, y - faceHeight);
      ctx.closePath();
      ctx.fill();
      drawPhotoPanel(image, x, y, faceWidth, faceHeight, scale);
      ctx.fillStyle = "rgba(31,35,39,.45)";
      ctx.fillRect(x - faceWidth / 2, y - 8 * scale, faceWidth, 8 * scale);
    }
  }

  function drawPlayer() {
    const { width, height } = dimensions();
    const y = playerY();
    const x = laneX(state.lane, 1);
    const jumpHeight = state.jump > 0 ? Math.sin((1 - state.jump) * Math.PI) * height * 0.17 : 0;
    const sliding = state.slide > 0;
    const h = Math.min(height * 0.24, 156);
    const aspectRatio = photo.naturalWidth && photo.naturalHeight
      ? photo.naturalWidth / photo.naturalHeight
      : 0.72;
    const w = h * aspectRatio;
    const drawH = sliding ? h * 0.68 : h;
    const drawW = sliding ? w * 1.16 : w;
    const running = state.mode === "playing" && !sliding && state.jump <= 0;
    const stride = running ? Math.sin(state.elapsed * 18) : 0;
    const bob = running ? Math.abs(stride) * 5 : 0;
    const lean = running ? stride * 0.025 : 0;

    ctx.save();
    ctx.globalAlpha = state.jump > 0 ? 0.48 : 0.3;
    ctx.fillStyle = "#101722";
    ctx.beginPath();
    ctx.ellipse(x, y + 3, drawW * (0.47 - state.jump * 0.08), Math.max(5, drawH * 0.065), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y - jumpHeight + bob);
    ctx.rotate(lean);
    if (state.shield > 0) {
      ctx.strokeStyle = "rgba(94,231,208,.72)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, -drawH * 0.48, drawW * 0.7, drawH * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (photo.complete && photo.naturalWidth > 0) {
      ctx.shadowColor = "rgba(10,17,29,.48)";
      ctx.shadowBlur = 17;
      ctx.shadowOffsetX = 7;
      ctx.shadowOffsetY = 12;
      roundedRect(-drawW / 2 - 3, -drawH - 2, drawW + 7, drawH + 6, 20, "#ffad67");
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      roundedRect(-drawW / 2 + 4, -drawH + 5, drawW + 4, drawH, 18, "#783d27");
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-drawW / 2, -drawH, drawW, drawH, [drawW * 0.35, drawW * 0.35, 7, 7]);
      ctx.clip();
      ctx.drawImage(photo, -drawW / 2, -drawH, drawW, drawH);
      ctx.fillStyle = "rgba(15,24,39,.07)";
      ctx.fillRect(-drawW / 2, -drawH, drawW, drawH);
      const lighting = ctx.createLinearGradient(-drawW / 2, -drawH, drawW / 2, 0);
      lighting.addColorStop(0, "rgba(255,255,255,.2)");
      lighting.addColorStop(0.45, "rgba(255,255,255,0)");
      lighting.addColorStop(1, "rgba(10,18,31,.2)");
      ctx.fillStyle = lighting;
      ctx.fillRect(-drawW / 2, -drawH, drawW, drawH);
      ctx.restore();
      ctx.strokeStyle = "#fff0d6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-drawW / 2, -drawH, drawW, drawH, [drawW * 0.35, drawW * 0.35, 7, 7]);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,123,50,.9)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-drawW * 0.38, -drawH + 3);
      ctx.lineTo(-drawW * 0.38, -5);
      ctx.stroke();
    } else {
      roundedRect(-drawW / 2, -drawH, drawW, drawH, 20, "#ff873e");
      ctx.fillStyle = "#f3d4b8";
      ctx.beginPath();
      ctx.arc(0, -drawH * 0.72, drawW * 0.23, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    const { width: w, height: h } = dimensions();
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    if (state.shake > 0) {
      ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    }
    drawBackground(w, h);

    const ordered = [...state.objects].sort((a, b) => a.progress - b.progress);
    for (const obj of ordered) {
      if (obj.progress < 0 || obj.progress > 1.06 || obj.collected) continue;
      const p = obj.progress;
      const depth = depthAt(p);
      const y = horizonY() + (playerY() - horizonY()) * depth;
      const x = laneX(obj.lane, depth);
      const scale = 0.34 + depth * 1.08;
      if (obj.kind === "coin") drawCoin(obj, x, y - 8 * scale, scale);
      else if (obj.kind === "power") {
        ctx.fillStyle = "#5ee7d0";
        ctx.beginPath();
        ctx.arc(x, y - 12 * scale, 11 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1c5360";
        ctx.font = `bold ${13 * scale}px sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("+", x, y - 7 * scale);
      } else drawObstacle(obj, x, y, 0.38 + depth * 1.18);
    }

    drawPlayer();
    for (const particle of state.particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  let audioContext;
  function playTone(frequency, duration, type) {
    if (!state.sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.06, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
      console.warn("Audio is unavailable in this browser.", error);
      state.sound = false;
    }
  }

  function playGameOverAudio() {
    if (!state.sound) return;
    gameOverAudio.currentTime = 0;
    gameOverAudio.play().catch((error) => {
      console.warn("Could not play the game-over audio.", error);
    });
  }

  function frame(now) {
    const dt = Math.min((now - state.lastTime) / 1000 || 0, 0.04);
    state.lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function handleKey(event) {
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) event.preventDefault();
    if (key === "arrowleft" || key === "a") moveLane(-1);
    else if (key === "arrowright" || key === "d") moveLane(1);
    else if (key === "arrowup" || key === "w" || key === " ") jump();
    else if (key === "arrowdown" || key === "s") slide();
    else if (key === "escape" || key === "p") {
      if (state.mode === "playing") pauseGame();
      else if (state.mode === "paused") resumeGame();
    }
    else if (key === "enter" && state.mode !== "playing") startGame();
  }

  let touchStart = null;
  canvas.addEventListener("pointerdown", (event) => {
    touchStart = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener("pointerup", (event) => {
    if (!touchStart) return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 25) {
      if (Math.abs(dx) > Math.abs(dy)) moveLane(dx < 0 ? -1 : 1);
      else if (dy < 0) jump();
      else slide();
    }
    touchStart = null;
  });
  canvas.addEventListener("pointercancel", () => { touchStart = null; });
  window.addEventListener("keydown", handleKey);
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseGame();
  });

  $("playButton").addEventListener("click", startGame);
  $("againButton").addEventListener("click", startGame);
  $("pauseRestartButton").addEventListener("click", startGame);
  $("pauseButton").addEventListener("click", pauseGame);
  $("resumeButton").addEventListener("click", resumeGame);
  $("menuButton").addEventListener("click", () => {
    state.mode = "menu";
    updateBestUI();
    showScreen("menu");
  });
  $("soundButton").addEventListener("click", () => {
    state.sound = !state.sound;
    if (!state.sound) {
      gameOverAudio.pause();
    }
    $("soundButton").textContent = state.sound ? "♫" : "×";
    $("soundButton").setAttribute("aria-label", state.sound ? "Mute sound" : "Enable sound");
    if (state.sound) playTone(500, 0.08, "sine");
  });

  updateBestUI();
  resize();
  state.lastTime = performance.now();
  requestAnimationFrame(frame);
})();
