// Every sound in Monster Maze, made on the spot with the browser's Web Audio (no sound files).
//
// The monster is heard where it is. Left and right come from the browser's 3D sound (an "HRTF"
// panner, which imitates how a head shapes sound for each ear). Front and back are hard for that to
// tell apart, so we copy what the outer ear does: a sound behind you loses its high pitches. The
// monster sounds crisp in front of you and muffled behind you. A heartbeat speeds up as it nears.

/** @type {AudioContext | null} */
let ctx = null;
/** @type {GainNode} */
let master;
/** @type {{ panner: PannerNode, filter: BiquadFilterNode, voice: GainNode } | null} */
let monster = null;
let muted = false;
let nextStep = 0;
let nextBeat = 0;

/** Start sound; browsers only allow it in answer to a key press or a touch. */
export function wake() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
}

/** @param {boolean} on */
export function mute(on) {
  muted = on;
  if (ctx) master.gain.setTargetAtTime(on ? 0 : 0.8, ctx.currentTime, 0.05);
}

function noiseBuffer() {
  const c = /** @type {AudioContext} */ (ctx);
  const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** The monster's breathing growl, running all the time, heard through its 3D panner. */
function startMonster() {
  const c = /** @type {AudioContext} */ (ctx);
  const panner = new PannerNode(c, {
    panningModel: "HRTF", distanceModel: "inverse", refDistance: 1.2, rolloffFactor: 1.4, maxDistance: 1000,
  });
  const filter = new BiquadFilterNode(c, { type: "lowpass", frequency: 6000, Q: 0.7 });
  const voice = new GainNode(c, { gain: 0 });
  voice.connect(filter).connect(panner).connect(master);

  // A low growl: two rough tones a fifth apart, wobbling.
  const growl = new GainNode(c, { gain: 0.22 });
  for (const f of [46, 69]) {
    const osc = new OscillatorNode(c, { type: "sawtooth", frequency: f });
    osc.connect(growl);
    osc.start();
  }
  const wobble = new OscillatorNode(c, { type: "sine", frequency: 5.5 });
  const depth = new GainNode(c, { gain: 0.12 });
  wobble.connect(depth).connect(growl.gain);
  wobble.start();
  growl.connect(voice);

  // Raspy breath: hissing noise swelling in and out, high enough for the ears to place it.
  const noise = new AudioBufferSourceNode(c, { buffer: noiseBuffer(), loop: true });
  const rasp = new BiquadFilterNode(c, { type: "bandpass", frequency: 1800, Q: 1.2 });
  const breath = new GainNode(c, { gain: 0.15 });
  const lungs = new OscillatorNode(c, { type: "sine", frequency: 0.45 });
  const lungDepth = new GainNode(c, { gain: 0.14 });
  lungs.connect(lungDepth).connect(breath.gain);
  noise.connect(rasp).connect(breath).connect(voice);
  noise.start();
  lungs.start();

  monster = { panner, filter, voice };
}

/** A heavy footstep, at the monster. */
function thump() {
  const c = /** @type {AudioContext} */ (ctx);
  const t = c.currentTime;
  const osc = new OscillatorNode(c, { type: "sine", frequency: 90 });
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
  const g = new GainNode(c, { gain: 0 });
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.9, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
  osc.connect(g).connect(/** @type {any} */ (monster).voice);
  osc.start(t);
  osc.stop(t + 0.3);
  const crunch = new AudioBufferSourceNode(c, { buffer: noiseBuffer() });
  const cg = new GainNode(c, { gain: 0 });
  cg.gain.setValueAtTime(0.5, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  crunch.connect(new BiquadFilterNode(c, { type: "highpass", frequency: 2500 })).connect(cg).connect(/** @type {any} */ (monster).voice);
  crunch.start(t);
  crunch.stop(t + 0.1);
}

/** A heartbeat, not placed anywhere: it is yours. @param {number} strength 0 to 1 */
function beat(strength) {
  const c = /** @type {AudioContext} */ (ctx);
  for (const [delay, level] of [[0, 1], [0.16, 0.7]]) {
    const t = c.currentTime + delay;
    const osc = new OscillatorNode(c, { type: "sine", frequency: 55 });
    const g = new GainNode(c, { gain: 0 });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.6 * strength * level, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.2);
  }
}

/**
 * Called every frame while in the 3D maze. Positions are in cells; `yaw` is where the player looks,
 * in radians, 0 facing up the maze (towards smaller y), increasing to the left.
 * @param {{ x: number, y: number, yaw: number }} me
 * @param {{ x: number, y: number, moving: boolean } | null} it the monster
 */
export function update(me, it) {
  if (!ctx || ctx.state !== "running") return;
  if (!monster) startMonster();
  const m = /** @type {NonNullable<typeof monster>} */ (monster);
  const t = ctx.currentTime;
  const L = ctx.listener;
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw); // forward, with the maze's y as the 3D z
  if (L.positionX) {
    L.positionX.setTargetAtTime(me.x, t, 0.02);
    L.positionY.setTargetAtTime(0, t, 0.02);
    L.positionZ.setTargetAtTime(me.y, t, 0.02);
    L.forwardX.setTargetAtTime(fx, t, 0.02);
    L.forwardY.setTargetAtTime(0, t, 0.02);
    L.forwardZ.setTargetAtTime(fz, t, 0.02);
    L.upX.value = 0;
    L.upY.value = 1;
    L.upZ.value = 0;
  } else {
    L.setPosition(me.x, 0, me.y);
    L.setOrientation(fx, 0, fz, 0, 1, 0);
  }
  if (!it) {
    m.voice.gain.setTargetAtTime(0, t, 0.1);
    return;
  }
  m.voice.gain.setTargetAtTime(1, t, 0.1);
  m.panner.positionX.setTargetAtTime(it.x, t, 0.02);
  m.panner.positionY.setTargetAtTime(0, t, 0.02);
  m.panner.positionZ.setTargetAtTime(it.y, t, 0.02);

  // Front or back: +1 straight ahead, -1 straight behind. Behind is muffled.
  const dx = it.x - me.x, dz = it.y - me.y;
  const distance = Math.hypot(dx, dz) || 1;
  const ahead = (dx * fx + dz * fz) / distance;
  const cutoff = 600 * Math.pow(8000 / 600, (ahead + 1) / 2);
  m.filter.frequency.setTargetAtTime(cutoff, t, 0.05);

  if (it.moving && t >= nextStep) {
    thump();
    nextStep = t + 0.36;
  }
  // The heartbeat starts 8 cells away and races as it closes in.
  if (distance < 8 && t >= nextBeat) {
    const close = 1 - distance / 8;
    beat(0.3 + 0.7 * close);
    nextBeat = t + 60 / (70 + 90 * close);
  }
}

/** A short sound for something that happened: step, fall, caught, finished. @param {string} what */
export function play(what) {
  if (!ctx || ctx.state !== "running") return;
  const c = ctx;
  const t = c.currentTime;
  const tone = (/** @type {OscillatorType} */ type, /** @type {number} */ f0, /** @type {number} */ f1, /** @type {number} */ start, /** @type {number} */ length, /** @type {number} */ level) => {
    const osc = new OscillatorNode(c, { type, frequency: f0 });
    osc.frequency.exponentialRampToValueAtTime(f1, t + start + length);
    const g = new GainNode(c, { gain: 0 });
    g.gain.setValueAtTime(0, t + start);
    g.gain.linearRampToValueAtTime(level, t + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + start + length);
    osc.connect(g).connect(master);
    osc.start(t + start);
    osc.stop(t + start + length + 0.05);
  };
  const hiss = (/** @type {number} */ f0, /** @type {number} */ f1, /** @type {number} */ length, /** @type {number} */ level) => {
    const src = new AudioBufferSourceNode(c, { buffer: noiseBuffer() });
    const filter = new BiquadFilterNode(c, { type: "bandpass", frequency: f0, Q: 2 });
    filter.frequency.exponentialRampToValueAtTime(f1, t + length);
    const g = new GainNode(c, { gain: level });
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + length);
  };
  if (what === "step") tone("triangle", 660, 520, 0, 0.08, 0.15);
  if (what === "fall") {
    tone("square", 300, 30, 0.1, 1.8, 0.18);
    hiss(3000, 200, 2, 0.5);
  }
  if (what === "caught") {
    tone("sawtooth", 120, 35, 0, 0.9, 0.6);
    tone("sawtooth", 180, 50, 0, 0.7, 0.4);
    hiss(900, 120, 0.8, 0.9);
  }
  if (what === "finished") [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, i * 0.12, 0.5, 0.3));
}
