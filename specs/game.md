# The game

What Monster Maze does, and why. The code that carries it out is `server/maze3d_server/game.py` (the rules), `maze.py` (the mazes) and `app/play/` (what the player sees, hears and does).

## A level

Each level has two mazes that have nothing to do with each other:

- **The flat maze** is Endless Maze's maze for the same level, made by the same method with the same numbers, so it looks exactly like that game (6 by 6 at level 1, two more each level). The page even calls itself "Endless Maze" at this point. The player starts top left.
- **The 3D maze** is made the same way with a different seed, one cell bigger each level (7 by 7 at level 1, up to 30 by 30). Then about a third of its dead ends get a wall knocked down, so it has loops. Without loops there is only one path to the goal, and since the monster starts at the goal it would always be standing on it.

An attempt goes:

1. The flat maze. The clock starts at the first move. A move into a wall does not count.
2. After the second move: a black screen, "You just fell through a trap door!", for 2.5 seconds.
3. The 3D maze. Every player lands on the same cell, top left. The goal, bottom right, glows like the square in the flat maze.
4. Reaching the goal finishes the level. The time is from the first flat move to the goal. The player moves up a level, which other players may or may not be on.

## The monster

There is one monster per level, shared by everyone on it.

- It starts at the goal. It only hunts players who are inside the 3D maze. When there are none, it goes back to the goal.
- It sees through walls: it always heads for the nearest player in a straight line. But it is not clever. At each cell it takes whichever open way leads closest to that player, and it never turns back unless it is in a dead end. Walls fool it, and loops let players lead it away.
- Players move 3 cells a second; the monster 2.7.
- When its middle comes within 0.55 cells of a player's, it has caught them. That player sees "The monster got you!" for 2 seconds, then starts the level over: flat maze, same start, clock at zero. The monster goes back to the goal and waits 1.5 seconds. That gives everyone else on the level a breather.
- Players pass through each other. No one passes through the monster, because touching it is being caught.

## Moving inside the 3D maze

Players move along the lines between cell middles, never diagonally, which keeps controls simple on a phone. Commands are relative to the way the player faces, as in real life:

| Command  | Keys                | Phone             | What it does                                    |
| -------- | ------------------- | ----------------- | ----------------------------------------------- |
| Forward  | Up arrow, W         | swipe up          | go forward                                      |
| Left     | Left arrow, A       | swipe left        | turn left and go that way                       |
| Right    | Right arrow, D      | swipe right       | turn right and go that way                      |
| Back     | Down arrow, S       | swipe down        | turn around and go                              |
| Stop     | Space               | tap               | stop at the next cell middle (a tap starts too) |

A player keeps running until a wall. A turn asked for between junctions waits for the next cell where that way is open, as in arcade maze games. One asked for just after passing a junction (within 0.3 cells) still takes it. Stopped and turning toward a wall, the player turns to face it and stays put. The view swings round smoothly with every turn. A swipe counts as soon as it is long enough, without waiting for the finger to lift.

## Sound

All sound is made in the browser with Web Audio; there are no sound files.

- **The monster** growls and breathes all the time, and thumps when it walks. The sound comes from where it is, through the browser's 3D sound ("HRTF", which imitates how a head shapes sound for each ear), so in headphones it is on the left or the right and fainter when far away.
- **Front or back.** Our ears tell front from back mostly because the outer ear dulls sounds from behind. So the monster's sound loses its high pitches smoothly as it moves behind you: crisp in front, muffled behind.
- **Heartbeat.** Within 8 cells, a heartbeat starts, faster and louder as the monster gets closer.
- Short sounds for a flat move, the fall, being caught and finishing. A button turns all sound off; the choice is remembered.

## Best times and progress

Players are guests for now. A browser keeps a random guest ID; the server derives a friendly name from it ("Witty Clover") and remembers that guest's highest level. Opening the game again continues there. The best time on each level, with who made it, is shown on the welcome page and at the end of every run.
