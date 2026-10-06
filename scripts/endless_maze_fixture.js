// Writes tests/fixtures/endless_maze.json: Endless Maze's mazes for levels 1 to 20, made by the real
// maze.js, so tests/test_maze.py can check the Python port makes the same ones.
//   deno run --allow-read --allow-write scripts/endless_maze_fixture.js [path to EveryGame]
const repo = Deno.args[0] ?? new URL("../../EveryGame/", import.meta.url).pathname;
const { makeMaze } = await import(`file://${repo}/examples/maze/maze.js`);
const levels = {};
for (let level = 1; level <= 20; level++) levels[level] = Array.from(makeMaze(level).open);
await Deno.writeTextFile(new URL("../tests/fixtures/endless_maze.json", import.meta.url), JSON.stringify(levels) + "\n");
