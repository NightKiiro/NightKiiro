/*
 * Slimy (web) — rendering, input, sound and screens.
 * Draws with the Java game's own assets at its native 1280x720 (tiles are 64px).
 */
(() => {
  "use strict";
  const E = window.SlimyEngine, LEVELS = window.SLIMY_LEVELS;
  const W = 1280, H = 720, T = 64;
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  // ------------------------------------------------------------ assets
  const img = {};
  const IMAGES = [
    "bg/bg_far", "bg/bg_mid",
    "menu/title_bg", "menu/victory_bg", "menu/clear_bg", "menu/logo", "menu/logo_glow", "menu/hud_death",
    "menu/star_full", "menu/star_empty", "menu/font_white", "menu/font_teal", "menu/font_dim", "menu/font_shadow",
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `menu/title_alarm_${i}`),
    ...["crate", "door", "door_open", "door_open_top", "door_top", "exit", "exit_top", "heavy_block",
      "heavy_plate", "light_plate", "spawn", "spikes", "wall", "wall_top"].map((t) => `tiles/tile_${t}`),
  ];
  for (const c of ["blue", "green", "teal"])
    for (const a of ["idle", "move", "jump", "death"])
      for (const f of ["left", "right"]) IMAGES.push(`sprites/slime_${c}_${a}_${f}`);
  for (const k of ["merge", "split", "merge_blue_on_top", "merge_green_on_top"])
    for (const f of ["left", "right"]) IMAGES.push(`sprites/slime_${k}_${f}`);

  const loaded = Promise.all(IMAGES.map((p) => new Promise((ok) => {
    const im = new Image();
    im.onload = ok; im.onerror = () => { console.warn("missing", p); ok(); };
    im.src = `assets/${p}.png`;
    img[p] = im;
  })));
  const I = (p) => img[p];

  // ------------------------------------------------------------ pixel font (the game's own)
  const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZÉÈÀ0123456789:.!-'/<> ";
  const textWidth = (s, scale) => (s.length * 6 - 1) * scale;
  function text(s, x, y, scale = 4, ink = "white", align = "left") {
    s = String(s).toUpperCase();
    if (align === "center") x -= textWidth(s, scale) / 2;
    else if (align === "right") x -= textWidth(s, scale);
    for (let i = 0; i < s.length; i++) {
      let k = CHARS.indexOf(s[i]);
      if (k < 0) k = CHARS.indexOf(" ");
      const gx = Math.round(x + i * 6 * scale), gy = Math.round(y);
      ctx.drawImage(I("menu/font_shadow"), k * 8, 0, 8, 8, gx + scale, gy + scale, 8 * scale, 8 * scale);
      ctx.drawImage(I(`menu/font_${ink}`), k * 8, 0, 8, 8, gx, gy, 8 * scale, 8 * scale);
    }
  }

  // ------------------------------------------------------------ sound
  const SFX = ["jump", "land", "fuse", "split", "refused", "plate", "door", "death", "level_clear",
    "menu_move", "menu_select", "star", "alarm"];
  const audio = { ctx: null, buffers: {}, music: null, musicName: null, muted: false, master: null };
  try { audio.muted = localStorage.getItem("slimy-muted") === "1"; } catch (e) { /* storage blocked */ }
  function initAudio() {
    if (audio.ctx) { if (audio.ctx.state === "suspended") audio.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio.ctx = new AC();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 1;
    audio.master.connect(audio.ctx.destination);
    const load = (name, path) => fetch(path).then((r) => r.arrayBuffer())
      .then((b) => new Promise((ok, ko) => audio.ctx.decodeAudioData(b, ok, ko)))
      .then((buf) => { audio.buffers[name] = buf; if (audio.wantMusic === name) playMusic(name, true); })
      .catch(() => {});
    SFX.forEach((s) => load(s, `assets/sfx/${s}.mp3`));
    load("music_menu", "assets/music/menu.mp3");
    load("music_lab", "assets/music/lab.mp3");
  }
  function sfx(name, vol = 0.8) {
    const buf = audio.buffers[name];
    if (!audio.ctx || !buf) return;
    const src = audio.ctx.createBufferSource(), g = audio.ctx.createGain();
    g.gain.value = vol;
    src.buffer = buf; src.connect(g).connect(audio.master); src.start();
  }
  function playMusic(name, force = false) {
    const key = `music_${name}`;
    audio.wantMusic = key;
    if (!audio.ctx || (!force && audio.musicName === key)) return;
    const buf = audio.buffers[key];
    if (!buf) return;
    if (audio.music) { try { audio.music.stop(); } catch (e) { /* already stopped */ } }
    const src = audio.ctx.createBufferSource(), g = audio.ctx.createGain();
    g.gain.value = 0.35;
    src.buffer = buf; src.loop = true; src.connect(g).connect(audio.master); src.start();
    audio.music = src; audio.musicName = key;
  }
  function toggleMute() {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 1;
    try { localStorage.setItem("slimy-muted", audio.muted ? "1" : "0"); } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ input
  const keys = {}, pressed = {};
  const KEYMAP = {
    ArrowLeft: "left", KeyA: "left", KeyQ: "left", ArrowRight: "right", KeyD: "right",
    ArrowUp: "jump", Space: "jump", KeyW: "jump", KeyZ: "jump", ArrowDown: "down", KeyS: "down",
    KeyF: "fuse", KeyE: "fuse", ShiftLeft: "fuse", ShiftRight: "fuse",
    KeyR: "restart", Enter: "enter", Escape: "pause", KeyP: "pause", KeyM: "mute",
  };
  const press = (a) => { if (!keys[a]) pressed[a] = true; keys[a] = true; initAudio(); };
  const release = (a) => { keys[a] = false; };
  addEventListener("keydown", (e) => { const a = KEYMAP[e.code]; if (!a) return; e.preventDefault(); press(a); });
  addEventListener("keyup", (e) => { const a = KEYMAP[e.code]; if (a) release(a); });
  addEventListener("blur", () => Object.keys(keys).forEach((k) => (keys[k] = false)));
  canvas.addEventListener("pointerdown", () => { initAudio(); if (screen !== "play") press("enter"); setTimeout(() => release("enter"), 50); });
  window.SlimyInput = { press, release };

  // ------------------------------------------------------------ progress
  const PAR = [20, 20, 30, 25, 25, 32]; // seconds for the third star
  let save = { unlocked: 1, stars: [] };
  try { save = Object.assign(save, JSON.parse(localStorage.getItem("slimy-save") || "{}")); } catch (e) { /* ignore */ }
  const persist = () => { try { localStorage.setItem("slimy-save", JSON.stringify(save)); } catch (e) { /* ignore */ } };

  // ------------------------------------------------------------ state
  let screen = "title";            // title | play | clear | victory
  let clock = 0, menuLevel = 0;
  let g = null, levelIndex = 0, levelTime = 0, levelDeaths = 0, runTime = 0, runDeaths = 0;
  let paused = false, clearInfo = null, feedback = null, shake = 0, banner = 0;
  const views = new Map();         // per-slime animation state

  function startLevel(i, fresh = true) {
    levelIndex = i;
    g = E.create(LEVELS[i]);
    views.clear();
    if (fresh) { levelTime = 0; levelDeaths = 0; banner = 3.2; }
    feedback = null; paused = false;
    screen = "play";
    playMusic("lab");
  }

  // ------------------------------------------------------------ update
  function updatePlay(dt) {
    if (pressed.pause) { paused = !paused; sfx("menu_select", 0.5); }
    if (paused) {
      if (pressed.enter) paused = false;
      if (pressed.restart) { startLevel(levelIndex, false); levelDeaths++; runDeaths++; }
      return;
    }
    if (pressed.restart && !g.dying) { startLevel(levelIndex, false); return; }
    levelTime += dt; runTime += dt; banner = Math.max(0, banner - dt);
    const before = new Set(g.slimes);
    let input = { dir: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), jump: !!keys.jump, fuse: !!keys.fuse };
    if (autoplay.length) input = autoplay.shift();
    E.update(g, input, dt);

    for (const ev of g.events) {
      if (ev.type === "jump") sfx("jump", 0.45);
      else if (ev.type === "land") sfx("land", 0.35);
      else if (ev.type === "fuse") sfx("fuse");
      else if (ev.type === "split") sfx("split");
      else if (ev.type === "plate") sfx("plate", 0.7);
      else if (ev.type === "door_open" || ev.type === "door_close") sfx("door", 0.6);
      else if (ev.type === "death") { sfx("death"); levelDeaths++; runDeaths++; }
      else if (ev.type === "refused") { sfx("refused", 0.7); feedback = { text: ev.why, t: 1.1 }; shake = 0.25; }
      else if (ev.type === "clear") levelCleared();
    }
    if (g.restartRequested) startLevel(levelIndex, false);
    // animation state of every slime still around
    for (const s of g.slimes) {
      let v = views.get(s);
      if (!v) { v = { anim: "idle", t: 0, wasGround: true, squash: 0 }; views.set(s, v); }
      v.squash = Math.max(0, v.squash - dt);
      if (s.ground && !v.wasGround && !s.dead) v.squash = 0.15;
      v.wasGround = s.ground;
      const next = s.dead ? "death" : !s.ground ? "jump" : s.vx !== 0 ? "move" : "idle";
      if (next !== v.anim) { v.anim = next; v.t = 0; } else v.t += dt;
    }
    for (const s of before) if (!g.slimes.includes(s)) views.delete(s);
    if (feedback) { feedback.t -= dt; if (feedback.t <= 0) feedback = null; }
    shake = Math.max(0, shake - dt);
  }

  function levelCleared() {
    sfx("level_clear");
    let stars = 1;
    if (levelDeaths === 0) stars++;
    if (levelDeaths === 0 && levelTime <= PAR[levelIndex]) stars++;
    save.stars[levelIndex] = Math.max(save.stars[levelIndex] || 0, stars);
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIndex + 2));
    persist();
    clearInfo = { stars, time: levelTime, deaths: levelDeaths, t: 0, last: levelIndex + 1 >= LEVELS.length };
    screen = "clear";
  }

  function update(dt) {
    clock += dt;
    if (pressed.mute) toggleMute();
    if (screen === "title") {
      const max = save.unlocked - 1;
      if (pressed.left && menuLevel > 0) { menuLevel--; sfx("menu_move", 0.6); }
      if (pressed.right && menuLevel < max) { menuLevel++; sfx("menu_move", 0.6); }
      playMusic("menu");
      if (pressed.enter || pressed.jump) { sfx("menu_select"); runTime = 0; runDeaths = 0; startLevel(menuLevel); }
    } else if (screen === "play") {
      updatePlay(dt);
    } else if (screen === "clear") {
      clearInfo.t += dt;
      for (let k = 0; k < clearInfo.stars; k++) {
        const at = 0.5 + k * 0.35;
        if (clearInfo.t >= at && clearInfo.t - dt < at) sfx("star", 0.7);
      }
      if (clearInfo.t > 0.8 && (pressed.enter || pressed.jump)) {
        sfx("menu_select");
        if (clearInfo.last) { screen = "victory"; clock = 0; playMusic("menu"); }
        else startLevel(levelIndex + 1);
      }
    } else if (screen === "victory") {
      if (clock > 1 && pressed.enter) { screen = "title"; menuLevel = 0; }
    }
  }

  // ------------------------------------------------------------ drawing helpers
  const full = (p) => ctx.drawImage(I(p), 0, 0, W, H);
  function sheetFrame(p, frame, fs, x, y, w, h) {
    const im = I(p);
    if (!im || !im.width) return;
    const n = Math.max(1, Math.floor(im.width / fs));
    frame = Math.max(0, Math.min(n - 1, frame));
    ctx.drawImage(im, frame * fs, 0, fs, fs, Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  const frameCount = (p, fs) => Math.max(1, Math.floor((I(p) && I(p).width || fs) / fs));

  function cameraX() {
    const xs = g.slimes.map((s) => s.x + s.w / 2);
    const center = xs.reduce((a, b) => a + b, 0) / xs.length * T;
    const max = Math.max(0, g.L.width * T - W);
    return Math.max(0, Math.min(max, center - W / 2));
  }

  function drawBackground(cam) {
    ctx.fillStyle = "#06101a"; ctx.fillRect(0, 0, W, H);
    for (const [p, speed] of [["bg/bg_far", 0.2], ["bg/bg_mid", 0.5]]) {
      const off = -((cam * speed) % W);
      ctx.drawImage(I(p), off, 0, W, H);
      ctx.drawImage(I(p), off + W, 0, W, H);
    }
  }

  function drawLevel(cam) {
    const L = g.L;
    const first = Math.max(0, Math.floor(cam / T) - 1), last = Math.min(L.width - 1, Math.ceil((cam + W) / T));
    for (let y = 0; y < L.height; y++) {
      for (let x = first; x <= last; x++) {
        const ch = L.tiles[y][x];
        let p = null;
        if (ch === "#") p = L.at(x, y - 1) === "#" ? "tiles/tile_wall" : "tiles/tile_wall_top";
        else if (ch === "E") p = L.at(x, y + 1) === "E" ? "tiles/tile_exit_top" : "tiles/tile_exit";
        else if (ch === "S") p = "tiles/tile_spawn";
        else if (ch === "^") p = "tiles/tile_spikes";
        else if (ch === "p") p = "tiles/tile_light_plate";
        else if (ch === "P") p = "tiles/tile_heavy_plate";
        if (!p) continue;
        const im = I(p), h = (im.height / 32) * T;
        ctx.drawImage(im, Math.round(x * T - cam), (y + 1) * T - h, T, h);
      }
    }
    // active plates glow a little
    for (const pl of L.plates) if (pl.active) {
      ctx.fillStyle = "rgba(80,232,214,.35)";
      ctx.fillRect(Math.round(pl.x * T - cam + 6), (pl.y + 1) * T - 14, T - 12, 6);
    }
    for (const d of L.doors) {
      for (let i = 0; i < d.height; i++) {
        const bottom = i === d.height - 1;
        const p = d.open ? (bottom ? "tiles/tile_door_open" : "tiles/tile_door_open_top") : (bottom ? "tiles/tile_door" : "tiles/tile_door_top");
        ctx.drawImage(I(p), Math.round(d.x * T - cam), (d.top + i) * T, T, T);
      }
    }
    for (const c of L.crates) {
      ctx.drawImage(I(c.heavy ? "tiles/tile_heavy_block" : "tiles/tile_crate"), Math.round(c.x * T - cam), Math.round(c.y * T), T, T);
    }
  }

  function drawSlimes(cam) {
    if (g.transition > 0) {
      const kind = !g.merged ? "split" : g.fusionKind === "blue_on_top" ? "merge_blue_on_top"
        : g.fusionKind === "green_on_top" ? "merge_green_on_top" : "merge";
      const facing = g.slimes[0].facing;
      const p = `sprites/slime_${kind}_${facing}`;
      const n = frameCount(p, 96);
      const progress = 1 - g.transition / E.TRANSITION;
      const frame = Math.min(Math.floor(progress * n), n - 1);
      let left = Infinity, right = -Infinity, feet = -Infinity;
      for (const s of g.slimes) { left = Math.min(left, s.x); right = Math.max(right, s.x + s.w); feet = Math.max(feet, s.y + s.h); }
      const size = (right - left) * T, scale = size / 96;
      sheetFrame(p, frame, 96, left * T - cam, feet * T - 80 * scale, size, size);
      return;
    }
    for (const s of g.slimes) {
      const v = views.get(s) || { anim: "idle", t: 0, squash: 0 };
      const p = `sprites/slime_${s.color}_${v.anim}_${s.facing}`;
      const n = frameCount(p, 48);
      let frame;
      if (v.anim === "jump") {
        const rise = 6, fall = n - rise;
        if (s.vy < 0) frame = Math.min(Math.floor(Math.max(0, 1 + s.vy / s.jump) * rise), rise - 1);
        else frame = rise + Math.min(Math.floor((s.vy / s.jump) * fall), fall - 1);
      } else {
        const fps = v.anim === "idle" ? 2.5 : 8;
        frame = Math.floor(v.t * fps);
        frame = v.anim === "death" ? Math.min(frame, n - 1) : frame % n;
      }
      const size = s.w * T, sq = 0.25 * v.squash / 0.15;
      const w = size * (1 + sq), h = size * (1 - sq);
      const feet = (s.y + s.h) * T;
      sheetFrame(p, frame, 48, s.x * T - cam - (w - size) / 2, feet - 40 * (h / 48), w, h);
    }
  }

  function drawHud() {
    ctx.fillStyle = "rgba(4,12,20,.72)"; ctx.fillRect(0, 0, W, 56);
    ctx.fillStyle = "#50e8d6"; ctx.fillRect(0, 56, W, 2);
    text(`LEVEL ${levelIndex + 1}`, 24, 15, 4, "white");
    const m = Math.floor(levelTime / 60), s = Math.floor(levelTime % 60).toString().padStart(2, "0");
    text(`${m}:${s}`, W / 2, 15, 4, "teal", "center");
    const count = String(levelDeaths);
    const cx = W - 24 - textWidth(count, 4);
    ctx.drawImage(I("menu/hud_death"), cx - 10 - 32, 12, 32, 32);
    text(count, cx, 15, 4, levelDeaths ? "white" : "dim");
  }

  function drawPlay() {
    let cam = cameraX();
    if (shake > 0) cam += Math.sin(clock * 90) * 6 * (shake / 0.25);
    drawBackground(cam);
    drawLevel(cam);
    drawSlimes(cam);
    if (feedback) {
      const s0 = g.slimes;
      const x = s0.reduce((a, s) => a + s.x + s.w / 2, 0) / s0.length * T - cam;
      const y = Math.min(...s0.map((s) => s.y)) * T - 46 - (1.1 - feedback.t) * 18;
      ctx.globalAlpha = Math.min(1, feedback.t * 3);
      text(feedback.text, x, y, 3, "white", "center");
      ctx.globalAlpha = 1;
    }
    drawHud();
    if (banner > 0) {
      const a = Math.min(1, banner * 2, (3.2 - banner) * 4);
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(4,12,20,.6)"; ctx.fillRect(0, 86, W, 104);
      text(LEVELS[levelIndex].name, W / 2, 100, 6, "white", "center");
      text(LEVELS[levelIndex].hint, W / 2, 158, 3, "teal", "center");
      ctx.globalAlpha = 1;
    }
    if (paused) {
      ctx.fillStyle = "rgba(4,12,20,.75)"; ctx.fillRect(0, 0, W, H);
      text("PAUSE", W / 2, 230, 10, "white", "center");
      text("ENTER - RESUME", W / 2, 360, 4, "teal", "center");
      text("R - RESTART LEVEL", W / 2, 410, 4, "teal", "center");
      text(`M - ${audio.muted ? "SOUND ON" : "MUTE"}`, W / 2, 460, 4, "teal", "center");
    }
  }

  function drawHopper(color, x, phase) {
    // a slime hopping on the title / victory screens
    const t = (clock + phase) % 2.4;
    let p = `sprites/slime_${color}_idle_right`, frame = Math.floor(clock * 2.5) % 2, y = 600;
    if (t < 0.6) {
      const k = t / 0.6;
      y = 600 - Math.sin(k * Math.PI) * 70;
      p = `sprites/slime_${color}_jump_right`;
      frame = k < 0.5 ? Math.floor(k * 2 * 6) : 6 + Math.floor((k - 0.5) * 2 * 6);
    }
    sheetFrame(p, frame, 48, x, y - 40 * (128 / 48), 128, 128);
  }

  function drawLogo(y) {
    const bob = Math.sin(clock * 2) * 6;
    const gl = I("menu/logo_glow"), lo = I("menu/logo");
    ctx.drawImage(gl, (W - gl.width * 2) / 2, y - 40 + bob, gl.width * 2, gl.height * 2);
    ctx.drawImage(lo, (W - lo.width * 2) / 2, y + bob, lo.width * 2, lo.height * 2);
  }

  function drawTitle() {
    full("menu/title_bg");
    full(`menu/title_alarm_${Math.floor(clock * 6) % 8}`);
    drawLogo(64);
    drawHopper("blue", W / 2 - 220 - 128, 0);
    drawHopper("green", W / 2 + 220, 1.2);
    if (Math.floor(clock * 2) % 2 === 0) text(touch ? "TAP TO PLAY" : "PRESS ENTER", W / 2, 400, 5, "white", "center");
    if (save.unlocked > 1) {
      const n = menuLevel + 1, st = save.stars[menuLevel] || 0;
      text(`< LEVEL ${n} >`, W / 2, 460, 4, "teal", "center");
      for (let k = 0; k < 3; k++) ctx.drawImage(I(k < st ? "menu/star_full" : "menu/star_empty"), W / 2 - 54 + k * 38, 500, 32, 32);
    }
    text("ARROWS MOVE - UP/SPACE JUMP - F FUSE/SPLIT - R RESTART - M MUTE", W / 2, 672, 2, "dim", "center");
  }

  function drawClear() {
    full("menu/clear_bg");
    ctx.fillStyle = "rgba(4,12,20,.45)"; ctx.fillRect(0, 0, W, H);
    const t = clearInfo.t;
    text("LEVEL CLEAR!", W / 2, 110, 8, "white", "center");
    text(LEVELS[levelIndex].name, W / 2, 196, 4, "teal", "center");
    for (let k = 0; k < 3; k++) {
      const on = k < clearInfo.stars && t >= 0.5 + k * 0.35;
      const pop = on ? Math.max(0, 1 - (t - 0.5 - k * 0.35) * 5) : 0;
      const s = 96 + pop * 30;
      ctx.drawImage(I(on ? "menu/star_full" : "menu/star_empty"), W / 2 - 150 + k * 150 - s / 2, 290 - pop * 15, s, s);
    }
    const m = Math.floor(clearInfo.time / 60), s = Math.floor(clearInfo.time % 60).toString().padStart(2, "0");
    text(`TIME ${m}:${s}     DEATHS ${clearInfo.deaths}`, W / 2, 450, 4, "white", "center");
    text(`3 STARS: NO DEATH AND UNDER ${PAR[levelIndex]} S`, W / 2, 506, 2, "dim", "center");
    if (t > 0.8 && Math.floor(clock * 2) % 2 === 0) text(touch ? "TAP TO CONTINUE" : "PRESS ENTER", W / 2, 600, 4, "teal", "center");
  }

  function drawVictory() {
    full("menu/victory_bg");
    ctx.fillStyle = "rgba(4,12,20,.25)"; ctx.fillRect(0, 0, W, 260);
    text("YOU ESCAPED THE LAB!", W / 2, 80, 7, "white", "center");
    const m = Math.floor(runTime / 60), s = Math.floor(runTime % 60).toString().padStart(2, "0");
    const stars = save.stars.reduce((a, b) => a + (b || 0), 0);
    text(`TIME ${m}:${s}    DEATHS ${runDeaths}    STARS ${stars}/${LEVELS.length * 3}`, W / 2, 170, 3, "teal", "center");
    drawHopper("blue", W / 2 - 220 - 128, 0);
    drawHopper("green", W / 2 + 220, 1.2);
    text("THANKS FOR PLAYING!", W / 2, 230, 3, "white", "center");
  }

  function render() {
    document.getElementById("end-links").hidden = screen !== "victory" || clock < 1;
    if (screen === "title") drawTitle();
    else if (screen === "play") drawPlay();
    else if (screen === "clear") drawClear();
    else drawVictory();
    if (audio.muted && screen !== "play") text("MUTED", W - 20, 20, 2, "dim", "right");
  }

  // ------------------------------------------------------------ loop
  const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (touch) document.body.classList.add("touch");
  let last = 0, acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now; acc += dt;
    while (acc >= E.DT) {
      update(E.DT);
      for (const k in pressed) delete pressed[k];
      acc -= E.DT;
    }
    render();
    requestAnimationFrame(frame);
  }

  // demo / test mode: plays a solution written like the files in solutions/
  const autoplay = [];
  function queueSolution(textSol) {
    autoplay.length = 0;
    for (const raw of textSol.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [k, n] = line.split(/\s+/), set = new Set(k.split("+"));
      for (let i = 0; i < +n; i++) autoplay.push({ dir: (set.has("RIGHT") ? 1 : 0) - (set.has("LEFT") ? 1 : 0), jump: set.has("JUMP"), fuse: set.has("FUSE") });
    }
  }

  // hooks for automated tests
  window.Slimy = {
    state: () => ({ screen, levelIndex, paused, merged: g && g.merged, completed: g && g.completed,
      slimes: g ? g.slimes.map((s) => ({ x: s.x, y: s.y, ground: s.ground, color: s.color })) : [] }),
    start: (i) => startLevel(i),
    autoplay: (i, sol) => { startLevel(i); banner = 0; queueSolution(sol); },
  };

  loaded.then(() => requestAnimationFrame(frame));
})();
