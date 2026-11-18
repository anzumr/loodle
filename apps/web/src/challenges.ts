import { applyAction, createMatch, isSafeTrackIndex, legalMoves, trackIndexIn, type GameEvent, type MatchState, type Seat } from '@loodl/rules';

/**
 * Challenge scenarios: one-turn puzzles on the classic board. You play red against a
 * still yellow side, with preset dice, and must reach the goal before your turn ends.
 * Every move goes through the real rules engine.
 *
 * Yellow pawn steps: yellow starts at track square 26, so yellow step s stands on
 * track square (26 + s) % 52. Red step s is track square s.
 */

export interface ChallengeTally {
  captures: number;
  /** Red pawns home at the end, counting any that started there. */
  home: number;
}

export interface Challenge {
  id: string;
  title: string;
  brief: string;
  /** Red's preset rolls, in order. */
  dice: number[];
  red: number[];
  yellow: number[];
  /** Whether the goal is met at this point of the turn. */
  goal(match: MatchState, tally: ChallengeTally): boolean;
  /** Judge the goal only once the turn is over (for positions you must end the turn in). */
  atTurnEnd?: boolean;
  /** Said when the goal is met. */
  win: string;
  /** Said when the turn ends without it. */
  hint: string;
  /** Paid once, the first time it is solved. */
  coins: number;
}

const RED: Seat = 0;
const YELLOW: Seat = 2;
const HOME = 56;

/** Red pawns an opponent could land on next turn: on the shared loop, not on a safe square, not in a pair. */
export function redInDanger(match: MatchState): number[] {
  const lastShared = 50;
  return match.pawns[RED]!.flatMap((step, pawn) => {
    const here = trackIndexIn(match, RED, step);
    if (here === null || isSafeTrackIndex(here)) return [];
    if (match.pawns[RED]!.filter((s) => s === step).length >= 2 && match.config.blockades) return [];
    const threatened = match.seats.some(
      (seat) =>
        seat !== RED &&
        match.pawns[seat]!.some((theirs) => {
          const there = trackIndexIn(match, seat, theirs);
          if (there === null) return false;
          const gap = (here - there + 52) % 52;
          return gap >= 1 && gap <= 6 && theirs + gap <= lastShared;
        }),
    );
    return threatened ? [pawn] : [];
  });
}

export const CHALLENGES: readonly Challenge[] = [
  {
    id: 'hunter',
    title: 'Hunter',
    brief: 'You rolled a five. Capture the yellow pawn.',
    dice: [5],
    red: [10, 30, -1, -1],
    yellow: [41, -1, -1, -1], // track 15
    goal: (_, t) => t.captures >= 1,
    win: 'Caught it! Landing exactly on a rival sends it home.',
    hint: 'Count five squares from each red pawn. Only one lands on yellow.',
    coins: 15,
  },
  {
    id: 'double-trouble',
    title: 'Double trouble',
    brief: 'Capture twice in one turn. A capture earns another roll.',
    dice: [3, 4],
    red: [12, 30, -1, -1],
    yellow: [41, 45, -1, -1], // tracks 15 and 19
    goal: (_, t) => t.captures >= 2,
    win: 'Two in a row! Each capture gave you the next roll.',
    hint: 'The first capture is what earns the second roll. Chase with the same pawn.',
    coins: 20,
  },
  {
    id: 'safe-haven',
    title: 'Safe haven',
    brief: 'A yellow pawn is close behind you. End your turn with no red pawn in reach.',
    dice: [3],
    red: [18, 40, -1, -1],
    yellow: [41, -1, -1, -1], // track 15, threatens 16-21
    goal: (m) => redInDanger(m).length === 0,
    atTurnEnd: true,
    win: 'Safe! Stars and start squares can never be captured.',
    hint: 'Look for a star within three squares of the pawn in danger.',
    coins: 15,
  },
  {
    id: 'strength-in-numbers',
    title: 'Strength in numbers',
    brief: 'Both your pawns are in reach of yellow. Keep them both safe.',
    dice: [4],
    red: [20, 24, -1, -1],
    yellow: [44, -1, -1, -1], // track 18, threatens 19-24
    goal: (m) => redInDanger(m).length === 0,
    atTurnEnd: true,
    win: 'A safe pair! Two pawns of one colour on a square cannot be captured.',
    hint: 'Moving away leaves the other pawn alone. What if they shared a square?',
    coins: 20,
  },
  {
    id: 'break-out',
    title: 'Break out',
    brief: 'You rolled a six, then a one. Capture the yellow pawn by your start.',
    dice: [6, 1],
    red: [2, -1, -1, -1],
    yellow: [27, -1, -1, -1], // track 1
    goal: (_, t) => t.captures >= 1,
    win: 'A six brings a fresh pawn out, and it can strike straight away.',
    hint: 'Yellow sits one square past your start. Which pawn could be one behind it?',
    coins: 20,
  },
  {
    id: 'homecoming',
    title: 'Homecoming',
    brief: 'You rolled a three, then a six. Bring two pawns home this turn.',
    dice: [3, 6],
    red: [53, 50, -1, -1],
    yellow: [10, -1, -1, -1],
    goal: (_, t) => t.home >= 2,
    win: 'Both home! Getting a pawn home earns another roll.',
    hint: 'Only a pawn reaching home earns the next roll. Which one can get there with a three?',
    coins: 25,
  },
];

export interface ChallengeState {
  index: number;
  match: MatchState;
  rolls: number;
  tally: ChallengeTally;
  result: 'playing' | 'won' | 'lost';
}

const homeCount = (m: MatchState) => m.pawns[RED]!.filter((p) => p === HOME).length;

export function startChallenge(index: number): ChallengeState {
  const c = CHALLENGES[index];
  if (!c) throw new Error('Unknown challenge');
  const match = createMatch({ players: 2 });
  match.pawns[RED] = [...c.red];
  match.pawns[YELLOW] = [...c.yellow];
  return { index, match, rolls: 0, tally: { captures: 0, home: homeCount(match) }, result: 'playing' };
}

/** Roll the next preset die, or move a pawn. Anything else leaves the state unchanged. */
export function advanceChallenge(state: ChallengeState, pawn?: number): ChallengeState {
  if (state.result !== 'playing') return state;
  const c = CHALLENGES[state.index]!;
  const rolling = state.match.turn.phase === 'roll';
  if (rolling === (pawn !== undefined)) return state;
  if (rolling && state.rolls >= c.dice.length) return { ...state, result: 'lost' };
  if (!rolling && !legalMoves(state.match).some((m) => m.pawn === pawn)) return state;
  const { state: match, events } = applyAction(
    state.match,
    rolling ? { type: 'roll', seat: RED, value: c.dice[state.rolls]! } : { type: 'move', seat: RED, pawn: pawn! },
  );
  const tally = {
    captures: state.tally.captures + events.filter((e: GameEvent) => e.type === 'captured' && e.by === RED).length,
    home: homeCount(match),
  };
  const next: ChallengeState = { ...state, match, rolls: state.rolls + Number(rolling), tally };
  const turnOver = match.turn.seat !== RED || match.turn.phase === 'over';
  if (!c.atTurnEnd && c.goal(match, tally)) return { ...next, result: 'won' };
  // Out of moves: the turn passed, or a bonus roll came with no preset dice left.
  if (turnOver || (match.turn.phase === 'roll' && next.rolls >= c.dice.length)) return { ...next, result: c.goal(match, tally) ? 'won' : 'lost' };
  return next;
}

// ---------- progress ----------

const KEY = 'loodl.challenges';

export function solvedChallenges(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => CHALLENGES.some((c) => c.id === id)) : [];
  } catch {
    return [];
  }
}

/** Replace the solved list (used when a cloud save is loaded). */
export function setSolvedChallenges(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids.filter((id) => CHALLENGES.some((c) => c.id === id))));
  } catch {
    /* storage unavailable */
  }
}

/** Record a solve. Returns true the first time, when the coins should be paid. */
export function markSolved(id: string): boolean {
  const solved = solvedChallenges();
  if (solved.includes(id)) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify([...solved, id]));
  } catch {
    /* storage unavailable */
  }
  return true;
}
