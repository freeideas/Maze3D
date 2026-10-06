// How a player moves in the 3D maze. The browser runs this for its own player, so turning feels
// instant; the server checks every position it reports (server/maze3d_server/game.py).
//
// Positions are in cells: the middle of cell (column c, row r) is (c + 0.5, r + 0.5). A player only
// ever moves along the lines joining the middles of open neighbouring cells. Headings are 0 up,
// 1 right, 2 down, 3 left. Every command is relative to the way the player faces:
//   F  go forward             L / R  turn left / right and go that way
//   B  turn around and go     S      stop at the next cell middle
// A turn asked for between junctions waits for the next cell where that way is open, as in arcade
// maze games; one asked for just after passing a junction still takes it.

export const SPEED = 3.0; // cells per second, as PLAYER_SPEED on the server
const SIDES = [1, 2, 4, 8]; // the open-side bit for each heading (maze.py: UP, RIGHT, DOWN, LEFT)
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const LATE_TURN = 0.3; // how far past a junction a turn still takes it

/** @typedef {{ size: number, open: number[] }} Maze */
/** @typedef {{ maze: Maze, x: number, y: number, h: number, moving: boolean, queued: number | null, stopping: boolean }} Walker */

/** @param {Maze} maze @param {number} x @param {number} y @param {number} h @returns {Walker} */
export function walker(maze, x, y, h) {
  return { maze, x, y, h, moving: false, queued: null, stopping: false };
}

const cellAt = (/** @type {Walker} */ w, /** @type {number} */ x, /** @type {number} */ y) => Math.floor(y) * w.maze.size + Math.floor(x);
const isOpen = (/** @type {Walker} */ w, /** @type {number} */ cell, /** @type {number} */ h) => (w.maze.open[cell] & SIDES[h]) !== 0;

/** The next cell middle ahead along the heading, as the coordinate on the axis of travel. */
function nextMiddle(/** @type {number} */ a, /** @type {number} */ s) {
  return s > 0 ? Math.floor(a - 0.5 + 1e-9) + 1.5 : Math.ceil(a - 0.5 - 1e-9) - 0.5;
}

/** Apply a command. @param {Walker} w @param {string} c */
export function command(w, c) {
  if (c === "S") {
    if (w.moving) w.stopping = true;
    return;
  }
  w.stopping = false;
  const here = cellAt(w, w.x, w.y);
  if (c === "F") {
    if (!w.moving && isOpen(w, here, w.h)) w.moving = true;
    return;
  }
  if (c === "B") {
    w.h = (w.h + 2) % 4;
    w.queued = null;
    const atMiddle = !w.moving || (w.x % 1 === 0.5 && w.y % 1 === 0.5);
    w.moving = atMiddle ? isOpen(w, here, w.h) : true;
    return;
  }
  const turned = (w.h + (c === "R" ? 1 : 3)) % 4;
  if (!w.moving) {
    w.h = turned; // turn to face that way even if it is a wall
    w.moving = isOpen(w, here, w.h);
    return;
  }
  // Just past a junction where that way is open: go back to its middle and take it.
  const [dx, dy] = DIRS[w.h];
  const s = dx || dy;
  const a = dx ? w.x : w.y;
  const prev = nextMiddle(a, s) - s;
  const px = dx ? prev : w.x, py = dy ? prev : w.y;
  if (Math.abs(a - prev) < LATE_TURN && isOpen(w, cellAt(w, px, py), turned)) {
    w.x = px;
    w.y = py;
    w.h = turned;
    w.queued = null;
    return;
  }
  w.queued = turned;
}

/** Move for `dt` seconds. @param {Walker} w @param {number} dt */
export function advance(w, dt) {
  let left = SPEED * dt;
  while (w.moving && left > 0) {
    const [dx, dy] = DIRS[w.h];
    const s = dx || dy;
    const a = dx ? w.x : w.y;
    const next = nextMiddle(a, s);
    const gap = Math.abs(next - a);
    if (gap > left) {
      if (dx) w.x += s * left;
      else w.y += s * left;
      return;
    }
    if (dx) w.x = next;
    else w.y = next;
    left -= gap;
    const cell = cellAt(w, w.x, w.y);
    if (w.stopping) {
      w.moving = w.stopping = false;
      w.queued = null;
    } else {
      if (w.queued !== null && isOpen(w, cell, w.queued)) {
        w.h = w.queued;
        w.queued = null;
      }
      if (!isOpen(w, cell, w.h)) {
        w.moving = false;
        w.queued = null;
      }
    }
  }
}
