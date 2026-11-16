import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_TIMEOUT_MS, Room } from '../src/room';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(100_000); });
afterEach(() => vi.useRealTimers());
const start = () => {
  const room = new Room('ABCDE', 'race', { roll: () => 6 });
  room.join('a', 'Alex'); room.join('b', 'Emma'); room.start('a');
  return room;
};
const expire = () => vi.advanceTimersByTime(ACTION_TIMEOUT_MS);

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
    expect(deadline).toBe(Date.now() + ACTION_TIMEOUT_MS);
    room.disconnect('a'); room.join('a', 'Alex');
    expect(room.view().actionDeadline).toBe(deadline);
    vi.advanceTimersByTime(10_000);
    expect(room.tick()).toEqual([]);
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
