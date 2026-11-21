import { describe, expect, it } from 'vitest';
import {
  rollFor,
  CLASSIC_RULES,
  FINISH_STEP,
  QUICK_CLASH_RULES,
  QUICK_RACE_RULES,
  YARD,
  applyAction,
  chooseMove,
  createMatch,
  deserializeMatch,
  seededDice,
  seededRandom,
  serializeMatch,
  type MatchState,
  type RulesConfig,
} from '../src';

const roll = (s: MatchState, value: number) => applyAction(s, { type: 'roll', seat: s.turn.seat, value });
const move = (s: MatchState, pawn: number) => applyAction(s, { type: 'move', seat: s.turn.seat, pawn });

/** Play a whole match with medium AI on every seat. Returns the final state and action count. */
function playOut(seed: number, config: RulesConfig, players = 4) {
  const dice = seededDice(seed);
  const random = seededRandom(seed + 99);
  let state = createMatch({ players, config });
  let actions = 0;
  while (state.turn.phase !== 'over') {
    if (++actions > 20000) throw new Error('match did not finish');
    state = state.turn.phase === 'roll' ? roll(state, rollFor(state, dice).value).state : move(state, chooseMove(state, 'medium', random)).state;
  }
  return { state, actions };
}

describe('Quick Race', () => {
  it('starts each seat with one pawn on its start square', () => {
    const s = createMatch({ config: QUICK_RACE_RULES });
    expect(s.pawns.every((p) => p[0] === 0 && p.slice(1).every((x) => x === YARD))).toBe(true);
    // Play can begin without a six.
    expect(roll(s, 3).state.turn.phase).toBe('move');
  });

  it('ends when the first seat brings two pawns home, ranking the rest by standing', () => {
    const s = createMatch({ config: QUICK_RACE_RULES });
    s.pawns[0] = [FINISH_STEP, 55, YARD, YARD];
    s.pawns[1] = [10, YARD, YARD, YARD];
    s.pawns[2] = [FINISH_STEP, 30, YARD, YARD];
    s.pawns[3] = [40, YARD, YARD, YARD];
    const { state, events } = move(roll(s, 1).state, 1);
    expect(state.turn.phase).toBe('over');
    expect(state.finishOrder).toEqual([0, 2, 3, 1]); // winner, then one home, then by progress
    expect(events.at(-1)).toEqual({ type: 'matchOver', order: [0, 2, 3, 1] });
  });

  it('does not end on the first pawn home', () => {
    const s = createMatch({ config: QUICK_RACE_RULES });
    s.pawns[0] = [55, YARD, YARD, YARD];
    expect(move(roll(s, 1).state, 0).state.turn.phase).toBe('roll');
  });
});

describe('Quick Clash', () => {
  it('scores 3 for a capture and 2 for a pawn home', () => {
    const s = createMatch({ config: QUICK_CLASH_RULES });
    s.pawns[0] = [10, 55, YARD, YARD];
    s.pawns[1] = [1, YARD, YARD, YARD]; // green on track 14
    let r = move(roll(s, 4).state, 0);
    expect(r.events).toContainEqual({ type: 'scored', seat: 0, points: 3, total: 3 });
    r = move(roll(r.state, 1).state, 1); // capture bonus roll brings pawn 1 home
    expect(r.state.scores).toEqual([5, 0, 0, 0]);
  });

  it('ends at the target score with the highest score first', () => {
    const s = createMatch({ config: QUICK_CLASH_RULES });
    s.scores = [8, 4, 9, 0];
    s.pawns[0] = [10, YARD, YARD, YARD];
    s.pawns[1] = [1, YARD, YARD, YARD];
    const { state } = move(roll(s, 4).state, 0);
    expect(state.turn.phase).toBe('over');
    expect(state.scores[0]).toBe(11);
    expect(state.finishOrder.slice(0, 3)).toEqual([0, 2, 1]);
  });

  it('awards the win to the top score when someone goes out first', () => {
    const s = createMatch({ config: QUICK_CLASH_RULES });
    s.scores = [2, 6, 0, 0];
    s.pawns[0] = [FINISH_STEP, 55, YARD, YARD];
    const { state } = move(roll(s, 1).state, 1);
    expect(state.turn.phase).toBe('over');
    expect(state.scores[0]).toBe(4);
    expect(state.finishOrder[0]).toBe(1);
  });
});

describe('quick modes overall', () => {
  it('never award points in Classic', () => {
    expect(playOut(5, CLASSIC_RULES).state.scores).toEqual([0, 0, 0, 0]);
  });

  it('always finish, place every seat, and are much shorter than Classic', () => {
    const average = (config: RulesConfig) => {
      let total = 0;
      for (let seed = 1; seed <= 20; seed++) {
        const { state, actions } = playOut(seed, config);
        expect([...state.finishOrder].sort()).toEqual([0, 1, 2, 3]);
        total += actions;
      }
      return total / 20;
    };
    const classic = average(CLASSIC_RULES);
    expect(average(QUICK_RACE_RULES)).toBeLessThan(classic * 0.6);
    expect(average(QUICK_CLASH_RULES)).toBeLessThan(classic * 0.6);
  });

  it('save and reload with scores, and reject bad settings', () => {
    const s = createMatch({ config: QUICK_CLASH_RULES });
    s.scores = [3, 0, 2, 0];
    expect(deserializeMatch(serializeMatch(s))).toEqual(s);
    expect(() => createMatch({ config: { pawnsToWin: 5 } })).toThrow();
    expect(() => createMatch({ config: { startOnBoard: -1 } })).toThrow();
  });
});
