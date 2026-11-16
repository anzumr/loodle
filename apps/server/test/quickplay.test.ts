import { describe, expect, it } from 'vitest';
import { seededDice } from '@loodl/rules';
import { BOT_DELAY_MS, BOT_FILL_MS, PUBLIC_START_DELAY_MS, Room, RoomError } from '../src/room';

const token = (n: number) => `guest:token-${n}-aaaaaaaaaaaa`;
const publicRoom = (seed = 3) => new Room('QUICK', 'race', seededDice(seed), true);

describe('Quick Play rooms', () => {
  it('waits with one player, then counts down once a second arrives', () => {
    const room = publicRoom();
    room.join(token(1), 'Alex');
    expect(room.view()).toMatchObject({ public: true, startsAt: null });
    expect(room.lobbyTick()).toBe(false);
    room.join(token(2), 'Emma');
    const startsAt = room.view().startsAt!;
    expect(startsAt).toBeGreaterThan(Date.now());
    expect(room.lobbyTick(startsAt - 1)).toBe(false);
    expect(room.lobbyTick(startsAt)).toBe(true);
    expect(room.view().match?.seats).toEqual([0, 2]);
    expect(room.joinable).toBe(false);
  });

  it('starts immediately when the fourth player joins', () => {
    const room = publicRoom();
    [1, 2, 3, 4].forEach((n) => room.join(token(n), 'Guest'));
    expect(room.view().startsAt).toBeLessThanOrEqual(Date.now());
    expect(room.lobbyTick()).toBe(true);
    expect(room.view().match?.seats).toHaveLength(4);
  });

  it('cancels the countdown if a player leaves and only one remains', () => {
    const room = publicRoom();
    room.join(token(1), 'Alex');
    room.join(token(2), 'Emma');
    room.disconnect(token(2));
    expect(room.view().startsAt).toBeNull();
    expect(room.lobbyTick(Date.now() + PUBLIC_START_DELAY_MS)).toBe(false);
  });

  it('never starts a private room by itself', () => {
    const room = new Room('PRIV1', 'classic', seededDice(1));
    room.join(token(1), 'Alex');
    room.join(token(2), 'Emma');
    expect(room.view()).toMatchObject({ public: false, startsAt: null });
    expect(room.lobbyTick(Date.now() + 60_000)).toBe(false);
    expect(room.joinable).toBe(false);
  });
});

describe('bots', () => {
  const withBots = () => {
    const room = publicRoom();
    room.join(token(1), 'Alex');
    expect(room.lobbyTick(Date.now() + BOT_FILL_MS - 1000)).toBe(false);
    expect(room.lobbyTick(Date.now() + BOT_FILL_MS + 1000)).toBe(true);
    return room;
  };

  it('fill the empty seats when nobody else joins, clearly marked as bots', () => {
    const view = withBots().view();
    expect(view.players.map((p) => p.bot)).toEqual([false, true, true, true]);
    expect(view.match?.seats).toHaveLength(4);
    expect(JSON.stringify(view)).not.toContain('token');
  });

  it('take their turns after a short pause and can finish a whole match with a person', () => {
    const room = withBots();
    for (let guard = 0; room.view().match!.turn.phase !== 'over'; guard++) {
      if (guard > 20000) throw new Error('match did not finish');
      const humanTurn = room.view().match!.turn.seat === 0;
      // Nobody is played for instantly: bots pause briefly, people get the full 30 seconds.
      expect(room.tick(Date.now())).toEqual([]);
      if (!humanTurn) expect(room.tick(Date.now() + BOT_DELAY_MS + 5).length).toBeGreaterThan(0);
      else {
        expect(room.tick(Date.now() + BOT_DELAY_MS + 5)).toEqual([]);
        expect(room.tick(Date.now() + 31_000).length).toBeGreaterThan(0);
      }
    }
    expect(room.view().match!.finishOrder).toHaveLength(4);
  });

  it('do not keep an abandoned room alive', () => {
    const room = withBots();
    room.disconnect(token(1));
    expect(room.empty).toBe(true);
    expect(room.tick(Date.now() + 120_000)).toEqual([]);
  });
});

describe('rematch', () => {
  const finished = () => {
    const room = publicRoom(9);
    room.join(token(1), 'Alex');
    room.lobbyTick(Date.now() + BOT_FILL_MS + 1000);
    let now = Date.now();
    while (room.view().match!.turn.phase !== 'over') {
      now += 31_000; // let the server play every turn, bots and the absent human alike
      room.tick(now);
    }
    return room;
  };

  it('is refused while the match is still running', () => {
    const room = publicRoom();
    room.join(token(1), 'Alex');
    room.join(token(2), 'Emma');
    room.lobbyTick(Date.now() + PUBLIC_START_DELAY_MS + 1);
    expect(() => room.rematch(token(1))).toThrow(RoomError);
    expect(() => room.rematch(token(3))).toThrow(RoomError);
  });

  it('returns the people still here to the waiting room and drops the bots', () => {
    const room = finished();
    room.rematch(token(1));
    const view = room.view();
    expect(view.match).toBeNull();
    expect(view.players).toEqual([{ name: 'Alex', avatar: 0, seat: null, connected: true, bot: false }]);
    expect(room.joinable).toBe(true);
  });
});
