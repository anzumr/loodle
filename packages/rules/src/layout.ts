/**
 * Board shapes for 4 to 8 seats.
 *
 * Every board is the classic one generalised: N identical arms around a
 * central N-sided finish, each arm three squares wide and six long, with a
 * home wedge between each pair of arms. The shared loop has 13 squares per
 * seat, so the classic board is simply N = 4. Because each seat's arm, start,
 * star, lane and yard are the same shape rotated by 360/N degrees, every seat
 * travels the same distance over the same pattern of safe squares. Seat
 * fairness is structural; the simulations in the tests confirm it.
 */
import type { Seat } from './classicBoard';

export const MIN_BOARD_SEATS = 4;
export const MAX_BOARD_SEATS = 8;
/** Shared-loop squares between one seat's start and the next. */
export const SQUARES_PER_SEAT = 13;
export const LANE_SQUARES = 5;


export interface BoardShape {
  boardSeats: number;
  /** Squares in the shared loop. */
  trackLength: number;
  /** Last step of a pawn's path that is on the shared loop. */
  lastSharedStep: number;
  /** Step value of a pawn that is home. */
  finishStep: number;
}

export function boardShape(boardSeats = 4): BoardShape {
  if (!Number.isInteger(boardSeats) || boardSeats < MIN_BOARD_SEATS || boardSeats > MAX_BOARD_SEATS)
    throw new Error(`Boards have ${MIN_BOARD_SEATS} to ${MAX_BOARD_SEATS} seats`);
  const trackLength = SQUARES_PER_SEAT * boardSeats;
  return { boardSeats, trackLength, lastSharedStep: trackLength - 2, finishStep: trackLength - 2 + LANE_SQUARES + 1 };
}

/** Start squares and star squares, eight squares after each start, are safe on every board. */
export const isSafeTrackIndex = (index: number): boolean => index % SQUARES_PER_SEAT === 0 || index % SQUARES_PER_SEAT === 8;

/** Which board a match with this many players uses: the classic one up to four, then one arm per player. */
export const boardSeatsFor = (players: number): number => Math.max(MIN_BOARD_SEATS, players);

// ---------- geometry (for drawing; the rules never read positions) ----------

/** A position on the board plane. One unit is one square; the centre is (0, 0); +x is right, +z is toward the viewer. */
export interface Point {
  x: number;
  z: number;
}

export interface BoardLayout extends BoardShape {
  /** Centre of each shared-loop square, indexed like the rules' track index. */
  track: Point[];
  /** lanes[seat][i]: the five home-lane squares, outermost first. */
  lanes: Point[][];
  /** Centre of each seat's yard. */
  yards: Point[];
  /** yardSpots[seat][pawn]: where waiting pawns stand. */
  yardSpots: Point[][];
  /** Direction each seat's arm points, in radians: 0 is left, increasing clockwise on screen. */
  armAngles: number[];
  /** Direction of each seat's yard, halfway between its arm and the next. */
  yardAngles: number[];
  /** Distance from the centre to the inner end of the arms. */
  hubRadius: number;
  /** Distance from the centre to the outer end of the arms. */
  radius: number;
}

/** Turn a point about the centre. Positive angles turn clockwise as seen on screen. */
export const rotatePoint = (p: Point, angle: number): Point => ({
  x: p.x * Math.cos(angle) - p.z * Math.sin(angle),
  z: p.x * Math.sin(angle) + p.z * Math.cos(angle),
});
// Adding 0 turns a negative zero into a plain zero.
const round = (p: Point): Point => ({ x: Math.round(p.x * 1e6) / 1e6 + 0, z: Math.round(p.z * 1e6) / 1e6 + 0 });

export function boardLayout(boardSeats = 4): BoardLayout {
  const shape = boardShape(boardSeats);
  const turn = (Math.PI * 2) / boardSeats;
  const hubRadius = 1.5 / Math.tan(Math.PI / boardSeats);
  /**
   * A square on arm `arm`. `v` counts outward from the hub (1 to 6); `u` is the
   * column: +1 is the side pawns travel inward on, 0 the lane, -1 the outward side.
   * Arm 0 points left, exactly as red's arm does on the classic board.
   */
  const cell = (arm: number, u: number, v: number): Point => round(rotatePoint({ x: -(hubRadius + v - 0.5), z: -u }, arm * turn));

  const track: Point[] = [];
  for (let seat = 0; seat < boardSeats; seat++) {
    const next = (seat + 1) % boardSeats;
    for (let v = 5; v >= 1; v--) track.push(cell(seat, 1, v)); // start square, then inward
    for (let v = 1; v <= 6; v++) track.push(cell(next, -1, v)); // out along the next arm
    track.push(cell(next, 0, 6)); // across its tip (that seat's lane entry)
    track.push(cell(next, 1, 6)); // the square before that seat's start
  }

  // Yards are the triangular wedges between arms. Pawns wait in a triangle that
  // narrows toward the centre: two at the wide outer edge, then one, then one.
  const half = Math.PI / boardSeats;
  const outerEdge = (hubRadius + 6) * Math.cos(half) + 1.5 * Math.sin(half);
  const pairAt = outerEdge - 1.15;
  const yardAngles = Array.from({ length: boardSeats }, (_, seat) => (seat + 0.5) * turn);
  const local: Point[] = [
    { x: -pairAt, z: -0.72 },
    { x: -pairAt, z: 0.72 },
    { x: -(pairAt - 1.3), z: 0 },
    { x: -(pairAt - 2.6), z: 0 },
  ];
  const yardDistance = pairAt - 1.0;
  return {
    ...shape,
    track,
    lanes: Array.from({ length: boardSeats }, (_, seat) => Array.from({ length: LANE_SQUARES }, (_, i) => cell(seat, 0, 5 - i))),
    yards: yardAngles.map((a) => round(rotatePoint({ x: -yardDistance, z: 0 }, a))),
    yardSpots: yardAngles.map((a) => local.map((p) => round(rotatePoint(p, a)))),
    armAngles: Array.from({ length: boardSeats }, (_, seat) => seat * turn),
    yardAngles,
    hubRadius,
    radius: hubRadius + 6,
  };
}

/** Where a pawn of `seat` stands at each step of its path, start square first. The finish is the board centre. */
export function seatPathPoints(layout: BoardLayout, seat: Seat): Point[] {
  const start = seat * SQUARES_PER_SEAT;
  const shared = Array.from({ length: layout.trackLength - 1 }, (_, i) => layout.track[(start + i) % layout.trackLength]!);
  return [...shared, ...layout.lanes[seat]!, { x: 0, z: 0 }];
}
