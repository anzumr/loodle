import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AI_LEVELS,
  CLASSIC_RULES,
  FINISH_STEP,
  QUICK_CLASH_RULES,
  QUICK_RACE_RULES,
  SEAT_NAMES,
  applyAction,
  chooseMove,
  createMatch,
  deserializeMatch,
  legalMoves,
  serializeMatch,
  type AiLevel,
  type GameEvent,
  type MatchState,
  type Seat,
} from '@loodl/rules';
import { BoardScene, type CameraMode, type Quality } from './scene/BoardScene';
import { Logo } from './ui/Logo';
import { Die } from './ui/Die';
import { play, setSoundEnabled, type Sfx } from './sound';
import { Back, Chest, Chevron, Crown, Gear, Pawn, People } from './ui/icons';

type Screen = 'lobby' | 'board';
type View = Exclude<CameraMode, 'lobby'>;

const QUALITY_KEY = 'loodl.quality';
const loadQuality = (): Quality => {
  try {
    return localStorage.getItem(QUALITY_KEY) === 'low' ? 'low' : 'high';
  } catch {
    return 'high';
  }
};

const SAVE_KEY = 'loodl.match';

const VARIANTS = {
  classic: { label: 'Classic', rules: CLASSIC_RULES, blurb: 'Full game: bring all four pawns home' },
  race: { label: 'Race', rules: QUICK_RACE_RULES, blurb: 'Quick: one pawn starts out, first to bring two home wins' },
  clash: { label: 'Clash', rules: QUICK_CLASH_RULES, blurb: 'Quick: 3 points per capture, 2 per pawn home, first to 10' },
} as const;
type Variant = keyof typeof VARIANTS;

const HOW_TO_PLAY = [
  'Roll the die on your turn. You need a six to bring a pawn out of your yard.',
  'Tap a glowing pawn to move it forward by the number you rolled.',
  'Land on an opponent to send that pawn back to its yard. You roll again.',
  'Pawns on a star or on any coloured start square are safe.',
  'Two of your pawns on one square form a block that opponents cannot pass.',
  'A six gives you another roll, but a third six in a row ends your turn with no move.',
  'Travel once around the board, up your coloured lane, and land on the centre with the exact number.',
];
const SOUND_KEY = 'loodl.sound';

/** Named computer rivals, one per difficulty. */
const RIVALS: Record<AiLevel, string> = { beginner: 'Pip', easy: 'Dot', medium: 'Rook', hard: 'Vex', expert: 'Sable' };

interface Saved {
  match: MatchState;
  humans: Seat[];
  level: AiLevel;
}

function loadSaved(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { match: string; humans: Seat[]; level: AiLevel } | null;
    if (!raw || !Array.isArray(raw.humans) || !AI_LEVELS.includes(raw.level)) return null;
    const match = deserializeMatch(raw.match);
    return match.turn.phase === 'over' ? null : { match, humans: raw.humans, level: raw.level };
  } catch {
    return null;
  }
}

const SOUNDS: Partial<Record<GameEvent['type'], Sfx>> = {
  matchOver: 'win',
  captured: 'capture',
  thirdSixForfeit: 'bust',
  pawnFinished: 'home',
  moved: 'move',
};

const seatName = (seat: Seat) => SEAT_NAMES[seat][0]!.toUpperCase() + SEAT_NAMES[seat].slice(1);

/** Unbiased local die for offline play. Online dice will come from the server. */
function rollDie(): number {
  const buf = new Uint8Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= 252);
  return (buf[0]! % 6) + 1;
}

/** One short line describing what just happened. */
function describe(events: GameEvent[]): string {
  const find = <T extends GameEvent['type']>(type: T) => events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined;
  const rolled = find('rolled');
  const over = find('matchOver');
  if (over) return `${seatName(over.order[0]!)} wins!`;
  if (find('thirdSixForfeit')) return 'Third six in a row — turn ends';
  const done = find('seatFinished');
  if (done) return `${seatName(done.seat)} is home — place ${done.place}`;
  const cap = find('captured');
  if (cap) return `${seatName(cap.by)} captured ${seatName(cap.seat)} — roll again`;
  if (find('pawnFinished')) return 'Pawn home!';
  const none = find('noLegalMove');
  if (none) return none.value === 6 ? 'No move for that six — roll again' : `Rolled ${none.value} — no move`;
  if (find('bonusRoll')) return 'Six! Roll again';
  if (rolled) return `Rolled ${rolled.value} — tap a pawn`;
  return '';
}

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const [screen, setScreen] = useState<Screen>('lobby');
  const [view, setView] = useState<View>('angled');
  const [sheet, setSheet] = useState<'play' | 'settings' | 'help' | null>(null);
  const [variant, setVariant] = useState<Variant>('classic');
  const [quality, setQuality] = useState<Quality>(loadQuality);
  const saved = useMemo(loadSaved, []);
  const [players, setPlayers] = useState(4);
  const [solo, setSolo] = useState(true);
  const [level, setLevel] = useState<AiLevel>(saved?.level ?? 'medium');
  const [humans, setHumans] = useState<Seat[]>(saved?.humans ?? [0]);
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const [match, setMatch] = useState<MatchState | null>(saved?.match ?? null);
  const [message, setMessage] = useState('');
  const [face, setFace] = useState(6);
  const [rolling, setRolling] = useState(false);

  const moves = useMemo(() => (match?.turn.phase === 'move' ? legalMoves(match) : []), [match]);
  // If every legal move starts from the same spot there is nothing to choose.
  const human = !!match && humans.includes(match.turn.seat);
  const forced = human && moves.length > 0 && moves.every((m) => m.from === moves[0]!.from);

  const act = useCallback((state: MatchState, action: Parameters<typeof applyAction>[1]) => {
    const result = applyAction(state, action);
    setMatch(result.state);
    setMessage(describe(result.events));
    const sfx = (Object.keys(SOUNDS) as GameEvent['type'][]).find((type) => result.events.some((e) => e.type === type));
    if (sfx) play(SOUNDS[sfx]!);
  }, []);

  const move = useCallback(
    (pawn: number) => {
      if (match?.turn.phase === 'move' && moves.some((m) => m.pawn === pawn)) act(match, { type: 'move', seat: match.turn.seat, pawn });
    },
    [match, moves, act],
  );

  const roll = () => {
    if (!match || match.turn.phase !== 'roll' || rolling) return;
    setRolling(true);
    setMessage('');
    play('roll');
    const value = rollDie();
    window.setTimeout(() => {
      setFace(value);
      setRolling(false);
      act(match, { type: 'roll', seat: match.turn.seat, value });
    }, 520);
  };

  useEffect(() => {
    const s = new BoardScene(host.current!);
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    if (scene.current) scene.current.onPawnTap = move;
  }, [move]);

  useEffect(() => {
    scene.current?.setMode(screen === 'lobby' ? 'lobby' : view);
  }, [screen, view]);

  useEffect(() => {
    const showing = screen === 'board' && match;
    scene.current?.setView(
      showing ? { pawns: match.pawns, seat: match.turn.seat, movable: forced || !human ? [] : moves.map((m) => m.pawn) } : null,
    );
  }, [screen, match, moves, forced, human]);

  useEffect(() => {
    if (!forced || screen !== 'board') return;
    const id = window.setTimeout(() => move(moves[0]!.pawn), 650);
    return () => window.clearTimeout(id);
  }, [forced, moves, move, screen]);

  // Computer players: roll, then choose a move. They only pick among legal moves.
  useEffect(() => {
    if (!match || screen !== 'board' || match.turn.phase === 'over' || human || rolling) return;
    const seat = match.turn.seat;
    const id = window.setTimeout(
      () => (match.turn.phase === 'roll' ? roll() : act(match, { type: 'move', seat, pawn: chooseMove(match, level, Math.random) })),
      match.turn.phase === 'roll' ? 1000 : 700,
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, screen, human, rolling, level]);

  // Keep the match across reloads.
  useEffect(() => {
    try {
      if (match && match.turn.phase !== 'over') localStorage.setItem(SAVE_KEY, JSON.stringify({ match: serializeMatch(match), humans, level }));
      else localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable: the match just won't survive a reload */
    }
  }, [match, humans, level]);

  useEffect(() => {
    setSoundEnabled(sound);
    try {
      localStorage.setItem(SOUND_KEY, sound ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [sound]);

  useEffect(() => {
    scene.current?.setQuality(quality);
    try {
      localStorage.setItem(QUALITY_KEY, quality);
    } catch {
      /* storage unavailable: setting just won't persist */
    }
  }, [quality]);

  const startMatch = () => {
    const fresh = createMatch({ players, config: VARIANTS[variant].rules });
    setHumans(solo ? [fresh.seats[0]!] : fresh.seats);
    setMatch(fresh);
    setMessage('');
    setSheet(null);
    setScreen('board');
  };

  const turn = match?.turn;
  const over = turn?.phase === 'over';
  const clash = !!match && match.config.targetScore !== null;
  const vsAi = !!match && humans.length < match.seats.length;
  const who = (seat: Seat) => (!vsAi ? seatName(seat) : humans.includes(seat) ? 'You' : RIVALS[level]);

  return (
    <div className={`app screen-${screen}`}>
      <div className="backdrop" aria-hidden="true" />
      <div className="stage" ref={host} />

      {screen === 'lobby' && (
        <div className="ui lobby">
          <header className="topbar">
            <div className="profile">
              <span className="avatar">
                <Pawn />
              </span>
              <span className="profile-text">
                <strong>Guest</strong>
                <small>No sign-up needed</small>
              </span>
            </div>
            <button className="round-btn" aria-label="Settings" onClick={() => setSheet('settings')}>
              <Gear />
            </button>
          </header>

          <Logo tagline />

          <div className="lobby-actions">
            <button className="play-btn" onClick={() => setSheet('play')}>
              <Crown className="play-crown" />
              <span>PLAY</span>
              <Chevron className="play-chevron" />
            </button>
            <nav className="tiles" aria-label="More ways to play">
              <Tile icon={<Pawn />} title="Solo" sub="Play Offline" tone="gold" onClick={() => (setSolo(true), setSheet('play'))} />
              <Tile icon={<People />} title="Friends" sub="Play Together" tone="blue" />
              <Tile icon={<Chest />} title="Collection" sub="Boards & Pawns" tone="red" />
            </nav>
          </div>
        </div>
      )}

      {screen === 'board' && match && turn && (
        <div className="ui board-ui">
          <header className="topbar">
            <button className="round-btn" aria-label="Back to lobby" onClick={() => setScreen('lobby')}>
              <Back />
            </button>
            {over ? (
              <Logo size="sm" />
            ) : (
              <div className={`turn-pill seat-${SEAT_NAMES[turn.seat]}`} aria-live="polite">
                <i />
                {vsAi && human ? 'Your turn' : `${seatName(turn.seat)}’s turn`}
              </div>
            )}
            <div className="segmented" role="group" aria-label="Camera view">
              <button className={view === 'top' ? 'on' : ''} aria-pressed={view === 'top'} onClick={() => setView('top')}>
                Top
              </button>
              <button className={view === 'angled' ? 'on' : ''} aria-pressed={view === 'angled'} onClick={() => setView('angled')}>
                3D
              </button>
            </div>
          </header>

          <div className="seats" aria-label="Players">
            {match.seats.map((seat) => {
              const home = match.pawns[seat]!.filter((p) => p === FINISH_STEP).length;
              return (
                <span
                  key={seat}
                  className={`seat seat-${SEAT_NAMES[seat]} ${!over && turn.seat === seat ? 'active' : ''}`}
                  aria-label={`${seatName(seat)}: ${home} of ${match.pawns[seat]!.length} home${clash ? `, ${match.scores[seat]} points` : ''}`}
                >
                  {match.pawns[seat]!.map((_, i) => (
                    <i key={i} className={i < home ? 'home' : ''} />
                  ))}
                  {clash && <b>{match.scores[seat]}</b>}
                </span>
              );
            })}
          </div>

          {!over && (
            <footer className="board-foot">
              <div className="readout" aria-live="polite">
                {(forced || !human ? message.replace(' — tap a pawn', '') : message) ||
                  (!human ? `${RIVALS[level]} is playing…` : turn.phase === 'roll' ? 'Roll the die' : 'Tap a pawn')}
              </div>
              <div className="roll-row">
                <Die value={face} rolling={rolling} />
                <button className="play-btn roll-btn" onClick={roll} disabled={!human || turn.phase !== 'roll' || rolling}>
                  ROLL
                </button>
              </div>
            </footer>
          )}
        </div>
      )}

      {screen === 'board' && match && over && (
        <div className="scrim">
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Results">
            <div className="sheet-head">
              <h2>{vsAi && humans.includes(match.finishOrder[0]!) ? 'You win!' : `${seatName(match.finishOrder[0]!)} wins!`}</h2>
              <Crown style={{ width: 44 }} />
            </div>
            {match.finishOrder.map((seat, i) => (
              <div className="setting" key={seat}>
                <span className={`place seat-${SEAT_NAMES[seat]}`}>
                  <i />
                  <strong>{vsAi ? `${seatName(seat)} · ${who(seat)}` : seatName(seat)}</strong>
                </span>
                <strong>
                  {clash ? `${match.scores[seat]} pts · ` : ''}
                  {['1st', '2nd', '3rd', '4th'][i]}
                </strong>
              </div>
            ))}
            <button className="mode on" onClick={startMatch}>
              <span>
                <strong>Play again</strong>
              </span>
              <Chevron />
            </button>
            <button className="mode" onClick={() => (setMatch(null), setScreen('lobby'))}>
              <span>
                <strong>Back to lobby</strong>
              </span>
            </button>
          </div>
        </div>
      )}

      {sheet === 'play' && (
        <Sheet title="Choose a mode" onClose={() => setSheet(null)}>
          {match && match.turn.phase !== 'over' && (
            <button className="mode on" onClick={() => (setSheet(null), setScreen('board'))}>
              <span>
                <strong>Resume match</strong>
                <small>{seatName(match.turn.seat)} to play</small>
              </span>
              <Chevron />
            </button>
          )}
          <div className="setting stacked">
            <span>
              <strong>{variant === 'classic' ? 'Classic Ludo' : `Quick ${VARIANTS[variant].label}`}</strong>
              <small>{VARIANTS[variant].blurb}</small>
            </span>
            <div className="segmented compact" role="group" aria-label="Game mode">
              {(Object.keys(VARIANTS) as Variant[]).map((v) => (
                <button key={v} className={variant === v ? 'on' : ''} aria-pressed={variant === v} onClick={() => setVariant(v)}>
                  {VARIANTS[v].label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span>
              <strong>Opponents</strong>
              <small>{solo ? 'You against the computer' : 'Share this device'}</small>
            </span>
            <div className="segmented" role="group" aria-label="Opponents">
              <button className={solo ? 'on' : ''} aria-pressed={solo} onClick={() => setSolo(true)}>
                Solo
              </button>
              <button className={!solo ? 'on' : ''} aria-pressed={!solo} onClick={() => setSolo(false)}>
                Pass &amp; Play
              </button>
            </div>
          </div>
          <div className="setting">
            <span>
              <strong>Players</strong>
            </span>
            <div className="segmented" role="group" aria-label="Number of players">
              {[2, 3, 4].map((n) => (
                <button key={n} className={players === n ? 'on' : ''} aria-pressed={players === n} onClick={() => setPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {solo && (
            <div className="setting stacked">
              <span>
                <strong>Rival: {RIVALS[level]}</strong>
              </span>
              <div className="segmented compact" role="group" aria-label="Difficulty">
                {AI_LEVELS.map((l) => (
                  <button key={l} className={level === l ? 'on' : ''} aria-pressed={level === l} onClick={() => setLevel(l)}>
                    {l[0]!.toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button className={`mode ${match && match.turn.phase !== 'over' ? '' : 'on'}`} onClick={startMatch}>
            <span>
              <strong>Start new match</strong>
              <small>
                {VARIANTS[variant].label} · {players} players{solo ? ` · ${level}` : ''}
              </small>
            </span>
            <Chevron />
          </button>
          <button className="mode" onClick={() => setSheet('help')}>
            <span>
              <strong>How to play</strong>
              <small>The rules in one minute</small>
            </span>
            <Chevron />
          </button>
          {[
            ['Quick Play', 'Fast online match'],
            ['Friends', 'Private room with an invite code'],
            ['Ranked', 'Linked accounts only'],
          ].map(([title, sub]) => (
            <button className="mode" disabled key={title}>
              <span>
                <strong>{title}</strong>
                <small>{sub}</small>
              </span>
              <em>Soon</em>
            </button>
          ))}
        </Sheet>
      )}

      {sheet === 'help' && (
        <Sheet title="How to play" onClose={() => setSheet('play')}>
          <ol className="howto">
            {HOW_TO_PLAY.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </Sheet>
      )}

      {sheet === 'settings' && (
        <Sheet title="Settings" onClose={() => setSheet(null)}>
          <div className="setting">
            <span>
              <strong>Graphics</strong>
              <small>Low turns off shadows and sharpening</small>
            </span>
            <div className="segmented">
              {(['high', 'low'] as const).map((q) => (
                <button key={q} className={quality === q ? 'on' : ''} aria-pressed={quality === q} onClick={() => setQuality(q)}>
                  {q === 'high' ? 'High' : 'Low'}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span>
              <strong>Sound</strong>
            </span>
            <div className="segmented">
              {[true, false].map((on) => (
                <button key={String(on)} className={sound === on ? 'on' : ''} aria-pressed={sound === on} onClick={() => setSound(on)}>
                  {on ? 'On' : 'Off'}
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function Tile({ icon, title, sub, tone, onClick }: { icon: React.ReactNode; title: string; sub: string; tone: string; onClick?: () => void }) {
  return (
    <button className={`tile tone-${tone}`} disabled={!onClick} onClick={onClick} aria-label={onClick ? title : `${title} — coming soon`}>
      {!onClick && <em>Soon</em>}
      <span className="tile-icon">{icon}</span>
      <strong>{title}</strong>
      <small>{sub}</small>
    </button>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="round-btn small" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
