import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  LANES,
  SEATS,
  SEAT_NAMES,
  TRACK,
  YARD_ORIGINS,
  boardLayout,
  rotatePoint,
  seatPathPoints,
  yardSpots,
  type BoardLayout,
  type BoardNode,
  type Cell,
  type Point,
  type Seat,
} from '@loodl/rules';

export type CameraMode = 'lobby' | 'angled' | 'top';
export type Quality = 'high' | 'low';

/** What the scene needs to know about a match in order to draw it. */
export interface MatchView {
  /** pawns[seat][pawn] = progress (-1 yard, 0-55 on the path, 56 home). */
  pawns: number[][];
  /** Seat whose turn it is. */
  seat: Seat;
  /** Pawns of that seat that may be tapped to move right now. */
  movable: number[];
  /** Arms on the board: 4 (classic, the default) to 8. */
  boardSeats?: number;
}

const SEAT_HEX = [0xe5262f, 0x14a44f, 0xf8c21c, 0x1c96ee, 0x8e44d6, 0xf07a1a, 0x12b5a6, 0xe84aa0] as const;
const SEAT_DARK = [0xa3121a, 0x0b7436, 0xc28a05, 0x0f67b0, 0x5b2aa8, 0xb3540a, 0x0c7a70, 0xa3206c] as const;
const ALL_SEATS: readonly Seat[] = [0, 1, 2, 3, 4, 5, 6, 7];
/** Board skins: tile, trim and bed colours. Cosmetic only. */
const BOARD_SKINS: Record<string, [tile: number, trim: number, bed: number]> = {
  board_classic: [0xf7f2e6, 0xe2a92b, 0x1b2550],
  board_midnight: [0xdfe6ff, 0x9fb2d6, 0x080d22],
  board_royal: [0xfff3d6, 0xd49a1a, 0x4a1030],
};
/** Pawn finishes: surface properties only; seat colours never change. */
const PAWN_SKINS: Record<string, { metalness: number; roughness: number; clearcoat: number; clearcoatRoughness: number }> = {
  pawn_glossy: { metalness: 0, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 },
  pawn_metal: { metalness: 0.85, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.3 },
  pawn_pearl: { metalness: 0.25, roughness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.5 },
};
// The equipped skin is a player preference shared by every board on the page.
let [CREAM, GOLD, BED] = BOARD_SKINS.board_classic!;

const TILE_TOP = 0.2;
const YARD_TOP = 0.34;
const HALF = 7;

interface PawnAnim {
  /** Where the pawn starts, each square it hops through, and where it ends. */
  points: THREE.Vector3[];
  s0: number;
  s1: number;
  /** Progress in hops: 0 at the first point, points.length - 1 at the last. */
  t: number;
}

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
  onPawnTap: (pawn: number) => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  private controls: OrbitControls;
  private sun: THREE.DirectionalLight;
  private rings: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pawns: THREE.Group[][] = [];
  private view: MatchView | null = null;
  private pawnMats: THREE.MeshPhysicalMaterial[] = [];
  private pawnRingMat: THREE.MeshPhysicalMaterial | null = null;
  private layout: BoardLayout = boardLayout(4);
  private paths: Point[][] = [];
  /** Everything that makes up the board itself, so it can be swapped for another size. */
  private board = new THREE.Group();
  /** Half-width the camera must fit. */
  private extent = 9.1;
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

    this.scene.add(this.board);
    this.buildBoard();
    this.buildPawns();
    this.buildDie();

    const ringGeo = new THREE.TorusGeometry(0.5, 0.075, 12, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false, transparent: true });
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.renderOrder = 10;
      ring.visible = false;
      this.scene.add(ring);
      this.rings.push(ring);
    }

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
    this.board.add(mesh);
    return mesh;
  }

  /** Swap the board for one with a different number of arms. */
  private setLayout(boardSeats: number) {
    for (const child of [...this.board.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((x) => x.dispose());
      else m?.dispose();
      this.board.remove(child);
    }
    this.layout = boardLayout(boardSeats);
    this.paths = [];
    if (boardSeats === 4) this.buildBoard();
    else this.buildStarBoard();
    this.layoutPawns(false);
    if (this.transition) this.transition.to = this.poseFor(this.mode);
    else {
      this.applySpherical(this.poseFor(this.mode));
      if (this.mode !== 'lobby') this.finishTransition();
    }
  }

  /** Boards for five to eight players: one arm each around a central polygon, with a home wedge between arms. */
  private buildStarBoard() {
    const L = this.layout;
    const n = L.boardSeats;
    const at = (x: number, z: number, angle: number): [number, number] => {
      const p = rotatePoint({ x, z }, angle);
      return [p.x, p.z];
    };
    const grow = (pts: [number, number][], k: number) => pts.map(([x, z]) => [x * k, z * k] as [number, number]);
    // Outline through the outer corners of every arm, clockwise.
    const outline = L.armAngles.flatMap((a) => [at(-L.radius, 1.5, a), at(-L.radius, -1.5, a)]);
    this.extent = Math.hypot(L.radius, 1.5) * 1.07 + 0.9;

    const gold = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 0.95, roughness: 0.28, clearcoat: 0.4 });
    this.add(new THREE.Mesh(flat(grow(outline, 1.07), 0.6, 0.06), gold)).position.y = -0.7;
    this.add(new THREE.Mesh(flat(grow(outline, 1.02), 0.16, 0.02), glossy(BED, { roughness: 0.6 }))).position.y = -0.17;
    const floor = this.add(new THREE.Mesh(new THREE.CircleGeometry(48, 48), new THREE.ShadowMaterial({ opacity: 0.38 })), false);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.72;

    const seatMats = SEAT_HEX.map((c) => glossy(c));
    const cream = glossy(CREAM, { roughness: 0.45, clearcoat: 0.35 });
    const tileGeo = new RoundedBoxGeometry(0.93, TILE_TOP, 0.93, 4, 0.07);
    // Safe squares: a large star, and star squares get a gold tile so they still read as safe
    // when a pawn stands on the star. Start squares keep their seat colour with a white star.
    // The points reach past a pawn's base (radius about 0.38), so they stay visible under it.
    const starGeo = flat(starPoints(0.5, 0.22), 0.03, 0.01);
    const starMat = new THREE.MeshStandardMaterial({ color: 0xb87d0a, roughness: 0.45, metalness: 0.35 });
    const startStarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const safeTile = glossy(0xffd76a, { roughness: 0.4, clearcoat: 0.4 });
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
    const put = (mesh: THREE.Mesh, p: Point, y: number, angle: number) => {
      mesh.position.set(p.x, y, p.z);
      mesh.rotation.y = -angle; // three.js turns the other way round from the layout's angles
      return mesh;
    };

    L.track.forEach((p, i) => {
      const block = Math.floor(i / 13);
      const offset = i % 13;
      // The first five squares of a seat's stretch lie on its own arm, the rest on the next arm.
      const arm = offset < 5 ? block : (block + 1) % n;
      const angle = L.armAngles[arm]!;
      put(this.add(new THREE.Mesh(tileGeo, offset === 0 ? seatMats[block]! : offset === 8 ? safeTile : cream)), p, TILE_TOP / 2, angle);
      if (offset === 8 || offset === 0) put(this.add(new THREE.Mesh(starGeo, offset === 0 ? startStarMat : starMat), false), p, TILE_TOP, 0);
      if (offset === 11) put(this.add(new THREE.Mesh(arrowGeo, glossy(SEAT_DARK[arm]!)), false), p, TILE_TOP, angle);
    });
    L.lanes.forEach((lane, seat) => lane.forEach((p) => put(this.add(new THREE.Mesh(tileGeo, seatMats[seat]!)), p, TILE_TOP / 2, L.armAngles[seat]!)));

    const spotGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.05, 36);
    L.armAngles.forEach((angle, seat) => {
      const next = L.armAngles[(seat + 1) % n]!;
      // Centre finish: one triangle per seat, fed by that seat's lane.
      this.add(new THREE.Mesh(flat([at(-L.hubRadius, 1.47, angle), at(-L.hubRadius, -1.47, angle), [0, 0]], 0.26, 0.03), seatMats[seat]!));
      // Home wedge between this arm and the next, widest at the outer edge.
      const wedge: [number, number][] = [at(-L.hubRadius, -1.5, angle), at(-L.radius, -1.5, angle), at(-L.radius, 1.5, next)];
      const cx = (wedge[0]![0] + wedge[1]![0] + wedge[2]![0]) / 3;
      const cz = (wedge[0]![1] + wedge[1]![1] + wedge[2]![1]) / 3;
      const inset = (k: number) => wedge.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k] as [number, number]);
      this.add(new THREE.Mesh(flat(inset(0.965), YARD_TOP - 0.04, 0.04), seatMats[seat]!));
      this.add(new THREE.Mesh(flat(inset(0.8), 0.05, 0.03), cream)).position.y = YARD_TOP + 0.01;
      const spotMat = glossy(SEAT_HEX[seat]!, { roughness: 0.5 });
      for (const spot of L.yardSpots[seat]!) this.add(new THREE.Mesh(spotGeo, spotMat), false).position.set(spot.x, YARD_TOP + 0.1, spot.z);
    });
  }

  private buildBoard() {
    this.extent = 9.1;
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
    // Safe squares: a large star, and star squares get a gold tile so they still read as safe
    // when a pawn stands on the star. Start squares keep their seat colour with a white star.
    // The points reach past a pawn's base (radius about 0.38), so they stay visible under it.
    const starGeo = flat(starPoints(0.5, 0.22), 0.03, 0.01);
    const starMat = new THREE.MeshStandardMaterial({ color: 0xb87d0a, roughness: 0.45, metalness: 0.35 });
    const startStarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const safeTile = glossy(0xffd76a, { roughness: 0.4, clearcoat: 0.4 });
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
    };
    for (const node of TRACK) {
      addTile(node, node.start ? seatMats[node.seat!]! : node.star ? safeTile : cream);
      if (node.star || node.start) {
        this.add(new THREE.Mesh(starGeo, node.start ? startStarMat : starMat), false).position.copy(toWorld(node, TILE_TOP));
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
      this.add(new THREE.Mesh(flat([corners[a]!, corners[b]!, [0, 0]], 0.26, 0.03), seatMats[seat]));
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
    this.pawnRingMat = ringMat;
    for (const seat of ALL_SEATS) {
      const mat = glossy(SEAT_HEX[seat], { roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
      this.pawnMats[seat] = mat;
      this.pawns[seat] = [0, 1, 2, 3].map(() => {
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
        this.scene.add(pawn);
        return pawn;
      });
    }
    this.layoutPawns(false);
  }

  // ---------- match display ----------

  /** Show a match, or pass null for the idle board with every pawn in its yard. */
  setView(view: MatchView | null) {
    this.view = view;
    const boardSeats = view?.boardSeats ?? 4;
    if (boardSeats !== this.layout.boardSeats) this.setLayout(boardSeats);
    else this.layoutPawns(true);
  }

  private at(p: Point, y: number) {
    return new THREE.Vector3(p.x, y, p.z);
  }

  /** Where a waiting pawn stands: the classic square yards on the four-seat board, the wedges otherwise. */
  private yardPoint(seat: Seat, pawn: number): THREE.Vector3 {
    if (this.layout.boardSeats === 4) return toWorld(yardSpots(seat)[pawn]!, YARD_TOP + 0.125);
    return this.at(this.layout.yardSpots[seat]![pawn]!, YARD_TOP + 0.125);
  }

  /** Where each pawn should stand, spreading out pawns that share a square. */
  private layoutPawns(animate: boolean) {
    const sharing = new Map<string, number>();
    const slots: { pawn: THREE.Group; pos: THREE.Vector3; scale: number; key?: string; step: number; path: Point[] }[] = [];
    const onBoard = this.layout.boardSeats;
    for (const seat of ALL_SEATS) {
      // Seats that do not exist on this board have no pawns to show.
      const steps = seat >= onBoard ? [] : this.view ? (this.view.pawns[seat] ?? []) : [-1, -1, -1, -1];
      const path = seat >= onBoard ? [] : (this.paths[seat] ??= seatPathPoints(this.layout, seat));
      this.pawns[seat]!.forEach((pawn, i) => {
        const step = steps[i];
        pawn.visible = step !== undefined;
        if (step === undefined) return;
        if (step < 0) {
          slots.push({ pawn, pos: this.yardPoint(seat, i), scale: this.layout.boardSeats === 4 ? 1.25 : 1.1, step, path });
        } else if (step >= path.length - 1) {
          // Home: line up inside the seat's own centre triangle.
          const lane = this.at(this.layout.lanes[seat]![4]!, 0).normalize();
          const side = new THREE.Vector3(-lane.z, 0, lane.x).multiplyScalar((i - 1.5) * 0.36);
          slots.push({ pawn, pos: lane.multiplyScalar(Math.max(0.95, this.layout.hubRadius * 0.55)).add(side).setY(0.29), scale: 0.72, step, path });
        } else {
          const node = path[step]!;
          const id = `${node.x.toFixed(2)},${node.z.toFixed(2)}`;
          sharing.set(id, (sharing.get(id) ?? 0) + 1);
          slots.push({ pawn, pos: this.at(node, TILE_TOP), scale: 1.1, key: id, step, path });
        }
      });
    }
    const placed = new Map<string, number>();
    for (const slot of slots) {
      const count = slot.key ? sharing.get(slot.key)! : 1;
      if (slot.key && count > 1) {
        const n = placed.get(slot.key) ?? 0;
        placed.set(slot.key, n + 1);
        const a = (n / count) * Math.PI * 2 + Math.PI / 4;
        slot.pos.x += Math.cos(a) * 0.24;
        slot.pos.z += Math.sin(a) * 0.24;
        slot.scale = 0.78;
      }
      const { pawn, pos, scale, step, path } = slot;
      const anim = pawn.userData.anim as PawnAnim | undefined;
      const previous = pawn.userData.step as number | undefined;
      pawn.userData.step = step;
      const current = anim ? anim.points[anim.points.length - 1]! : pawn.position;
      if (!animate) {
        pawn.position.copy(pos);
        pawn.scale.setScalar(scale);
        pawn.userData.anim = undefined;
      } else if (current.distanceTo(pos) > 0.01 || Math.abs((anim?.s1 ?? pawn.scale.x) - scale) > 0.01) {
        // Moving forward along the path: hop through every square on the way.
        const through =
          previous !== undefined && previous >= 0 && step > previous
            ? path.slice(previous + 1, step).map((n) => this.at(n, TILE_TOP))
            : [];
        pawn.userData.anim = { points: [pawn.position.clone(), ...through, pos], s0: pawn.scale.x, s1: scale, t: 0 } satisfies PawnAnim;
      }
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
    const usable = this.mode === 'lobby' ? 1 : (h - (h < 500 ? 110 : 300)) / h;
    return this.extent / (tan * Math.min(usable, aspect));
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
    const view = this.view;
    if (!view || view.movable.length === 0) return;
    // Pick the movable pawn nearest the tap, measured on screen. This is far
    // more forgiving for fingers than requiring a hit on the pawn's mesh.
    const rect = this.renderer.domElement.getBoundingClientRect();
    // First, a tap that lands on a movable pawn picks exactly that pawn. Without this a
    // tap on a pawn standing on its start square could pick a yard pawn right beside it.
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const groups = view.movable.map((index) => this.pawns[view.seat]![index]!);
    const hit = this.raycaster.intersectObjects(groups, true)[0];
    if (hit) {
      const index = view.movable.find((i) => groups[view.movable.indexOf(i)]!.children.includes(hit.object));
      if (index !== undefined) return this.onPawnTap(index);
    }
    // Otherwise, forgiving for fingers: the movable pawn nearest the tap, if close enough.
    let best = -1;
    let bestDist = Math.max(34, rect.width * 0.045);
    for (const index of view.movable) {
      const pawn = this.pawns[view.seat]![index]!;
      const p = pawn.position.clone().setY(pawn.position.y + 0.45).project(this.camera);
      const x = rect.left + ((p.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - p.y) / 2) * rect.height;
      const dist = Math.hypot(e.clientX - x, e.clientY - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = index;
      }
    }
    if (best >= 0) this.onPawnTap(best);
  };

  /** Apply the player's equipped board skin and pawn finish. Looks only; nothing about play changes. */
  setSkin(board: string, pawn: string) {
    const colours = BOARD_SKINS[board] ?? BOARD_SKINS.board_classic!;
    const changed = colours[0] !== CREAM || colours[1] !== GOLD || colours[2] !== BED;
    [CREAM, GOLD, BED] = colours;
    const finish = PAWN_SKINS[pawn] ?? PAWN_SKINS.pawn_glossy!;
    for (const mat of this.pawnMats) Object.assign(mat, finish);
    this.pawnRingMat?.color.setHex(GOLD);
    if (changed) this.setLayout(this.layout.boardSeats);
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

    for (const group of this.pawns)
      for (const pawn of group) {
        const anim = pawn.userData.anim as PawnAnim | undefined;
        if (!anim) continue;
        const hops = anim.points.length - 1;
        const walking = hops > 1;
        anim.t = Math.min(hops, anim.t + dt / (walking ? 0.16 : 0.38));
        const seg = Math.min(hops - 1, Math.floor(anim.t));
        const from = anim.points[seg]!;
        const to = anim.points[seg + 1]!;
        const local = anim.t - seg;
        const k = local * local * (3 - 2 * local);
        pawn.position.lerpVectors(from, to, k);
        pawn.position.y += Math.sin(Math.PI * k) * (walking ? 0.32 : Math.min(1.2, 0.35 + from.distanceTo(to) * 0.12));
        pawn.scale.setScalar(THREE.MathUtils.lerp(anim.s0, anim.s1, anim.t / hops));
        if (anim.t >= hops) pawn.userData.anim = undefined;
      }

    const movable = this.view && this.mode !== 'lobby' ? this.view.movable : [];
    this.rings.forEach((ring, i) => {
      const index = movable[i];
      ring.visible = index !== undefined;
      if (index === undefined) return;
      const pawn = this.pawns[this.view!.seat]![index]!;
      const s = (1 + Math.sin(time * 6) * 0.1) * (pawn.scale.x / 1.1);
      ring.scale.set(s, s, 1);
      ring.position.set(pawn.position.x, pawn.position.y + 0.07, pawn.position.z);
    });
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
