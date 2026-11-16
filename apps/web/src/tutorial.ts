import { applyAction, createMatch, type Action, type MatchState } from '@loodl/rules';

interface Lesson {
  title: string;
  instruction: string;
  outcome: string;
  dice: number[];
  red?: number[];
  yellow?: number[];
}

// Each lesson is an independent board position. All subsequent changes use the real rules engine.
export const LESSONS: readonly Lesson[] = [
  { title: 'Leave the yard', instruction: 'You are red. Roll a six, then choose a red pawn to bring onto the board.', outcome: 'A six brings a pawn out and earns another roll.', dice: [6] },
  { title: 'Move around the board', instruction: 'Roll a three, then move your red pawn three squares.', outcome: 'Your pawn moves by the number rolled. Play now passes to yellow.', dice: [3], red: [0, -1, -1, -1] },
  { title: 'Capture a rival', instruction: 'Roll a three and land on the yellow pawn.', outcome: 'The yellow pawn returns to its yard. A capture earns you another roll.', dice: [3], red: [2, -1, -1, -1], yellow: [31, -1, -1, -1] },
  { title: 'Safe squares', instruction: 'Roll a three and join yellow on the star square.', outcome: 'Both pawns stay on the star. Stars and coloured start squares protect pawns from capture.', dice: [3], red: [5, -1, -1, -1], yellow: [34, -1, -1, -1] },
  { title: 'Blocked path', instruction: 'Two yellow pawns block your path. Roll a three to see what happens.', outcome: 'You cannot pass or land on an opposing pair. With no legal move, your turn passes.', dice: [3], red: [2, -1, -1, -1], yellow: [30, 30, -1, -1] },
  { title: 'Exact number needed', instruction: 'Your pawn is one square from home. Try rolling a two.', outcome: 'That roll would overshoot home, so the pawn cannot move. You need exactly one.', dice: [2], red: [55, -1, -1, -1] },
  { title: 'Bring a pawn home', instruction: 'Roll a two and move up your red lane into the centre.', outcome: 'One pawn is home! In Classic, bring all four home to finish.', dice: [2], red: [54, -1, -1, -1] },
  { title: 'Three sixes', instruction: 'Roll and move after each of the first two sixes, then roll once more.', outcome: 'The third six ends your turn immediately. Your first two moves still stand.', dice: [6, 6, 6] },
];

export interface TutorialState {
  lesson: number;
  match: MatchState;
  rolls: number;
  complete: boolean;
}

export function startLesson(lesson = 0): TutorialState {
  const definition = LESSONS[lesson];
  if (!definition) throw new Error('Unknown tutorial lesson');
  const match = createMatch({ players: 2 });
  if (definition.red) match.pawns[0] = [...definition.red];
  if (definition.yellow) match.pawns[2] = [...definition.yellow];
  return { lesson, match, rolls: 0, complete: false };
}

/** Dice are scripted only here; normal matches keep their existing random dice. */
export function advanceLesson(state: TutorialState, pawn?: number): TutorialState {
  if (state.complete) return state;
  const isRoll = state.match.turn.phase === 'roll';
  if (isRoll && pawn !== undefined) return state;
  if (!isRoll && pawn === undefined) return state;
  const definition = LESSONS[state.lesson]!;
  const action: Action = isRoll
    ? { type: 'roll', seat: state.match.turn.seat, value: definition.dice[state.rolls]! }
    : { type: 'move', seat: state.match.turn.seat, pawn: pawn! };
  const { state: match } = applyAction(state.match, action);
  const rolls = state.rolls + Number(isRoll);
  return { ...state, match, rolls, complete: rolls === definition.dice.length && match.turn.phase !== 'move' };
}
