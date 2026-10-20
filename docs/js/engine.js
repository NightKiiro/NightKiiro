/*
 * Slimy — game engine (no rendering).
 * A JavaScript port of the rules of the Java game: same physics, same forms,
 * same fusion/split rules, crates, plates, doors, spikes and exits.
 * Runs in the browser (window.SlimyEngine) and in Node (module.exports) so
 * level solutions can be checked automatically.
 * Units are tiles; y grows downward. Fixed step of 1/60 s.
 */
(function (root) {
  "use strict";

  const GRAVITY = 30, MAX_FALL = 20, EPS = 1e-6;
  const SMALL = { w: 0.9, h: 0.65, speed: 5, jump: 12, mass: 1, pushHeavy: false };
  const BIG = { w: 1.8, h: 1.3, speed: 3.5, jump: 9.5, mass: 3, pushHeavy: true };
  const MERGE_RANGE = 2, STACKED_HEIGHT = 0.5, TRANSITION = 0.4;
  const EXIT_HOLD = 0.3, DEATH_DELAY = 1.0, SPIKE_TOP = 0.4;
  const CRATE_TOUCH = 0.01, FEET_TOLERANCE = 0.01;
  const DT = 1 / 60;

  // ------------------------------------------------------------------ bodies
  function body(x, y, w, h, speed, jump) {
    return { x, y, w, h, vx: 0, vy: 0, ground: false, speed, jump };
  }
  const overlap = (s, size, o, osize) => s < o + osize - EPS && o < s + size - EPS;

  // ------------------------------------------------------------------ level
  function parse(def) {
    const width = Math.max(...def.map.map((r) => r.length));
    const tiles = def.map.map((r) => r.padEnd(width, " ").split(""));
    const height = tiles.length;
    const at = (x, y) => (y >= 0 && y < height && x >= 0 && x < width ? tiles[y][x] : " ");
    const L = { def, width, height, tiles, at, spawns: [], crates: [], plates: [], doors: [], exits: [], spikes: [] };

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const ch = tiles[y][x];
        if (ch === "S") L.spawns.push({ x, y });
        else if (ch === "c" || ch === "H") {
          L.crates.push({ ...body(x, y, 1, 1, 0, 0), heavy: ch === "H" });
          tiles[y][x] = " ";
        } else if (ch === "p" || ch === "P") {
          L.plates.push({ x, y, heavy: ch === "P", channel: (def.plates || [])[L.plates.length] || 0, active: false });
        } else if (ch === "^") L.spikes.push({ x, y });
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x] === "D" && at(x, y - 1) !== "D") {
          let h = 0;
          while (at(x, y + h) === "D") h++;
          const channel = (def.doors || [])[L.doors.length] || 0;
          L.doors.push({ x, top: y, height: h, channel, open: false, required: 0, activePlates: 0 });
        }
      }
    }
    for (const d of L.doors) d.required = L.plates.filter((p) => p.channel === d.channel).length;
    for (let x = 0; x < width; x++) {
      let y = 0;
      while (y < height) {
        if (tiles[y][x] !== "E") { y++; continue; }
        const top = y;
        while (y < height && tiles[y][x] === "E") y++;
        L.exits.push({ x, top, height: y - top });
      }
    }
    return L;
  }

  // ------------------------------------------------------------------ game
  function create(def) {
    const L = parse(def);
    const g = {
      L, time: 0, dying: false, dyingTime: 0, completed: false, exitHeld: 0,
      merged: false, transition: 0, fusionKind: "side", direction: 0, events: [],
    };
    const spawn = (tile, color) => {
      const s = body(tile.x + (1 - SMALL.w) / 2, tile.y + 1 - SMALL.h, SMALL.w, SMALL.h, SMALL.speed, SMALL.jump);
      return Object.assign(s, { color, form: SMALL, facing: "right", dead: false });
    };
    g.slimes = [spawn(L.spawns[0], "blue"), spawn(L.spawns[1] || L.spawns[0], "green")];
    return g;
  }

  const isBlocked = (g, x, y) => {
    if (g.L.at(x, y) === "#") return true;
    for (const d of g.L.doors) if (!d.open && x === d.x && y >= d.top && y < d.top + d.height) return true;
    return false;
  };
  const crateOccupies = (g, x, y) => g.L.crates.some((c) =>
    c.x < x + 1 - EPS && x < c.x + c.w - EPS && c.y < y + 1 - EPS && y < c.y + c.h - EPS);
  function areaFree(g, x, y, w, h) {
    const m = 1e-6;
    for (let r = Math.floor(y + m); r <= Math.floor(y + h - m); r++)
      for (let c = Math.floor(x + m); c <= Math.floor(x + w - m); c++)
        if (isBlocked(g, c, r) || crateOccupies(g, c, r)) return false;
    return true;
  }

  // ---- PhysicsWorld.step
  function step(g, b, dt, obstacles) {
    let vx = b.vx;
    let vy = Math.min(b.vy + GRAVITY * dt, MAX_FALL);
    const wantedX = b.x + vx * dt;
    const x = blockedByBodiesX(b, moveX(g, b, vx, dt), obstacles);
    if (x !== wantedX) vx = 0;
    const oldY = b.y;
    b.x = x;
    b.ground = false;
    let y = oldY + vy * dt;
    if (vy > 0) {
      const landed = Math.min(landingY(g, b, x, y), landingOnBodiesY(b, x, oldY, y, obstacles));
      if (landed !== y) { y = landed; vy = 0; b.ground = true; }
    } else if (vy < 0) {
      const bumped = Math.max(ceilingY(g, b, x, y), bumpingIntoBodiesY(b, x, oldY, y, obstacles));
      if (bumped !== y) { y = bumped; vy = 0; }
    }
    b.y = y; b.vx = vx; b.vy = vy;
  }
  const solidCol = (g, c, t, bt) => { for (let r = t; r <= bt; r++) if (isBlocked(g, c, r)) return true; return false; };
  const solidRow = (g, r, l, rt) => { for (let c = l; c <= rt; c++) if (isBlocked(g, c, r)) return true; return false; };
  function moveX(g, b, vx, dt) {
    const newX = b.x + vx * dt;
    const top = Math.floor(b.y + EPS), bottom = Math.floor(b.y + b.h - EPS);
    if (vx > 0) {
      const col = Math.floor(newX + b.w);
      if (solidCol(g, col, top, bottom)) return col - b.w;
    } else if (vx < 0) {
      const col = Math.floor(newX);
      if (solidCol(g, col, top, bottom)) return col + 1;
    }
    return newX;
  }
  function landingY(g, b, x, newY) {
    const row = Math.floor(newY + b.h);
    if (solidRow(g, row, Math.floor(x + EPS), Math.floor(x + b.w - EPS))) return row - b.h;
    return newY;
  }
  function ceilingY(g, b, x, newY) {
    const row = Math.floor(newY);
    if (solidRow(g, row, Math.floor(x + EPS), Math.floor(x + b.w - EPS))) return row + 1;
    return newY;
  }
  function blockedByBodiesX(b, newX, obstacles) {
    const oldX = b.x;
    for (const o of obstacles) {
      if (!overlap(b.y, b.h, o.y, o.h)) continue;
      if (newX > oldX && oldX + b.w <= o.x + EPS && newX + b.w > o.x + EPS) newX = o.x - b.w;
      if (newX < oldX && oldX >= o.x + o.w - EPS && newX < o.x + o.w - EPS) newX = o.x + o.w;
    }
    return newX;
  }
  function landingOnBodiesY(b, x, oldY, newY, obstacles) {
    let r = newY;
    for (const o of obstacles) {
      if (oldY + b.h <= o.y + EPS && newY + b.h > o.y + EPS && overlap(x, b.w, o.x, o.w)) r = Math.min(r, o.y - b.h);
    }
    return r;
  }
  function bumpingIntoBodiesY(b, x, oldY, newY, obstacles) {
    let r = newY;
    for (const o of obstacles) {
      const ob = o.y + o.h;
      if (oldY >= ob - EPS && newY < ob - EPS && overlap(x, b.w, o.x, o.w)) r = Math.max(r, ob);
    }
    return r;
  }

  // ---- fusion
  const cx = (s) => s.x + s.w / 2, cy = (s) => s.y + s.h / 2, feet = (s) => s.y + s.h;
  function fusionBlocker(g) {
    if (g.transition > 0) return "WAIT!";
    if (g.merged) return g.slimes[0].ground ? null : "LAND FIRST!";
    const [b, gr] = g.slimes;
    if (!b.ground || !gr.ground) return "LAND FIRST!";
    if (Math.hypot(cx(b) - cx(gr), cy(b) - cy(gr)) > MERGE_RANGE) return "TOO FAR!";
    const p = fusedPos(b, gr);
    if (!areaFree(g, p.x, p.y, BIG.w, BIG.h)) return "NO ROOM!";
    return null;
  }
  const fusedPos = (b, gr) => ({ x: (cx(b) + cx(gr)) / 2 - BIG.w / 2, y: Math.max(feet(b), feet(gr)) - BIG.h });

  function toggleFusion(g) {
    const why = fusionBlocker(g);
    if (why) { g.events.push({ type: "refused", why }); return false; }
    if (!g.merged) {
      const [b, gr] = g.slimes;
      const p = fusedPos(b, gr);
      const diff = feet(gr) - feet(b);
      g.fusionKind = diff > STACKED_HEIGHT ? "blue_on_top" : diff < -STACKED_HEIGHT ? "green_on_top" : "side";
      const big = Object.assign(body(p.x, p.y, BIG.w, BIG.h, BIG.speed, BIG.jump),
        { color: "teal", form: BIG, facing: b.facing, dead: false });
      g.slimes = [big];
      g.merged = true;
      g.events.push({ type: "fuse" });
    } else {
      const big = g.slimes[0];
      const y = big.y + big.h - SMALL.h;
      const mk = (x, color) => Object.assign(body(x, y, SMALL.w, SMALL.h, SMALL.speed, SMALL.jump),
        { color, form: SMALL, facing: big.facing, dead: false });
      g.slimes = [mk(big.x, "blue"), mk(big.x + big.w - SMALL.w, "green")];
      g.merged = false;
      g.events.push({ type: "split" });
    }
    g.transition = TRANSITION;
    return true;
  }

  // ---- crates
  function updateCrates(g, dt) {
    for (const c of g.L.crates) {
      let speed = 0;
      for (const s of g.slimes) {
        if (c.heavy && !s.form.pushHeavy) continue;
        if (!(s.y < c.y + c.h - EPS && c.y < s.y + s.h - EPS)) continue;
        const right = s.vx > 0 && Math.abs(s.x + s.w - c.x) < CRATE_TOUCH;
        const left = s.vx < 0 && Math.abs(s.x - (c.x + c.w)) < CRATE_TOUCH;
        if ((right || left) && Math.abs(s.vx) > Math.abs(speed)) speed = s.vx;
      }
      c.vx = speed;
    }
    for (const c of g.L.crates) {
      const obs = g.L.crates.filter((o) => o !== c).concat(g.slimes);
      step(g, c, dt, obs);
    }
  }

  // ---- plates & doors
  function updateMechanisms(g) {
    const bodies = g.slimes.map((s) => [s, s.form.mass]).concat(g.L.crates.map((c) => [c, c.heavy ? 3 : 1]));
    for (const p of g.L.plates) {
      let mass = 0;
      for (const [b, m] of bodies) {
        const above = b.x < p.x + 1 - EPS && p.x < b.x + b.w - EPS;
        const onFloor = Math.abs(b.y + b.h - (p.y + 1)) < FEET_TOLERANCE;
        if (b.ground && above && onFloor) mass += m;
      }
      const pressed = mass >= (p.heavy ? 3 : 1);
      if (pressed !== p.active) {
        p.active = pressed;
        for (const d of g.L.doors) if (d.channel === p.channel) d.activePlates += pressed ? 1 : -1;
        g.events.push({ type: pressed ? "plate" : "plate_off", plate: p });
      }
    }
    for (const d of g.L.doors) {
      const was = d.open;
      if (d.activePlates >= d.required) d.open = true;
      else if (!bodies.some(([b]) => b.x < d.x + 1 - EPS && d.x < b.x + b.w - EPS &&
        b.y < d.top + d.height - EPS && d.top < b.y + b.h - EPS)) d.open = false;
      if (d.open !== was) g.events.push({ type: d.open ? "door_open" : "door_close", door: d });
    }
  }

  // ---- deaths & exits
  function checkDeath(g) {
    for (const s of g.slimes) {
      const void_ = feet(s) >= g.L.height - EPS;
      const spike = g.L.spikes.some((k) =>
        s.x < k.x + 1 - EPS && k.x < s.x + s.w - EPS && s.y < k.y + 1 - EPS && k.y + SPIKE_TOP < s.y + s.h - EPS);
      if (void_ || spike) {
        g.slimes.forEach((o) => (o.dead = true));
        g.dying = true;
        g.events.push({ type: "death", cause: spike ? "spikes" : "void" });
        return;
      }
    }
  }
  function slimesInDifferentDoors(g) {
    if (g.merged || g.transition > 0) return false;
    const used = new Set();
    for (const s of g.slimes) {
      const i = g.L.exits.findIndex((e) => cx(s) >= e.x && cx(s) < e.x + 1 && cy(s) >= e.top && cy(s) < e.top + e.height);
      if (i < 0 || used.has(i)) return false;
      used.add(i);
    }
    return true;
  }

  // ------------------------------------------------------------------ tick
  // input: { dir: -1|0|1, jump: bool (held), fuse: bool (held) }
  function update(g, input, dt = DT) {
    g.events.length = 0;
    if (g.completed) return g;
    g.time += dt;

    if (g.dying) {
      g.dyingTime += dt;
      for (const s of g.slimes) s.vx = 0;
      updateCrates(g, dt);
      for (const s of g.slimes) step(g, s, dt, g.slimes.filter((o) => o !== s).concat(g.L.crates));
      if (g.dyingTime >= DEATH_DELAY) g.restartRequested = true;
      return g;
    }

    if (input.fuse && !g.fuseWasDown) toggleFusion(g);
    g.fuseWasDown = !!input.fuse;

    const applied = g.transition > 0 ? 0 : input.dir;
    g.direction = applied;
    for (const s of g.slimes) {
      if (applied < 0) s.facing = "left"; else if (applied > 0) s.facing = "right";
      s.vx = Math.max(-1, Math.min(1, applied)) * s.speed;
    }
    if (input.jump && g.transition === 0) {
      let jumped = false;
      for (const s of g.slimes) if (s.ground) { s.vy = -s.jump; s.ground = false; jumped = true; }
      if (jumped) g.events.push({ type: "jump" });
    }

    updateCrates(g, dt);

    g.transition = Math.max(0, g.transition - dt);
    const order = [...g.slimes].sort((a, b) => a.x - b.x);
    if (applied > 0) order.reverse();
    const wasGround = g.slimes.map((s) => s.ground);
    for (const s of order) {
      const obs = g.slimes.filter((o) => o !== s).concat(g.L.crates);
      step(g, s, dt, obs);
    }
    g.slimes.forEach((s, i) => { if (s.ground && !wasGround[i]) g.events.push({ type: "land", slime: s }); });

    updateMechanisms(g);
    checkDeath(g);
    if (g.dying) return g;

    if (slimesInDifferentDoors(g)) {
      g.exitHeld += dt;
      if (g.exitHeld >= EXIT_HOLD) { g.completed = true; g.events.push({ type: "clear" }); }
    } else g.exitHeld = 0;
    return g;
  }

  // Replays a solution written like the Java game's solution files:
  //   "RIGHT 62", "FUSE 1", "RIGHT+JUMP 1", "WAIT 24" (1 step = 1/60 s)
  function replay(def, solution, onStep) {
    const g = create(def);
    let steps = 0;
    for (const raw of solution.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [keys, n] = line.split(/\s+/);
      const set = new Set(keys.split("+"));
      for (let i = 0; i < Number(n); i++) {
        update(g, { dir: (set.has("RIGHT") ? 1 : 0) - (set.has("LEFT") ? 1 : 0), jump: set.has("JUMP"), fuse: set.has("FUSE") });
        steps++;
        if (onStep) onStep(g, steps);
        if (g.completed || g.dying) return { g, steps };
      }
    }
    return { g, steps };
  }

  const api = { create, update, replay, fusionBlocker, SMALL, BIG, DT, TRANSITION, EXIT_HOLD, DEATH_DELAY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SlimyEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
