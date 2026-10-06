// The play page: talks to the server over one WebSocket, shows the Start screen, the map and the 3D
// maze, and plays the sounds. The rules and the messages are in ../../specs/.

import { drawMap } from "./map.js";
import { advance, command, walker } from "./motion.js";
import * as sound from "./sound.js";
import { view3d } from "./view3d.js";

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const view = view3d(/** @type {HTMLCanvasElement} */ ($("view")));
const mapCanvas = /** @type {HTMLCanvasElement} */ ($("map"));
const DELAY = 100; // others and the monster are drawn this many milliseconds in the past, smoothly

/** @typedef {{ level: number, size: number, open: number[], start: number, exit: number }} Maze */
let me = { id: "", name: "" };
let level = 0;
/** @type {Maze | null} */ let maze = null;
/** @type {{ ms: number, name: string } | null} */ let best = null;
let phase = "";
let caughtLast = false;
/** @type {ReturnType<typeof walker> | null} */ let self = null;
let yaw = 0;
let lift = 1; // 1 high above the maze looking down, 0 at eye level
let mapOpen = false;
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
  };
  socket.onmessage = (event) => receive(JSON.parse(event.data));
  socket.onclose = () => {
    phase = "";
    card("", "Lost the connection", "Trying again...");
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
    maze = m.maze;
    best = m.best;
    view.build(m.maze);
    $("level").textContent = `Level ${level}`;
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
  if (phase === "ready") {
    const record = best ? `Best time: ${seconds(best.ms)} by ${best.name}` : "No one has finished this level yet.";
    card("", `Level ${level}`, caughtLast ? `The monster got you. The clock starts over. ${record}` : record, true);
    caughtLast = false;
    if (maze) self = walker(maze, maze.start % maze.size + .5, Math.floor(maze.start / maze.size) + .5, 1);
    mapOpen = false;
    lift = 1;
  } else if (phase === "play") {
    $("cover").hidden = true;
    self = walker(/** @type {Maze} */ (maze), m.x, m.y, m.h);
    yaw = -m.h * Math.PI / 2;
    mapOpen = true;
    states = [];
    $("hint").style.opacity = "1";
  } else if (phase === "caught") {
    if (self) self.moving = false;
    caughtLast = true;
    mapOpen = false;
    card("caught", "The monster got you!", "Back to the start, and the clock starts over.");
    sound.play("caught");
  } else if (phase === "finished") {
    if (self) self.moving = false;
    mapOpen = false;
    best = m.best;
    const note = m.record ? "The best time anyone has made on this level!" : `Best on this level: ${seconds(m.best.ms)} by ${m.best.name}`;
    card("", `Level ${level} done in ${seconds(m.ms)}`, note);
    sound.play("finished");
  }
}

/** Show the cover with a message, and the Start button if `ready`. */
function card(/** @type {string} */ kind, /** @type {string} */ text, /** @type {string} */ detail, ready = false) {
  const cover = $("cover");
  cover.className = kind;
  cover.hidden = false;
  $("message").textContent = text;
  $("detail").textContent = detail;
  $("start").hidden = !ready;
  $("keys").hidden = !ready;
  const box = $("card");
  box.style.animation = "none";
  void box.offsetWidth; // restart the drop-in animation
  box.style.animation = "";
}

function start() {
  sound.wake();
  if (phase === "ready") send({ t: "start" });
}

const seconds = (/** @type {number} */ ms) => (ms / 1000).toFixed(1) + " s";

// --- input -----------------------------------------------------------------------------------

/** A command, relative to where the player faces: F, B, L, R, or S to stop and look at the map. */
function steer(/** @type {string} */ c) {
  if (phase !== "play" || !self) return;
  if (c === "S") {
    if (mapOpen) {
      mapOpen = false;
      command(self, "F");
    } else {
      mapOpen = true;
      command(self, "S");
    }
  } else {
    mapOpen = false;
    command(self, c);
  }
  if (!mapOpen) $("hint").style.opacity = "0";
}

const KEYS = { ArrowUp: "F", w: "F", ArrowRight: "R", d: "R", ArrowDown: "B", s: "B", ArrowLeft: "L", a: "L", " ": "S" };
addEventListener("keydown", (event) => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (phase === "ready" && (key === "Enter" || key === " ")) {
    event.preventDefault();
    start();
    return;
  }
  if (!(key in KEYS) || event.repeat) return;
  event.preventDefault();
  sound.wake();
  steer(/** @type {any} */ (KEYS)[key]);
});

// Swipes: up is forward, left and right turn and go, down turns around, and a tap stops and shows
// the map (or, with the map showing, goes on). A swipe counts as soon as it is long enough, so the
// finger can keep sliding without waiting to lift.
{
  const area = $("deep");
  /** @type {{ x: number, y: number, done: boolean } | null} */
  let touch = null;
  area.addEventListener("pointerdown", (event) => {
    sound.wake();
    touch = { x: event.clientX, y: event.clientY, done: false };
    area.setPointerCapture(event.pointerId);
  });
  area.addEventListener("pointermove", (event) => {
    if (!touch || touch.done) return;
    const dx = event.clientX - touch.x, dy = event.clientY - touch.y;
    if (Math.hypot(dx, dy) < 24) return;
    touch.done = true;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "R" : "L") : (dy > 0 ? "B" : "F"));
  });
  area.addEventListener("pointerup", () => {
    if (touch && !touch.done) steer("S");
    touch = null;
  });
  area.addEventListener("pointercancel", () => { touch = null; });
}

let muted = false;
try { muted = localStorage.getItem("maze3d-muted") === "1"; } catch { /* fine */ }
sound.mute(muted);
const muteButton = $("mute");
muteButton.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
muteButton.addEventListener("pointerdown", (event) => event.stopPropagation());
muteButton.addEventListener("click", () => {
  muted = !muted;
  sound.mute(muted);
  muteButton.textContent = muted ? "\u{1F507}" : "\u{1F50A}";
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
  const ms = clockAt.ms === null ? null : clockAt.ms + (phase === "play" ? now - clockAt.when : 0);
  $("clock").textContent = ms === null ? "" : seconds(ms);
  $("overview").hidden = !(mapOpen && phase === "play");
  if (self && maze) {
    if (phase === "play") advance(self, dt);
    // Turn the view smoothly towards the heading, the short way round, and swoop up or down.
    const target = -self.h * Math.PI / 2;
    let diff = (target - yaw) % (2 * Math.PI);
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    yaw += diff * Math.min(1, dt * 14);
    lift = Math.max(0, Math.min(1, lift + (mapOpen || phase === "ready" ? dt * 2.5 : -dt * 2.5)));
    const others = seen();
    const it = phase === "play" && others ? others.monster : null;
    const bob = self.moving ? Math.sin(now / 95) * 0.04 * (1 - lift) : 0;
    view.draw({ x: self.x, y: self.y, yaw, bob, lift }, it ? { ...it, h: 0 } : null, others?.players ?? []);
    if (mapOpen && phase === "play") drawMap(mapCanvas, maze, { ...self, yaw }, it, others?.players ?? []);
    sound.update({ x: self.x, y: self.y, yaw }, it);
    const at = `${self.x.toFixed(3)},${self.y.toFixed(3)},${self.h}`;
    if (phase === "play" && at !== sentAt && now - lastSent > 66) {
      send({ t: "at", x: +self.x.toFixed(3), y: +self.y.toFixed(3), h: self.h });
      sentAt = at;
      lastSent = now;
    }
  }
  requestAnimationFrame(frame);
}

$("start").addEventListener("click", start);
connect();
requestAnimationFrame(frame);
