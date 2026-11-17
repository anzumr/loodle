import { describe, expect, it } from 'vitest';
import { WAGER_STAKES, canWager, wagerMultiplier, wagerPayout } from '../src';

describe('wagers', () => {
  it('only allows listed stakes the player can afford', () => {
    expect(canWager(0, 0)).toBe(true);
    expect(canWager(100, 100)).toBe(true);
    expect(canWager(100, 99)).toBe(false);
    expect(canWager(30, 1000)).toBe(false);
    expect(canWager(-25, 1000)).toBe(false);
    expect(WAGER_STAKES[0]).toBe(0);
  });

  it('pays more for harder rivals and bigger tables', () => {
    expect(wagerMultiplier('beginner', 2)).toBe(1.2);
    expect(wagerMultiplier('medium', 2)).toBe(2);
    expect(wagerMultiplier('expert', 2)).toBe(3);
    expect(wagerMultiplier('medium', 4)).toBe(3);
    expect(wagerMultiplier('expert', 8)).toBe(6);
  });

  it('pays only for a win, rounding down', () => {
    expect(wagerPayout(100, 'medium', 4, 1)).toBe(300);
    expect(wagerPayout(25, 'beginner', 2, 1)).toBe(30);
    expect(wagerPayout(100, 'expert', 4, 2)).toBe(0);
    expect(wagerPayout(0, 'expert', 4, 1)).toBe(0);
  });
});
