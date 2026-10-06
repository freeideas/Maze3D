# The game

What Monster Maze does, and why. The code that carries it out is `server/maze3d_server/game.py` (the rules), `maze.py` (the mazes) and `app/play/` (what the player sees, hears and does).

## A level

Each level has one maze, the same for everyone on it, made the way Endless Maze makes its mazes, with the same small random number source, so a level number always makes the same maze. It is 7 by 7 at level 1, one more each way per level, up to 30 by 30. Then about a third of its dead ends get a wall knocked down, so it has loops. Without loops there is only one path to the goal, and since the monster starts at the goal it would always be standing on it.

An attempt goes:

1. **The Start screen:** the level number and its best time. Nothing is running yet, and the map is not shown, so no one can study it for free.
2. **Start** (the button, Enter or space): the clock starts, the player stands on the start cell (top left, the same for everyone), and the monster can see them. The map shows the whole level from above, drawn in Endless Maze's style.
3. **The first move** closes the map, and the camera swoops down from above to eye level.
4. **Reaching the goal** (a glowing yellow star, bottom right) finishes the level. The time is from Start to the goal. The player moves up a level, which other players may or may not be on, and is back at a Start screen.

## The map

The map is drawn the way Endless Maze draws its mazes, and it turns with the player so that their arrow always points up: up on the map is straight ahead, and left and right on the map are the player's own left and right, just like the controls. It turns smoothly with every turn, shrinking a little part way round so it still fits. On it:

- **You:** a bright cyan arrow, pointing the way you face, which is up.
- **Other players:** white dots with their names, written upright however the map is turned.
- **The monster:** a red dot with a pulsing red glow.
- **The goal:** a glowing yellow star.

A legend under the map says which is which. The map is there at Start and whenever the player stops (space or a tap). Another space or tap closes it and goes forward; any move closes it too. The clock and the monster keep going while the map is open, so looking costs time.

## The monster

There is one monster per level, shared by everyone on it.

- It starts at the goal. It hunts players who have pressed Start. When there are none, it goes back to the goal.
- It sees through walls: it always heads for the nearest player in a straight line. But it is not clever. At each cell it takes whichever open way leads closest to that player, and it never turns back unless it is in a dead end. Walls fool it, and loops let players lead it away.
- Players move 3 cells a second; the monster 2.7.
- When its middle comes within 0.55 cells of a player's, it has caught them. That player sees "The monster got you!" for 2 seconds, then is back at the Start screen, with the clock at zero. The monster goes back to the goal and waits 1.5 seconds. That gives everyone else on the level a breather.
- Players pass through each other. No one passes through the monster, because touching it is being caught.

## Moving

Players move along the lines between cell middles, never diagonally, which keeps controls simple on a phone. Commands are relative to the way the player faces, as in real life:

| Command  | Keys                | Phone             | What it does                                    |
| -------- | ------------------- | ----------------- | ----------------------------------------------- |
| Forward  | Up arrow, W         | swipe up          | go forward                                      |
| Left     | Left arrow, A       | swipe left        | turn left and go that way                       |
| Right    | Right arrow, D      | swipe right       | turn right and go that way                      |
| Back     | Down arrow, S       | swipe down        | turn around and go                              |
| Map      | Space               | tap               | stop at the next cell middle and show the map   |

A player keeps running until a wall. A turn asked for between junctions waits for the next cell where that way is open, as in arcade maze games. One asked for just after passing a junction (within 0.3 cells) still takes it. Stopped and turning toward a wall, the player turns to face it and stays put. The view swings round smoothly with every turn. A swipe counts as soon as it is long enough, without waiting for the finger to lift.

## Sound

All sound is made in the browser with Web Audio; there are no sound files.

- **The monster** breathes all the time (hoarse, in and out), growls every few seconds, more often when it is near, roars when it is within about 3 cells, and thumps when it walks. A growl is a rattling low voice shaped by three throat resonances (the "formants" that make vowels), sliding from "wor" to "ah". The sound comes from where it is, through the browser's 3D sound ("HRTF", which imitates how a head shapes sound for each ear), so in headphones it is on the left or the right and fainter when far away.
- **Front or back.** Our ears tell front from back mostly because the outer ear dulls sounds from behind. So the monster's sound loses its high pitches smoothly as it moves behind you: crisp in front, muffled behind.
- **Heartbeat.** Within 8 cells, a heartbeat starts, faster and louder as the monster gets closer.
- Short sounds for being caught and finishing. A button turns all sound off; the choice is remembered.

## Best times and progress

Players are guests for now. A browser keeps a random guest ID; the server derives a friendly name from it ("Witty Clover") and remembers that guest's highest level. Opening the game again continues there. The best time on each level, with who made it, is shown on the welcome page, on the Start screen and at the end of every run.
