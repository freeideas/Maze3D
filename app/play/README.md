# play/

The game itself. The rules are in [../../specs/game.md](../../specs/game.md) and the messages in [../../specs/protocol.md](../../specs/protocol.md).

| File          | What it does                                                                         |
| ------------- | ------------------------------------------------------------------------------------ |
| `index.html`  | The 3D view, the map with its legend, and the Start and message screen               |
| `play.css`    | Styles; the map uses Endless Maze's colours                                          |
| `play.js`     | The connection, the phases, keys and swipes, the clock, the swoop, every frame       |
| `map.js`      | The map: Endless Maze's look, you as an arrow, others, the monster, the goal star    |
| `motion.js`   | How the player moves in the 3D maze; tested by `tests/motion_test.js`                |
| `view3d.js`   | The 3D maze, the goal star, the monster and other players, with three.js             |
| `sound.js`    | Every sound, made with Web Audio: breathing, growls and roars placed in 3D           |
