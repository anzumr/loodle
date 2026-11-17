import { describe, expect, it } from 'vitest';
import {
  QUICK_RACE_RULES,
  RuleError,
  YARD,
  applyAction,
  chooseLegalMove,
  createMatch,
  deserializeMatch,
  diceLeft,
  legalMoves,
  seededDice,
  seededRandom,
  serializeMatch,
  type GameEvent,
  type MatchState,
  type Seat,
} from '../src';

const twoDice = (pawns: Partial<Record<Seat, number[]>> = {}) => {
  const s = createMatch({ players: 4, config: { dice: 2 } });
  for (const [seat, list] of Object.entries(pawns)) s.pawns[Number(seat)] = [...list!];
  return s;
};
const roll = (s: MatchState, a: number, b: number) => applyAction(s, { type: 'roll', seat: s.turn.seat, value: a, value2: b });
const move = (s: MatchState, pawn: number, die?: number) => applyAction(s, { type: 'move', seat: s.turn.seat, pawn, die });
const types = (events: GameEvent[]) => events.map((e) => e.type);

describe('two dice: rolling', () => {
  it('is off by default and must be asked for', () => {
    expect(createMatch().config.dice).toBe(1);
    expect(createMatch({ config: { dice: 2 } }).config.dice).toBe(2);
    expect(() => createMatch({ config: { dice: 3 as never } })).toThrow(RuleError);
  });

  it('needs both dice in a two-dice game and only one in a one-die game', () => {
    expect(() => applyAction(twoDice(), { type: 'roll', seat: 0, value: 3 })).toThrow(RuleError);
    expect(() => roll(twoDice(), 3, 0)).toThrow(RuleError);
    expect(applyAction(createMatch(), { type: 'roll', seat: 0, value: 3, value2: 9 }).events[0]).toEqual({ type: 'rolled', seat: 0, value: 3 });
  });

  it('reports both values', () => {
    expect(roll(twoDice({ 0: [10, YARD, YARD, YARD] }), 2, 5).events[0]).toEqual({ type: 'rolled', seat: 0, value: 2, value2: 5 });
  });

  it('passes the turn when neither die can be used', () => {
    const { state, events } = roll(twoDice(), 2, 5);
    expect(types(events)).toEqual(['rolled', 'noLegalMove', 'noLegalMove', 'turnPassed']);
    expect(state.turn.seat).toBe(1);
  });
});

describe('two dice: moving', () => {
  it('uses each die separately, in either order, then passes the turn', () => {
    const start = twoDice({ 0: [10, 20, YARD, YARD] });
    let r = roll(start, 3, 5);
    expect(diceLeft(r.state)).toEqual([3, 5]);
    expect(legalMoves(r.state).map((m) => [m.pawn, m.die])).toEqual([
      [0, 3],
      [1, 3],
      [0, 5],
      [1, 5],
    ]);
    r = move(r.state, 1, 5);
    expect(r.state.pawns[0]).toEqual([10, 25, YARD, YARD]);
    expect(diceLeft(r.state)).toEqual([3]);
    expect(r.state.turn).toMatchObject({ seat: 0, phase: 'move' });
    r = move(r.state, 0);
    expect(r.state.pawns[0]).toEqual([13, 25, YARD, YARD]);
    expect(r.state.turn).toMatchObject({ seat: 1, phase: 'roll' });
  });

  it('can move one pawn with both dice', () => {
    let r = roll(twoDice({ 0: [10, YARD, YARD, YARD] }), 4, 2);
    r = move(r.state, 0, 4);
    r = move(r.state, 0, 2);
    expect(r.state.pawns[0]![0]).toBe(16);
  });

  it('defaults to the first die that works for the chosen pawn', () => {
    // Pawn 0 can only finish with the 3; the 5 would overshoot.
    const r = move(roll(twoDice({ 0: [53, 10, YARD, YARD] }), 5, 3).state, 0);
    expect(r.state.pawns[0]![0]).toBe(56);
  });

  it('needs a six on one die to bring a pawn out, and then lets the other die move it', () => {
    let r = roll(twoDice(), 6, 4);
    expect(legalMoves(r.state).map((m) => m.die)).toEqual([6, 6, 6, 6]);
    r = move(r.state, 0);
    expect(r.state.pawns[0]![0]).toBe(0);
    r = move(r.state, 0, 4);
    expect(r.state.pawns[0]![0]).toBe(4);
  });

  it('rejects a die that is not left, or a move the chosen die does not allow', () => {
    const r = roll(twoDice({ 0: [10, YARD, YARD, YARD] }), 3, 5);
    expect(() => move(r.state, 0, 6)).toThrow(RuleError);
    expect(() => move(r.state, 1, 3)).toThrow(RuleError);
    const after = move(r.state, 0, 3).state;
    expect(() => move(after, 0, 3)).toThrow(RuleError);
  });

  it('drops the second die when the first move leaves it nothing to do', () => {
    // Pawn at 52 can finish with the 4; the 3 then has no pawn to move.
    const { state, events } = move(roll(twoDice({ 0: [52, 56, 56, 56] }), 4, 3).state, 0, 4);
    expect(types(events)).toContain('seatFinished');
    expect(state.turn.seat).toBe(1);
    const r2 = move(roll(twoDice({ 0: [52, YARD, YARD, YARD] }), 4, 3).state, 0, 4);
    expect(types(r2.events)).toEqual(expect.arrayContaining(['moved', 'pawnFinished', 'noLegalMove']));
  });
});

describe('two dice: bonuses and the three-doubles rule', () => {
  it('gives another roll for a double, after both dice are used', () => {
    let r = roll(twoDice({ 0: [10, YARD, YARD, YARD] }), 3, 3);
    expect(types(r.events)).toContain('bonusRoll');
    r = move(r.state, 0);
    expect(r.state.turn.phase).toBe('move');
    r = move(r.state, 0);
    expect(r.state.turn).toMatchObject({ seat: 0, phase: 'roll', sixes: 1 });
  });

  it('gives one extra roll per roll for captures, not one per capture', () => {
    // Green pawns on track 14 and 16 (green steps 1 and 3); red on track 10.
    let r = roll(twoDice({ 0: [10, YARD, YARD, YARD], 1: [1, 3, YARD, YARD] }), 4, 2);
    r = move(r.state, 0, 4);
    expect(r.events).toContainEqual({ type: 'captured', seat: 1, pawn: 0, by: 0 });
    r = move(r.state, 0, 2);
    expect(r.events).toContainEqual({ type: 'captured', seat: 1, pawn: 1, by: 0 });
    expect(r.state.turn).toMatchObject({ seat: 0, phase: 'roll', pendingBonus: 0 });
    // After that one extra roll, a plain roll passes the turn.
    r = move(roll(r.state, 1, 2).state, 0, 1);
    r = move(r.state, 0, 2);
    expect(r.state.turn.seat).toBe(1);
  });

  it('ends the turn at once on a third double in a row; earlier moves stand', () => {
    let r = roll(twoDice({ 0: [10, YARD, YARD, YARD] }), 2, 2);
    r = move(move(r.state, 0).state, 0);
    r = roll(r.state, 1, 1);
    r = move(move(r.state, 0).state, 0);
    expect(r.state.pawns[0]![0]).toBe(16);
    const third = roll(r.state, 4, 4);
    expect(types(third.events)).toEqual(['rolled', 'thirdSixForfeit', 'turnPassed']);
    expect(third.state.pawns[0]![0]).toBe(16);
    expect(third.state.turn.seat).toBe(1);
  });

  it('resets the double streak after a non-double', () => {
    let r = roll(twoDice({ 0: [10, YARD, YARD, YARD] }), 2, 2);
    r = move(move(r.state, 0).state, 0);
    expect(r.state.turn.sixes).toBe(1);
    r = roll(r.state, 1, 3);
    expect(r.state.turn.sixes).toBe(0);
  });
});

describe('two dice: whole matches', () => {
  const playOut = (seed: number, players: number, rules = {}) => {
    const dice = seededDice(seed);
    const random = seededRandom(seed + 1);
    // Big tables are long with four pawns each, so they play with two here.
    let state = createMatch({ players, config: { dice: 2, pawnsPerPlayer: players > 4 ? 2 : 4, ...rules } });
    const initial = state;
    for (let guard = 0; state.turn.phase !== 'over'; guard++) {
      if (guard > 60000) throw new Error('match did not finish');
      const seat = state.turn.seat;
      if (state.turn.phase === 'roll') state = applyAction(state, { type: 'roll', seat, value: dice.roll(), value2: dice.roll() }).state;
      else {
        const m = chooseLegalMove(state, 'medium', random);
        state = applyAction(state, { type: 'move', seat, pawn: m.pawn, die: m.die }).state;
      }
    }
    return { initial, state };
  };

  it('always finish, with every seat placed, for 2-8 players and quick modes', () => {
    let seed = 1;
    for (const players of [2, 3, 4, 6, 8])
      for (let i = 0; i < 6; i++) {
        const { state } = playOut(seed++, players);
        expect([...state.finishOrder].sort()).toEqual([...state.seats].sort());
      }
    for (let i = 0; i < 6; i++) expect(playOut(seed++, 4, QUICK_RACE_RULES).state.turn.phase).toBe('over');
  });

  it('save and reload mid-roll, between the two dice', () => {
    const r = move(roll(twoDice({ 0: [10, 20, YARD, YARD] }), 3, 5).state, 0, 3).state;
    const back = deserializeMatch(serializeMatch(r));
    expect(back).toEqual(r);
    expect(diceLeft(back)).toEqual([5]);
  });
});
