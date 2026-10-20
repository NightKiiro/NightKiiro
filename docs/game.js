// Slimy — web edition. Two slimes, one controller.
// No dependencies: plain canvas + WebAudio.
(() => {
  "use strict";

  // ------------------------------------------------------------ constants
  const W = 960, H = 544, T = 32;
  const GRAV = 1800, MAX_FALL = 900;
  const SMALL = { w: 34, h: 24, speed: 185, jump: 560 };
  const BIG = { w: 72, h: 56, speed: 155, jump: 690 };
  const COYOTE = 0.1, BUFFER = 0.12;
  const DOOR_COLORS = { a: "#FF4D6D", c: "#FFB84D", h: "#A78BFA" };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ------------------------------------------------------------ sprites
  // strips: 6 frames of 48px (or 7 of 96px) with a 2px transparent gutter
  const SHEETS = {
    "blue-r": [48, 6], "blue-l": [48, 6], "green-r": [48, 6], "green-l": [48, 6],
    "teal-r": [48, 6], "teal-l": [48, 6], merge: [96, 7], split: [96, 7],
  };
  const img = {};
  const loading = Object.keys(SHEETS).map((name) => new Promise((ok) => {
    const im = new Image();
    im.onload = ok; im.onerror = ok;
    im.src = `assets/sprites/${name}.png`;
    img[name] = im;
  }));

  // noShadow: cut the bottom rows where the sprite's floor shadow is painted
  function drawFrame(name, i, x, y, scale = 1, flip = false, noShadow = false) {
    const [fs] = SHEETS[name];
    const p = fs + 4;
    const s = fs * scale;
    const sh = noShadow ? Math.round(fs * 0.84) : fs;
    if (flip) {
      ctx.save();
      ctx.translate(Math.round(x) + s, Math.round(y));
      ctx.scale(-1, 1);
      ctx.drawImage(img[name], i * p + 2, 2, fs, sh, 0, 0, s, sh * scale);
      ctx.restore();
    } else {
      ctx.drawImage(img[name], i * p + 2, 2, fs, sh, Math.round(x), Math.round(y), s, sh * scale);
    }
  }

  // ------------------------------------------------------------ sound
  let audio = null, muted = false;
  function beep(freq, dur = 0.08, type = "square", slide = 0, vol = 0.06) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audio.currentTime);
      if (slide) o.frequency.linearRampToValueAtTime(freq + slide, audio.currentTime + dur);
      g.gain.setValueAtTime(vol, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + dur);
    } catch (e) { /* audio not available */ }
  }
  const sfx = {
    jump: () => beep(320, 0.09, "square", 220),
    merge: () => { beep(220, 0.25, "triangle", 330, 0.09); setTimeout(() => beep(440, 0.2, "triangle", 220, 0.07), 120); },
    split: () => { beep(520, 0.2, "triangle", -300, 0.08); },
    button: () => { beep(660, 0.06); setTimeout(() => beep(880, 0.08), 70); },
    death: () => beep(200, 0.35, "sawtooth", -150, 0.07),
    win: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.14, "square", 0, 0.05), i * 110)),
    nope: () => beep(140, 0.1, "square", 0, 0.05),
  };

  // ------------------------------------------------------------ input
  const keys = {};
  const pressed = {};
  const map = {
    ArrowLeft: "left", KeyA: "left", KeyQ: "left",
    ArrowRight: "right", KeyD: "right",
    ArrowUp: "jump", KeyW: "jump", KeyZ: "jump", Space: "jump",
    KeyF: "merge", ShiftLeft: "merge", ShiftRight: "merge", KeyE: "merge",
    KeyR: "restart", Enter: "start", KeyM: "mute",
  };
  function press(a) { if (!keys[a]) pressed[a] = true; keys[a] = true; }
  function release(a) { keys[a] = false; }
  addEventListener("keydown", (e) => {
    const a = map[e.code];
    if (!a) return;
    e.preventDefault();
    press(a);
  });
  addEventListener("keyup", (e) => { const a = map[e.code]; if (a) release(a); });
  window.SlimyInput = { press, release }; // used by touch buttons

  // ------------------------------------------------------------ level state
  let level = 0, grid = [], slimes = [], merged = false, opened = {}, hint = "";
  let anim = null;          // { kind: "merge"|"split", t, x, bottom, flip }
  let jumpBuffer = 0, coyote = 0;
  let screen = "title";     // title | play | dying | cleared | end
  let timer = 0, runTime = 0, deaths = 0, flash = 0;
  const particles = [];

  function load(n) {
    level = n;
    const L = window.LEVELS[n];
    grid = L.map.map((r) => r.split(""));
    hint = L.hint;
    slimes = []; opened = {}; anim = null; merged = false;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const ch = grid[r][c];
        if (ch === "b" || ch === "g") {
          slimes.push(makeSlime(ch === "b" ? "blue" : "green", c * T + T / 2, (r + 1) * T, SMALL));
          grid[r][c] = ".";
        } else if (ch === "m") {
          slimes.push(makeSlime("teal", c * T + T / 2, (r + 1) * T, BIG));
          merged = true;
          grid[r][c] = ".";
        }
      }
    }
    buildDecor();
  }

  function makeSlime(color, cx, bottom, size) {
    return { color, x: cx - size.w / 2, y: bottom - size.h, w: size.w, h: size.h,
             vx: 0, vy: 0, ground: false, facing: "r", t: Math.random() };
  }

  const tile = (c, r) => (grid[r] && grid[r][c] !== undefined ? grid[r][c] : "#");
  function solidTile(ch) {
    if (ch === "#") return true;
    if ("ACH".includes(ch)) return !opened[ch.toLowerCase()];
    return false;
  }
  function boxHitsTiles(x, y, w, h) {
    const c0 = Math.floor(x / T), c1 = Math.floor((x + w - 0.001) / T);
    const r0 = Math.floor(y / T), r1 = Math.floor((y + h - 0.001) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (solidTile(tile(c, r))) return true;
    return false;
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function hitsAnything(s, x, y) {
    if (boxHitsTiles(x, y, s.w, s.h)) return true;
    for (const o of slimes) if (o !== s && overlap({ x, y, w: s.w, h: s.h }, o)) return true;
    return false;
  }

  // ------------------------------------------------------------ update
  function moveSlime(s, dt) {
    // horizontal, pixel by pixel so slimes push against walls and each other cleanly
    let dx = s.vx * dt;
    const stepX = Math.sign(dx);
    while (Math.abs(dx) > 0) {
      const d = Math.abs(dx) >= 1 ? stepX : dx;
      if (hitsAnything(s, s.x + d, s.y)) { s.vx = 0; break; }
      s.x += d; dx -= d;
    }
    // vertical
    let dy = s.vy * dt;
    const stepY = Math.sign(dy);
    s.ground = false;
    while (Math.abs(dy) > 0) {
      const d = Math.abs(dy) >= 1 ? stepY : dy;
      if (hitsAnything(s, s.x, s.y + d)) {
        if (stepY > 0) s.ground = true;
        s.vy = 0; break;
      }
      s.y += d; dy -= d;
    }
    if (!s.ground && s.vy === 0 && hitsAnything(s, s.x, s.y + 1)) s.ground = true;
  }

  function update(dt) {
    if (pressed.mute) { muted = !muted; }
    if (screen === "title") {
      if (pressed.start || pressed.jump) { screen = "play"; load(0); runTime = 0; deaths = 0; sfx.win(); }
      return;
    }
    if (screen === "end") {
      if (pressed.start) { screen = "title"; }
      return;
    }
    if (screen === "dying" || screen === "cleared") {
      timer -= dt;
      if (timer <= 0) {
        if (screen === "dying") { load(level); screen = "play"; }
        else if (level + 1 < window.LEVELS.length) { load(level + 1); screen = "play"; }
        else { screen = "end"; }
      }
      updateParticles(dt);
      return;
    }

    runTime += dt;
    if (pressed.restart) { load(level); return; }

    // merge / split animation freezes control
    if (anim) {
      anim.t += dt;
      if (anim.t >= 7 * 0.09) finishAnim();
      updateParticles(dt);
      return;
    }

    if (pressed.merge) merged ? trySplit() : tryMerge();

    const size = merged ? BIG : SMALL;
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (pressed.jump) jumpBuffer = BUFFER; else jumpBuffer -= dt;
    const anyGround = slimes.some((s) => s.ground);
    coyote = anyGround ? COYOTE : coyote - dt;

    // same input for every slime
    for (const s of slimes) {
      s.vx = dir * size.speed;
      if (dir) s.facing = dir > 0 ? "r" : "l";
      s.vy = Math.min(s.vy + GRAV * dt, MAX_FALL);
      if (jumpBuffer > 0 && (s.ground || (coyote > 0 && s.vy >= 0 && s.coy > 0))) {
        s.vy = -size.jump; s.ground = false; s.jumped = true;
      }
      if (!keys.jump && s.vy < -size.jump * 0.45) s.vy = -size.jump * 0.45; // short hop
      s.coy = s.ground ? COYOTE : (s.coy || 0) - dt;
      s.t += dt * (dir ? 1.6 : 1);
    }
    if (slimes.some((s) => s.jumped)) { sfx.jump(); jumpBuffer = 0; slimes.forEach((s) => (s.jumped = false)); }

    // move the slime "in front" first so the one behind doesn't get blocked by it
    const order = [...slimes].sort((a, b) => (dir >= 0 ? b.x - a.x : a.x - b.x));
    for (const s of order) moveSlime(s, dt);

    // buttons, acid, exit
    for (const s of slimes) {
      // a few px of tolerance so grazing an edge doesn't count
      const c0 = Math.floor((s.x + 6) / T), c1 = Math.floor((s.x + s.w - 7) / T);
      const rFeet = Math.floor((s.y + s.h - 1) / T);
      for (let c = c0; c <= c1; c++) {
        const ch = tile(c, rFeet);
        if ((ch === "a" || ch === "c" || (ch === "h" && merged)) && !opened[ch] && s.ground) {
          opened[ch] = true; sfx.button(); burst(c * T + T / 2, (rFeet + 1) * T - 4, DOOR_COLORS[ch], 14);
        }
        if (ch === "h" && !merged && !opened.h && s.ground && !s.toldHeavy) { s.toldHeavy = true; sfx.nope(); }
        if (ch === "~" && s.y + s.h > rFeet * T + 12) {
          // acid is a little more forgiving: the slime must really be over it
          const cx0 = Math.floor((s.x + 10) / T), cx1 = Math.floor((s.x + s.w - 11) / T);
          if (c >= cx0 && c <= cx1) return die(s);
        }
      }
    }
    const inExit = (s) => tile(Math.floor((s.x + s.w / 2) / T), Math.floor((s.y + s.h - 4) / T)) === "E";
    if (slimes.every(inExit) && slimes.every((s) => s.ground)) {
      screen = "cleared"; timer = 1.6; sfx.win();
      for (const s of slimes) burst(s.x + s.w / 2, s.y, "#7CFC9A", 24);
    }
    updateParticles(dt);
  }

  function die(s) {
    deaths++; screen = "dying"; timer = 0.9; flash = 0.25; sfx.death();
    burst(s.x + s.w / 2, s.y + s.h, "#7CFC9A", 30);
  }

  function tryMerge() {
    if (slimes.length !== 2) return;
    const [a, b] = slimes;
    const gap = Math.abs((a.x + a.w / 2) - (b.x + b.w / 2));
    const dy = Math.abs((a.y + a.h) - (b.y + b.h));
    if (gap > SMALL.w + 10 || dy > 10 || !a.ground || !b.ground) { sfx.nope(); return; }
    const cx = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
    const bottom = Math.max(a.y + a.h, b.y + b.h);
    const spot = findSpot(cx, bottom, BIG);
    if (spot === null) { sfx.nope(); return; }
    const blue = slimes.find((s) => s.color === "blue");
    anim = { kind: "merge", t: 0, x: spot, bottom, flip: blue.x > (cx - 1) };
    sfx.merge();
  }

  function trySplit() {
    const s = slimes[0];
    if (!s.ground) { sfx.nope(); return; }
    const cx = s.x + s.w / 2, bottom = s.y + s.h;
    anim = { kind: "split", t: 0, x: cx, bottom, flip: s.facing === "l" };
    sfx.split();
  }

  // nearest x (around cx) where a slime of `size` fits, or null
  function findSpot(cx, bottom, size) {
    for (let d = 0; d <= 48; d += 2) {
      for (const sgn of [1, -1]) {
        const x = cx + sgn * d - size.w / 2;
        const free = !boxHitsTiles(x, bottom - size.h, size.w, size.h);
        if (free) return cx + sgn * d;
      }
    }
    return null;
  }

  function finishAnim() {
    const { kind, x, bottom, flip } = anim;
    anim = null;
    if (kind === "merge") {
      const facing = slimes[0].facing;
      slimes = [makeSlime("teal", x, bottom, BIG)];
      slimes[0].facing = facing;
      merged = true;
      burst(x, bottom - 30, "#5FB3A0", 20);
    } else {
      const left = makeSlime(flip ? "green" : "blue", x - 18, bottom, SMALL);
      const right = makeSlime(flip ? "blue" : "green", x + 18, bottom, SMALL);
      // squeeze into free space if a wall is right next to us
      for (const s of [left, right]) {
        let tries = 0;
        while (boxHitsTiles(s.x, s.y, s.w, s.h) && tries++ < 40) s.x += s === left ? 1 : -1;
      }
      left.facing = right.facing = flip ? "l" : "r";
      slimes = [left, right];
      merged = false;
      burst(x, bottom - 20, "#5FB3A0", 16);
    }
  }

  // ------------------------------------------------------------ particles
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 160;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0.5 + Math.random() * 0.4, color });
    }
  }
  function updateParticles(dt) {
    for (const p of particles) { p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
  }

  // ------------------------------------------------------------ drawing
  let clock = 0;
  function drawBackground() {
    ctx.fillStyle = "#0D0B1E"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#1A1535"; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += T) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += T) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
  }

  // deterministic decor per level: pipes, specimen tubes, blinking lights (purely visual)
  let decor = [];
  function buildDecor() {
    let seed = 1337 + level * 97;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    decor = [];
    const free = (c, r) => tile(c, r) === ".";
    // ceiling pipes on the first open row under a wall
    for (let r = 1; r < 6; r++) {
      let run = [];
      for (let c = 1; c < 29; c++) {
        if (free(c, r) && tile(c, r - 1) === "#") run.push(c);
        else { if (run.length > 4) decor.push({ k: "pipe", c0: run[0], c1: run[run.length - 1], r }); run = []; }
      }
      if (run.length > 4) decor.push({ k: "pipe", c0: run[0], c1: run[run.length - 1], r });
    }
    // tubes standing on the floor
    const spots = [];
    for (let c = 2; c < 24; c++) {
      for (let r = 2; r < 16; r++) {
        if (free(c, r) && free(c, r - 1) && tile(c, r + 1) === "#") spots.push([c, r]);
      }
    }
    for (let k = 0; k < 3 && spots.length; k++) {
      const [c, r] = spots.splice(Math.floor(rnd() * spots.length), 1)[0];
      decor.push({ k: "tube", c, r, hue: rnd() < 0.5 ? "#5FB3A0" : "#7CFC9A", ph: rnd() * 3 });
    }
    // lights on walls
    for (let k = 0; k < 6; k++) {
      const c = 1 + Math.floor(rnd() * 28), r = 1 + Math.floor(rnd() * 14);
      if (free(c, r)) decor.push({ k: "light", c, r, ph: rnd() * 2, red: rnd() < 0.4 });
    }
  }

  function drawDecor() {
    for (const d of decor) {
      if (d.k === "pipe") {
        const y = d.r * T + 4;
        ctx.fillStyle = "#1E1840"; ctx.fillRect(d.c0 * T, y, (d.c1 - d.c0 + 1) * T, 8);
        ctx.fillStyle = "#2A2350";
        for (let c = d.c0; c <= d.c1; c += 3) ctx.fillRect(c * T + 12, y - 2, 6, 12);
      } else if (d.k === "tube") {
        const x = d.c * T + 6, y = (d.r - 1) * T + 4, h = 2 * T - 4;
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = "#14112B"; ctx.fillRect(x, y, 20, h);
        ctx.fillStyle = d.hue; ctx.fillRect(x + 2, y + 22, 16, h - 24);
        ctx.fillStyle = "#3B3270"; ctx.fillRect(x - 3, y - 4, 26, 6); ctx.fillRect(x - 3, y + h - 2, 26, 4);
        ctx.fillStyle = "#EDE9FE";
        for (let k = 0; k < 2; k++) {
          const t = (clock * 0.6 + d.ph + k * 0.5) % 1;
          ctx.fillRect(x + 5 + k * 7, y + h - 6 - t * (h - 30), 3, 3);
        }
        ctx.globalAlpha = 1;
      } else if (d.k === "light") {
        const on = Math.floor(clock * 1.5 + d.ph) % 2 === 0;
        ctx.fillStyle = d.red ? (on ? "#FF4D6D" : "#4A1424") : (on ? "#7CFC9A" : "#1E5B3A");
        ctx.globalAlpha = 0.5; ctx.fillRect(d.c * T + 13, d.r * T + 13, 6, 6); ctx.globalAlpha = 1;
      }
    }
  }

  function drawLevel() {
    drawDecor();
    // exit frame
    const ex = [];
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) if (grid[r][c] === "E") ex.push([c, r]);
    if (ex.length) {
      const c0 = Math.min(...ex.map((e) => e[0])), c1 = Math.max(...ex.map((e) => e[0]));
      const r0 = Math.min(...ex.map((e) => e[1])), r1 = Math.max(...ex.map((e) => e[1]));
      const x = c0 * T, y = r0 * T - 10, w = (c1 - c0 + 1) * T, h = (r1 - r0 + 1) * T + 10;
      ctx.fillStyle = "rgba(95,179,160,.12)"; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = Math.floor(clock * 2) % 2 ? "#5FB3A0" : "#7CFC9A";
      ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y, 4, h); ctx.fillRect(x + w - 4, y, 4, h);
      ctx.font = "10px 'Press Start 2P', monospace"; ctx.textAlign = "center";
      ctx.fillText("EXIT", x + w / 2, y - 6);
    }

    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const ch = grid[r][c], x = c * T, y = r * T;
        if (ch === "#") {
          ctx.fillStyle = "#2A2350"; ctx.fillRect(x, y, T, T);
          if (tile(c, r - 1) !== "#") { ctx.fillStyle = "#3B3270"; ctx.fillRect(x, y, T, 5); }
          ctx.fillStyle = "#1A1535"; ctx.fillRect(x, y + T - 3, T, 3);
        } else if ("ACH".includes(ch)) {
          const col = DOOR_COLORS[ch.toLowerCase()];
          if (opened[ch.toLowerCase()]) {
            ctx.strokeStyle = col; ctx.globalAlpha = 0.25; ctx.strokeRect(x + 6.5, y + 0.5, T - 13, T - 1); ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = "#14112B"; ctx.fillRect(x + 4, y, T - 8, T);
            ctx.fillStyle = col;
            for (let k = 0; k < 4; k++) ctx.fillRect(x + 6, y + k * 8 + ((Math.floor(clock * 6) + k) % 2) * 2, T - 12, 3);
          }
        } else if ("ach".includes(ch)) {
          const col = DOOR_COLORS[ch];
          const down = opened[ch];
          ctx.fillStyle = "#3B3270"; ctx.fillRect(x + 2, y + T - 4, T - 4, 4);
          ctx.fillStyle = col; ctx.fillRect(x + 6, y + T - (down ? 6 : 10), T - 12, down ? 2 : 6);
          if (ch === "h") { ctx.fillStyle = col; ctx.fillRect(x + 2, y + T - 12, 4, 8); ctx.fillRect(x + T - 6, y + T - 12, 4, 8); }
        } else if (ch === "~") {
          ctx.fillStyle = "#1E5B3A"; ctx.fillRect(x, y + 12, T, T - 12);
          ctx.fillStyle = "#7CFC9A";
          for (let k = 0; k < 4; k++) ctx.fillRect(x + k * 8, y + 10 + ((Math.floor(clock * 5) + k + c) % 2) * 3, 8, 4);
        }
      }
    }
  }

  function drawSlimes() {
    if (anim) {
      const i = Math.min(6, Math.floor(anim.t / 0.09));
      drawFrame(anim.kind, i, anim.x - 48, anim.bottom - 80, 1, anim.flip);
      return;
    }
    for (const s of slimes) {
      const moving = s.vx !== 0;
      let f = Math.floor(s.t * 9) % 6;
      if (!s.ground) f = s.vy < 0 ? 2 : 4;
      else if (!moving) f = Math.floor(s.t * 6) % 6;
      const name = `${s.color}-${s.facing}`;
      const air = !s.ground;
      if (s.color === "teal") drawFrame(name, f, s.x + s.w / 2 - 48, s.y + s.h - 80, 2, false, air);
      else drawFrame(name, f, s.x + s.w / 2 - 24, s.y + s.h - 40, 1, false, air);
    }
  }

  function drawHud() {
    const L = window.LEVELS[level];
    ctx.fillStyle = "rgba(13,11,30,.82)"; ctx.fillRect(0, 0, W, 30);
    ctx.font = "12px 'Press Start 2P', monospace";
    ctx.textAlign = "left"; ctx.fillStyle = "#EDE9FE";
    ctx.fillText(`LV ${level + 1}/${window.LEVELS.length}  ${L.name.toUpperCase()}`, 12, 20);
    ctx.textAlign = "right"; ctx.fillStyle = "#A78BFA";
    ctx.fillText(`F MERGE/SPLIT  R RESTART  M ${muted ? "UNMUTE" : "MUTE"}`, W - 12, 20);
    ctx.font = "10px 'Press Start 2P', monospace"; ctx.textAlign = "center"; ctx.fillStyle = "#7CFC9A";
    ctx.fillText(hint, W / 2, 50);
  }

  function centerText(text, y, size, color) {
    ctx.font = `${size}px 'Press Start 2P', monospace`; ctx.textAlign = "center"; ctx.fillStyle = color;
    ctx.fillText(text, W / 2, y);
  }

  function drawTitle() {
    drawBackground();
    ctx.fillStyle = "#14112B"; ctx.fillRect(0, 420, W, H - 420);
    ctx.fillStyle = "#3B3270"; ctx.fillRect(0, 420, W, 4);
    centerText("SLIMY", 170, 72, "#5FB3A0");
    centerText("SLIMY", 164, 72, "#EDE9FE");
    centerText("two slimes · one controller", 215, 12, "#A78BFA");
    const f = Math.floor(clock * 8) % 6;
    drawFrame("blue-r", f, W / 2 - 150, 420 - 80, 2);
    drawFrame("green-l", (f + 3) % 6, W / 2 + 54, 420 - 80, 2);
    if (Math.floor(clock * 2) % 2) centerText(touch ? "TAP TO START" : "PRESS ENTER", 300, 16, "#7CFC9A");
    centerText("← → move · ↑ jump · F merge / split · R restart", 480, 10, "#A78BFA");
    centerText("made by NightKiiro", 515, 10, "#6B5FA8");
  }

  function drawEnd() {
    drawBackground();
    centerText("YOU ESCAPED", 160, 40, "#7CFC9A");
    centerText("THE LAB!", 210, 40, "#EDE9FE");
    const m = Math.floor(runTime / 60), s = Math.floor(runTime % 60).toString().padStart(2, "0");
    centerText(`time ${m}:${s}   ·   deaths ${deaths}`, 270, 14, "#A78BFA");
    const f = Math.floor(clock * 6) % 6;
    drawFrame("teal-r", f, W / 2 - 96, 300, 4);
    centerText("thanks for playing — NightKiiro", 520, 10, "#6B5FA8");
    document.getElementById("end-links").hidden = false;
  }

  function render() {
    if (screen !== "end") document.getElementById("end-links").hidden = true;
    if (screen === "title") return drawTitle();
    if (screen === "end") return drawEnd();
    drawBackground();
    drawLevel();
    drawSlimes();
    for (const p of particles) { ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life * 1.6); ctx.fillRect(p.x, p.y, 4, 4); }
    ctx.globalAlpha = 1;
    drawHud();
    if (screen === "cleared") {
      ctx.fillStyle = "rgba(13,11,30,.6)"; ctx.fillRect(0, H / 2 - 40, W, 80);
      centerText(level + 1 < window.LEVELS.length ? "LEVEL CLEAR!" : "FREEDOM!", H / 2 + 12, 28, "#7CFC9A");
    }
    if (flash > 0) { ctx.fillStyle = `rgba(255,77,109,${flash * 2})`; ctx.fillRect(0, 0, W, H); }
  }

  // ------------------------------------------------------------ loop
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (touch) document.body.classList.add("touch");
  canvas.addEventListener("pointerdown", () => { if (screen === "title" || screen === "end") press("start"); });

  let last = 0, acc = 0;
  const STEP = 1 / 120;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now; acc += dt; clock += dt; flash = Math.max(0, flash - dt);
    while (acc >= STEP) {
      update(STEP);
      for (const k in pressed) delete pressed[k];
      acc -= STEP;
    }
    render();
    requestAnimationFrame(frame);
  }

  // debug hook for automated tests
  window.Slimy = {
    state: () => ({ screen, level, merged, slimes: slimes.map((s) => ({ ...s })), opened: { ...opened }, deaths }),
    goto: (n) => { screen = "play"; load(n); },
  };

  Promise.all(loading).then(() => {
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => requestAnimationFrame(frame));
  });
})();
