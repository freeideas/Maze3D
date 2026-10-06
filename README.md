# Monster Maze

A fast maze game for several players at once, at **<https://maze3d.endlessmind.com/>**.

It starts out looking just like [Endless Maze](https://maze.endlessmind.com/), a flat maze seen from above. Two moves in, the floor gives way: "You just fell through a trap door!" Now you are inside a 3D maze, seen through your own eyes, with other players and a monster. Reach the glowing square to go up a level. If the monster touches you, you start the level over, flat maze and all, with the clock back at zero.

- **Other players** share your level's maze. You can run right through each other.
- **The monster** starts at the goal and comes for the nearest player. It sees through walls, but it is not clever, and you are a little faster than it is. No one can pass it.
- **Sound tells you where it is.** In headphones you hear it on the left or the right, and muffled when it is behind you. A heartbeat speeds up as it gets close.
- **Best times** for every level are on the welcome page.

## Controls

On a computer: arrow keys or W A S D. On a phone: swipe anywhere. In the flat maze, directions are on the screen. Inside the 3D maze they are your own: up is always straight ahead, left and right turn you that way and keep going, and down turns you around. Tap or press space to stop.

## How it is made

One Python program runs the whole game, forever: it serves the pages and keeps a two-way connection (a WebSocket) to every player. It moves the monster, decides who it catches, and times every run. Each browser moves its own player, so turning feels instant, and the server checks every move against the walls and the top speed.

```text
app/
  welcome/     what the game is, Play, best times
  play/        the game: the flat start, the 3D maze (three.js), sound, controls
  vendor/      three.js, pinned (vendor/README.md)
server/maze3d_server/
  maze.py      the mazes: Endless Maze's, line for line, and the 3D ones
  game.py      the rules: levels, the trap door, the monster, catching, finishing
  app.py       serving the pages, /api/summary, /ws, the clock that runs the game
specs/         the rules, the messages between browser and server, deployment
tests/         pytest for the server, Deno for the movement code
deploy/        the systemd unit and the Caddy block
```

Start with [specs/game.md](specs/game.md), then [specs/protocol.md](specs/protocol.md). Deployment is in [specs/deployment.md](specs/deployment.md).

## Development

```sh
uv run maze3d-server          # http://localhost:8770/  (PORT, HOST and DATA_ROOT change it)
uv run pytest                 # the server
deno test tests/motion_test.js   # how players move
```

`data/` (gitignored) keeps each guest's highest level and the best time on each level.

## Not done yet

- Signing in with Endless Mind, so progress and records follow a player anywhere. The Python realm library it needs is in EveryGame's `realm-py/`.
- Choosing an earlier level to play again, and changing your name.
