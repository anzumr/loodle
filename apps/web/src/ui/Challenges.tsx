import { useEffect, useRef, useState } from 'react';
import { legalMoves } from '@loodl/rules';
import { BoardScene, type Quality } from '../scene/BoardScene';
import { advanceChallenge, CHALLENGES, markSolved, solvedChallenges, startChallenge, type ChallengeState } from '../challenges';
import { Die } from './Die';
import { Back, Chevron } from './icons';

/** Challenge scenarios: pick a puzzle from the list, then solve it on the board. */
export function Challenges({ quality, onClose, onReward }: { quality: Quality; onClose: () => void; onReward: (coins: number) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const [solved, setSolved] = useState(solvedChallenges);
  const [state, setState] = useState<ChallengeState | null>(null);
  const [paid, setPaid] = useState(0);
  const challenge = state ? CHALLENGES[state.index]! : null;
  const moves = state && state.result === 'playing' && state.match.turn.phase === 'move' ? legalMoves(state.match) : [];

  useEffect(() => {
    const board = new BoardScene(host.current!);
    board.setMode('top');
    board.setQuality(quality);
    scene.current = board;
    return () => {
      board.dispose();
      scene.current = null;
    };
  }, [quality]);

  useEffect(() => {
    const board = scene.current;
    if (!board) return;
    const shown = state ?? startChallenge(0);
    board.setView({ pawns: shown.match.pawns, seat: 0, movable: moves.map((m) => m.pawn) });
    board.onPawnTap = (pawn) => {
      if (moves.some((m) => m.pawn === pawn)) step(pawn);
    };
  });

  const step = (pawn?: number) => {
    if (!state) return;
    const next = advanceChallenge(state, pawn);
    if (next === state) return;
    setState(next);
    if (next.result === 'won') {
      const c = CHALLENGES[next.index]!;
      const first = markSolved(c.id);
      if (first) onReward(c.coins);
      setPaid(first ? c.coins : 0);
      setSolved(solvedChallenges());
    }
  };

  const open = (index: number) => {
    setPaid(0);
    setState(startChallenge(index));
  };

  return (
    <div className="tutorial app screen-board" role="dialog" aria-modal="true" aria-label="Challenges">
      <div className="backdrop" aria-hidden="true" />
      <div className="stage" ref={host} />
      <div className="ui board-ui">
        <header className="topbar">
          <button autoFocus className="round-btn" aria-label={state ? 'Back to challenges' : 'Exit challenges'} onClick={() => (state ? setState(null) : onClose())}>
            <Back />
          </button>
          <strong>
            Challenges · {solved.length}/{CHALLENGES.length} solved
          </strong>
          {state ? (
            <button className="round-btn" aria-label="Restart challenge" onClick={() => open(state.index)}>
              ↻
            </button>
          ) : (
            <span />
          )}
        </header>

        {!state || !challenge ? (
          <div className="challenge-list sheet" aria-label="Choose a challenge">
            {CHALLENGES.map((c, i) => (
              <button key={c.id} className={`mode ${solved.includes(c.id) ? 'done' : ''}`} onClick={() => open(i)}>
                <span>
                  <strong>
                    {i + 1}. {c.title} {solved.includes(c.id) ? '✓' : ''}
                  </strong>
                  <small>{solved.includes(c.id) ? 'Solved' : `${c.coins} coins the first time`}</small>
                </span>
                <Chevron />
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="tutorial-guide" aria-live="polite">
              <strong>{state.result === 'won' ? 'Solved!' : state.result === 'lost' ? 'Not this time' : challenge.title}</strong>
              <p>{state.result === 'won' ? challenge.win : state.result === 'lost' ? challenge.hint : challenge.brief}</p>
              <small>
                {state.result === 'won' && paid ? `+${paid} coins · ` : ''}You are red · preset dice: {challenge.dice.join(', ')}
              </small>
            </div>
            <footer className="board-foot">
              {state.result === 'won' ? (
                <button
                  className="play-btn roll-btn tutorial-next"
                  onClick={() => (state.index + 1 < CHALLENGES.length ? open(state.index + 1) : setState(null))}
                >
                  {state.index + 1 < CHALLENGES.length ? 'NEXT' : 'DONE'}
                </button>
              ) : state.result === 'lost' ? (
                <button className="play-btn roll-btn tutorial-next" onClick={() => open(state.index)}>
                  TRY AGAIN
                </button>
              ) : state.match.turn.phase === 'roll' ? (
                <div className="roll-row">
                  <Die value={challenge.dice[Math.max(0, state.rolls - 1)] ?? 6} rolling={false} />
                  <button className="play-btn roll-btn" onClick={() => step()}>
                    ROLL
                  </button>
                </div>
              ) : (
                <div className="tutorial-choices" role="group" aria-label="Choose a red pawn">
                  <span>Rolled {challenge.dice[state.rolls - 1]} · tap a glowing pawn, or choose below</span>
                  <div className="segmented">
                    {moves.map((m) => (
                      <button key={m.pawn} onClick={() => step(m.pawn)}>
                        Pawn {m.pawn + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
