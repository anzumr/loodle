import { useEffect, useRef, useState } from 'react';
import { legalMoves } from '@loodl/rules';
import { BoardScene, type Quality } from '../scene/BoardScene';
import { advanceLesson, LESSONS, startLesson } from '../tutorial';
import { Die } from './Die';
import { Back } from './icons';

export function Tutorial({ quality, onClose }: { quality: Quality; onClose: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const [state, setState] = useState(() => startLesson());
  const lesson = LESSONS[state.lesson]!;
  const moves = state.complete ? [] : legalMoves(state.match);
  const last = state.lesson === LESSONS.length - 1;

  useEffect(() => {
    const board = new BoardScene(host.current!);
    board.setMode('top');
    board.setQuality(quality);
    scene.current = board;
    return () => { board.dispose(); scene.current = null; };
  }, [quality]);

  useEffect(() => {
    const board = scene.current;
    if (!board) return;
    board.setView({ pawns: state.match.pawns, seat: 0, movable: moves.map((move) => move.pawn) });
    board.onPawnTap = (pawn) => {
      if (moves.some((move) => move.pawn === pawn)) setState((current) => advanceLesson(current, pawn));
    };
  }, [state, quality]);

  return (
    <div className="tutorial app screen-board" role="dialog" aria-modal="true" aria-label="Interactive tutorial" onKeyDown={(event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const first = buttons[0];
      const lastButton = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); lastButton?.focus(); }
      else if (!event.shiftKey && document.activeElement === lastButton) { event.preventDefault(); first?.focus(); }
    }}>
      <div className="backdrop" aria-hidden="true" />
      <div className="stage" ref={host} />
      <div className="ui board-ui">
        <header className="topbar">
          <button autoFocus className="round-btn" aria-label="Exit tutorial" onClick={onClose}><Back /></button>
          <strong>Learn to play · {state.lesson + 1}/{LESSONS.length}</strong>
          <button className="round-btn" aria-label="Restart lesson" onClick={() => setState(startLesson(state.lesson))}>↻</button>
        </header>
        <div className="tutorial-guide" aria-live="polite">
          <strong>{state.complete && last ? 'Tutorial complete!' : lesson.title}</strong>
          <p>{state.complete ? lesson.outcome : lesson.instruction}</p>
          <small>Guided lesson · preset dice</small>
        </div>
        <footer className="board-foot">
          {state.complete ? (
            <button className="play-btn roll-btn tutorial-next" onClick={() => last ? onClose() : setState(startLesson(state.lesson + 1))}>
              {last ? 'DONE' : 'NEXT'}
            </button>
          ) : state.match.turn.phase === 'roll' ? (
            <div className="roll-row">
              <Die value={state.rolls ? lesson.dice[state.rolls - 1]! : 6} rolling={false} />
              <button className="play-btn roll-btn" onClick={() => setState((current) => advanceLesson(current))}>ROLL</button>
            </div>
          ) : (
            <div className="tutorial-choices" role="group" aria-label="Choose a red pawn">
              <span>Tap a glowing pawn, or choose below</span>
              <div className="segmented">
                {moves.map((move) => <button key={move.pawn} onClick={() => setState((current) => advanceLesson(current, move.pawn))}>Pawn {move.pawn + 1}</button>)}
              </div>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
