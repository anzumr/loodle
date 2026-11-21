import { describe, expect, it } from 'vitest';
import {
  MERCY_TRIES,
  RuleError,
  YARD,
  applyAction,
  chooseLegalMove,
  createMatch,
  deserializeMatch,
  mercySixDue,
  rollFor,
  seededDice,
  seededRandom,
  serializeMatch,
  sideOf,
  type MatchState,
} from '../src';

const roll = (s: MatchState, value: number, value2?: number) => applyAction(s, { type: 'roll', seat: s.turn.seat, value, value2 }).state;
const move = (s: MatchState, pawn: number) => applyAction(s, { type: 'move', seat: s.turn.seat, pawn }).state;
/** Two players (red 0, yellow 2). Yellow keeps rolling 1s and has nothing out either. */
const duel = () => createMatch({ players: 2 });

describe('mercy rule', () => {
  it('guarantees a six on the third try with every pawn in the yard', () => {
    let s = duel();
    expect(mercySixDue(s)).toBe(false);
    s = roll(roll(s, 3), 2); // red misses, yellow misses
    s = roll(roll(s, 4), 5); // red misses again, yellow misses again
    expect(s.turn.seat).toBe(0);
    expect(mercySixDue(s)).toBe(true);
    expect(() => roll(s, 2)).toThrow(RuleError);
    s = roll(s, 6);
    expect(s.turn.phase).toBe('move');
    s = move(s, 0);
    expect(s.pawns[0]![0]).toBe(0);
  });

  it('rollFor gives the six when it is due, and the dice otherwise', () => {
    const dice = { roll: () => 2 };
    let s = duel();
    expect(rollFor(s, dice)).toEqual({ value: 2 });
    for (let i = 0; i < MERCY_TRIES - 1; i++) s = roll(roll(s, 2), 2);
    expect(rollFor(s, dice)).toEqual({ value: 6 });
  });

  it('starts counting again after a six', () => {
    let s = duel();
    s = roll(roll(s, 3), 3);
    s = roll(s, 6); // red rolls a six: comes out
    s = move(s, 0);
    expect(s.yardTries?.[0]).toBe(0);
    expect(mercySixDue({ ...s, turn: { ...s.turn, seat: 0, phase: 'roll' } })).toBe(false);
  });

  it('does not apply while a pawn is out', () => {
    let s = duel();
    s.pawns[0] = [10, YARD, YARD, YARD];
    s.pawns[2] = [10, YARD, YARD, YARD];
    for (let i = 0; i < 4; i++) s = move(roll(move(roll(s, 2), 0), 2), 0); // both move a pawn that is out
    expect(s.turn.seat).toBe(0);
    expect(mercySixDue(s)).toBe(false);
  });

  it('applies when the only pawns not home are in the yard', () => {
    let s = duel();
    s.pawns[0] = [56, 56, YARD, YARD];
    s = roll(roll(s, 1), 1);
    s = roll(roll(s, 1), 1);
    expect(mercySixDue(s)).toBe(true);
  });

  it('with two dice, one die is the six', () => {
    let s = createMatch({ players: 2, config: { dice: 2 } });
    s = roll(roll(s, 1, 2), 1, 2);
    s = roll(roll(s, 3, 4), 3, 4);
    expect(() => roll(s, 2, 3)).toThrow(RuleError);
    expect(roll(s, 3, 6).turn.phase).toBe('move');
  });

  it('can be switched off, and old saves without it keep playing without it', () => {
    let s = createMatch({ players: 2, config: { mercy: false } });
    for (let i = 0; i < 4; i++) s = roll(roll(s, 2), 2);
    expect(mercySixDue(s)).toBe(false);
    const old = JSON.parse(serializeMatch(duel()));
    delete old.config.mercy;
    delete old.yardTries;
    expect(deserializeMatch(JSON.stringify(old)).config.mercy).toBe(false);
  });

  it('survives save and reload mid-count', () => {
    const s = roll(roll(roll(roll(duel(), 2), 2), 2), 2);
    expect(mercySixDue(deserializeMatch(serializeMatch(s)))).toBe(true);
  });
});

describe('1v1 with two colours each', () => {
  // Player A: red (0) and yellow (2). Player B: green (1) and blue (3).
  const sides = [0, 1, 0, 1];
  const twoYards = (pawns: Partial<Record<number, number[]>> = {}) => {
    const s = createMatch({ players: 4, config: { sides } });
    for (const [seat, list] of Object.entries(pawns)) s.pawns[Number(seat)] = [...list!];
    return s;
  };

  it('puts the seats on the right sides and needs classic rules', () => {
    const s = twoYards();
    expect(([0, 1, 2, 3] as const).map((seat) => sideOf(s, seat))).toEqual(sides);
    expect(() => createMatch({ players: 4, config: { sides: [0, 0, 0, 0] } })).toThrow(RuleError);
    expect(() => createMatch({ players: 4, config: { sides: [0, 1] } })).toThrow(RuleError);
    expect(() => createMatch({ players: 4, config: { sides, endOnFirstFinish: true, pawnsToWin: 2 } })).toThrow(RuleError);
  });

  it('never captures your own other colour', () => {
    // Red at 12 rolls a 4 onto track 16, where yellow (red's partner) and green both stand.
    const s = twoYards({ 0: [12, YARD, YARD, YARD], 2: [42, YARD, YARD, YARD], 1: [3, YARD, YARD, YARD] });
    const after = applyAction(roll(s, 4), { type: 'move', seat: 0, pawn: 0 });
    const captured = after.events.filter((e) => e.type === 'captured').map((e) => e.type === 'captured' && e.seat);
    expect(captured).toEqual([1]);
    expect(after.state.pawns[2]![0]).toBe(42);
  });

  it('ends when one player has both colours home, and that player places first', () => {
    // Yellow is already home; red brings its last pawn in.
    const s = twoYards({ 0: [55, 56, 56, 56], 2: [56, 56, 56, 56], 1: [20, YARD, YARD, YARD], 3: [40, 10, YARD, YARD] });
    s.finishOrder = [2];
    const end = applyAction(roll(s, 1), { type: 'move', seat: 0, pawn: 0 });
    expect(end.state.turn.phase).toBe('over');
    expect(end.state.finishOrder.slice(0, 2)).toEqual([2, 0]);
    expect(end.state.finishOrder.slice(2).sort()).toEqual([1, 3]);
  });

  it('plays whole matches to a result', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const dice = seededDice(seed);
      const random = seededRandom(seed + 50);
      let s = createMatch({ players: 4, config: { sides, pawnsPerPlayer: 2 } });
      for (let guard = 0; s.turn.phase !== 'over'; guard++) {
        if (guard > 40000) throw new Error('match did not finish');
        const seat = s.turn.seat;
        s = s.turn.phase === 'roll'
          ? applyAction(s, { type: 'roll', seat, ...rollFor(s, dice) }).state
          : applyAction(s, { type: 'move', seat, pawn: chooseLegalMove(s, 'medium', random).pawn }).state;
      }
      const winner = sideOf(s, s.finishOrder[0]!);
      expect(sideOf(s, s.finishOrder[1]!)).toBe(winner);
      expect(s.finishOrder).toHaveLength(4);
    }
  });
});
