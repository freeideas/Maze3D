// Checks how players move (app/play/motion.js), on a tiny hand-made maze.  deno test tests/motion_test.js
import { advance, command, walker } from "../app/play/motion.js";

// A 3 by 1 corridor with a branch down from the middle: cells 0 1 2 in a row, cell 4 below 1 (size 3).
const maze = { size: 3, open: [2, 2 | 8 | 4, 8, 0, 1, 0, 0, 0, 0] };
const eq = (a, b, what) => { if (Math.abs(a - b) > 1e-9) throw new Error(`${what}: ${a} != ${b}`); };

Deno.test("runs to the wall and stops at the last middle", () => {
  const w = walker(maze, 0.5, 0.5, 1);
  command(w, "F");
  for (let i = 0; i < 100; i++) advance(w, 0.05);
  eq(w.x, 2.5, "x");
  if (w.moving) throw new Error("still moving");
});

Deno.test("a right turn asked early waits for the junction", () => {
  const w = walker(maze, 0.5, 0.5, 1);
  command(w, "F");
  advance(w, 0.1);
  command(w, "R"); // right of heading 1 is down: open only at cell 1
  for (let i = 0; i < 100; i++) advance(w, 0.05);
  eq(w.x, 1.5, "x");
  eq(w.y, 1.5, "y");
  eq(w.h, 2, "heading");
});

Deno.test("a right turn just after the junction still takes it", () => {
  const w = walker(maze, 0.5, 0.5, 1);
  command(w, "F");
  advance(w, 1.1 / 3); // 0.1 past cell 1's middle
  command(w, "R");
  eq(w.x, 1.5, "snapped back");
  for (let i = 0; i < 100; i++) advance(w, 0.05);
  eq(w.y, 1.5, "y");
});

Deno.test("turning to face a wall while stopped does not move", () => {
  const w = walker(maze, 0.5, 0.5, 1);
  command(w, "L");
  eq(w.h, 0, "heading");
  if (w.moving) throw new Error("moved into a wall");
  command(w, "B");
  eq(w.h, 2, "heading");
});
