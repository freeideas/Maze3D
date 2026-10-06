// The map: the whole maze from above, drawn the way Endless Maze draws its mazes, with you as an
// arrow pointing the way you face (up on the controls is where it points), other players as white
// dots, the monster as a pulsing red glow, and the goal as a yellow star.

const UP = 1, RIGHT = 2, DOWN = 4, LEFT = 8;

/** A star with five points, centred on (x, y). @param {CanvasRenderingContext2D} g */
export function star(g, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const d = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  g.closePath();
}

/** A soft round glow of `colour` (with alpha), fading out to radius r. @param {CanvasRenderingContext2D} g */
function glow(g, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ r, /** @type {string} */ colour) {
  const fade = g.createRadialGradient(x, y, 0, x, y, r);
  fade.addColorStop(0, colour);
  fade.addColorStop(1, colour.slice(0, 7) + "00");
  g.fillStyle = fade;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * Draw the map on `canvas`. Positions are in cells; `h` headings are 0 up, 1 right, 2 down, 3 left.
 * @param {HTMLCanvasElement} canvas
 * @param {{ size: number, open: number[], exit: number }} maze
 * @param {{ x: number, y: number, h: number }} me
 * @param {{ x: number, y: number } | null} monster
 * @param {{ name: string, x: number, y: number }[]} people
 */
export function drawMap(canvas, maze, me, monster, people) {
  const px = Math.round(canvas.clientWidth * Math.min(devicePixelRatio, 2));
  if (canvas.width !== px) canvas.width = canvas.height = px;
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
  const n = maze.size;
  const unit = px / n;
  const at = (/** @type {number} */ v) => v * unit;
  g.clearRect(0, 0, px, px);
  g.fillStyle = "#111b2b";
  g.fillRect(0, 0, px, px);

  // The goal: a glowing star.
  const gx = at(maze.exit % n + .5), gy = at(Math.floor(maze.exit / n) + .5);
  glow(g, gx, gy, unit * .8, "#ffd76a99");
  g.fillStyle = "#ffd76a";
  star(g, gx, gy, unit * .38);
  g.fill();

  g.strokeStyle = "#c9d8ee";
  g.lineWidth = Math.max(2, unit / 8);
  g.lineCap = "round";
  g.beginPath();
  for (let c = 0; c < n * n; c++) {
    const x = at(c % n), y = at(Math.floor(c / n));
    const open = maze.open[c];
    if (!(open & UP)) { g.moveTo(x, y); g.lineTo(x + unit, y); }
    if (!(open & LEFT)) { g.moveTo(x, y); g.lineTo(x, y + unit); }
    if (!(open & DOWN) && Math.floor(c / n) === n - 1) { g.moveTo(x, y + unit); g.lineTo(x + unit, y + unit); }
    if (!(open & RIGHT) && c % n === n - 1) { g.moveTo(x + unit, y); g.lineTo(x + unit, y + unit); }
  }
  g.stroke();

  // Other players: white dots with their names.
  g.font = `600 ${Math.max(11, unit * .32)}px system-ui, sans-serif`;
  g.textAlign = "center";
  for (const p of people) {
    g.fillStyle = "#f2f2f2";
    g.beginPath();
    g.arc(at(p.x), at(p.y), unit * .2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#f2f2f2cc";
    g.fillText(p.name, at(p.x), at(p.y) - unit * .32);
  }

  // The monster: a red dot with a pulsing glow.
  if (monster) {
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
    glow(g, at(monster.x), at(monster.y), unit * (0.7 + 0.3 * pulse), "#ff3b2fcc");
    g.fillStyle = "#ff3b2f";
    g.beginPath();
    g.arc(at(monster.x), at(monster.y), unit * .28, 0, Math.PI * 2);
    g.fill();
  }

  // You: a bright arrow pointing the way you face.
  glow(g, at(me.x), at(me.y), unit * .6, "#6ee7ff66");
  g.save();
  g.translate(at(me.x), at(me.y));
  g.rotate(me.h * Math.PI / 2);
  g.fillStyle = "#6ee7ff";
  g.beginPath();
  g.moveTo(0, -unit * .36);
  g.lineTo(unit * .28, unit * .3);
  g.lineTo(0, unit * .16);
  g.lineTo(-unit * .28, unit * .3);
  g.closePath();
  g.fill();
  g.restore();
}
