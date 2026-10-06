// The 3D view: the maze seen through the player's eyes, drawn with three.js (../vendor/).
// The maze's x is the 3D x, its y is the 3D z, one cell is CELL units wide; the camera looks along
// `yaw`, 0 facing up the maze (towards smaller y), increasing to the left.

import * as THREE from "../vendor/three.module.min.js";

const CELL = 2;
const WALL = 2.4; // height
const THICK = 0.16;
const EYE = 1.05;
const UP = 1, LEFT = 8;

/** A rough stone texture, drawn once on a canvas. */
function stone() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  g.fillStyle = "#4a5568";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 60 + Math.random() * 50;
    g.fillStyle = `rgb(${v},${v + 4},${v + 14})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  g.strokeStyle = "#2a3140";
  g.lineWidth = 3;
  for (let row = 0; row < 4; row++) {
    g.beginPath();
    g.moveTo(0, row * 32);
    g.lineTo(128, row * 32);
    for (let k = 0; k < 2; k++) {
      const x = (k * 64 + (row % 2) * 32) % 128;
      g.moveTo(x, row * 32);
      g.lineTo(x, row * 32 + 32);
    }
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A name floating over another player. @param {string} text */
function label(text) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
  g.font = "bold 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.fillStyle = "#e9f1ff";
  g.fillText(text, 128, 42);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  sprite.scale.set(1.2, 0.3, 1);
  sprite.position.y = 2.1;
  return sprite;
}

function makeMonster() {
  const body = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x3a0b12, roughness: 0.9, emissive: 0x1a0004 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.9, 6, 12), skin);
  torso.position.y = 1.1;
  body.add(torso);
  const eye = new THREE.MeshBasicMaterial({ color: 0xff3b2f });
  for (const side of [-0.22, 0.22]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), eye);
    e.position.set(side, 1.6, 0.5);
    e.scale.set(1.3, 0.6, 1);
    body.add(e);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 8), new THREE.MeshStandardMaterial({ color: 0xd8cbb0 }));
    horn.position.set(side * 1.6, 2.0, 0.1);
    horn.rotation.z = -side * 2;
    body.add(horn);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.05), new THREE.MeshBasicMaterial({ color: 0x120004 }));
  mouth.position.set(0, 1.22, 0.55);
  body.add(mouth);
  const tooth = new THREE.ConeGeometry(0.035, 0.13, 4);
  const ivory = new THREE.MeshBasicMaterial({ color: 0xf2ead8 });
  for (let i = 0; i < 7; i++) {
    for (const [y, flip] of [[1.3, Math.PI], [1.14, 0]]) {
      const t = new THREE.Mesh(tooth, ivory);
      t.position.set(-0.27 + i * 0.09, y, 0.58);
      t.rotation.z = flip;
      body.add(t);
    }
  }
  body.scale.setScalar(1.15);
  const glow = new THREE.PointLight(0xff2a1a, 6, CELL * 2.5, 1.5);
  glow.position.y = 1.4;
  body.add(glow);
  return body;
}

/** Make the 3D view in `canvas`. */
export function view3d(/** @type {HTMLCanvasElement} */ canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070c);
  scene.fog = new THREE.FogExp2(0x05070c, 0.09);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
  camera.rotation.order = "YXZ";
  scene.add(camera);
  scene.add(new THREE.AmbientLight(0x8090b0, 0.35));
  const torch = new THREE.PointLight(0xffe2b0, 14, CELL * 5, 1.6);
  torch.position.set(0, 0.2, 0);
  camera.add(torch);

  const monster = makeMonster();
  monster.visible = false;
  scene.add(monster);

  let level = new THREE.Group();
  /** @type {THREE.Mesh | null} */
  let goal = null;
  scene.add(level);
  /** @type {Map<string, THREE.Group>} */
  const others = new Map();
  const wallTexture = stone();

  /** Build the walls, floor and goal for a maze. @param {{ size: number, open: number[], exit: number }} maze */
  function build(maze) {
    scene.remove(level);
    level = new THREE.Group();
    const n = maze.size;
    /** @type {[number, number, boolean][]} */
    const walls = []; // middle x, middle z, runs along x
    for (let cell = 0; cell < n * n; cell++) {
      const cx = cell % n, cy = Math.floor(cell / n);
      if (!(maze.open[cell] & UP)) walls.push([cx + 0.5, cy, true]);
      if (!(maze.open[cell] & LEFT)) walls.push([cx, cy + 0.5, false]);
      if (cy === n - 1) walls.push([cx + 0.5, n, true]);
      if (cx === n - 1) walls.push([n, cy + 0.5, false]);
    }
    const material = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.95 });
    wallTexture.repeat.set(1, 1);
    const box = new THREE.BoxGeometry(CELL + THICK, WALL, THICK);
    const mesh = new THREE.InstancedMesh(box, material, walls.length);
    const m = new THREE.Matrix4();
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    walls.forEach(([x, z, alongX], i) => {
      m.makeTranslation(x * CELL, WALL / 2, z * CELL);
      if (!alongX) m.multiply(turn);
      mesh.setMatrixAt(i, m);
    });
    level.add(mesh);

    const floorTexture = new THREE.CanvasTexture((() => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d"));
      g.fillStyle = "#1c2433";
      g.fillRect(0, 0, 64, 64);
      g.strokeStyle = "#2c3850";
      g.lineWidth = 2;
      g.strokeRect(1, 1, 62, 62);
      return c;
    })());
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(n, n);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(n * CELL, n * CELL), new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(n * CELL / 2, 0, n * CELL / 2);
    level.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(n * CELL, n * CELL), new THREE.MeshStandardMaterial({ color: 0x0b0f18 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(n * CELL / 2, WALL, n * CELL / 2);
    level.add(ceiling);

    // The goal: a glowing yellow star, turning slowly, as on the map.
    const gx = (maze.exit % n + 0.5) * CELL, gz = (Math.floor(maze.exit / n) + 0.5) * CELL;
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, d = i % 2 ? 0.22 : 0.5;
      if (i) shape.lineTo(Math.cos(a) * d, Math.sin(a) * d);
      else shape.moveTo(Math.cos(a) * d, Math.sin(a) * d);
    }
    const starGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
    starGeometry.center();
    goal = new THREE.Mesh(starGeometry, new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffb820, emissiveIntensity: 1.2, metalness: 0.3, roughness: 0.35 }));
    goal.position.set(gx, 1.1, gz);
    level.add(goal);
    const goalLight = new THREE.PointLight(0xffd76a, 8, CELL * 3, 1.5);
    goalLight.position.set(gx, 1, gz);
    level.add(goalLight);
    scene.add(level);
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  /**
   * Draw one frame.
   * @param {{ x: number, y: number, yaw: number, bob: number, lift: number }} me `lift` 0 is at eye
   *   level, 1 is high above the maze looking down (the camera swoops between them)
   * @param {{ x: number, y: number, h: number } | null} it the monster
   * @param {{ id: string, name: string, x: number, y: number, h: number }[]} people other players
   */
  function draw(me, it, people) {
    resize();
    const lift = me.lift * me.lift * (3 - 2 * me.lift); // ease in and out
    camera.position.set(me.x * CELL, EYE + me.bob + lift * 14, me.y * CELL);
    camera.rotation.y = me.yaw;
    camera.rotation.x = -lift * Math.PI / 2 * 0.95;
    /** @type {THREE.FogExp2} */ (scene.fog).density = 0.09 * (1 - lift * 0.8);
    if (goal) goal.rotation.y = performance.now() / 900;
    monster.visible = !!it;
    if (it) {
      monster.position.set(it.x * CELL, Math.abs(Math.sin(performance.now() / 180)) * 0.08, it.y * CELL);
      monster.lookAt(me.x * CELL, 0, me.y * CELL);
    }
    const here = new Set();
    for (const p of people) {
      here.add(p.id);
      let figure = others.get(p.id);
      if (!figure) {
        figure = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 10),
          new THREE.MeshStandardMaterial({ color: 0x6ee7ff, emissive: 0x0d4a5a, transparent: true, opacity: 0.6 }));
        body.position.y = 0.9;
        figure.add(body, label(p.name));
        scene.add(figure);
        others.set(p.id, figure);
      }
      figure.position.set(p.x * CELL, 0, p.y * CELL);
    }
    for (const [id, figure] of others) {
      if (!here.has(id)) {
        scene.remove(figure);
        others.delete(id);
      }
    }
    renderer.render(scene, camera);
  }

  return { build, draw };
}
