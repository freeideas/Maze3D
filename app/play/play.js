// The play page: talks to the server over one WebSocket, draws the 2D start like Endless Maze, then
// the 3D maze, and plays the sounds. The rules and the messages are in ../../specs/.

import { advance, command, walker } from "./motion.js";
import * as sound from "./sound.js";
import { view3d } from "./view3d.js";

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const board = /** @type {HTMLCanvasElement} */ ($("board"));
const ctx = /** @type {CanvasRenderingContext2D} */ (board.getContext("2d"));
const view = view3d(/** @type {HTMLCanvasElement} */ ($("view")));
const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;
const STEPS = { U: [0, -1, UP], R: [1, 0, RIGHT], D: [0, 1, DOWN], L: [-1, 0, LEFT] };
const DELAY = 100; // others and the monster are drawn this many milliseconds in the past, smoothly

/** @typedef {{ level: number, size: number, open: number[], start: number, exit: number }} Maze */
let me = { id: "", name: "" };
let level = 0;
/** @type {Maze} */ let maze2d;
/** @type {Maze} */ let maze3d;
let phase = "";
let cell = 0;
let moves2d = 0;
/** @type {ReturnType<typeof walker> | null} */ let self = null;
let yaw = 0;
let clockAt = { ms: /** @type {number | null} */ (null), when: 0 };
/** @type {{ when: number, monster: { x: number, y: number }, players: any[] }[]} */
let states = [];
let lastSent = 0;
let sentAt = "";

// --- the connection --------------------------------------------------------------------------

/** @type {WebSocket} */ let socket;
function connect() {
  socket = new WebSocket(new URL("../ws", location.href).href.replace(/^http/, "ws"));
  socket.onopen = () => {
    let guest = null;
    try { guest = localStorage.getItem("maze3d-guest"); } catch { /* private window: a new guest each time */ }
    send({ t: "hello", guest });
    $("note").textContent = "";
  };
  socket.onmessage = (event) => receive(JSON.parse(event.data));
  socket.onclose = () => {
    $("note").textContent = "Lost the connection; trying again…";
    setTimeout(connect, 2000);
  };
}
const send = (/** @type {object} */ message) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(message));

/** @param {any} m */
function receive(m) {
  if (m.t === "hello") {
    me = { id: m.id, name: m.name };
    try { localStorage.setItem("maze3d-guest", m.guest); } catch { /* fine */ }
  } else if (m.t === "level") {
    level = m.level;
    maze2d = m.maze2d;
    maze3d = m.maze3d;
    view.build(maze3d);
    const best = m.best ? `best ${seconds(m.best.ms)} by ${m.best.name}` : "no one has finished it yet";
    $("level").textContent = `Level ${level}`;
    $("level3").textContent = `Level ${level}`;
    $("note").textContent = "";
    $("clock").title = best;
  } else if (m.t === "phase") {
    enter(m);
  } else if (m.t === "state") {
    clockAt = { ms: m.clock, when: performance.now() };
    states.push({ when: performance.now(), monster: m.monster, players: m.players.filter((/** @type {any} */ p) => p.id !== me.id) });
    if (states.length > 20) states.shift();
    $("here").textContent = m.here > 1 ? `${m.here} on this level` : "only you on this level";
  } else if (m.t === "snap" && self) {
    Object.assign(self, { x: m.x, y: m.y, h: m.h, moving: false, queued: null, stopping: false });
  }
}

/** @param {any} m */
function enter(m) {
  phase = m.phase;
  const cover = $("cover");
  cover.className = "";
  if (phase === "2d") {
    cell = m.cell;
    moves2d = 0;
    self = null;
    cover.hidden = true;
    $("flat").hidden = false;
    $("deep").hidden = true;
    document.title = "Endless Maze";
    draw2d();
  } else if (phase === "falling") {
    show("", "You just fell through a trap door!");
    sound.play("fall");
  } else if (phase === "3d") {
    cover.hidden = true;
    $("flat").hidden = true;
    $("deep").hidden = false;
    document.title = "Monster Maze";
    self = walker(maze3d, m.x, m.y, m.h);
    yaw = -m.h * Math.PI / 2;
    states = [];
  } else if (phase === "caught") {
    if (self) self.moving = false;
    show("caught", "The monster got you!", "Back to the start, and the clock starts over.");
    sound.play("caught");
  } else if (phase === "finished") {
    if (self) self.moving = false;
    const note = m.record ? "The best time anyone has made on this level!" : `Best on this level: ${seconds(m.best.ms)} by ${m.best.name}`;
    show("finished", `Level ${level} done in ${seconds(m.ms)}`, note);
    sound.play("finished");
  }
}

/** @param {string} kind @param {string} text @param {string} [small] */
function show(kind, text, small) {
  $("cover").className = kind;
  $("cover").hidden = false;
  const message = $("message");
  message.textContent = text;
  if (small) {
    const s = document.createElement("small");
    s.textContent = small;
    message.append(s);
  }
}

const seconds = (/** @type {number} */ ms) => (ms / 1000).toFixed(1) + " s";

// --- the 2D start, drawn as Endless Maze draws it ---------------------------------------------

function draw2d() {
  if (!maze2d) return;
  const px = board.width;
  const unit = px / maze2d.size;
  ctx.fillStyle = "#111b2b";
  ctx.fillRect(0, 0, px, px);
  const ex = (maze2d.exit % maze2d.size) * unit, ey = Math.floor(maze2d.exit / maze2d.size) * unit;
  ctx.fillStyle = "#ffd76a";
  ctx.shadowColor = "#ffd76a";
  ctx.shadowBlur = unit;
  ctx.fillRect(ex + unit * .2, ey + unit * .2, unit * .6, unit * .6);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#c9d8ee";
  ctx.lineWidth = Math.max(2, unit / 8);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let c = 0; c < maze2d.size * maze2d.size; c++) {
    const x = (c % maze2d.size) * unit, y = Math.floor(c / maze2d.size) * unit;
    const open = maze2d.open[c];
    if (!(open & UP)) { ctx.moveTo(x, y); ctx.lineTo(x + unit, y); }
    if (!(open & LEFT)) { ctx.moveTo(x, y); ctx.lineTo(x, y + unit); }
    if (!(open & DOWN) && Math.floor(c / maze2d.size) === maze2d.size - 1) { ctx.moveTo(x, y + unit); ctx.lineTo(x + unit, y + unit); }
    if (!(open & RIGHT) && c % maze2d.size === maze2d.size - 1) { ctx.moveTo(x + unit, y); ctx.lineTo(x + unit, y + unit); }
  }
  ctx.stroke();
  const x = (cell % maze2d.size + .5) * unit, y = (Math.floor(cell / maze2d.size) + .5) * unit;
  ctx.fillStyle = "#6ee7ff";
  ctx.beginPath();
  ctx.arc(x, y, unit * .3, 0, Math.PI * 2);
  ctx.fill();
}

/** A 2D move: up, right, down or left on the screen. @param {"U" | "R" | "D" | "L"} letter */
function move2d(letter) {
  if (phase !== "2d" || moves2d >= 2 || !STEPS[letter]) return;
  const [dx, dy, side] = STEPS[letter];
  if (!(maze2d.open[cell] & side)) return;
  cell += dy * maze2d.size + dx;
  moves2d++;
  sound.play("step");
  send({ t: "move", m: letter });
  draw2d();
}

// --- input -----------------------------------------------------------------------------------

/** A command in the 3D maze, relative to where the player faces. @param {string} c */
function steer(c) {
  if (phase === "3d" && self) command(self, c);
  $("hint").style.opacity = "0";
}

const KEYS2D = { ArrowUp: "U", w: "U", ArrowRight: "R", d: "R", ArrowDown: "D", s: "D", ArrowLeft: "L", a: "L" };
const KEYS3D = { ArrowUp: "F", w: "F", ArrowRight: "R", d: "R", ArrowDown: "B", s: "B", ArrowLeft: "L", a: "L", " ": "S" };
addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (!(key in KEYS3D) || event.repeat) return;
  event.preventDefault();
  sound.wake();
  if (phase === "2d") move2d(/** @type {any} */ (KEYS2D)[key]);
  else if (phase === "3d") steer(/** @type {any} */ (KEYS3D)[key]);
});

for (const button of document.querySelectorAll(".pad button")) {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    sound.wake();
    move2d(/** @type {any} */ (/** @type {HTMLElement} */ (button).dataset.move));
  });
}

/**
 * Swipes. In 2D they are directions on the screen; in 3D, up is forward, left and right turn and go,
 * down turns around, and a tap stops or starts. A swipe counts as soon as it is long enough, so the
 * finger can keep sliding without waiting to lift.
 * @param {HTMLElement} area @param {(direction: string | null) => void} act
 */
function swipes(area, act) {
  /** @type {{ x: number, y: number, done: boolean } | null} */
  let start = null;
  area.addEventListener("pointerdown", (event) => {
    sound.wake();
    start = { x: event.clientX, y: event.clientY, done: false };
    area.setPointerCapture(event.pointerId);
  });
  area.addEventListener("pointermove", (event) => {
    if (!start || start.done) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) < 24) return;
    start.done = true;
    act(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "D" : "U"));
  });
  area.addEventListener("pointerup", () => {
    if (start && !start.done) act(null);
    start = null;
  });
  area.addEventListener("pointercancel", () => { start = null; });
}
swipes(board, (d) => d && move2d(/** @type {any} */ (d)));
swipes($("deep"), (d) => steer(d === null ? (self?.moving ? "S" : "F") : { U: "F", D: "B", L: "L", R: "R" }[d] ?? "F"));

let muted = false;
try { muted = localStorage.getItem("maze3d-muted") === "1"; } catch { /* fine */ }
sound.mute(muted);
const muteButton = $("mute");
muteButton.textContent = muted ? "🔇" : "🔊";
muteButton.addEventListener("pointerdown", (event) => event.stopPropagation());
muteButton.addEventListener("click", () => {
  muted = !muted;
  sound.mute(muted);
  muteButton.textContent = muted ? "🔇" : "🔊";
  try { localStorage.setItem("maze3d-muted", muted ? "1" : "0"); } catch { /* fine */ }
});

// --- every frame -----------------------------------------------------------------------------

/** Where the monster and the others were DELAY ms ago, between the two states around that time. */
function seen() {
  const at = performance.now() - DELAY;
  let i = states.length - 1;
  while (i > 0 && states[i - 1].when > at) i--;
  const b = states[i], a = states[i - 1] ?? b;
  if (!b) return null;
  const k = b.when === a.when ? 1 : Math.min(1, Math.max(0, (at - a.when) / (b.when - a.when)));
  const mix = (/** @type {number} */ p, /** @type {number} */ q) => p + (q - p) * k;
  const before = new Map(a.players.map((p) => [p.id, p]));
  return {
    monster: { x: mix(a.monster.x, b.monster.x), y: mix(a.monster.y, b.monster.y), moving: a.monster.x !== b.monster.x || a.monster.y !== b.monster.y },
    players: b.players.map((p) => {
      const q = before.get(p.id) ?? p;
      return { ...p, x: mix(q.x, p.x), y: mix(q.y, p.y) };
    }),
  };
}

let last = performance.now();
function frame(/** @type {number} */ now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const ms = clockAt.ms === null ? null : clockAt.ms + (phase === "finished" ? 0 : now - clockAt.when);
  const clock = ms === null ? "" : seconds(ms);
  $("clock").textContent = clock;
  $("clock3").textContent = clock;
  if (self && (phase === "3d" || phase === "caught" || phase === "finished")) {
    if (phase === "3d") advance(self, dt);
    // Turn the view smoothly towards the heading, the short way round.
    const target = -self.h * Math.PI / 2;
    let diff = (target - yaw) % (2 * Math.PI);
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    yaw += diff * Math.min(1, dt * 14);
    const others = seen();
    const it = phase === "3d" && others ? others.monster : null;
    const bob = self.moving ? Math.sin(now / 95) * 0.04 : 0;
    view.draw({ x: self.x, y: self.y, yaw, bob }, it ? { ...it, h: 0 } : null, others?.players ?? []);
    sound.update({ x: self.x, y: self.y, yaw }, it);
    const at = `${self.x.toFixed(3)},${self.y.toFixed(3)},${self.h}`;
    if (phase === "3d" && at !== sentAt && now - lastSent > 66) {
      send({ t: "at", x: +self.x.toFixed(3), y: +self.y.toFixed(3), h: self.h });
      sentAt = at;
      lastSent = now;
    }
  }
  requestAnimationFrame(frame);
}

connect();
requestAnimationFrame(frame);
