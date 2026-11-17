import { describe, expect, it } from 'vitest';
import {
  FINISH_STEP,
  RuleError,
  TRACK,
  YARD,
  applyAction,
  createMatch,
  deserializeMatch,
  legalMoves,
  replay,
  seededDice,
  serializeMatch,
  trackIndexAt,
  type Action,
  type GameEvent,
  type MatchState,
  type RulesConfig,
  type Seat,
} from '../src';

/** A match with pawns placed by hand. Unlisted seats keep everything in the yard. */
function setup(pawns: Partial<Record<Seat, number[]>>, opts: { seat?: Seat; players?: number; config?: Partial<RulesConfig> } = {}) {
  const state = createMatch({ players: opts.players ?? 4, config: opts.config });
  for (const [seat, list] of Object.entries(pawns)) state.pawns[Number(seat)] = [...list!];
  state.turn.seat = opts.seat ?? 0;
  return state;
}

/** Apply rolls and moves in order: a number rolls, `m0` moves pawn 0. */
function play(state: MatchState, ...steps: (number | `m${number}`)[]) {
  const events: GameEvent[] = [];
  for (const step of steps) {
    const seat = state.turn.seat;
    const action: Action = typeof step === 'number' ? { type: 'roll', seat, value: step } : { type: 'move', seat, pawn: Number(step.slice(1)) };
    const result = applyAction(state, action);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

const types = (events: GameEvent[]) => events.map((e) => e.type);

describe('setup', () => {
  it('seats two players opposite each other and three or four clockwise', () => {
    expect(createMatch({ players: 2 }).seats).toEqual([0, 2]);
    expect(createMatch({ players: 3 }).seats).toEqual([0, 1, 2]);
    expect(createMatch({ players: 4 }).seats).toEqual([0, 1, 2, 3]);
  });

  it('starts every pawn in the yard with 2, 3 or 4 pawns each', () => {
    for (const n of [2, 3, 4] as const) {
      const s = createMatch({ players: 4, config: { pawnsPerPlayer: n } });
      expect(s.pawns.every((p) => p.length === n && p.every((x) => x === YARD))).toBe(true);
    }
    expect(createMatch({ players: 2 }).pawns.map((p) => p.length)).toEqual([4, 0, 4, 0]);
  });

  it('rejects unsupported player and pawn counts', () => {
    expect(() => createMatch({ players: 9 })).toThrow(RuleError);
    expect(() => createMatch({ config: { pawnsPerPlayer: 5 as never } })).toThrow(RuleError);
    expect(() => createMatch({ seats: [0, 0] })).toThrow(RuleError);
  });
});

describe('entering and moving', () => {
  it('needs a six to leave the yard; otherwise the turn passes', () => {
    const { state, events } = play(createMatch(), 5);
    expect(types(events)).toEqual(['rolled', 'noLegalMove', 'turnPassed']);
    expect(state.turn).toMatchObject({ seat: 1, phase: 'roll' });
  });

  it('enters on the start square with a six and rolls again', () => {
    const { state, events } = play(createMatch(), 6, 'm2');
    expect(state.pawns[0]).toEqual([YARD, YARD, 0, YARD]);
    expect(events).toContainEqual({ type: 'bonusRoll', seat: 0, reason: 'six' });
    expect(state.turn).toMatchObject({ seat: 0, phase: 'roll', sixes: 1 });
  });

  it('advances by the die and passes the turn on a non-six', () => {
    const { state } = play(setup({ 0: [10, YARD, YARD, YARD] }), 4, 'm0');
    expect(state.pawns[0]![0]).toBe(14);
    expect(state.turn.seat).toBe(1);
  });

  it('offers every legal pawn and nothing else', () => {
    const s = play(setup({ 0: [10, YARD, 54, FINISH_STEP] }), 6).state;
    // pawn 0 moves, pawn 1 enters, pawn 2 would overshoot, pawn 3 is home
    expect(legalMoves(s).map((m) => [m.pawn, m.to])).toEqual([
      [0, 16],
      [1, 0],
    ]);
  });

  it('keeps a six-roller rolling even when no pawn can use the six', () => {
    const { state, events } = play(setup({ 0: [54, FINISH_STEP, FINISH_STEP, FINISH_STEP] }), 6);
    expect(types(events)).toEqual(['rolled', 'noLegalMove', 'bonusRoll']);
    expect(state.turn).toMatchObject({ seat: 0, phase: 'roll', sixes: 1 });
  });

  it('rotates clockwise and maps each seat onto its own start square', () => {
    expect([0, 1, 2, 3].map((s) => trackIndexAt(s as Seat, 0))).toEqual([0, 13, 26, 39]);
    let s = createMatch();
    const order: Seat[] = [];
    for (let i = 0; i < 5; i++) {
      order.push(s.turn.seat);
      s = play(s, 3).state;
    }
    expect(order).toEqual([0, 1, 2, 3, 0]);
  });
});

describe('three consecutive sixes (locked rule)', () => {
  it('6, 6, 6: two moves stand, the third six moves nothing and ends the turn', () => {
    const start = setup({ 0: [10, YARD, YARD, YARD] });
    const afterTwo = play(start, 6, 'm0', 6, 'm1');
    expect(afterTwo.state.pawns[0]).toEqual([16, 0, YARD, YARD]);
    expect(afterTwo.state.turn).toMatchObject({ seat: 0, phase: 'roll', sixes: 2 });

    const third = play(afterTwo.state, 6);
    expect(types(third.events)).toEqual(['rolled', 'thirdSixForfeit', 'turnPassed']);
    expect(third.state.pawns[0]).toEqual([16, 0, YARD, YARD]); // first two moves remain
    expect(third.state.turn).toMatchObject({ seat: 1, phase: 'roll', sixes: 0, die: null });
    expect(legalMoves(third.state)).toEqual([]);
  });

  it('rejects any move or further roll by the forfeiting player', () => {
    const s = play(setup({ 0: [10, YARD, YARD, YARD] }), 6, 'm0', 6, 'm0', 6).state;
    expect(() => applyAction(s, { type: 'move', seat: 0, pawn: 0 })).toThrow(RuleError);
    expect(() => applyAction(s, { type: 'roll', seat: 0, value: 3 })).toThrow(RuleError);
  });

  it('6, 6, 5: the third roll is an ordinary move, then the turn passes', () => {
    const { state } = play(setup({ 0: [10, YARD, YARD, YARD] }), 6, 'm0', 6, 'm0', 5, 'm0');
    expect(state.pawns[0]![0]).toBe(27);
    expect(state.turn.seat).toBe(1);
  });

  it('keeps a capture made with an earlier six', () => {
    // Red on step 10 = track 10; green pawn sits on track 16 (green step 3).
    const start = setup({ 0: [10, 20, YARD, YARD], 1: [3, YARD, YARD, YARD] });
    const { state, events } = play(start, 6, 'm0', 6, 'm1', 6);
    expect(events).toContainEqual({ type: 'captured', seat: 1, pawn: 0, by: 0 });
    expect(state.pawns[1]![0]).toBe(YARD);
    expect(state.pawns[0]).toEqual([16, 26, YARD, YARD]);
    expect(state.turn.seat).toBe(1);
  });

  it('counts sixes that could not be used, and resets on a non-six', () => {
    const stuck = setup({ 0: [54, FINISH_STEP, FINISH_STEP, FINISH_STEP] });
    expect(types(play(stuck, 6, 6, 6).events)).toContain('thirdSixForfeit');
    const reset = play(setup({ 0: [10, 30, YARD, YARD], 1: [3, YARD, YARD, YARD] }), 6, 'm0').state;
    // capture bonus roll of 2 resets the streak; two more sixes are then allowed
    const cont = play(reset, 6, 'm0', 2, 'm1');
    expect(cont.state.turn.seat).toBe(1);
  });

  it('survives save and reload before the third six', () => {
    const two = play(setup({ 0: [10, YARD, YARD, YARD] }), 6, 'm0', 6, 'm0').state;
    const reloaded = deserializeMatch(serializeMatch(two));
    expect(reloaded).toEqual(two);
    expect(types(play(reloaded, 6).events)).toContain('thirdSixForfeit');
  });
});

describe('captures and safe squares', () => {
  it('sends a captured pawn home and grants another roll', () => {
    const { state, events } = play(setup({ 0: [10, YARD, YARD, YARD], 1: [1, YARD, YARD, YARD] }), 4, 'm0');
    expect(state.pawns[1]![0]).toBe(YARD);
    expect(events).toContainEqual({ type: 'bonusRoll', seat: 0, reason: 'capture' });
    expect(state.turn).toMatchObject({ seat: 0, phase: 'roll', sixes: 0 });
  });

  it('never captures on a star square', () => {
    // Red step 8 is the star at track 8; green reaches it on step 47.
    const { state, events } = play(setup({ 0: [5, YARD, YARD, YARD], 1: [47, YARD, YARD, YARD] }), 3, 'm0');
    expect(TRACK[8]!.star).toBe(true);
    expect(types(events)).not.toContain('captured');
    expect(state.pawns[1]![0]).toBe(47);
    expect(state.turn.seat).toBe(1);
  });

  it('never captures on a start square, including when entering', () => {
    // Green pawn waits on red's start (green step 39 = track 0).
    const { state } = play(setup({ 1: [39, YARD, YARD, YARD] }), 6, 'm0');
    expect(state.pawns[0]![0]).toBe(0);
    expect(state.pawns[1]![0]).toBe(39);
  });

  it('cannot capture inside a home lane', () => {
    const s = play(setup({ 0: [50, YARD, YARD, YARD], 1: [52, YARD, YARD, YARD] }), 2).state;
    expect(legalMoves(s)[0]).toMatchObject({ to: 52, captures: [] });
  });

  it('grants one roll for a capturing six by default, two when stacking is on', () => {
    const pawns = { 0: [10, YARD, YARD, YARD], 1: [3, YARD, YARD, YARD] };
    const single = play(setup(pawns), 6, 'm0', 2, 'm0').state;
    expect(single.turn.seat).toBe(1);
    const stacked = play(setup(pawns, { config: { stackBonuses: true } }), 6, 'm0', 2, 'm0').state;
    expect(stacked.turn).toMatchObject({ seat: 0, phase: 'roll', pendingBonus: 0 });
    expect(play(stacked, 2, 'm0').state.turn.seat).toBe(1);
  });
});

describe('blockades', () => {
  // Two green pawns on green step 3 = track 16.
  const wall = { 1: [3, 3, YARD, YARD] };

  it('stops opponents landing on or passing a blockade', () => {
    const land = play(setup({ ...wall, 0: [12, YARD, YARD, YARD] }), 4);
    expect(types(land.events)).toContain('noLegalMove');
    const pass = play(setup({ ...wall, 0: [12, YARD, YARD, YARD] }), 5);
    expect(types(pass.events)).toContain('noLegalMove');
    const short = play(setup({ ...wall, 0: [12, YARD, YARD, YARD] }), 3).state;
    expect(legalMoves(short)).toHaveLength(1);
  });

  it('lets the owner pass and join their own blockade', () => {
    const s = play(setup({ 1: [3, 3, 1, YARD] }, { seat: 1 }), 2).state;
    expect(legalMoves(s).map((m) => m.to)).toEqual([5, 5, 3]);
  });

  it('blocks entry when a blockade sits on the start square', () => {
    const { events } = play(setup({ 1: [39, 39, YARD, YARD] }), 6);
    expect(types(events)).toContain('noLegalMove');
  });

  it('can be switched off, in which case a lone landing pawn captures both', () => {
    const { state } = play(setup({ ...wall, 0: [12, YARD, YARD, YARD] }, { config: { blockades: false } }), 4, 'm0');
    expect(state.pawns[1]).toEqual([YARD, YARD, YARD, YARD]);
  });
});

describe('finishing', () => {
  it('requires the exact number to finish', () => {
    const s = setup({ 0: [53, YARD, YARD, YARD] });
    expect(types(play(s, 4).events)).toContain('noLegalMove');
    const done = play(s, 3, 'm0');
    expect(done.state.pawns[0]![0]).toBe(FINISH_STEP);
    expect(types(done.events)).toContain('pawnFinished');
    expect(done.state.turn.seat).toBe(1); // no finish bonus by default
  });

  it('can grant a roll for finishing a pawn when configured', () => {
    const { state } = play(setup({ 0: [53, YARD, YARD, YARD] }, { config: { bonusOnFinish: true } }), 3, 'm0');
    expect(state.turn).toMatchObject({ seat: 0, phase: 'roll' });
  });

  it('turns into the home lane instead of circling again', () => {
    const { state } = play(setup({ 0: [49, YARD, YARD, YARD] }), 3, 'm0');
    expect(state.pawns[0]![0]).toBe(52);
    expect(trackIndexAt(0, 52)).toBeNull();
  });

  it('records full finishing order, skips finished seats, and ends the match', () => {
    const home = [FINISH_STEP, FINISH_STEP, FINISH_STEP];
    let s = setup({ 0: [55, ...home], 1: [55, ...home], 2: [10, 20, YARD, YARD] }, { players: 3 });
    let r = play(s, 1, 'm0');
    expect(r.events).toContainEqual({ type: 'seatFinished', seat: 0, place: 1 });
    expect(r.state.turn).toMatchObject({ seat: 1, phase: 'roll' });
    r = play(r.state, 2, 3, 'm0'); // green misses, yellow moves, red is skipped
    expect(r.state.turn.seat).toBe(1);
    r = play(r.state, 1, 'm0');
    expect(r.events).toContainEqual({ type: 'matchOver', order: [0, 1, 2] });
    expect(r.state.turn.phase).toBe('over');
    expect(() => applyAction(r.state, { type: 'roll', seat: 2, value: 1 })).toThrow(RuleError);
  });

  it('ends the turn of a seat that finishes on a six', () => {
    const home = [FINISH_STEP, FINISH_STEP, FINISH_STEP];
    const { state } = play(setup({ 0: [50, ...home] }), 6, 'm0');
    expect(state.finishOrder).toEqual([0]);
    expect(state.turn.seat).toBe(1);
  });
});

describe('action validation', () => {
  it('rejects out-of-turn, out-of-phase and malformed actions without changing state', () => {
    const s = createMatch();
    const before = serializeMatch(s);
    expect(() => applyAction(s, { type: 'roll', seat: 1, value: 3 })).toThrow(RuleError);
    expect(() => applyAction(s, { type: 'move', seat: 0, pawn: 0 })).toThrow(RuleError);
    for (const value of [0, 7, 2.5, NaN]) expect(() => applyAction(s, { type: 'roll', seat: 0, value })).toThrow(RuleError);
    const rolled = play(s, 6).state;
    expect(() => applyAction(rolled, { type: 'roll', seat: 0, value: 3 })).toThrow(RuleError);
    expect(() => applyAction(rolled, { type: 'move', seat: 0, pawn: 9 })).toThrow(RuleError);
    expect(serializeMatch(s)).toBe(before);
  });

  it('rejects corrupt saved matches', () => {
    const good = createMatch();
    const bad = (patch: (s: MatchState) => void) => {
      const copy = JSON.parse(serializeMatch(good)) as MatchState;
      patch(copy);
      return () => deserializeMatch(JSON.stringify(copy));
    };
    expect(bad((s) => (s.pawns[0]![0] = 99))).toThrow(RuleError);
    expect(bad((s) => (s.turn.sixes = 3))).toThrow(RuleError);
    expect(bad((s) => (s.turn.die = 4))).toThrow(RuleError);
    expect(bad((s) => (s.turn.seat = 1 as Seat) && (s.seats = [0, 2]))).toThrow(RuleError);
  });
});

describe('full simulated matches', () => {
  function simulate(seed: number, players: number, pawnsPerPlayer: 2 | 3 | 4) {
    const dice = seededDice(seed);
    const pick = seededDice(seed ^ 0x9e3779b9);
    const initial = createMatch({ players, config: { pawnsPerPlayer } });
    let state = initial;
    const log: Action[] = [];
    let sixMovesInARow = 0;
    while (state.turn.phase !== 'over') {
      if (log.length > 20000) throw new Error('match did not finish');
      const seat = state.turn.seat;
      let action: Action;
      if (state.turn.phase === 'roll') action = { type: 'roll', seat, value: dice.roll() };
      else {
        const moves = legalMoves(state);
        expect(moves.length).toBeGreaterThan(0);
        action = { type: 'move', seat, pawn: moves[(pick.roll() * 7) % moves.length]!.pawn };
        sixMovesInARow = state.turn.die === 6 ? sixMovesInARow + 1 : 0;
        expect(sixMovesInARow).toBeLessThanOrEqual(2);
      }
      const { state: next, events } = applyAction(state, action);
      if (events.some((e) => e.type === 'turnPassed')) sixMovesInARow = 0;
      log.push(action);
      state = next;
      // Two different seats may only share a safe square.
      const seen = new Map<number, Seat>();
      for (const s of state.seats)
        for (const step of state.pawns[s]!) {
          const idx = trackIndexAt(s, step);
          if (idx === null || TRACK[idx]!.safe) continue;
          expect(seen.get(idx) ?? s).toBe(s);
          seen.set(idx, s);
        }
    }
    return { initial, state, log };
  }

  it('always finishes, with every seat placed, for 2–4 players and 2–4 pawns', () => {
    let seed = 1;
    for (const players of [2, 3, 4])
      for (const pawns of [2, 3, 4] as const)
        for (let i = 0; i < 12; i++) {
          const { state } = simulate(seed++, players, pawns);
          expect([...state.finishOrder].sort()).toEqual([...state.seats].sort());
          // Everyone but the last-placed seat has all pawns home.
          for (const s of state.finishOrder.slice(0, -1)) expect(state.pawns[s]!.every((p) => p === FINISH_STEP)).toBe(true);
        }
  }, 20_000); // Full-game simulations share CPU with the AI tournament and other test workers.

  it('replays an action log to the identical match', () => {
    const { initial, state, log } = simulate(4242, 4, 4);
    expect(replay(initial, log)).toEqual(state);
    const half = replay(initial, log.slice(0, log.length >> 1));
    const resumed = replay(deserializeMatch(serializeMatch(half)), log.slice(log.length >> 1));
    expect(resumed).toEqual(state);
  });

  it('produces fair seeded dice', () => {
    const dice = seededDice(7);
    const counts = Array<number>(7).fill(0);
    for (let i = 0; i < 60000; i++) counts[dice.roll()]!++;
    expect(counts[0]).toBe(0);
    for (let v = 1; v <= 6; v++) expect(Math.abs(counts[v]! - 10000)).toBeLessThan(400);
  });
});
