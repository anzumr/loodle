import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_DELAY_MS, MOVE_TIMEOUT_MS, ROLL_TIMEOUT_MS, Room } from '../src/room';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
afterEach(() => vi.useRealTimers());
const start = () => {
  const room = new Room('ABCDE', 'race', { roll: () => 6 });
  room.join('a', 'Alex'); room.join('b', 'Emma'); room.start('a');
  return room;
};
const expire = () => vi.advanceTimersByTime(MOVE_TIMEOUT_MS);

describe('server action deadlines', () => {
  it('rolls and moves for an absent player, applying the third-six rule', () => {
    const room = start();
    room.disconnect('a');
    expect(room.tick()).toEqual([]);
    expire();
    expect(room.tick().map((event) => event.type)).toContain('rolled');
    expect(room.view().match!.turn.phase).toBe('move');
    expect(room.tick()).toEqual([]);
    expire();
    expect(room.tick().map((event) => event.type)).toContain('moved');
    expire(); room.tick();
    expire(); room.tick();
    const pawns = room.view().match!.pawns;
    expire();
    expect(room.tick().map((event) => event.type)).toContain('thirdSixForfeit');
    expect(room.view().match!.pawns).toEqual(pawns);
    expect(room.view().match!.turn.seat).toBe(2);
  });

  it('resets after a manual action, but not after reconnecting', () => {
    const room = start();
    vi.advanceTimersByTime(20_000);
    room.roll('a');
    const deadline = room.view().actionDeadline;
    expect(deadline).toBe(Date.now() + MOVE_TIMEOUT_MS); // now choosing a pawn
    room.disconnect('a'); room.join('a', 'Alex');
    expect(room.view().actionDeadline).toBe(deadline);
    vi.advanceTimersByTime(10_000);
    expect(room.tick()).toEqual([]);
  });

  it('gives 6 seconds to roll and 12 seconds to move', () => {
    const room = start();
    vi.advanceTimersByTime(ROLL_TIMEOUT_MS - 1);
    expect(room.tick()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(room.tick().map((event) => event.type)).toContain('rolled');
    vi.advanceTimersByTime(MOVE_TIMEOUT_MS - 1);
    expect(room.tick()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(room.tick().map((event) => event.type)).toContain('moved');
  });

  it('lets a bot play quickly for a player who has left, and hands the seat back on return', () => {
    const room = start();
    room.disconnect('a');
    vi.advanceTimersByTime(BOT_DELAY_MS);
    expect(room.tick().map((event) => event.type)).toContain('rolled');
    vi.advanceTimersByTime(BOT_DELAY_MS);
    expect(room.tick().map((event) => event.type)).toContain('moved');
    room.join('a', 'Alex');
    expect(room.view().match!.turn.seat).toBe(0); // the six earned another roll, now Alex's again
    vi.advanceTimersByTime(BOT_DELAY_MS);
    expect(room.tick()).toEqual([]); // back at the table: the normal time limit applies
  });

  it('does not advance empty rooms or rooms waiting to start', () => {
    const room = start(); room.disconnect('a'); room.disconnect('b');
    expire();
    expect(room.tick()).toEqual([]);
    expect(room.view().match!.version).toBe(0);
    room.join('b', 'Emma');
    expect(room.tick().length).toBeGreaterThan(0);
    const lobby = new Room('FGHIJ', 'classic', { roll: () => 1 });
    lobby.join('a', 'Alex');
    expect(lobby.view().actionDeadline).toBeNull();
    expect(lobby.tick()).toEqual([]);
  });
});
