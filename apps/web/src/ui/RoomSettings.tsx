import type { RoomView } from '../net';

type Settings = NonNullable<RoomView['settings']>;

const MODES: [string, string][] = [
  ['classic', 'Classic'],
  ['race', 'Race'],
  ['clash', 'Clash'],
];

/** Private-room rules. The host changes them before the start; everyone else sees them. */
export function RoomSettings({ room, isHost, send }: { room: RoomView; isHost: boolean; send: (msg: object) => void }) {
  const s = room.settings;
  if (!s || room.public || room.match) return null;
  const set = (change: Partial<Settings>) => send({ t: 'settings', settings: change });
  const twoYards = s.yards === 2 && room.players.length === 2;
  const bots = room.players.filter((p) => p.bot).length;
  const full = room.players.length >= (room.capacity ?? 8);

  if (!isHost)
    return (
      <div className="setting stacked">
        <strong>Room rules</strong>
        <small>
          {twoYards ? 'Classic · 1v1, two yards each' : MODES.find(([v]) => v === s.variant)?.[1]} · {s.dice} {s.dice === 1 ? 'die' : 'dice'} · {s.pawns} pawns each ·{' '}
          {s.timer === 'relaxed' ? 'relaxed timer (12s/24s)' : 'timer 6s/12s'}
        </small>
      </div>
    );

  const choice = <T extends string | number>(label: string, value: T, options: [T, string][], onPick: (v: T) => void, note?: string) => (
    <div className="setting stacked">
      <span>
        <strong>{label}</strong>
        {note && <small>{note}</small>}
      </span>
      <div className="segmented compact" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onPick(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="room-settings">
      {choice('Mode', twoYards ? 'classic' : s.variant, MODES, (variant) => set({ variant }), twoYards ? 'Two yards each always uses Classic' : undefined)}
      {choice<1 | 2>('Yards each (1v1 only)', s.yards, [[1, 'One'], [2, 'Two']], (yards) => set({ yards }),
        s.yards === 2 && room.players.length !== 2 ? 'Needs exactly two players, so this match uses one yard each' : 'Two: each player moves two colours')}
      {choice<1 | 2>('Dice', s.dice, [[1, '1'], [2, '2']], (dice) => set({ dice }))}
      {choice<2 | 3 | 4>('Pawns each', s.pawns, [[2, '2'], [3, '3'], [4, '4']], (pawns) => set({ pawns }))}
      {choice<'normal' | 'relaxed'>('Turn timer', s.timer, [['normal', '6s / 12s'], ['relaxed', '12s / 24s']], (timer) => set({ timer }), 'Time to roll / to move before the game plays for you')}
      <div className="setting">
        <span>
          <strong>Computer players</strong>
          <small>{bots ? `${bots} in the room` : 'Fill empty seats with bots'}</small>
        </span>
        <div className="segmented" role="group" aria-label="Computer players">
          <button disabled={!bots} onClick={() => send({ t: 'removeBot' })} aria-label="Remove a bot">
            −
          </button>
          <button disabled={full} onClick={() => send({ t: 'addBot' })} aria-label="Add a bot">
            +
          </button>
        </div>
      </div>
    </div>
  );
}
