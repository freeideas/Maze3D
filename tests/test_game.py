from maze3d_server.game import (CATCH_DISTANCE, FALL_SECONDS, MONSTER_SPEED, Game, middle, on_track)
from maze3d_server.maze import MOVES, step


def two_moves(maze):
    """Two moves that each go somewhere, from the 2D start."""
    for a in MOVES:
        if step(maze, 0, a) != 0:
            for b in MOVES:
                if step(maze, step(maze, 0, a), b) != step(maze, 0, a):
                    return a, b


def new_game():
    game = Game()
    inbox = []
    player = game.join("p1", "0" * 32, inbox.append, now=0.0)
    return game, player, inbox


def fall(game, player, now=0.0):
    a, b = two_moves(game.rooms[player.level].maze2d)
    game.move2d(player, a, now)
    assert player.phase == "2d" and player.started == now
    game.move2d(player, b, now + 0.1)
    assert player.phase == "falling"
    game.tick(now + 0.1 + FALL_SECONDS, 0.05)
    assert player.phase == "3d"


def test_two_moves_then_trap_door_then_same_start():
    game, player, inbox = new_game()
    assert [m["t"] for m in inbox] == ["hello", "level", "phase"]
    game.move2d(player, "U", 0)  # into the top wall: not a move
    assert player.moves2d == 0 and player.started is None
    fall(game, player)
    maze = game.rooms[1].maze3d
    assert (player.x, player.y) == middle(maze, maze.start)


def test_reports_through_walls_or_too_fast_are_refused():
    game, player, inbox = new_game()
    fall(game, player)
    maze = game.rooms[1].maze3d
    sx, sy = player.x, player.y
    blocked = [h for h, side in enumerate((1, 2, 4, 8)) if not maze.open[0] & side and h in (1, 2)]
    for h in blocked:  # through a wall of the start cell
        dx, dy = ((0, -1), (1, 0), (0, 1), (-1, 0))[h]
        game.report(player, sx + dx * 0.3, sy + dy * 0.3, h, 1.0)
        assert inbox[-1]["t"] == "snap" and (player.x, player.y) == (sx, sy)
    h = player.heading
    dx, dy = ((0, -1), (1, 0), (0, 1), (-1, 0))[h]
    game.report(player, sx + dx * 0.9, sy + dy * 0.9, h, player.reported + 0.01)  # far too fast
    assert inbox[-1]["t"] == "snap"
    game.report(player, sx + dx * 0.3, sy + dy * 0.3, h, player.reported + 0.2)
    assert (player.x, player.y) == (sx + dx * 0.3, sy + dy * 0.3)
    assert not on_track(maze, sx + 0.3, sy + 0.3)


def test_monster_starts_at_goal_chases_and_catching_restarts_everything():
    game, player, inbox = new_game()
    room = game.rooms[1]
    maze = room.maze3d
    assert (room.monster.x, room.monster.y) == middle(maze, maze.exit)
    fall(game, player)
    t = 10.0
    start_distance = abs(player.x - room.monster.x) + abs(player.y - room.monster.y)
    for _ in range(2000):  # the player stands still; the monster comes for them
        t += 0.05
        game.tick(t, 0.05)
        if player.phase != "3d":
            break
    assert player.phase == "caught"
    assert (room.monster.x, room.monster.y) == middle(maze, maze.exit)
    game.tick(t + 5, 0.05)
    assert player.phase == "2d" and player.cell2d == 0 and player.started is None


def test_reaching_the_goal_records_a_time_and_moves_up():
    game, player, inbox = new_game()
    fall(game, player, now=0.0)
    maze = game.rooms[1].maze3d
    gx, gy = middle(maze, maze.exit)
    player.x, player.y = gx, gy  # as if it had walked there
    game.rooms[1].monster.x = -10  # out of the way
    game.report(player, gx, gy, 1, 30.0)
    assert player.phase == "finished" and game.store.best["1"]["ms"] == 30000
    game.tick(40.0, 0.05)
    assert player.level == 2 and player.phase == "2d" and 1 not in game.rooms
    assert game.store.progress["0" * 32]["reached"] == 2
