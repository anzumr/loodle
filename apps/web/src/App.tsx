import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FINISH_STEP,
  SEAT_NAMES,
  applyAction,
  createMatch,
  legalMoves,
  type GameEvent,
  type MatchState,
  type Seat,
} from '@loodl/rules';
import { BoardScene, type CameraMode, type Quality } from './scene/BoardScene';
import { Logo } from './ui/Logo';
import { Die } from './ui/Die';
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
  const [sheet, setSheet] = useState<'play' | 'settings' | null>(null);
  const [quality, setQuality] = useState<Quality>(loadQuality);
  const [players, setPlayers] = useState(4);
  const [match, setMatch] = useState<MatchState | null>(null);
  const [message, setMessage] = useState('');
  const [face, setFace] = useState(6);
  const [rolling, setRolling] = useState(false);

  const moves = useMemo(() => (match?.turn.phase === 'move' ? legalMoves(match) : []), [match]);
  // If every legal move starts from the same spot there is nothing to choose.
  const forced = moves.length > 0 && moves.every((m) => m.from === moves[0]!.from);

  const act = useCallback((state: MatchState, action: Parameters<typeof applyAction>[1]) => {
    const result = applyAction(state, action);
    setMatch(result.state);
    setMessage(describe(result.events));
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
      showing ? { pawns: match.pawns, seat: match.turn.seat, movable: forced ? [] : moves.map((m) => m.pawn) } : null,
    );
  }, [screen, match, moves, forced]);

  useEffect(() => {
    if (!forced || screen !== 'board') return;
    const id = window.setTimeout(() => move(moves[0]!.pawn), 650);
    return () => window.clearTimeout(id);
  }, [forced, moves, move, screen]);

  useEffect(() => {
    scene.current?.setQuality(quality);
    try {
      localStorage.setItem(QUALITY_KEY, quality);
    } catch {
      /* storage unavailable: setting just won't persist */
    }
  }, [quality]);

  const startMatch = () => {
    setMatch(createMatch({ players }));
    setMessage('');
    setSheet(null);
    setScreen('board');
  };

  const turn = match?.turn;
  const over = turn?.phase === 'over';

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
              <Tile icon={<Pawn />} title="Solo" sub="Play Offline" tone="gold" />
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
                {seatName(turn.seat)}’s turn
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
                  aria-label={`${seatName(seat)}: ${home} of ${match.pawns[seat]!.length} home`}
                >
                  {match.pawns[seat]!.map((_, i) => (
                    <i key={i} className={i < home ? 'home' : ''} />
                  ))}
                </span>
              );
            })}
          </div>

          {!over && (
            <footer className="board-foot">
              <div className="readout" aria-live="polite">
                {(forced ? message.replace(' — tap a pawn', '') : message) || (turn.phase === 'roll' ? 'Roll the die' : 'Tap a pawn')}
              </div>
              <div className="roll-row">
                <Die value={face} rolling={rolling} />
                <button className="play-btn roll-btn" onClick={roll} disabled={turn.phase !== 'roll' || rolling}>
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
              <h2>{seatName(match.finishOrder[0]!)} wins!</h2>
              <Crown style={{ width: 44 }} />
            </div>
            {match.finishOrder.map((seat, i) => (
              <div className="setting" key={seat}>
                <span className={`place seat-${SEAT_NAMES[seat]}`}>
                  <i />
                  <strong>{seatName(seat)}</strong>
                </span>
                <strong>{['1st', '2nd', '3rd', '4th'][i]}</strong>
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
          <div className="setting">
            <span>
              <strong>Classic · Pass &amp; Play</strong>
              <small>Share this device</small>
            </span>
            <div className="segmented" role="group" aria-label="Number of players">
              {[2, 3, 4].map((n) => (
                <button key={n} className={players === n ? 'on' : ''} aria-pressed={players === n} onClick={() => setPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button className={`mode ${match && match.turn.phase !== 'over' ? '' : 'on'}`} onClick={startMatch}>
            <span>
              <strong>Start new match</strong>
              <small>{players} players · 4 pawns each</small>
            </span>
            <Chevron />
          </button>
          {[
            ['Quick Play', 'Fast online match'],
            ['Solo', 'Play against AI rivals'],
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
        </Sheet>
      )}
    </div>
  );
}

function Tile({ icon, title, sub, tone }: { icon: React.ReactNode; title: string; sub: string; tone: string }) {
  return (
    <button className={`tile tone-${tone}`} disabled aria-label={`${title} — coming soon`}>
      <em>Soon</em>
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
