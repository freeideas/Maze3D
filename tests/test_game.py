from maze3d_server.game import Game, middle, on_track


def new_game():
    game = Game()
    inbox = []
    player = game.join("p1", "0" * 32, inbox.append, now=0.0)
    return game, player, inbox


def fall(game, player, now=0.0):
    """Press Start."""
    game.start(player, now)
    assert player.phase == "play" and player.started == now


def test_start_puts_everyone_on_the_same_cell_and_starts_the_clock():
    game, player, inbox = new_game()
    assert [m["t"] for m in inbox] == ["hello", "level", "phase"] and inbox[-1]["phase"] == "ready"
    other = game.join("p2", "1" * 32, [].append, now=0.0)
    fall(game, player, now=1.0)
    game.start(other, 2.0)
    maze = game.rooms[1].maze
    assert (player.x, player.y) == (other.x, other.y) == middle(maze, maze.start)
    assert inbox[-1]["phase"] == "play"


def test_reports_through_walls_or_too_fast_are_refused():
    game, player, inbox = new_game()
    fall(game, player)
    maze = game.rooms[1].maze
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
    maze = room.maze
    assert (room.monster.x, room.monster.y) == middle(maze, maze.exit)
    fall(game, player)
    t = 10.0
    start_distance = abs(player.x - room.monster.x) + abs(player.y - room.monster.y)
    for _ in range(2000):  # the player stands still; the monster comes for them
        t += 0.05
        game.tick(t, 0.05)
        if player.phase != "play":
            break
    assert player.phase == "caught"
    assert (room.monster.x, room.monster.y) == middle(maze, maze.exit)
    game.tick(t + 5, 0.05)
    assert player.phase == "ready" and player.started is None


def test_reaching_the_goal_records_a_time_and_moves_up():
    game, player, inbox = new_game()
    fall(game, player, now=0.0)
    maze = game.rooms[1].maze
    gx, gy = middle(maze, maze.exit)
    player.x, player.y = gx, gy  # as if it had walked there
    game.rooms[1].monster.x = -10  # out of the way
    game.report(player, gx, gy, 1, 30.0)
    assert player.phase == "finished" and game.store.best["1"]["ms"] == 30000
    game.tick(40.0, 0.05)
    assert player.level == 2 and player.phase == "ready" and 1 not in game.rooms
    assert game.store.progress["0" * 32]["reached"] == 2
