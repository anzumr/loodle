import { describe, expect, it } from 'vitest';
import { legalMoves, serializeMatch } from '@loodl/rules';
import { advanceLesson, LESSONS, startLesson } from '../src/tutorial';

function finish(lesson: number, pickLast = false) {
  let state = startLesson(lesson);
  for (let i = 0; i < 10 && !state.complete; i++) {
    const moves = legalMoves(state.match);
    state = advanceLesson(state, state.match.turn.phase === 'move' ? moves[pickLast ? moves.length - 1 : 0]!.pawn : undefined);
  }
  expect(state.complete).toBe(true);
  return state;
}

describe('guided tutorial', () => {
  it.each(LESSONS.map((lesson, index) => [lesson.title, index] as const))('%s completes using real legal moves', (_, index) => {
    finish(index);
    finish(index, true);
  });

  it('demonstrates capture, safety, stacks and exact finishing', () => {
    expect(finish(2).match.pawns[2]![0]).toBe(-1);
    expect(finish(2).match.turn.seat).toBe(0);
    expect(finish(3).match.pawns[2]![0]).toBe(34);
    expect(finish(3).match.pawns[0]![0]).toBe(8);
    expect(finish(4).match.pawns[0]![0]).toBe(4);
    expect(finish(4).match.pawns[2]).toEqual([-1, 30, -1, -1]);
    expect(finish(4).match.turn.seat).toBe(0); // the capture earns red another roll
    expect(finish(5).match.pawns[0]![0]).toBe(55);
    expect(finish(6).match.pawns[0]![0]).toBe(56);
  });

  it('forfeits the third six while retaining both previous moves', () => {
    let state = startLesson(7);
    state = advanceLesson(advanceLesson(state), 0);
    state = advanceLesson(advanceLesson(state), 0);
    const pawns = state.match.pawns;
    state = advanceLesson(state);
    expect(state.complete).toBe(true);
    expect(state.match.pawns).toEqual(pawns);
    expect(state.match.pawns[0]![0]).toBe(6);
    expect(state.match.turn.seat).toBe(2);
  });

  it('requires a manual pawn choice, isolates restarts and stops completed lessons', () => {
    const initial = startLesson();
    const snapshot = serializeMatch(initial.match);
    const rolled = advanceLesson(initial);
    expect(advanceLesson(rolled)).toBe(rolled);
    expect(serializeMatch(initial.match)).toBe(snapshot);
    expect(startLesson()).toEqual(initial);
    expect(advanceLesson(initial, 0)).toBe(initial);
    const complete = finish(0);
    expect(advanceLesson(complete)).toBe(complete);
  });
});
