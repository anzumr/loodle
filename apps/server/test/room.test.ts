import { describe, expect, it } from 'vitest';
import { legalMoves, seededDice } from '@loodl/rules';
import { Room, RoomError, cleanName } from '../src/room';

const A = 'token-aaaaaaaaaaaaaaaa';
const B = 'token-bbbbbbbbbbbbbbbb';
const C = 'token-cccccccccccccccc';

const started = (seed = 1) => {
  const room = new Room('TEST1', 'classic', seededDice(seed));
  room.join(A, 'Alex');
  room.join(B, 'Emma');
  room.start(A);
  return room;
};

describe('room lobby', () => {
  it('seats two players opposite each other when the host starts', () => {
    const view = started().view();
    expect(view.players.map((p) => [p.name, p.seat])).toEqual([
      ['Alex', 0],
      ['Emma', 2],
    ]);
    expect(view.match?.seats).toEqual([0, 2]);
  });

  it('only lets the host start, and only with two or more players', () => {
    const room = new Room('TEST1', 'classic', seededDice(1));
    room.join(A, 'Alex');
    expect(() => room.start(A)).toThrow(RoomError);
    room.join(B, 'Emma');
    expect(() => room.start(B)).toThrow(RoomError);
    expect(() => room.start(C)).toThrow(RoomError);
  });

  it('rejects a fifth player and anyone arriving after the start', () => {
    const room = new Room('TEST1', 'classic', seededDice(1));
    ['1', '2', '3', '4'].forEach((n) => room.join(A + n, 'Guest'));
    expect(() => room.join(B, 'Late')).toThrow(RoomError);
    expect(() => started().join(C, 'Late')).toThrow(RoomError);
  });

  it('never exposes tokens and cleans up names', () => {
    expect(JSON.stringify(started().view())).not.toContain('token-');
    expect(cleanName('Al')).toBe('Guest');
    expect(cleanName('<script>')).toBe('Guest');
    expect(cleanName('Alex_12')).toBe('Alex_12');
  });

  it('uses the chosen quick mode', () => {
    const room = new Room('TEST1', 'race', seededDice(1));
    room.join(A, 'Alex');
    room.join(B, 'Emma');
    room.start(A);
    expect(room.view().match?.pawns[0]![0]).toBe(0);
  });
});

describe('authoritative play', () => {
  it('rejects rolls and moves from the wrong player, and moves before a roll', () => {
    const room = started();
    expect(() => room.roll(B)).toThrow(RoomError);
    expect(() => room.move(B, 0)).toThrow(RoomError);
    expect(() => room.move(A, 0)).toThrow(); // must roll first
    expect(() => room.roll(C)).toThrow(RoomError);
  });

  it('rolls the die itself: the same seed always gives the same match', () => {
    const play = () => {
      const room = started(42);
      for (let i = 0; i < 30; i++) {
        const m = room.view().match!;
        const who = m.turn.seat === 0 ? A : B;
        if (m.turn.phase === 'roll') room.roll(who);
        else room.move(who, legalMoves(m)[0]!.pawn);
      }
      return room.view().match;
    };
    expect(play()).toEqual(play());
  });

  it('rejects illegal and malformed pawn choices', () => {
    const room = started();
    let m = room.view().match!;
    while (m.turn.phase !== 'move') {
      room.roll(m.turn.seat === 0 ? A : B);
      m = room.view().match!;
    }
    const who = m.turn.seat === 0 ? A : B;
    expect(() => room.move(who, 99)).toThrow();
    expect(() => room.move(who, '0')).toThrow(RoomError);
    expect(room.view().match).toEqual(m);
  });

  it('plays a whole match to a result through the room alone', () => {
    const room = started(7);
    for (let guard = 0; room.view().match!.turn.phase !== 'over'; guard++) {
      if (guard > 20000) throw new Error('match did not finish');
      const m = room.view().match!;
      const who = m.turn.seat === 0 ? A : B;
      if (m.turn.phase === 'roll') room.roll(who);
      else room.move(who, legalMoves(m)[0]!.pawn);
    }
    expect([...room.view().match!.finishOrder].sort()).toEqual([0, 2]);
    expect(() => room.roll(A)).toThrow();
  });
});

describe('disconnecting', () => {
  it('holds a seat during a match and gives it back on reconnect', () => {
    const room = started();
    room.disconnect(B);
    expect(room.view().players[1]).toMatchObject({ seat: 2, connected: false });
    room.join(B, 'SomeoneElse');
    expect(room.view().players[1]).toMatchObject({ name: 'Emma', seat: 2, connected: true });
  });

  it('simply removes a player who leaves before the start', () => {
    const room = new Room('TEST1', 'classic', seededDice(1));
    room.join(A, 'Alex');
    room.join(B, 'Emma');
    room.disconnect(B);
    expect(room.view().players).toHaveLength(1);
    expect(room.empty).toBe(false);
  });
});
