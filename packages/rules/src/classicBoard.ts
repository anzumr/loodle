/**
 * Classic four-colour Ludo board topology (15×15 grid).
 *
 * This file is the single source of truth for where every playable cell is,
 * how cells connect, which are safe, and which path each seat walks. The
 * renderer and (later) the rules engine and server all read from here, so
 * movement never depends on what the board happens to look like.
 *
 * Grid convention: row 0 is the top edge, col 0 is the left edge.
 * Seats run clockwise: red (top-left), green (top-right), yellow
 * (bottom-right), blue (bottom-left). Pawns travel clockwise.
 */

export const GRID_SIZE = 15;
export const SEAT_COUNT = 4;
export const TRACK_LENGTH = 52;
export const LANE_LENGTH = 5;
/** Steps from a seat's start square to the finish (start is step 0). */
export const PATH_LENGTH = 57;
/** Offset, in track squares, between one seat's start and the next. */
export const SEAT_TRACK_OFFSET = 13;
/** Safe star squares sit this many squares after each start square. */
export const STAR_OFFSET = 8;

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const SEAT_NAMES = ['red', 'green', 'yellow', 'blue'] as const;
export type SeatName = (typeof SEAT_NAMES)[number];

export interface Cell {
  row: number;
  col: number;
}

export type NodeKind = 'track' | 'lane' | 'finish';

export interface BoardNode extends Cell {
  id: string;
  kind: NodeKind;
  /** Pawns here cannot be captured. */
  safe: boolean;
  /** Seat that owns this node: start squares, lane squares and finish. */
  seat?: Seat;
  /** Index around the shared loop (track nodes only). */
  trackIndex?: number;
  /** True for the square a seat's pawns enter on. */
  start?: boolean;
  /** True for the non-start safe squares, drawn with a star. */
  star?: boolean;
  /** True for the last shared square before a seat turns into its lane. */
  laneEntry?: boolean;
}

const run = (row: number, col: number, dRow: number, dCol: number, count: number): Cell[] =>
  Array.from({ length: count }, (_, i) => ({ row: row + dRow * i, col: col + dCol * i }));

/** The 52-square shared loop, clockwise, beginning at red's start square. */
const TRACK_CELLS: readonly Cell[] = [
  ...run(6, 1, 0, 1, 5), // red start, east along the left arm
  ...run(5, 6, -1, 0, 6), // north up the top arm
  { row: 0, col: 7 },
  ...run(0, 8, 1, 0, 6), // south down the top arm (green start is second)
  ...run(6, 9, 0, 1, 6), // east along the right arm
  { row: 7, col: 14 },
  ...run(8, 14, 0, -1, 6), // west along the right arm (yellow start is second)
  ...run(9, 8, 1, 0, 6), // south down the bottom arm
  { row: 14, col: 7 },
  ...run(14, 6, -1, 0, 6), // north up the bottom arm (blue start is second)
  ...run(8, 5, 0, -1, 6), // west along the left arm
  { row: 7, col: 0 },
  { row: 6, col: 0 },
];

const LANE_CELLS: readonly (readonly Cell[])[] = [
  run(7, 1, 0, 1, LANE_LENGTH), // red: east toward the centre
  run(1, 7, 1, 0, LANE_LENGTH), // green: south
  run(7, 13, 0, -1, LANE_LENGTH), // yellow: west
  run(13, 7, -1, 0, LANE_LENGTH), // blue: north
];

/** Top-left cell of each seat's 6×6 home quadrant. */
export const YARD_ORIGINS: readonly Cell[] = [
  { row: 0, col: 0 },
  { row: 0, col: 9 },
  { row: 9, col: 9 },
  { row: 9, col: 0 },
];

export const startTrackIndex = (seat: Seat): number => seat * SEAT_TRACK_OFFSET;

const mod = (n: number, m: number) => ((n % m) + m) % m;

function buildTrack(): BoardNode[] {
  return TRACK_CELLS.map((cell, trackIndex) => {
    const offset = trackIndex % SEAT_TRACK_OFFSET;
    const nearestSeat = Math.floor(trackIndex / SEAT_TRACK_OFFSET) as Seat;
    const start = offset === 0;
    const star = offset === STAR_OFFSET;
    // The square two before a start is where the *next* seat's lane begins.
    const laneEntrySeat = SEATS.find((s) => mod(startTrackIndex(s) - 2, TRACK_LENGTH) === trackIndex);
    const node: BoardNode = { ...cell, id: `t${trackIndex}`, kind: 'track', safe: start || star, trackIndex };
    if (start) {
      node.start = true;
      node.seat = nearestSeat;
    }
    if (star) node.star = true;
    if (laneEntrySeat !== undefined) {
      node.laneEntry = true;
      node.seat = laneEntrySeat;
    }
    return node;
  });
}

export const TRACK: readonly BoardNode[] = buildTrack();

export const LANES: readonly (readonly BoardNode[])[] = SEATS.map((seat) =>
  LANE_CELLS[seat]!.map((cell, i) => ({ ...cell, id: `h${seat}-${i}`, kind: 'lane' as const, safe: true, seat })),
);

/** Each seat finishes in the shared centre; one logical node per seat. */
export const FINISH: readonly BoardNode[] = SEATS.map((seat) => ({
  row: 7,
  col: 7,
  id: `f${seat}`,
  kind: 'finish' as const,
  safe: true,
  seat,
}));

/**
 * The full ordered path a seat's pawn walks once it leaves the yard:
 * 51 shared squares, 5 lane squares, then the finish (57 nodes).
 */
export function pathForSeat(seat: Seat): BoardNode[] {
  const start = startTrackIndex(seat);
  const shared = Array.from({ length: TRACK_LENGTH - 1 }, (_, i) => TRACK[(start + i) % TRACK_LENGTH]!);
  return [...shared, ...LANES[seat]!, FINISH[seat]!];
}

/** Resting spots inside a seat's yard, in fractional grid coordinates. */
export function yardSpots(seat: Seat): Cell[] {
  const o = YARD_ORIGINS[seat]!;
  const c = 2.5;
  const d = 0.9;
  return [
    { row: o.row + c - d, col: o.col + c - d },
    { row: o.row + c - d, col: o.col + c + d },
    { row: o.row + c + d, col: o.col + c - d },
    { row: o.row + c + d, col: o.col + c + d },
  ];
}

/** Every node a pawn can stand on (72 squares + 4 finish nodes). */
export const ALL_NODES: readonly BoardNode[] = [...TRACK, ...LANES.flat(), ...FINISH];

export const nodeById = (id: string): BoardNode | undefined => ALL_NODES.find((n) => n.id === id);

/** Rotate a cell 90° clockwise about the board centre. */
export const rotateCell = ({ row, col }: Cell): Cell => ({ row: col, col: GRID_SIZE - 1 - row });
