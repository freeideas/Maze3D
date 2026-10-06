"""Mazes for Monster Maze.

`make_maze(level)` is a line-by-line port of Endless Maze's maze.js (EveryGame, examples/maze/):
the same level number makes exactly the same maze, so the 2D start of every level looks just like
that game. tests/test_maze.py checks it against mazes the JavaScript made.

`make_maze_3d(level)` makes the different, 3D maze a player falls into. It uses the same
"recursive backtracker" with another seed, then knocks down some extra walls so the maze has loops:
with only one path between any two places, a monster coming from the goal would always block the
only way there.
"""

from dataclasses import dataclass

UP, RIGHT, DOWN, LEFT = 1, 2, 4, 8

# The moves a player can make: letter -> (column change, row change, side opened, opposite side).
# The order matters: it is the order maze.js tries them in.
MOVES = {
    "U": (0, -1, UP, DOWN),
    "R": (1, 0, RIGHT, LEFT),
    "D": (0, 1, DOWN, UP),
    "L": (-1, 0, LEFT, RIGHT),
}

M32 = 0xFFFFFFFF


@dataclass
class Maze:
    """Cells are numbered row by row: cell = row * size + column. `open` holds each cell's open sides as bits."""

    level: int
    size: int
    open: list[int]
    start: int
    exit: int

    def to_json(self) -> dict:
        return {"level": self.level, "size": self.size, "open": self.open, "start": self.start, "exit": self.exit}


def maze_size(level: int) -> int:
    """How big a 2D level is: 6 by 6 at level 1, two more each level, up to 40 by 40 (as maze.js)."""
    return min(4 + 2 * level, 40)


def maze_size_3d(level: int) -> int:
    """How big a 3D level is: 7 by 7 at level 1, one more each level, up to 30 by 30."""
    return min(6 + level, 30)


def _imul(a: int, b: int) -> int:
    return (a * b) & M32


def random(seed: int):
    """maze.js's small random number source: the same numbers for the same seed, as floats in [0, 1)."""
    a = seed & M32

    def next_() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = a
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & M32
        return ((t ^ (t >> 14)) & M32) / 4294967296

    return next_


def _backtracker(size: int, next_) -> list[int]:
    open_ = [0] * (size * size)
    seen = [False] * (size * size)
    stack = [0]
    seen[0] = True
    while stack:
        cell = stack[-1]
        x, y = cell % size, cell // size
        choices = [
            m for m in MOVES.values()
            if 0 <= x + m[0] < size and 0 <= y + m[1] < size and not seen[(y + m[1]) * size + x + m[0]]
        ]
        if not choices:
            stack.pop()
            continue
        dx, dy, side, back = choices[int(next_() * len(choices))]
        to = (y + dy) * size + x + dx
        open_[cell] |= side
        open_[to] |= back
        seen[to] = True
        stack.append(to)
    return open_


def make_maze(level: int) -> Maze:
    """Endless Maze's maze for a level: start top left, exit bottom right."""
    size = maze_size(level)
    open_ = _backtracker(size, random(level * 7919 + 17))
    return Maze(level, size, open_, 0, size * size - 1)


LOOPS = 0.35  # the share of dead ends that get a wall knocked down


def make_maze_3d(level: int) -> Maze:
    """The 3D maze for a level: its own layout, with some loops. Start top left, goal bottom right."""
    size = maze_size_3d(level)
    next_ = random(level * 104729 + 3)
    open_ = _backtracker(size, next_)
    for cell in range(size * size):
        if bin(open_[cell]).count("1") != 1 or next_() >= LOOPS:
            continue
        x, y = cell % size, cell // size
        walls = [
            m for m in MOVES.values()
            if not open_[cell] & m[2] and 0 <= x + m[0] < size and 0 <= y + m[1] < size
        ]
        if walls:
            dx, dy, side, back = walls[int(next_() * len(walls))]
            open_[cell] |= side
            open_[(y + dy) * size + x + dx] |= back
    return Maze(level, size, open_, 0, size * size - 1)


def step(maze: Maze, cell: int, letter: str) -> int:
    """Where a move leads: the next cell, or the same cell if a wall is in the way."""
    move = MOVES.get(letter)
    if not move or not maze.open[cell] & move[2]:
        return cell
    return cell + move[1] * maze.size + move[0]
