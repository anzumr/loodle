/**
 * Coin wagers on solo matches against the computer.
 *
 * The stake is taken when the match starts. Winning the match pays the stake back
 * multiplied; any other place loses it. Harder rivals and bigger tables pay more,
 * because they are harder to win. Wagers use only coins earned in play and never
 * touch dice, legal moves or the AI.
 */
import type { AiLevel } from './ai';

/** Stakes a player can choose. 0 means no wager. */
export const WAGER_STAKES = [0, 25, 50, 100, 250, 500, 1000] as const;

/** Total paid back on a win against one opponent, per difficulty (stake included). */
export const WAGER_BASE: Record<AiLevel, number> = { beginner: 1.2, easy: 1.5, medium: 2, hard: 2.5, expert: 3 };

/** Each extra opponent adds this much to the multiplier. */
export const WAGER_PER_EXTRA_OPPONENT = 0.5;

export const wagerMultiplier = (level: AiLevel, players: number): number =>
  WAGER_BASE[level] + WAGER_PER_EXTRA_OPPONENT * Math.max(0, players - 2);

/** Whether a stake can be placed with this many coins. */
export const canWager = (stake: number, coins: number): boolean =>
  (WAGER_STAKES as readonly number[]).includes(stake) && stake <= coins;

/** Coins paid back at the end of the match: stake × multiplier for a win, nothing otherwise. */
export const wagerPayout = (stake: number, level: AiLevel, players: number, place: number): number =>
  place === 1 && stake > 0 ? Math.floor(stake * wagerMultiplier(level, players)) : 0;
