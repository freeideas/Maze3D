"""The rules of Monster Maze, kept free of networking so tests can drive them with a made-up clock.

Every level is a room: everyone on level 7 shares level 7's maze and its one monster. An attempt
starts when the player presses Start: the clock starts, they stand at the start cell with everyone
else, and the monster can see them. The monster starts at the goal. If it touches a player, that
player is back at the Start screen with the clock at zero, and the monster goes back to the goal.
Reaching the goal finishes the level and moves the player up one.

Positions are in cells: the middle of cell (column c, row r) is (c + 0.5, r + 0.5). Players and the
monster only ever move along the lines joining the middles of open neighbouring cells. Headings are
0 up, 1 right, 2 down, 3 left.

The browser moves its own player and reports where it is (so turning feels instant); the server
checks every report against the walls and the top speed, and puts a player back if it is impossible.
The server alone moves the monster, decides who it catches, and times every run.
"""

import hashlib
import math
from collections import deque
from dataclasses import dataclass, field
from typing import Callable

from .maze import DOWN, LEFT, MOVES, RIGHT, UP, Maze, make_maze, step

PLAYER_SPEED = 3.0  # cells per second
MONSTER_SPEED = 2.7  # a little slower than players
CATCH_DISTANCE = 0.55  # the monster touches a player when their middles are this close
GOAL_DISTANCE = 0.3
CAUGHT_SECONDS = 2.0
FINISHED_SECONDS = 3.0
MONSTER_REST = 1.5  # after going back to the goal, the monster waits this long
TRACK_SLACK = 0.02  # how far off the line between cell middles a report may be
SPEED_SLACK = 1.25  # reports may run this much faster than the top speed, for network jitter
MAX_BUDGET = 2.0  # cells of movement a player may save up while reports are delayed

SIDES = [UP, RIGHT, DOWN, LEFT]  # by heading
DIRECTIONS = [(0, -1), (1, 0), (0, 1), (-1, 0)]  # by heading


def middle(maze: Maze, cell: int) -> tuple[float, float]:
    return cell % maze.size + 0.5, cell // maze.size + 0.5


def cell_at(maze: Maze, x: float, y: float) -> int:
    return int(y) * maze.size + int(x)


def on_track(maze: Maze, x: float, y: float) -> bool:
    """True if (x, y) is on a line between the middles of two open neighbouring cells."""
    n = maze.size
    if not (0 <= x < n and 0 <= y < n):
        return False
    cell = cell_at(maze, x, y)
    fx, fy = x - (int(x) + 0.5), y - (int(y) + 0.5)
    off_x, off_y = abs(fx) > TRACK_SLACK, abs(fy) > TRACK_SLACK
    if off_x and off_y:
        return False
    if off_x:
        return bool(maze.open[cell] & (RIGHT if fx > 0 else LEFT))
    if off_y:
        return bool(maze.open[cell] & (DOWN if fy > 0 else UP))
    return True


def steps_between(maze: Maze, a: int, b: int, limit: int) -> int | None:
    """The fewest moves from cell a to cell b, or None if it takes more than `limit`."""
    if a == b:
        return 0
    seen, queue = {a: 0}, deque([a])
    while queue:
        cell = queue.popleft()
        if seen[cell] >= limit:
            continue
        for letter in MOVES:
            to = step(maze, cell, letter)
            if to not in seen:
                seen[to] = seen[cell] + 1
                if to == b:
                    return seen[to]
                queue.append(to)
    return None


ADJECTIVES = """Brave Quick Quiet Lucky Clever Sunny Misty Rusty Swift Jolly Bold Calm Witty Nimble Breezy Plucky
Silver Golden Amber Velvet Cosmic Frosty Mellow Zippy Dusky Merry Daring Gentle Spry Hasty""".split()
NOUNS = """Otter Comet Pebble Falcon Willow Cricket Maple Badger Ember Heron Thistle Marble Sparrow Juniper
Lantern Pickle Rocket Fennel Walrus Biscuit Nutmeg Puffin Clover Acorn Gecko Kettle Minnow Quokka Tulip Yeti""".split()


def guest_name(guest: str) -> str:
    """A friendly name that stays the same for a guest ID."""
    digest = hashlib.sha256(guest.encode()).digest()
    return f"{ADJECTIVES[digest[0] % len(ADJECTIVES)]} {NOUNS[digest[1] % len(NOUNS)]}"


@dataclass
class Player:
    id: str  # this connection, shown to other players' browsers
    guest: str  # the browser's lasting guest ID, which progress belongs to
    name: str
    send: Callable[[dict], None]
    level: int = 1
    phase: str = "ready"  # ready (the Start screen), play, caught or finished
    phase_until: float = 0.0
    started: float | None = None  # when this attempt's clock started: pressing Start
    x: float = 0.5
    y: float = 0.5
    heading: int = 1
    budget: float = 0.0
    reported: float = 0.0


@dataclass
class Monster:
    x: float
    y: float
    cell: int
    heading: int | None = None
    target: int | None = None  # the cell it is walking to
    rest_until: float = 0.0


@dataclass
class Room:
    level: int
    maze: Maze
    monster: Monster
    players: dict[str, Player] = field(default_factory=dict)

    def monster_home(self, now: float) -> None:
        x, y = middle(self.maze, self.maze.exit)
        self.monster = Monster(x, y, self.maze.exit, rest_until=now + MONSTER_REST)


class Store:
    """What lasts between runs of the server: each guest's highest level, and the best time on each level."""

    def __init__(self) -> None:
        self.progress: dict[str, dict] = {}
        self.best: dict[str, dict] = {}

    def saved(self) -> None:
        """Called after a change; app.py replaces this with writing the files."""


class Game:
    def __init__(self, store: Store | None = None) -> None:
        self.store = store or Store()
        self.rooms: dict[int, Room] = {}
        self.players: dict[str, Player] = {}

    # --- joining and leaving -------------------------------------------------------------------

    def room(self, level: int) -> Room:
        if level not in self.rooms:
            maze = make_maze(level)
            x, y = middle(maze, maze.exit)
            self.rooms[level] = Room(level, maze, Monster(x, y, maze.exit))
        return self.rooms[level]

    def join(self, id: str, guest: str, send: Callable[[dict], None], now: float) -> Player:
        mine = self.store.progress.get(guest, {})
        player = Player(id, guest, mine.get("name") or guest_name(guest), send)
        self.players[id] = player
        send({"t": "hello", "id": id, "guest": guest, "name": player.name})
        self.enter(player, mine.get("reached", 1), now)
        return player

    def leave(self, player: Player) -> None:
        self.players.pop(player.id, None)
        room = self.rooms.get(player.level)
        if room:
            room.players.pop(player.id, None)
            if not room.players:
                del self.rooms[player.level]

    def enter(self, player: Player, level: int, now: float) -> None:
        old = self.rooms.get(player.level)
        if old:
            old.players.pop(player.id, None)
            if not old.players and old.level != level:
                del self.rooms[old.level]
        player.level = level
        room = self.room(level)
        room.players[player.id] = player
        best = self.store.best.get(str(level))
        player.send({"t": "level", "level": level, "maze": room.maze.to_json(), "best": best})
        self.restart(player)

    def restart(self, player: Player) -> None:
        """Back to the Start screen, with the clock at zero."""
        player.phase, player.started = "ready", None
        player.send({"t": "phase", "phase": "ready"})

    # --- what players do -----------------------------------------------------------------------

    def start(self, player: Player, now: float) -> None:
        """Start pressed: the clock starts, and everyone starts on the same cell, facing an open way."""
        if player.phase != "ready":
            return
        maze = self.rooms[player.level].maze
        player.phase, player.started = "play", now
        player.x, player.y = middle(maze, maze.start)
        player.heading = next(h for h in (1, 2, 0, 3) if maze.open[maze.start] & SIDES[h])
        player.budget, player.reported = 0.5, now
        player.send({"t": "phase", "phase": "play", "x": player.x, "y": player.y, "h": player.heading})

    def report(self, player: Player, x: float, y: float, heading: int, now: float) -> None:
        """A browser says where its player is now; accept it, or put the player back where they were."""
        if player.phase != "play":
            return
        maze = self.rooms[player.level].maze
        player.budget = min(MAX_BUDGET, player.budget + PLAYER_SPEED * SPEED_SLACK * (now - player.reported))
        player.reported = now
        distance = abs(x - player.x) + abs(y - player.y)
        ok = (
            heading in (0, 1, 2, 3)
            and on_track(maze, x, y)
            and distance <= player.budget + 0.05
            and steps_between(maze, cell_at(maze, player.x, player.y), cell_at(maze, x, y), math.ceil(distance) + 1)
            is not None
        )
        if not ok:
            player.send({"t": "snap", "x": player.x, "y": player.y, "h": player.heading})
            return
        player.budget -= distance
        player.x, player.y, player.heading = x, y, heading
        gx, gy = middle(maze, maze.exit)
        if math.hypot(x - gx, y - gy) < GOAL_DISTANCE:
            self.finish(player, now)

    def finish(self, player: Player, now: float) -> None:
        ms = round((now - player.started) * 1000) if player.started is not None else 0
        key = str(player.level)
        best = self.store.best.get(key)
        record = best is None or ms < best["ms"]
        if record:
            self.store.best[key] = {"ms": ms, "name": player.name}
        mine = self.store.progress.setdefault(player.guest, {})
        mine["reached"] = max(mine.get("reached", 1), player.level + 1)
        mine.setdefault("best", {})
        if key not in mine["best"] or ms < mine["best"][key]:
            mine["best"][key] = ms
        self.store.saved()
        player.phase, player.phase_until = "finished", now + FINISHED_SECONDS
        player.send({"t": "phase", "phase": "finished", "ms": ms, "record": record, "best": self.store.best[key],
                     "seconds": FINISHED_SECONDS})

    # --- time passing --------------------------------------------------------------------------

    def tick(self, now: float, dt: float) -> None:
        for player in list(self.players.values()):
            if player.phase in ("caught", "finished") and now >= player.phase_until:
                if player.phase == "caught":
                    self.restart(player)
                else:
                    self.enter(player, player.level + 1, now)
        for room in list(self.rooms.values()):
            self.move_monster(room, now, dt)
            m = room.monster
            for player in list(room.players.values()):
                if player.phase == "play" and math.hypot(player.x - m.x, player.y - m.y) < CATCH_DISTANCE:
                    player.phase, player.phase_until = "caught", now + CAUGHT_SECONDS
                    player.send({"t": "phase", "phase": "caught", "seconds": CAUGHT_SECONDS})
                    room.monster_home(now)
                    m = room.monster

    def move_monster(self, room: Room, now: float, dt: float) -> None:
        """The monster sees through walls and heads for the nearest player, but it is not smart: at
        every cell it takes whichever open way leads closest to that player in a straight line, and it
        never turns back unless it is in a dead end."""
        maze, m = room.maze, room.monster
        prey = [p for p in room.players.values() if p.phase == "play"]
        if not prey:
            if m.cell != maze.exit or m.target is not None:
                room.monster_home(now)
            return
        if now < m.rest_until:
            return
        left = MONSTER_SPEED * dt
        while left > 0:
            if m.target is None:
                m.target, m.heading = self.choose(maze, m, prey)
            tx, ty = middle(maze, m.target)
            gap = abs(tx - m.x) + abs(ty - m.y)
            if gap > left:
                dx, dy = DIRECTIONS[m.heading]
                m.x, m.y = m.x + dx * left, m.y + dy * left
                return
            m.x, m.y, m.cell, m.target = tx, ty, m.target, None
            left -= gap

    @staticmethod
    def choose(maze: Maze, m: Monster, prey: list[Player]) -> tuple[int, int]:
        near = min(prey, key=lambda p: math.hypot(p.x - m.x, p.y - m.y))
        ways = [h for h in range(4) if maze.open[m.cell] & SIDES[h]]
        if m.heading is not None and len(ways) > 1:
            ways = [h for h in ways if h != (m.heading + 2) % 4]

        def closeness(h: int) -> float:
            dx, dy = DIRECTIONS[h]
            return math.hypot(m.x + dx - near.x, m.y + dy - near.y)

        h = min(ways, key=closeness)
        dx, dy = DIRECTIONS[h]
        return m.cell + dy * maze.size + dx, h

    # --- what everyone sees --------------------------------------------------------------------

    def broadcast(self, now: float) -> None:
        for room in self.rooms.values():
            seen = [{"id": p.id, "name": p.name, "x": round(p.x, 3), "y": round(p.y, 3), "h": p.heading}
                    for p in room.players.values() if p.phase == "play"]
            m = room.monster
            for player in room.players.values():
                clock = None if player.started is None or player.phase == "finished" else round((now - player.started) * 1000)
                player.send({"t": "state", "clock": clock, "players": seen, "monster": {"x": round(m.x, 3), "y": round(m.y, 3)},
                             "here": len(room.players)})

    def summary(self) -> dict:
        """For the welcome page: best times by level, and how many people are on each level now."""
        levels = sorted(self.store.best, key=int)
        return {
            "best": [{"level": int(k), **self.store.best[k]} for k in levels],
            "playing": {str(r.level): len(r.players) for r in self.rooms.values()},
        }
