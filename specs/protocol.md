# Browser and server

The play page and the server talk over one WebSocket at `/ws` (relative to the site's root), in JSON messages that each have a type `t`. Positions are in cells: the middle of cell (column c, row r) is (c + 0.5, r + 0.5). Headings are 0 up, 1 right, 2 down, 3 left. A maze is `{level, size, open, start, exit}`, where `open[cell]` has bits 1 up, 2 right, 4 down, 8 left for its open sides, and cells are numbered row by row.

## From the browser

| Message                       | When                                                                        |
| ----------------------------- | --------------------------------------------------------------------------- |
| `{t: "hello", guest}`         | First. `guest` is the stored guest ID (32 hex digits), or null for a new one |
| `{t: "start"}`                | Start pressed                                                               |
| `{t: "at", x, y, h}`          | Where the player is, up to 15 times a second when it changes                |

## From the server

| Message                                       | Meaning                                                           |
| --------------------------------------------- | ----------------------------------------------------------------- |
| `{t: "hello", id, guest, name}`               | This connection's ID, the guest ID to store, the name shown       |
| `{t: "level", level, maze, best}`             | Now on this level; `best` is `{ms, name}` or null                 |
| `{t: "phase", phase: "ready"}`                | At the Start screen, clock at zero                                |
| `{t: "phase", phase: "play", x, y, h}`        | Started: standing here, clock running, monster hunting            |
| `{t: "phase", phase: "caught", seconds}`      | The monster got them; then `ready` again                          |
| `{t: "phase", phase: "finished", ms, record, best, seconds}` | Reached the goal; then `level` for the next one    |
| `{t: "state", clock, players, monster, here}` | 20 times a second; see below                              |
| `{t: "snap", x, y, h}`                        | The last `at` was impossible; the player is back here             |

A `state` message has the clock in ms (null before Start), the players who have started as `[{id, name, x, y, h}]`, the monster as `{x, y}`, and `here`, how many people are on the level.

## Checking moves

The browser moves its own player (`app/play/motion.js`), so it responds at once. The server accepts an `at` only if:

- the point lies on the line between the middles of two open neighbouring cells (within 0.02 cells), and
- the distance from the last accepted point is within what the top speed allows. The allowance builds up at 1.25 times the top speed, so a delayed message can catch up, and saves at most 2 cells. And
- the new cell can be reached from the old one through open sides in that many steps.

Otherwise the server sends `snap`. The clock, catching and finishing are decided only by the server.

Other players and the monster are drawn 100 ms in the past, sliding between the two `state` messages around that moment, so they move smoothly.

## HTTP

- `GET /api/summary`: `{best: [{level, ms, name}], playing: {level: count}}`, for the welcome page.
- Everything else is a file from `app/`: a directory serves its `index.html` (a request without the final slash is redirected to it), and `README.md` files are never served.
