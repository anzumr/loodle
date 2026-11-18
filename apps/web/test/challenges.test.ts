import { describe, expect, it } from 'vitest';
import { legalMoves } from '@loodl/rules';
import { CHALLENGES, advanceChallenge, redInDanger, startChallenge, type ChallengeState } from '../src/challenges';

/** Play a challenge choosing moves by index each time a pawn must be picked. */
function play(index: number, choose: (state: ChallengeState) => number) {
  let state = startChallenge(index);
  for (let i = 0; i < 20 && state.result === 'playing'; i++)
    state = state.match.turn.phase === 'roll' ? advanceChallenge(state) : advanceChallenge(state, choose(state));
  return state;
}

/** Every way of choosing pawns through the challenge, and whether each one wins. */
function outcomes(index: number): boolean[] {
  const results: boolean[] = [];
  const explore = (state: ChallengeState) => {
    if (state.result !== 'playing') return void results.push(state.result === 'won');
    if (state.match.turn.phase === 'roll') return explore(advanceChallenge(state));
    for (const m of legalMoves(state.match)) explore(advanceChallenge(state, m.pawn));
  };
  explore(startChallenge(index));
  return results;
}

describe('challenge scenarios', () => {
  it.each(CHALLENGES.map((c, i) => [c.title, i] as const))('%s can be won and can be lost', (_, index) => {
    const results = outcomes(index);
    expect(results).toContain(true);
    expect(results).toContain(false);
  });

  it('wins Hunter with the capture and loses with the other pawn', () => {
    expect(play(0, () => 0).result).toBe('won');
    expect(play(0, () => 1).result).toBe('lost');
  });

  it('counts a red pawn in reach of yellow as in danger, but not on a star or in a pair', () => {
    const s = startChallenge(3); // red on 20 and 24, yellow on track 18
    expect(redInDanger(s.match)).toEqual([0, 1]);
    const paired = play(3, () => 0);
    expect(paired.match.pawns[0]).toEqual([24, 24, -1, -1]);
    expect(paired.result).toBe('won');
  });

  it('ignores moves that are not allowed and actions after the end', () => {
    const s = startChallenge(0);
    expect(advanceChallenge(s, 0)).toBe(s); // must roll first
    const rolled = advanceChallenge(s);
    expect(advanceChallenge(rolled, 3)).toBe(rolled); // a yard pawn cannot move with a 5
    const won = play(0, () => 0);
    expect(advanceChallenge(won)).toBe(won);
  });
});
