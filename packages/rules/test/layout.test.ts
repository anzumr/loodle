import { describe, expect, it } from 'vitest';
import {
  LANES,
  QUICK_RACE_RULES,
  TRACK,
  YARD,
  applyAction,
  boardLayout,
  boardShape,
  chooseMove,
  createMatch,
  deserializeMatch,
  finishStepOf,
  isSafeTrackIndex,
  legalMoves,
  rotatePoint,
  seatPathPoints,
  seededDice,
  seededRandom,
  serializeMatch,
  trackIndexAt,
  trackIndexIn,
  type MatchState,
  type Point,
  type Seat,
} from '../src';

const SIZES = [4, 5, 6, 7, 8];
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const roll = (s: MatchState, value: number) => applyAction(s, { type: 'roll', seat: s.turn.seat, value }).state;
const move = (s: MatchState, pawn: number) => applyAction(s, { type: 'move', seat: s.turn.seat, pawn });

describe('board shapes', () => {
  it('has 13 loop squares per seat and the classic numbers for four seats', () => {
    expect(boardShape(4)).toEqual({ boardSeats: 4, trackLength: 52, lastSharedStep: 50, finishStep: 56 });
    expect(boardShape(6)).toEqual({ boardSeats: 6, trackLength: 78, lastSharedStep: 76, finishStep: 82 });
    expect(() => boardShape(3)).toThrow();
    expect(() => boardShape(9)).toThrow();
  });

  it('reproduces the classic board exactly when there are four seats', () => {
    const layout = boardLayout(4);
    TRACK.forEach((node, i) => expect(layout.track[i]).toEqual({ x: node.col - 7, z: node.row - 7 }));
    LANES.forEach((lane, seat) => lane.forEach((node, i) => expect(layout.lanes[seat]![i]).toEqual({ x: node.col - 7, z: node.row - 7 })));
    TRACK.forEach((node, i) => expect(isSafeTrackIndex(i)).toBe(node.safe));
  });

  for (const n of SIZES) {
    describe(`${n} seats`, () => {
      const layout = boardLayout(n);
      const squares = [...layout.track, ...layout.lanes.flat()];

      it('has no overlapping squares', () => {
        expect(layout.track).toHaveLength(13 * n);
        for (let i = 0; i < squares.length; i++)
          for (let j = i + 1; j < squares.length; j++) expect(dist(squares[i]!, squares[j]!)).toBeGreaterThan(0.99);
      });

      it('forms a closed loop of neighbouring squares', () => {
        layout.track.forEach((p, i) => expect(dist(p, layout.track[(i + 1) % layout.track.length]!)).toBeLessThan(1.5));
      });

      it('is identical for every seat: turning the board by one seat maps it onto itself', () => {
        const turn = (Math.PI * 2) / n;
        const same = (a: Point, b: Point) => expect(dist(a, b)).toBeLessThan(1e-4);
        layout.track.forEach((p, i) => same(rotatePoint(p, turn), layout.track[(i + 13) % layout.track.length]!));
        for (let seat = 0; seat < n; seat++) {
          const next = (seat + 1) % n;
          layout.lanes[seat]!.forEach((p, i) => same(rotatePoint(p, turn), layout.lanes[next]![i]!));
          same(rotatePoint(layout.yards[seat]!, turn), layout.yards[next]!);
        }
      });

      it('gives every seat the same path length, lane entry and safe squares', () => {
        const pattern = (seat: number) =>
          Array.from({ length: layout.lastSharedStep + 1 }, (_, step) => (isSafeTrackIndex(trackIndexAt(seat as Seat, step, n)!) ? 1 : 0)).join('');
        for (let seat = 0; seat < n; seat++) {
          const path = seatPathPoints(layout, seat as Seat);
          expect(path).toHaveLength(layout.finishStep + 1);
          expect(path[0]).toEqual(layout.track[seat * 13]);
          // The last shared square sits beside the first lane square.
          expect(dist(path[layout.lastSharedStep]!, path[layout.lastSharedStep + 1]!)).toBeCloseTo(1, 5);
          expect(path.at(-1)).toEqual({ x: 0, z: 0 });
          expect(pattern(seat)).toBe(pattern(0));
        }
      });

      it('keeps yard pawns clear of the track and of each other', () => {
        // The four-seat board is drawn with the classic square yards (classicBoard.yardSpots), not these wedges.
        if (n === 4) return;
        const spots = layout.yardSpots.flat();
        for (const spot of spots) for (const sq of squares) expect(dist(spot, sq)).toBeGreaterThan(1.05);
        for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(dist(spots[i]!, spots[j]!)).toBeGreaterThan(1.2);
      });
    });
  }
});

describe('matches on larger boards', () => {
  it('uses the classic board up to four players and one arm per player beyond that', () => {
    expect(createMatch({ players: 4 }).config.boardSeats).toBe(4);
    for (const n of [5, 6, 7, 8]) {
      const s = createMatch({ players: n });
      expect(s.config.boardSeats).toBe(n);
      expect(s.seats).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(s.pawns).toHaveLength(n);
      expect(s.scores).toHaveLength(n);
    }
    // Mode presets carry the classic board size; more players must still get the larger board.
    expect(createMatch({ players: 6, config: QUICK_RACE_RULES }).config.boardSeats).toBe(6);
    expect(createMatch({ players: 6, config: QUICK_RACE_RULES }).pawns[5]![0]).toBe(0);
    expect(() => createMatch({ players: 9 })).toThrow();
    expect(() => createMatch({ seats: [0, 5] })).toThrow(); // seat 5 does not exist on the classic board
    expect(createMatch({ seats: [0, 3, 5], config: { boardSeats: 6 } }).pawns.map((p) => p.length)).toEqual([4, 0, 0, 4, 0, 4]);
  });

  it('rotates turns through every seat in order', () => {
    let s = createMatch({ players: 7 });
    const order: number[] = [];
    for (let i = 0; i < 8; i++) {
      order.push(s.turn.seat);
      s = roll(s, 3);
    }
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 0]);
  });

  it('captures across the join between the last seat and the first', () => {
    const s = createMatch({ players: 6 });
    // Seat 5 starts on track 65; ten steps on is track 75. Seat 0 reaches track 75 at step 75.
    s.pawns[5] = [8, YARD, YARD, YARD];
    s.pawns[0] = [75, YARD, YARD, YARD];
    s.turn.seat = 5;
    expect(trackIndexIn(s, 5, 10)).toBe(75);
    const { state, events } = move(roll(s, 2), 0);
    expect(events).toContainEqual({ type: 'captured', seat: 0, pawn: 0, by: 5 });
    expect(state.pawns[0]![0]).toBe(YARD);
  });

  it('finishes with the exact number at the longer path end', () => {
    const s = createMatch({ players: 8 });
    const finish = finishStepOf(s);
    expect(finish).toBe(108);
    s.pawns[0] = [finish - 3, YARD, YARD, YARD];
    expect(legalMoves(roll(s, 4))).toEqual([]);
    expect(move(roll(s, 3), 0).state.pawns[0]![0]).toBe(finish);
  });

  it('saves and reloads, and treats older saves without a board size as classic', () => {
    const s = createMatch({ players: 6 });
    s.pawns[4] = [80, 12, YARD, YARD];
    expect(deserializeMatch(serializeMatch(s))).toEqual(s);
    const old = JSON.parse(serializeMatch(createMatch({ players: 3 }))) as { config: { boardSeats?: number } };
    delete old.config.boardSeats;
    expect(deserializeMatch(JSON.stringify(old)).config.boardSeats).toBe(4);
    const bad = JSON.parse(serializeMatch(createMatch({ players: 4 }))) as MatchState;
    bad.pawns[0]![0] = 60; // past the classic finish
    expect(() => deserializeMatch(JSON.stringify(bad))).toThrow();
  });
});

describe('balance on larger boards', () => {
  /** Whole matches with the same AI on every seat. Returns how often each seat won. */
  function winShares(players: number, games: number, pawnsPerPlayer: 2 | 3 | 4 = 2) {
    const wins = Array<number>(players).fill(0);
    for (let g = 0; g < games; g++) {
      const dice = seededDice(g * 7919 + players);
      const random = seededRandom(g * 104729 + players);
      let state = createMatch({ players, config: { pawnsPerPlayer } });
      // Rotate who goes first so the first-move edge is spread evenly and only the board is measured.
      state.turn.seat = (g % players) as Seat;
      for (let guard = 0; state.turn.phase !== 'over'; guard++) {
        if (guard > 60000) throw new Error('match did not finish');
        const seat = state.turn.seat;
        state =
          state.turn.phase === 'roll'
            ? applyAction(state, { type: 'roll', seat, value: dice.roll() }).state
            : applyAction(state, { type: 'move', seat, pawn: chooseMove(state, 'medium', random) }).state;
      }
      expect([...state.finishOrder].sort()).toEqual(Array.from({ length: players }, (_, i) => i));
      wins[state.finishOrder[0]!]!++;
    }
    return wins.map((w) => w / games);
  }

  for (const players of [5, 6, 7, 8]) {
    it(`${players} players: every match finishes and no seat is favoured`, () => {
      const games = 60 * players;
      const shares = winShares(players, games);
      const fair = 1 / players;
      // Allow about 3.5 standard deviations of ordinary luck around an even share.
      const tolerance = 3.5 * Math.sqrt((fair * (1 - fair)) / games);
      for (const share of shares) expect(Math.abs(share - fair)).toBeLessThan(tolerance);
    }, 120000);
  }

  it('also completes with three and four pawns each', () => {
    expect(winShares(5, 5, 3).reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(winShares(8, 5, 4).reduce((a, b) => a + b)).toBeCloseTo(1);
  }, 120000);
});
