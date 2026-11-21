/**
 * Classic Ludo rules engine.
 *
 * Pure and deterministic: a match is a plain JSON object, and the only way to
 * change it is `applyAction`, which returns a new state plus the events that
 * happened. Dice values arrive inside roll actions, so an action log replays
 * to exactly the same match on any machine (client, server, tests).
 */
import { PATH_LENGTH, TRACK_LENGTH, type Seat } from './classicBoard';
import { MAX_BOARD_SEATS, MIN_BOARD_SEATS, SQUARES_PER_SEAT, boardSeatsFor, boardShape, isSafeTrackIndex } from './layout';

/** Pawn progress values: -1 in the yard, 0–55 on the path, 56 finished. */
export const YARD = -1;
export const FINISH_STEP = PATH_LENGTH - 1;
/** Last step that is on the shared loop; later steps are in the home lane. */
export const LAST_SHARED_STEP = TRACK_LENGTH - 2;
/** LOCKED RULE: the third consecutive six ends the turn with no move. */
export const SIX_LIMIT = 3;
/** Mercy rule: the roll that is guaranteed a six, counting rolls with every pawn in the yard. */
export const MERCY_TRIES = 3;

export interface RulesConfig {
  pawnsPerPlayer: 2 | 3 | 4;
  /** Rolling a six grants another roll. */
  bonusOnSix: boolean;
  /** Capturing grants another roll. */
  bonusOnCapture: boolean;
  /** Bringing a pawn home grants another roll. */
  bonusOnFinish: boolean;
  /** If one move earns several bonuses (e.g. a six that captures), grant each. */
  stackBonuses: boolean;
  /**
   * Stacks: pawns of one colour may share a square. A different colour landing there
   * captures only one pawn of that stack. Off: the lander captures the whole stack.
   * Nothing ever blocks movement. (The key keeps its old name so saved matches load.)
   */
  blockades: boolean;
  /**
   * Mercy rule: while none of a seat's pawns are out (every unfinished pawn is in the
   * yard), its third roll in a row without a six is a six. With two dice, one die is a six.
   */
  mercy: boolean;
  /**
   * Sides: who plays which seats, as a side number per seat (index = seat). Seats on the
   * same side never capture each other, and the first side to bring all its seats home
   * wins. null: every seat plays for itself. Used by 1v1 with two colours each.
   */
  sides: number[] | null;
  /** Arms on the board: 4 is the classic board, 5-8 the larger star boards. */
  boardSeats: number;
  /** Pawns that begin on the start square instead of in the yard (Quick modes). */
  startOnBoard: number;
  /** Pawns a seat must bring home to finish. null means all of them. */
  pawnsToWin: number | null;
  /** End the match as soon as one seat finishes, ranking the rest by standing. */
  endOnFirstFinish: boolean;
  /** Quick Clash: the match ends when a seat reaches this score. null turns scoring wins off. */
  targetScore: number | null;
  capturePoints: number;
  homePoints: number;
  /**
   * Dice per roll. With 2, each die is used separately (on the same pawn or different
   * ones, in either order); a double earns another roll, and a third double in a row
   * ends the turn, mirroring the locked three-sixes rule of the one-die game.
   */
  dice: 1 | 2;
}

export const CLASSIC_RULES: RulesConfig = {
  pawnsPerPlayer: 4,
  bonusOnSix: true,
  bonusOnCapture: true,
  bonusOnFinish: true,
  stackBonuses: false,
  blockades: true,
  mercy: true,
  sides: null,
  boardSeats: 4,
  startOnBoard: 0,
  pawnsToWin: null,
  endOnFirstFinish: false,
  targetScore: null,
  capturePoints: 0,
  homePoints: 0,
  dice: 1,
};

/** Quick Race: one pawn already out; the first seat to bring two pawns home wins. */
export const QUICK_RACE_RULES: RulesConfig = { ...CLASSIC_RULES, startOnBoard: 1, pawnsToWin: 2, endOnFirstFinish: true };

/**
 * Quick Clash: one pawn already out; 3 points per capture, 2 per pawn home.
 * First to 10 points wins. If someone brings two pawns home first, the match
 * ends there and the highest score wins.
 */
export const QUICK_CLASH_RULES: RulesConfig = {
  ...CLASSIC_RULES,
  startOnBoard: 1,
  pawnsToWin: 2,
  endOnFirstFinish: true,
  targetScore: 10,
  capturePoints: 3,
  homePoints: 2,
};

export type Phase = 'roll' | 'move' | 'over';

export interface TurnState {
  seat: Seat;
  phase: Phase;
  /** The die waiting to be used (move phase only). */
  die: number | null;
  /** Two-dice games: the other die, still waiting to be used. */
  die2?: number | null;
  /** Two-dice games: extra rolls earned by the current roll so far. */
  rollBonus?: number;
  /** Consecutive sixes (one die) or doubles (two dice) rolled so far in this turn (0–2). */
  sixes: number;
  /** Extra rolls already earned but not yet taken (only with stackBonuses). */
  pendingBonus: number;
}

export interface MatchState {
  config: RulesConfig;
  /** Seats taking part, in turn order. */
  seats: Seat[];
  /** pawns[seat][pawn] = progress. Seats not playing have an empty list. */
  pawns: number[][];
  turn: TurnState;
  /** Final placing, best first. Filled as seats finish, completed when the match ends. */
  finishOrder: Seat[];
  /** Points per seat (index = seat). Only Quick Clash awards any. */
  scores: number[];
  /** Number of actions applied so far. */
  version: number;
  /** Mercy rule: rolls in a row without a six while all of a seat's pawns are in the yard (index = seat). */
  yardTries?: number[];
}

export type Action =
  | { type: 'roll'; seat: Seat; value: number; /** Second die, two-dice games only. */ value2?: number }
  | { type: 'move'; seat: Seat; pawn: number; /** Which die to use, two-dice games only. Defaults to the first that works. */ die?: number };

export interface PawnRef {
  seat: Seat;
  pawn: number;
}

export interface LegalMove {
  pawn: number;
  from: number;
  to: number;
  captures: PawnRef[];
  finishes: boolean;
  /** The die value this move uses. */
  die: number;
}

export type GameEvent =
  | { type: 'rolled'; seat: Seat; value: number; value2?: number }
  | { type: 'thirdSixForfeit'; seat: Seat }
  | { type: 'noLegalMove'; seat: Seat; value: number }
  | { type: 'moved'; seat: Seat; pawn: number; from: number; to: number }
  | { type: 'captured'; seat: Seat; pawn: number; by: Seat }
  | { type: 'pawnFinished'; seat: Seat; pawn: number }
  | { type: 'scored'; seat: Seat; points: number; total: number }
  | { type: 'seatFinished'; seat: Seat; place: number }
  | { type: 'bonusRoll'; seat: Seat; reason: 'six' | 'double' | 'capture' | 'finish' }
  | { type: 'turnPassed'; seat: Seat }
  | { type: 'matchOver'; order: Seat[] };

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

/** Default seating: two players sit opposite each other. */
export const defaultSeats = (playerCount: number): Seat[] => {
  if (playerCount === 2) return [0, 2];
  if (playerCount === 3) return [0, 1, 2];
  if (Number.isInteger(playerCount) && playerCount >= 4 && playerCount <= MAX_BOARD_SEATS)
    return Array.from({ length: playerCount }, (_, i) => i as Seat);
  throw new RuleError(`Matches have 2 to ${MAX_BOARD_SEATS} players`);
};

/** Board size and step values for a match. Matches saved before larger boards existed are classic. */
export const shapeOf = (state: MatchState) => boardShape(state.config.boardSeats ?? 4);
/** The step value of a pawn that is home, for this match's board. */
export const finishStepOf = (state: MatchState): number => shapeOf(state).finishStep;

export function createMatch(options: { players?: number; seats?: Seat[]; config?: Partial<RulesConfig> } = {}): MatchState {
  const seats = options.seats ? [...options.seats] : defaultSeats(options.players ?? 4);
  const config = { ...CLASSIC_RULES, ...options.config };
  // Five or more players always get a board with at least one arm each, even when a
  // mode preset says 4. A larger board can still be asked for explicitly.
  config.boardSeats = Math.max(config.boardSeats ?? 4, boardSeatsFor(seats.length));
  const boardSeats = config.boardSeats;
  if (!Number.isInteger(boardSeats) || boardSeats < MIN_BOARD_SEATS || boardSeats > MAX_BOARD_SEATS)
    throw new RuleError(`Boards have ${MIN_BOARD_SEATS} to ${MAX_BOARD_SEATS} seats`);
  if (seats.length < 2 || new Set(seats).size !== seats.length || seats.some((s) => !Number.isInteger(s) || s < 0 || s >= boardSeats))
    throw new RuleError('Seats must be 2 or more distinct seats that exist on the board');
  const boardIndexes = Array.from({ length: boardSeats }, (_, i) => i as Seat);
  if (![2, 3, 4].includes(config.pawnsPerPlayer)) throw new RuleError('Pawns per player must be 2, 3 or 4');
  config.dice ??= 1;
  if (config.dice !== 1 && config.dice !== 2) throw new RuleError('Matches use one or two dice');
  const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!whole(config.startOnBoard, 0, config.pawnsPerPlayer)) throw new RuleError('Invalid number of pawns starting on the board');
  if (config.pawnsToWin !== null && !whole(config.pawnsToWin, 1, config.pawnsPerPlayer)) throw new RuleError('Invalid pawns needed to win');
  if (config.targetScore !== null && !whole(config.targetScore, 1, 1000)) throw new RuleError('Invalid target score');
  if (!whole(config.capturePoints, 0, 100) || !whole(config.homePoints, 0, 100)) throw new RuleError('Invalid points');
  config.mercy ??= false; // saved matches from before the mercy rule keep playing without it
  config.sides ??= null;
  if (config.sides !== null) {
    const sides = config.sides;
    if (!Array.isArray(sides) || sides.length !== boardSeats || seats.some((s) => !Number.isInteger(sides[s]) || sides[s]! < 0))
      throw new RuleError('Every seat needs a side');
    if (new Set(seats.map((s) => sides[s])).size < 2) throw new RuleError('Sides need at least two teams');
    if (config.endOnFirstFinish || config.targetScore !== null) throw new RuleError('Sides are played with classic rules');
  }
  return {
    config,
    seats,
    pawns: boardIndexes.map((s) =>
      seats.includes(s) ? Array.from({ length: config.pawnsPerPlayer }, (_, i) => (i < config.startOnBoard ? 0 : YARD)) : [],
    ),
    turn: { seat: seats[0]!, phase: 'roll', die: null, sixes: 0, pendingBonus: 0 },
    finishOrder: [],
    scores: boardIndexes.map(() => 0),
    version: 0,
    yardTries: boardIndexes.map(() => 0),
  };
}

/** Shared-loop square a pawn stands on, or null in the yard, lane or finish. */
export const trackIndexAt = (seat: Seat, step: number, boardSeats = 4): number | null => {
  const trackLength = SQUARES_PER_SEAT * boardSeats;
  return step < 0 || step > trackLength - 2 ? null : (seat * SQUARES_PER_SEAT + step) % trackLength;
};

/** Shared-loop square of a pawn in this match, or null in the yard, lane or finish. */
export const trackIndexIn = (state: MatchState, seat: Seat, step: number): number | null =>
  trackIndexAt(seat, step, state.config.boardSeats ?? 4);

const pawnsOn = (state: MatchState, seat: Seat, trackIndex: number): number[] =>
  state.pawns[seat]!.flatMap((step, pawn) => (trackIndexIn(state, seat, step) === trackIndex ? [pawn] : []));

/** The side a seat plays for. Without sides every seat is its own side. */
export const sideOf = (state: MatchState, seat: Seat): number => state.config.sides?.[seat] ?? 100 + seat;

const opponentsOf = (state: MatchState, seat: Seat) => state.seats.filter((s) => sideOf(state, s) !== sideOf(state, seat));

/**
 * Pawns captured by landing on a square: from each opposing colour there, one pawn of
 * its stack (with stacks on) or all of them (stacks off).
 */
const capturableOn = (state: MatchState, mover: Seat, trackIndex: number): PawnRef[] =>
  opponentsOf(state, mover).flatMap((s) => {
    const here = pawnsOn(state, s, trackIndex);
    return (state.config.blockades ? here.slice(0, 1) : here).map((p) => ({ seat: s, pawn: p }));
  });

/** True when none of the seat's pawns are out: every unfinished pawn is in the yard. */
export const allInYard = (state: MatchState, seat: Seat): boolean => {
  const finish = finishStepOf(state);
  const left = state.pawns[seat]!.filter((p) => p !== finish);
  return left.length > 0 && left.every((p) => p === YARD);
};

/** Mercy rule: whether the next roll of the seat to play must contain a six. */
export const mercySixDue = (state: MatchState): boolean =>
  !!state.config.mercy &&
  state.turn.phase === 'roll' &&
  allInYard(state, state.turn.seat) &&
  (state.yardTries?.[state.turn.seat] ?? 0) >= MERCY_TRIES - 1;

/** Roll for the seat to play, honouring the mercy rule. Online the server uses this; offline the app does. */
export function rollFor(state: MatchState, dice: Dice): { value: number; value2?: number } {
  const value = mercySixDue(state) ? 6 : dice.roll();
  return state.config.dice === 2 ? { value, value2: dice.roll() } : { value };
}

/** Count a roll toward the mercy rule. Call before the roll is applied. */
function trackYardTries(state: MatchState, values: number[]) {
  if (!state.config.mercy) return;
  const seat = state.turn.seat;
  const tries = (state.yardTries ??= state.pawns.map(() => 0));
  tries[seat] = allInYard(state, seat) && !values.includes(6) ? (tries[seat] ?? 0) + 1 : 0;
}

/** Dice still waiting to be used this roll. */
export const diceLeft = (state: MatchState): number[] =>
  state.turn.phase !== 'move' ? [] : [state.turn.die, state.turn.die2].filter((d): d is number => typeof d === 'number');

/**
 * Every move the seat whose turn it is can make. With no die given, that is every
 * move for every die still waiting to be used (one or two).
 */
export function legalMoves(state: MatchState, die?: number | null): LegalMove[] {
  if (die === undefined) {
    const left = [...new Set(diceLeft(state))];
    return left.flatMap((d) => legalMoves(state, d));
  }
  if (die === null || state.turn.phase === 'over') return [];
  const seat = state.turn.seat;
  const moves: LegalMove[] = [];
  const finish = finishStepOf(state);
  state.pawns[seat]!.forEach((from, pawn) => {
    if (from === finish) return;
    if (from === YARD && die !== 6) return; // a six is required to enter
    const to = from === YARD ? 0 : from + die;
    if (to > finish) return; // finishing needs the exact number
    const landing = trackIndexIn(state, seat, to);
    const captures: PawnRef[] = landing === null || isSafeTrackIndex(landing) ? [] : capturableOn(state, seat, landing);
    moves.push({ pawn, from, to, captures, finishes: to === finish, die });
  });
  return moves;
}

const clone = (s: MatchState): MatchState => ({
  config: { ...s.config },
  seats: [...s.seats],
  pawns: s.pawns.map((p) => [...p]),
  turn: { ...s.turn },
  finishOrder: [...s.finishOrder],
  scores: [...s.scores],
  version: s.version,
  ...(s.yardTries ? { yardTries: [...s.yardTries] } : {}),
});

function passTurn(state: MatchState, events: GameEvent[]) {
  const remaining = state.seats.filter((s) => !state.finishOrder.includes(s));
  const order = state.seats;
  let i = order.indexOf(state.turn.seat);
  let next: Seat;
  do {
    i = (i + 1) % order.length;
    next = order[i]!;
  } while (!remaining.includes(next));
  state.turn = { seat: next, phase: 'roll', die: null, sixes: 0, pendingBonus: 0 };
  if (state.config.dice === 2) Object.assign(state.turn, { die2: null, rollBonus: 0 });
  events.push({ type: 'turnPassed', seat: next });
}

/** After a roll is fully resolved: take an earned extra roll, or pass the turn. */
function continueOrPass(state: MatchState, earned: number, events: GameEvent[]) {
  const total = state.turn.pendingBonus + earned;
  if (total > 0) {
    state.turn = { ...state.turn, phase: 'roll', die: null, pendingBonus: total - 1 };
    if (state.config.dice === 2) Object.assign(state.turn, { die2: null, rollBonus: 0 });
  }
  else passTurn(state, events);
}

function applyRoll(state: MatchState, value: number, events: GameEvent[]) {
  const seat = state.turn.seat;
  events.push({ type: 'rolled', seat, value });
  const sixes = value === 6 ? state.turn.sixes + 1 : 0;
  if (sixes === SIX_LIMIT) {
    // Locked rule: no move with the third six, earlier moves stand, turn ends.
    events.push({ type: 'thirdSixForfeit', seat });
    passTurn(state, events);
    return;
  }
  state.turn.sixes = sixes;
  if (legalMoves(state, value).length === 0) {
    events.push({ type: 'noLegalMove', seat, value });
    const earned = value === 6 && state.config.bonusOnSix ? 1 : 0;
    if (earned) events.push({ type: 'bonusRoll', seat, reason: 'six' });
    continueOrPass(state, earned, events);
    return;
  }
  state.turn.phase = 'move';
  state.turn.die = value;
}

/** Two dice: both values are kept and used one at a time. */
function applyRoll2(state: MatchState, a: number, b: number, events: GameEvent[]) {
  const seat = state.turn.seat;
  events.push({ type: 'rolled', seat, value: a, value2: b });
  const double = a === b;
  const streak = double ? state.turn.sixes + 1 : 0;
  if (streak === SIX_LIMIT) {
    // Third double in a row: no move with it, earlier moves stand, turn ends.
    events.push({ type: 'thirdSixForfeit', seat });
    passTurn(state, events);
    return;
  }
  const bonus = double && state.config.bonusOnSix ? 1 : 0;
  if (bonus) events.push({ type: 'bonusRoll', seat, reason: 'double' });
  state.turn = { ...state.turn, phase: 'move', die: a, die2: b, sixes: streak, rollBonus: bonus };
  settleDice(state, events);
}

/**
 * Two dice: the roll ends once no remaining die can be used. A die that cannot be used
 * yet is kept while the other can still move, because that move may open it up (a six
 * that brings a pawn out lets the other die move it).
 */
function settleDice(state: MatchState, events: GameEvent[]) {
  const seat = state.turn.seat;
  const left = diceLeft(state);
  if (left.some((d) => legalMoves(state, d).length > 0)) return;
  for (const d of left) events.push({ type: 'noLegalMove', seat, value: d });
  state.turn = { ...state.turn, die: null, die2: null };
  continueOrPass(state, state.turn.rollBonus ?? 0, events);
}

function useDie(state: MatchState, value: number) {
  if (state.turn.die === value) state.turn = { ...state.turn, die: state.turn.die2 ?? null, die2: null };
  else if (state.turn.die2 === value) state.turn = { ...state.turn, die2: null };
}

function applyMove(state: MatchState, pawn: number, events: GameEvent[], chosen?: number) {
  const seat = state.turn.seat;
  const left = diceLeft(state);
  if (chosen !== undefined && !left.includes(chosen)) throw new RuleError('That die has already been used');
  const options = legalMoves(state).filter((m) => m.pawn === pawn && (chosen === undefined || m.die === chosen));
  const move = options[0];
  if (!move) throw new RuleError('That pawn cannot move with this roll');
  const die = move.die;
  state.pawns[seat]![pawn] = move.to;
  events.push({ type: 'moved', seat, pawn, from: move.from, to: move.to });
  for (const c of move.captures) {
    state.pawns[c.seat]![c.pawn] = YARD;
    events.push({ type: 'captured', seat: c.seat, pawn: c.pawn, by: seat });
  }
  if (move.finishes) events.push({ type: 'pawnFinished', seat, pawn });

  const { capturePoints, homePoints, targetScore, endOnFirstFinish } = state.config;
  const points = move.captures.length * capturePoints + (move.finishes ? homePoints : 0);
  if (points > 0) {
    state.scores[seat]! += points;
    events.push({ type: 'scored', seat, points, total: state.scores[seat]! });
  }

  const finish = finishStepOf(state);
  const homeCount = (s: Seat) => state.pawns[s]!.filter((step) => step === finish).length;
  const seatDone = homeCount(seat) >= (state.config.pawnsToWin ?? state.pawns[seat]!.length);
  const scoreWin = targetScore !== null && state.scores[seat]! >= targetScore;
  const endMatch = () => {
    state.turn = { seat, phase: 'over', die: null, sixes: 0, pendingBonus: 0 };
    events.push({ type: 'matchOver', order: [...state.finishOrder] });
  };

  if (scoreWin || (seatDone && endOnFirstFinish)) {
    // Quick modes: rank everyone now. Clash ranks by score; Race puts the finisher first.
    const progress = (s: Seat) => state.pawns[s]!.reduce((sum, step) => sum + step, 0);
    const lead = (s: Seat) => (targetScore !== null ? state.scores[s]! : s === seat ? 1 : 0);
    state.finishOrder = [...state.seats].sort(
      (a, b) => lead(b) - lead(a) || homeCount(b) - homeCount(a) || progress(b) - progress(a),
    );
    events.push({ type: 'seatFinished', seat: state.finishOrder[0]!, place: 1 });
    endMatch();
    return;
  }

  if (seatDone && state.config.sides) {
    // Sides: the first side with every seat home wins; everyone else is ranked by distance.
    state.finishOrder.push(seat);
    events.push({ type: 'seatFinished', seat, place: state.finishOrder.length });
    const side = sideOf(state, seat);
    if (state.seats.filter((s) => sideOf(state, s) === side).every((s) => state.finishOrder.includes(s))) {
      // Winning side first (in the order its seats got home), then the others: those
      // already home in order, then the rest by pawns home and distance travelled.
      const progress = (s: Seat) => state.pawns[s]!.reduce((sum, step) => sum + step, 0);
      const winners = state.finishOrder.filter((s) => sideOf(state, s) === side);
      const finishedOthers = state.finishOrder.filter((s) => sideOf(state, s) !== side);
      const rest = state.seats.filter((s) => !state.finishOrder.includes(s));
      rest.sort((a, b) => homeCount(b) - homeCount(a) || progress(b) - progress(a));
      state.finishOrder = [...winners, ...finishedOthers, ...rest];
      endMatch();
    } else passTurn(state, events);
    return;
  }

  if (seatDone) {
    state.finishOrder.push(seat);
    events.push({ type: 'seatFinished', seat, place: state.finishOrder.length });
    const remaining = state.seats.filter((s) => !state.finishOrder.includes(s));
    if (remaining.length <= 1) {
      state.finishOrder.push(...remaining);
      endMatch();
    } else passTurn(state, events); // a finished seat has nothing left to roll for
    return;
  }

  const { bonusOnSix, bonusOnCapture, bonusOnFinish, stackBonuses } = state.config;
  const reasons: ('six' | 'capture' | 'finish')[] = [];
  if (state.config.dice === 2) {
    // The double bonus was decided at the roll; moves can add capture and home bonuses.
    if (move.captures.length > 0 && bonusOnCapture) reasons.push('capture');
    if (move.finishes && bonusOnFinish) reasons.push('finish');
    const have = state.turn.rollBonus ?? 0;
    const add = stackBonuses ? reasons.length : have > 0 ? 0 : Math.min(1, reasons.length);
    for (const reason of reasons.slice(0, add)) events.push({ type: 'bonusRoll', seat, reason });
    state.turn.rollBonus = have + add;
    useDie(state, die);
    settleDice(state, events);
    return;
  }
  if (die === 6 && bonusOnSix) reasons.push('six');
  if (move.captures.length > 0 && bonusOnCapture) reasons.push('capture');
  if (move.finishes && bonusOnFinish) reasons.push('finish');
  const granted = stackBonuses ? reasons : reasons.slice(0, 1);
  for (const reason of granted) events.push({ type: 'bonusRoll', seat, reason });
  continueOrPass(state, granted.length, events);
}

/** Validate and apply one action. Throws RuleError and changes nothing if it is not allowed. */
export function applyAction(prev: MatchState, action: Action): { state: MatchState; events: GameEvent[] } {
  if (prev.turn.phase === 'over') throw new RuleError('The match is over');
  if (action.seat !== prev.turn.seat) throw new RuleError('It is not that seat’s turn');
  const state = clone(prev);
  const events: GameEvent[] = [];
  if (action.type === 'roll') {
    if (prev.turn.phase !== 'roll') throw new RuleError('A pawn must be moved before rolling again');
    const face = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 6;
    if (!face(action.value)) throw new RuleError('Die must be 1 to 6');
    if (state.config.dice === 2 && !face(action.value2)) throw new RuleError('This game rolls two dice');
    const values = state.config.dice === 2 ? [action.value, action.value2!] : [action.value];
    if (mercySixDue(state) && !values.includes(6)) throw new RuleError('Mercy rule: this roll is a six');
    trackYardTries(state, values);
    if (state.config.dice === 2) applyRoll2(state, action.value, action.value2!, events);
    else applyRoll(state, action.value, events);
  } else if (action.type === 'move') {
    if (prev.turn.phase !== 'move') throw new RuleError('Roll the die first');
    applyMove(state, action.pawn, events, action.die);
  } else throw new RuleError('Unknown action');
  state.version = prev.version + 1;
  return { state, events };
}

/** Rebuild a match from its starting state and action log. */
export const replay = (initial: MatchState, actions: readonly Action[]): MatchState =>
  actions.reduce((state, action) => applyAction(state, action).state, initial);

// ---------- dice ----------

export interface Dice {
  roll(): number;
}

/** Repeatable dice for tests, simulations and replays. Not for online matches. */
export function seededDice(seed: number): Dice {
  let a = seed >>> 0;
  return {
    roll() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 6) + 1;
    },
  };
}

// ---------- serialization ----------

export const serializeMatch = (state: MatchState): string => JSON.stringify(state);

/** Parse a saved match, rejecting anything that is not a consistent state. */
export function deserializeMatch(json: string): MatchState {
  const s = JSON.parse(json) as MatchState;
  const fail = (why: string): never => {
    throw new RuleError(`Invalid saved match: ${why}`);
  };
  if (!s || typeof s !== 'object' || !s.config || !s.turn || !Array.isArray(s.seats) || !Array.isArray(s.pawns)) fail('shape');
  // Rules added later stay off for matches saved before them.
  const config = { ...s.config, mercy: s.config.mercy ?? false, sides: s.config.sides ?? null };
  const fresh = createMatch({ seats: s.seats, config }); // validates seats and config
  if (s.pawns.length !== fresh.pawns.length) fail('pawn lists');
  s.pawns.forEach((list, seat) => {
    if (!Array.isArray(list) || list.length !== fresh.pawns[seat]!.length) fail('pawn count');
    if (list.some((p) => !Number.isInteger(p) || p < YARD || p > boardShape(fresh.config.boardSeats).finishStep)) fail('pawn position');
  });
  const t = s.turn;
  if (!s.seats.includes(t.seat) || !['roll', 'move', 'over'].includes(t.phase)) fail('turn');
  if ((t.phase === 'move') !== (t.die !== null)) fail('die');
  if (t.die !== null && (!Number.isInteger(t.die) || t.die < 1 || t.die > 6)) fail('die value');
  if (t.die2 !== undefined && t.die2 !== null && (!Number.isInteger(t.die2) || t.die2 < 1 || t.die2 > 6 || t.die === null)) fail('second die');
  if (t.rollBonus !== undefined && (!Number.isInteger(t.rollBonus) || t.rollBonus < 0)) fail('roll bonus');
  if (!Number.isInteger(t.sixes) || t.sixes < 0 || t.sixes >= SIX_LIMIT) fail('six streak');
  if (!Number.isInteger(t.pendingBonus) || t.pendingBonus < 0) fail('bonus');
  if (!Array.isArray(s.finishOrder) || s.finishOrder.some((x) => !s.seats.includes(x))) fail('finish order');
  if (!Array.isArray(s.scores) || s.scores.length !== fresh.scores.length || s.scores.some((n) => !Number.isInteger(n) || n < 0)) fail('scores');
  if (!Number.isInteger(s.version) || s.version < 0) fail('version');
  if (
    s.yardTries !== undefined &&
    (!Array.isArray(s.yardTries) || s.yardTries.length !== fresh.pawns.length || s.yardTries.some((n) => !Number.isInteger(n) || n < 0))
  )
    fail('yard tries');
  return { ...clone(s), config: fresh.config };
}
