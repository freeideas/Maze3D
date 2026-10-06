from maze3d_server.maze import DOWN, LEFT, MOVES, RIGHT, UP, make_maze, step


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


def test_mazes_are_whole_consistent_have_loops_and_never_change():
    for level in (1, 5, 30):
        maze = make_maze(level)
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
        assert make_maze(level).open == maze.open
