import { useEffect, useRef, useState } from 'react';
import { BoardScene, describePick, type CameraMode, type Pick, type Quality } from './scene/BoardScene';
import { Logo } from './ui/Logo';
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

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const [screen, setScreen] = useState<Screen>('lobby');
  const [view, setView] = useState<View>('angled');
  const [pick, setPick] = useState<Pick>(null);
  const [sheet, setSheet] = useState<'play' | 'settings' | null>(null);
  const [quality, setQuality] = useState<Quality>(loadQuality);

  useEffect(() => {
    const s = new BoardScene(host.current!);
    s.onPick = setPick;
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.setMode(screen === 'lobby' ? 'lobby' : view);
  }, [screen, view]);

  useEffect(() => {
    scene.current?.setQuality(quality);
    try {
      localStorage.setItem(QUALITY_KEY, quality);
    } catch {
      /* storage unavailable: setting just won't persist */
    }
  }, [quality]);

  const openBoard = () => {
    setSheet(null);
    setPick(null);
    setScreen('board');
  };

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

      {screen === 'board' && (
        <div className="ui board-ui">
          <header className="topbar">
            <button className="round-btn" aria-label="Back to lobby" onClick={() => setScreen('lobby')}>
              <Back />
            </button>
            <Logo size="sm" />
            <div className="segmented" role="group" aria-label="Camera view">
              <button className={view === 'top' ? 'on' : ''} aria-pressed={view === 'top'} onClick={() => setView('top')}>
                Top
              </button>
              <button className={view === 'angled' ? 'on' : ''} aria-pressed={view === 'angled'} onClick={() => setView('angled')}>
                3D
              </button>
            </div>
          </header>
          <footer className="board-foot">
            <div className={`readout ${pick ? 'active' : ''}`} aria-live="polite">
              {describePick(pick)}
            </div>
            <p className="hint">Board preview — dice and turns arrive with the rules engine.</p>
          </footer>
        </div>
      )}

      {sheet === 'play' && (
        <Sheet title="Choose a mode" onClose={() => setSheet(null)}>
          <button className="mode on" onClick={openBoard}>
            <span>
              <strong>Classic Board</strong>
              <small>Explore the 3D board — preview</small>
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
