/**
 * Computer opponents.
 *
 * The AI only ever chooses among the legal moves for a die it was given.
 * It never sees, rolls or influences dice, so difficulty cannot affect fairness.
 */
import { isSafeTrackIndex } from './layout';
import { YARD, legalMoves, shapeOf, trackIndexIn, type LegalMove, type MatchState } from './engine';

export const AI_LEVELS = ['beginner', 'easy', 'medium', 'hard', 'expert'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];

/** Returns a number in [0, 1). */
export type Random = () => number;

/** Repeatable random source for tests and simulations. */
export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Weights {
  /** Chance of ignoring everything and moving at random. */
  blunder: number;
  capture: number;
  finish: number;
  enter: number;
  progress: number;
  safe: number;
  /** Penalty per opponent pawn that could capture the pawn where it lands. */
  risk: number;
  /** Reward for moving a pawn out of danger. */
  escape: number;
  /** Reward per opponent pawn left within reach ahead of the landing square. */
  chase: number;
  blockade: number;
}

const LEVELS: Record<AiLevel, Weights> = {
  beginner: { blunder: 1, capture: 0, finish: 0, enter: 0, progress: 0, safe: 0, risk: 0, escape: 0, chase: 0, blockade: 0 },
  easy: { blunder: 0.5, capture: 40, finish: 30, enter: 20, progress: 0.3, safe: 0, risk: 0, escape: 0, chase: 0, blockade: 0 },
  medium: { blunder: 0.12, capture: 50, finish: 35, enter: 24, progress: 0.3, safe: 12, risk: 0, escape: 0, chase: 0, blockade: 0 },
  hard: { blunder: 0, capture: 55, finish: 35, enter: 24, progress: 0.3, safe: 14, risk: 14, escape: 10, chase: 0, blockade: 6 },
  expert: { blunder: 0, capture: 60, finish: 35, enter: 22, progress: 0.35, safe: 16, risk: 20, escape: 14, chase: 5, blockade: 10 },
};

/** Opponent pawns that could land on this seat's pawn if it stood at `step`. */
function threats(state: MatchState, step: number): number {
  const seat = state.turn.seat;
  const here = trackIndexIn(state, seat, step);
  if (here === null || isSafeTrackIndex(here)) return 0;
  let count = 0;
  for (const other of state.seats) {
    if (other === seat) continue;
    for (const theirStep of state.pawns[other]!) {
      const there = trackIndexIn(state, other, theirStep);
      if (there === null) continue;
      const gap = (here - there + shapeOf(state).trackLength) % shapeOf(state).trackLength;
      // They must still be on the shared loop when they arrive.
      if (gap >= 1 && gap <= 6 && theirStep + gap <= shapeOf(state).lastSharedStep) count++;
    }
  }
  return count;
}

/** Opponent pawns this seat could capture next turn from `step`. */
function targets(state: MatchState, step: number): number {
  const seat = state.turn.seat;
  const here = trackIndexIn(state, seat, step);
  if (here === null) return 0;
  let count = 0;
  for (const other of state.seats) {
    if (other === seat) continue;
    for (const theirStep of state.pawns[other]!) {
      const there = trackIndexIn(state, other, theirStep);
      if (there === null || isSafeTrackIndex(there)) continue;
      const gap = (there - here + shapeOf(state).trackLength) % shapeOf(state).trackLength;
      if (gap >= 1 && gap <= 6 && step + gap <= shapeOf(state).lastSharedStep) count++;
    }
  }
  return count;
}

function score(state: MatchState, move: LegalMove, w: Weights): number {
  const seat = state.turn.seat;
  const landing = trackIndexIn(state, seat, move.to);
  let total = (move.to - Math.max(move.from, 0)) * w.progress + move.to * w.progress * 0.2;
  for (const c of move.captures) total += w.capture + state.pawns[c.seat]![c.pawn]! * 0.5;
  if (move.finishes) total += w.finish;
  if (move.from === YARD) total += w.enter;
  if (landing === null || isSafeTrackIndex(landing)) total += w.safe;
  // A pawn far along the path is worth more, so risking it costs more.
  total -= threats(state, move.to) * (w.risk + move.to * w.risk * 0.03);
  if (move.from >= 0) total += threats(state, move.from) * (w.escape + move.from * w.escape * 0.03);
  total += targets(state, move.to) * w.chase;
  if (landing !== null && state.pawns[seat]!.some((s, i) => i !== move.pawn && s === move.to)) total += w.blockade;
  return total;
}

/** Pick a pawn to move for the seat whose turn it is. The match must be in the move phase. */
export function chooseMove(state: MatchState, level: AiLevel, random: Random): number {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error('No legal move to choose from');
  const w = LEVELS[level];
  const pickFrom = (list: LegalMove[]) => list[Math.floor(random() * list.length)]!.pawn;
  if (random() < w.blunder) return pickFrom(moves);
  const scored = moves.map((m) => ({ m, s: score(state, m, w) }));
  const best = Math.max(...scored.map((x) => x.s));
  return pickFrom(scored.filter((x) => x.s >= best - 1e-9).map((x) => x.m));
}
