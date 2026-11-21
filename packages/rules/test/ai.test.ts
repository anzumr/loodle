import { describe, expect, it } from 'vitest';
import {
  rollFor,
  AI_LEVELS,
  YARD,
  applyAction,
  chooseMove,
  createMatch,
  legalMoves,
  seededDice,
  seededRandom,
  type AiLevel,
  type Seat,
} from '../src';

/** Two-player match between AI levels. Returns the winning seat. */
function duel(seed: number, levels: Partial<Record<Seat, AiLevel>>): Seat {
  const dice = seededDice(seed);
  const random = seededRandom(seed ^ 0x51ed27);
  let state = createMatch({ players: 2 });
  for (let guard = 0; state.turn.phase !== 'over'; guard++) {
    if (guard > 20000) throw new Error('match did not finish');
    const seat = state.turn.seat;
    if (state.turn.phase === 'roll') state = applyAction(state, { type: 'roll', seat, ...rollFor(state, dice) }).state;
    else {
      const pawn = chooseMove(state, levels[seat]!, random);
      expect(legalMoves(state).some((m) => m.pawn === pawn)).toBe(true);
      state = applyAction(state, { type: 'move', seat, pawn }).state;
    }
  }
  return state.finishOrder[0]!;
}

/** Share of games the first level wins, swapping seats every game so neither gets the first move more often. */
function winRate(a: AiLevel, b: AiLevel, games: number): number {
  let wins = 0;
  for (let i = 0; i < games; i++) {
    const aSeat: Seat = i % 2 === 0 ? 0 : 2;
    const bSeat: Seat = aSeat === 0 ? 2 : 0;
    if (duel(1000 + i, { [aSeat]: a, [bSeat]: b }) === aSeat) wins++;
  }
  return wins / games;
}

describe('AI opponents', () => {
  it('always returns a legal move at every level', () => {
    for (const level of AI_LEVELS) duel(7, { 0: level, 2: level });
  });

  it('is deterministic for a given random seed', () => {
    const state = createMatch();
    state.pawns[0] = [10, 20, YARD, 30];
    const rolled = applyAction(state, { type: 'roll', seat: 0, value: 6 }).state;
    for (const level of AI_LEVELS)
      expect(chooseMove(rolled, level, seededRandom(3))).toBe(chooseMove(rolled, level, seededRandom(3)));
  });

  it('takes a capture when one is available (medium and above)', () => {
    const state = createMatch();
    state.pawns[0] = [10, 30, YARD, YARD];
    state.pawns[1] = [1, YARD, YARD, YARD]; // green on track 14, four ahead of red's pawn 0
    const rolled = applyAction(state, { type: 'roll', seat: 0, value: 4 }).state;
    for (const level of ['hard', 'expert'] as const) expect(chooseMove(rolled, level, seededRandom(1))).toBe(0);
  });

  it('moves a threatened pawn to safety rather than a safe one (hard and above)', () => {
    const state = createMatch();
    // Red pawn 0 on track 18 has green two squares behind it; a 3 reaches the star on track 21.
    state.pawns[0] = [18, 40, YARD, YARD];
    state.pawns[1] = [3, YARD, YARD, YARD];
    const rolled = applyAction(state, { type: 'roll', seat: 0, value: 3 }).state;
    for (const level of ['hard', 'expert'] as const) expect(chooseMove(rolled, level, seededRandom(1))).toBe(0);
  });

  it('gets stronger with level', () => {
    const games = 300;
    const results = {
      'easy vs beginner': winRate('easy', 'beginner', games),
      'medium vs beginner': winRate('medium', 'beginner', games),
      'hard vs beginner': winRate('hard', 'beginner', games),
      'expert vs beginner': winRate('expert', 'beginner', games),
      'hard vs medium': winRate('hard', 'medium', games),
      'expert vs medium': winRate('expert', 'medium', games),
    };
    expect(results['easy vs beginner']).toBeGreaterThan(0.5);
    expect(results['medium vs beginner']).toBeGreaterThan(0.6);
    expect(results['hard vs beginner']).toBeGreaterThan(0.65);
    expect(results['expert vs beginner']).toBeGreaterThan(0.65);
    expect(results['hard vs medium']).toBeGreaterThan(0.5);
    expect(results['expert vs medium']).toBeGreaterThan(0.5);
  }, 120000);
});
