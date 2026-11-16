import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  FINISH,
  LANES,
  SEATS,
  SEAT_NAMES,
  TRACK,
  YARD_ORIGINS,
  yardSpots,
  type BoardNode,
  type Cell,
  type Seat,
} from '@loodl/rules';

export type CameraMode = 'lobby' | 'angled' | 'top';
export type Quality = 'high' | 'low';

export type Pick =
  | { type: 'node'; node: BoardNode }
  | { type: 'pawn'; seat: Seat; index: number }
  | null;

const SEAT_HEX = [0xe5262f, 0x14a44f, 0xf8c21c, 0x1c96ee] as const;
const SEAT_DARK = [0xa3121a, 0x0b7436, 0xc28a05, 0x0f67b0] as const;
const CREAM = 0xf7f2e6;
const GOLD = 0xe2a92b;
const BED = 0x1b2550;

const TILE_TOP = 0.2;
const YARD_TOP = 0.34;
const HALF = 7;

/** Grid cell (fractional allowed) → world position on the board plane. */
const toWorld = (c: Cell, y = 0) => new THREE.Vector3(c.col - HALF, y, c.row - HALF);

/** A flat shape drawn in board space (x right, z down-screen), extruded upward. */
function flat(points: [number, number][], depth: number, bevel = 0.02) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function starPoints(outer: number, inner: number): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r] as [number, number];
  });
}

const glossy = (color: number, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, ...extra });

export class BoardScene {
  onPick: (pick: Pick) => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private controls: OrbitControls;
  private sun: THREE.DirectionalLight;
  private raycaster = new THREE.Raycaster();
  private pickables: THREE.Object3D[] = [];
  private marker: THREE.Mesh;
  private pawns: THREE.Group[] = [];
  private die = new THREE.Group();
  private resizeObserver: ResizeObserver;
  private clock = new THREE.Clock();
  private raf = 0;
  private mode: CameraMode = 'lobby';
  private transition: { from: THREE.Spherical; to: THREE.Spherical; t: number } | null = null;
  private lobbySpin = 0.5;
  private down: { x: number; y: number } | null = null;
  private target = new THREE.Vector3(0, 0, 0);

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x1a2350, 0.55));
    this.sun = new THREE.DirectionalLight(0xfff0d2, 1.7);
    this.sun.position.set(7, 16, 9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -13;
    sc.right = sc.top = 13;
    sc.near = 1;
    sc.far = 50;
    this.scene.add(this.sun);
    const rim = new THREE.DirectionalLight(0x6fa8ff, 0.7);
    rim.position.set(-8, 6, -10);
    this.scene.add(rim);

    this.buildBoard();
    this.buildPawns();
    this.buildDie();

    this.marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.075, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true }),
    );
    this.marker.rotation.x = Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 10;
    this.scene.add(this.marker);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.target.copy(this.target);
    this.controls.enabled = false;

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.handleDown);
    el.addEventListener('pointerup', this.handleUp);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.applySpherical(this.poseFor('lobby'));
    this.tick();
  }

  // ---------- construction ----------

  private add(mesh: THREE.Mesh, cast = true, receive = true) {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    this.scene.add(mesh);
    return mesh;
  }

  private buildBoard() {
    const gold = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 0.95, roughness: 0.28, clearcoat: 0.4 });
    const frame = this.add(new THREE.Mesh(new RoundedBoxGeometry(16.5, 0.7, 16.5, 6, 0.32), gold));
    frame.position.y = -0.37;
    const bed = this.add(new THREE.Mesh(new RoundedBoxGeometry(15.5, 0.2, 15.5, 4, 0.12), glossy(BED, { roughness: 0.6 })));
    bed.position.y = -0.09;

    // Shadow catcher so the board sits on something even over the page background.
    const floor = this.add(
      new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.ShadowMaterial({ opacity: 0.38 })),
      false,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.72;

    const seatMats = SEAT_HEX.map((c) => glossy(c));
    const cream = glossy(CREAM, { roughness: 0.45, clearcoat: 0.35 });
    const tileGeo = new RoundedBoxGeometry(0.93, TILE_TOP, 0.93, 4, 0.07);

    // Home quadrants.
    const yardGeo = new RoundedBoxGeometry(5.93, YARD_TOP, 5.93, 5, 0.22);
    const padGeo = new RoundedBoxGeometry(4.0, 0.12, 4.0, 4, 0.2);
    const spotGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.05, 40);
    for (const seat of SEATS) {
      const o = YARD_ORIGINS[seat]!;
      const centre = { row: o.row + 2.5, col: o.col + 2.5 };
      this.add(new THREE.Mesh(yardGeo, seatMats[seat])).position.copy(toWorld(centre, YARD_TOP / 2));
      this.add(new THREE.Mesh(padGeo, cream)).position.copy(toWorld(centre, YARD_TOP + 0.03));
      const spotMat = glossy(SEAT_HEX[seat], { roughness: 0.5 });
      for (const spot of yardSpots(seat)) {
        this.add(new THREE.Mesh(spotGeo, spotMat), false).position.copy(toWorld(spot, YARD_TOP + 0.1));
      }
    }

    // Shared track and home lanes.
    const starGeo = flat(starPoints(0.3, 0.13), 0.02, 0.01);
    const starMat = new THREE.MeshStandardMaterial({ color: 0x8e99b3, roughness: 0.5, metalness: 0.3 });
    const arrowGeo = flat(
      [
        [-0.28, -0.07],
        [0.02, -0.07],
        [0.02, -0.22],
        [0.3, 0],
        [0.02, 0.22],
        [0.02, 0.07],
        [-0.28, 0.07],
      ],
      0.02,
      0.008,
    );
    const addTile = (node: BoardNode, mat: THREE.Material) => {
      const tile = this.add(new THREE.Mesh(tileGeo, mat));
      tile.position.copy(toWorld(node, TILE_TOP / 2));
      tile.userData.node = node;
      this.pickables.push(tile);
    };
    for (const node of TRACK) {
      addTile(node, node.start ? seatMats[node.seat!]! : cream);
      if (node.star) {
        this.add(new THREE.Mesh(starGeo, starMat), false).position.copy(toWorld(node, TILE_TOP));
      }
      if (node.laneEntry) {
        // Arrow points from the entry square into the seat's lane.
        const arrow = this.add(new THREE.Mesh(arrowGeo, glossy(SEAT_DARK[node.seat!])), false);
        arrow.position.copy(toWorld(node, TILE_TOP));
        arrow.rotation.y = -(node.seat! * Math.PI) / 2;
      }
    }
    for (const lane of LANES) for (const node of lane) addTile(node, seatMats[node.seat!]!);

    // Centre finish: four triangles, each fed by its seat's lane.
    const h = 1.47;
    const corners: [number, number][] = [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ];
    // Red's lane arrives from the left, green's from the top, and so on clockwise.
    const edges: [number, number][] = [
      [3, 0],
      [0, 1],
      [1, 2],
      [2, 3],
    ];
    for (const seat of SEATS) {
      const [a, b] = edges[seat]!;
      const tri = this.add(new THREE.Mesh(flat([corners[a]!, corners[b]!, [0, 0]], 0.26, 0.03), seatMats[seat]));
      tri.userData.node = FINISH[seat];
      this.pickables.push(tri);
    }
  }

  private buildPawns() {
    const profile = [
      [0, 0],
      [0.3, 0],
      [0.33, 0.05],
      [0.3, 0.1],
      [0.22, 0.15],
      [0.13, 0.42],
      [0.1, 0.56],
      [0.17, 0.6],
      [0.17, 0.64],
      [0.09, 0.68],
      [0, 0.68],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const bodyGeo = new THREE.LatheGeometry(profile, 40);
    const headGeo = new THREE.SphereGeometry(0.2, 32, 24);
    const ringGeo = new THREE.TorusGeometry(0.31, 0.04, 12, 40);
    const ringMat = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: 0.25 });
    for (const seat of SEATS) {
      const mat = glossy(SEAT_HEX[seat], { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
      yardSpots(seat).forEach((spot, index) => {
        const pawn = new THREE.Group();
        const body = new THREE.Mesh(bodyGeo, mat);
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = 0.83;
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.045;
        for (const m of [body, head, ring]) {
          m.castShadow = true;
          pawn.add(m);
        }
        pawn.scale.setScalar(1.25);
        pawn.position.copy(toWorld(spot, YARD_TOP + 0.125));
        pawn.userData.pawn = { seat, index };
        this.scene.add(pawn);
        this.pawns.push(pawn);
        this.pickables.push(pawn);
      });
    }
  }

  private buildDie() {
    const die = this.die;
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.1, 1.1, 6, 0.2), glossy(0xfbfbf7, { roughness: 0.2, clearcoat: 1 }));
    body.castShadow = true;
    die.add(body);
    const pipGeo = new THREE.CircleGeometry(0.1, 20);
    const pipMat = new THREE.MeshStandardMaterial({ color: 0x1a1f3a, roughness: 0.4 });
    const g = 0.27;
    const layouts: Record<number, [number, number][]> = {
      1: [[0, 0]],
      2: [[-g, -g], [g, g]],
      3: [[-g, -g], [0, 0], [g, g]],
      4: [[-g, -g], [g, -g], [-g, g], [g, g]],
      5: [[-g, -g], [g, -g], [0, 0], [-g, g], [g, g]],
      6: [[-g, -g], [g, -g], [-g, 0], [g, 0], [-g, g], [g, g]],
    };
    // Opposite faces sum to seven.
    const faces: [number, THREE.Euler][] = [
      [1, new THREE.Euler(0, 0, 0)],
      [6, new THREE.Euler(0, Math.PI, 0)],
      [2, new THREE.Euler(0, Math.PI / 2, 0)],
      [5, new THREE.Euler(0, -Math.PI / 2, 0)],
      [3, new THREE.Euler(-Math.PI / 2, 0, 0)],
      [4, new THREE.Euler(Math.PI / 2, 0, 0)],
    ];
    for (const [value, rot] of faces) {
      const face = new THREE.Group();
      for (const [x, y] of layouts[value]!) {
        const pip = new THREE.Mesh(pipGeo, pipMat);
        pip.position.set(x, y, 0.552);
        face.add(pip);
      }
      face.rotation.copy(rot);
      die.add(face);
    }
    die.position.set(0, 0.26 + 0.57, 0);
    die.rotation.set(0, 0.6, 0);
    this.scene.add(die);
  }

  // ---------- camera ----------

  private fitDistance() {
    const aspect = this.camera.aspect;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    // In play, keep the board clear of the HUD bars at the top and bottom.
    const h = this.container.clientHeight || 1;
    const usable = this.mode === 'lobby' ? 1 : (h - (h < 500 ? 120 : 190)) / h;
    return 9.1 / (tan * Math.min(usable, aspect));
  }

  private poseFor(mode: CameraMode): THREE.Spherical {
    const d = this.fitDistance();
    const portrait = this.camera.aspect < 1;
    if (mode === 'top') return new THREE.Spherical(d, 0.0015, 0);
    if (mode === 'angled') return new THREE.Spherical(d * 1.04, 0.62, 0);
    return new THREE.Spherical(d * (portrait ? 1.12 : 1.2), portrait ? 0.9 : 1.0, this.lobbySpin);
  }

  private currentSpherical() {
    return new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(this.target));
  }

  private applySpherical(s: THREE.Spherical) {
    this.camera.position.setFromSpherical(s).add(this.target);
    this.camera.lookAt(this.target);
  }

  setMode(mode: CameraMode) {
    if (mode === this.mode && !this.transition) return;
    const from = this.currentSpherical();
    this.mode = mode;
    // The showpiece die sits on the finish; hide it so it never covers play.
    this.die.visible = mode === 'lobby';
    const to = this.poseFor(mode);
    // Turn the short way round.
    from.theta = THREE.MathUtils.euclideanModulo(from.theta + Math.PI, Math.PI * 2) - Math.PI;
    if (mode === 'lobby') this.lobbySpin = to.theta = from.theta;
    this.controls.enabled = false;
    this.transition = { from, to, t: 0 };
    if (mode === 'lobby') this.select(null);
  }

  private finishTransition() {
    this.transition = null;
    if (this.mode === 'lobby') return;
    const d = this.fitDistance();
    const c = this.controls;
    c.minDistance = d * 0.45;
    c.maxDistance = d * 1.25;
    c.enableRotate = this.mode === 'angled';
    c.minPolarAngle = this.mode === 'top' ? 0 : 0.2;
    c.maxPolarAngle = this.mode === 'top' ? 0.002 : 1.15;
    c.enabled = true;
    c.update();
  }

  // ---------- interaction ----------

  private handleDown = (e: PointerEvent) => {
    this.down = { x: e.clientX, y: e.clientY };
  };

  private handleUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    if (!d || this.mode === 'lobby' || this.transition) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return; // it was a drag
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, true)[0];
    let obj: THREE.Object3D | null = hit?.object ?? null;
    while (obj && !obj.userData.node && !obj.userData.pawn) obj = obj.parent;
    if (!obj) return this.select(null);
    if (obj.userData.pawn) {
      const { seat, index } = obj.userData.pawn as { seat: Seat; index: number };
      this.select({ type: 'pawn', seat, index }, obj.position);
    } else {
      const node = obj.userData.node as BoardNode;
      this.select({ type: 'node', node }, toWorld(node, node.kind === 'finish' ? 0.3 : TILE_TOP));
    }
  };

  private select(pick: Pick, at?: THREE.Vector3) {
    this.marker.visible = !!pick && !!at;
    if (at) this.marker.position.set(at.x, at.y + 0.06, at.z);
    this.onPick(pick);
  }

  setQuality(q: Quality) {
    const high = q === 'high';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1));
    this.renderer.shadowMap.enabled = high;
    this.sun.castShadow = high;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  // ---------- loop ----------

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.transition) this.transition.to = this.poseFor(this.mode);
    else if (this.mode !== 'lobby') {
      this.applySpherical(this.poseFor(this.mode));
      this.finishTransition();
    }
  }

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const time = this.clock.elapsedTime;

    if (this.transition) {
      const tr = this.transition;
      tr.t = Math.min(1, tr.t + dt / 0.9);
      const k = tr.t * tr.t * (3 - 2 * tr.t);
      this.applySpherical(
        new THREE.Spherical(
          THREE.MathUtils.lerp(tr.from.radius, tr.to.radius, k),
          THREE.MathUtils.lerp(tr.from.phi, tr.to.phi, k),
          THREE.MathUtils.lerp(tr.from.theta, tr.to.theta, k),
        ),
      );
      if (tr.t >= 1) this.finishTransition();
    } else if (this.mode === 'lobby') {
      this.lobbySpin += dt * 0.1;
      this.applySpherical(this.poseFor('lobby'));
    } else {
      this.controls.update();
    }

    if (this.marker.visible) {
      const s = 1 + Math.sin(time * 5) * 0.08;
      this.marker.scale.set(s, s, 1);
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.handleDown);
    el.removeEventListener('pointerup', this.handleUp);
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
    });
    this.renderer.dispose();
    el.remove();
  }
}

export const describePick = (pick: Pick): string => {
  if (!pick) return 'Tap any square or pawn';
  if (pick.type === 'pawn') return `${cap(SEAT_NAMES[pick.seat])} pawn ${pick.index + 1} · in yard`;
  const n = pick.node;
  const owner = n.seat !== undefined ? cap(SEAT_NAMES[n.seat]) : '';
  if (n.kind === 'finish') return `${owner} finish`;
  if (n.kind === 'lane') return `${owner} home lane · square ${Number(n.id.split('-')[1]) + 1} of 5`;
  const tags = [n.start && `${owner} start`, n.star && 'Star', n.laneEntry && `${owner} lane entry`, n.safe && 'Safe']
    .filter(Boolean)
    .join(' · ');
  return `Track square ${n.trackIndex! + 1} of 52${tags ? ' · ' + tags : ''}`;
};

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
