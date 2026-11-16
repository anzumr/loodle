import { describe, expect, it } from 'vitest';
import {
  ALL_NODES,
  FINISH,
  GRID_SIZE,
  LANES,
  PATH_LENGTH,
  SEATS,
  TRACK,
  TRACK_LENGTH,
  YARD_ORIGINS,
  pathForSeat,
  rotateCell,
  startTrackIndex,
  yardSpots,
  type Cell,
} from '../src';

const key = (c: Cell) => `${c.row},${c.col}`;
const inYard = (c: Cell) => YARD_ORIGINS.some((o) => c.row >= o.row && c.row < o.row + 6 && c.col >= o.col && c.col < o.col + 6);
const inCentre = (c: Cell) => c.row >= 6 && c.row <= 8 && c.col >= 6 && c.col <= 8;

describe('classic board: shared track', () => {
  it('has 52 unique squares inside the grid', () => {
    expect(TRACK).toHaveLength(TRACK_LENGTH);
    expect(new Set(TRACK.map(key)).size).toBe(TRACK_LENGTH);
    for (const c of TRACK) {
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeLessThan(GRID_SIZE);
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(GRID_SIZE);
    }
  });

  it('never enters a home quadrant or the centre', () => {
    for (const c of TRACK) {
      expect(inYard(c)).toBe(false);
      expect(inCentre(c)).toBe(false);
    }
  });

  it('forms a closed loop of touching squares', () => {
    TRACK.forEach((c, i) => {
      const next = TRACK[(i + 1) % TRACK_LENGTH]!;
      const step = Math.max(Math.abs(next.row - c.row), Math.abs(next.col - c.col));
      expect(step).toBe(1);
    });
  });

  it('is four-fold symmetric: rotating 90° advances 13 squares', () => {
    TRACK.forEach((c, i) => {
      expect(key(rotateCell(c))).toBe(key(TRACK[(i + 13) % TRACK_LENGTH]!));
    });
  });

  it('travels clockwise (red heads east, then north)', () => {
    expect(key(TRACK[0]!)).toBe('6,1');
    expect(key(TRACK[4]!)).toBe('6,5');
    expect(key(TRACK[5]!)).toBe('5,6');
  });
});

describe('classic board: starts, stars, lanes', () => {
  it('places start squares to match the reference board', () => {
    const starts = SEATS.map((s) => TRACK[startTrackIndex(s)]!);
    expect(starts.map(key)).toEqual(['6,1', '1,8', '8,13', '13,6']);
    starts.forEach((n, seat) => {
      expect(n.start).toBe(true);
      expect(n.seat).toBe(seat);
      expect(n.safe).toBe(true);
    });
  });

  it('places star squares to match the reference board', () => {
    const stars = TRACK.filter((n) => n.star);
    expect(stars.map(key).sort()).toEqual(['12,8', '2,6', '6,12', '8,2'].sort());
    expect(stars.every((n) => n.safe)).toBe(true);
  });

  it('has exactly eight safe squares on the shared track', () => {
    expect(TRACK.filter((n) => n.safe)).toHaveLength(8);
  });

  it('has five-square lanes pointing at the centre', () => {
    expect(LANES.map((l) => l.map(key))).toEqual([
      ['7,1', '7,2', '7,3', '7,4', '7,5'],
      ['1,7', '2,7', '3,7', '4,7', '5,7'],
      ['7,13', '7,12', '7,11', '7,10', '7,9'],
      ['13,7', '12,7', '11,7', '10,7', '9,7'],
    ]);
    const trackKeys = new Set(TRACK.map(key));
    for (const lane of LANES) for (const n of lane) expect(trackKeys.has(key(n))).toBe(false);
  });

  it('marks one lane-entry square per seat, beside that lane', () => {
    const entries = TRACK.filter((n) => n.laneEntry);
    expect(entries.map(key).sort()).toEqual(['0,7', '14,7', '7,0', '7,14'].sort());
    for (const e of entries) {
      const first = LANES[e.seat!]![0]!;
      expect(Math.abs(first.row - e.row) + Math.abs(first.col - e.col)).toBe(1);
    }
  });

  it('has unique node ids', () => {
    expect(new Set(ALL_NODES.map((n) => n.id)).size).toBe(ALL_NODES.length);
    expect(ALL_NODES).toHaveLength(52 + 20 + 4);
  });
});

describe('classic board: seat paths', () => {
  it('gives every seat an equal 57-node path', () => {
    for (const seat of SEATS) expect(pathForSeat(seat)).toHaveLength(PATH_LENGTH);
  });

  it('starts on the seat start, leaves the loop at its lane entry, ends at its finish', () => {
    for (const seat of SEATS) {
      const path = pathForSeat(seat);
      expect(path[0]).toBe(TRACK[startTrackIndex(seat)]);
      expect(path[50]!.laneEntry).toBe(true);
      expect(path[50]!.seat).toBe(seat);
      expect(path.slice(51, 56)).toEqual(LANES[seat]);
      expect(path[56]).toBe(FINISH[seat]);
    }
  });

  it('never revisits a node and every step touches the previous one', () => {
    for (const seat of SEATS) {
      const path = pathForSeat(seat);
      expect(new Set(path.map((n) => n.id)).size).toBe(PATH_LENGTH);
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1]!;
        const b = path[i]!;
        // The final hop from the last lane square into the centre spans two cells.
        const limit = i === PATH_LENGTH - 1 ? 2 : 1;
        expect(Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col))).toBeLessThanOrEqual(limit);
      }
    }
  });

  it('gives every seat the same safe-square spacing', () => {
    const pattern = (seat: (typeof SEATS)[number]) => pathForSeat(seat).map((n) => (n.safe ? 1 : 0)).join('');
    for (const seat of SEATS) expect(pattern(seat)).toBe(pattern(0));
  });

  it('puts four yard spots inside each seat quadrant', () => {
    for (const seat of SEATS) {
      const o = YARD_ORIGINS[seat]!;
      const spots = yardSpots(seat);
      expect(spots).toHaveLength(4);
      for (const s of spots) {
        expect(s.row).toBeGreaterThan(o.row);
        expect(s.row).toBeLessThan(o.row + 5);
        expect(s.col).toBeGreaterThan(o.col);
        expect(s.col).toBeLessThan(o.col + 5);
      }
    }
  });
});
