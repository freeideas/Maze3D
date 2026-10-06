# play/

The game itself. The rules are in [../../specs/game.md](../../specs/game.md) and the messages in [../../specs/protocol.md](../../specs/protocol.md).

| File          | What it does                                                                         |
| ------------- | ------------------------------------------------------------------------------------ |
| `index.html`  | The flat start (made to look like Endless Maze), the 3D view, and the message cover  |
| `play.css`    | Styles; the flat part copies Endless Maze's                                          |
| `play.js`     | The connection, the phases, keys and swipes, the clock, drawing every frame          |
| `motion.js`   | How the player moves in the 3D maze; tested by `tests/motion_test.js`                |
| `view3d.js`   | The 3D maze, the monster and other players, with three.js                            |
| `sound.js`    | Every sound, made with Web Audio: the monster placed in 3D, muffled from behind      |
