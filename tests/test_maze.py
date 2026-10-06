import json
from pathlib import Path

from maze3d_server.maze import DOWN, LEFT, MOVES, RIGHT, UP, make_maze, make_maze_3d, step


def test_same_mazes_as_endless_maze():
    """The 2D mazes match the ones Endless Maze's maze.js makes (scripts/endless_maze_fixture.js)."""
    expected = json.loads((Path(__file__).parent / "fixtures" / "endless_maze.json").read_text())
    for level, open_ in expected.items():
        assert make_maze(int(level)).open == open_, f"level {level}"


def reachable(maze):
    seen, todo = {maze.start}, [maze.start]
    while todo:
        cell = todo.pop()
        for letter in MOVES:
            to = step(maze, cell, letter)
            if to not in seen:
                seen.add(to)
                todo.append(to)
    return seen


def test_3d_mazes_are_whole_consistent_and_have_loops():
    for level in (1, 5, 30):
        maze = make_maze_3d(level)
        n = maze.size
        assert len(reachable(maze)) == n * n
        for cell, bits in enumerate(maze.open):
            x, y = cell % n, cell // n
            if bits & RIGHT:
                assert x < n - 1 and maze.open[cell + 1] & LEFT
            if bits & DOWN:
                assert y < n - 1 and maze.open[cell + n] & UP
        passages = sum(bin(b).count("1") for b in maze.open) // 2
        assert passages > n * n - 1  # more passages than a maze with no loops
        assert maze.open != make_maze(level).open[: n * n]
