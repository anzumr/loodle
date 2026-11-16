/**
 * Classic Ludo rules engine.
 *
 * Pure and deterministic: a match is a plain JSON object, and the only way to
 * change it is `applyAction`, which returns a new state plus the events that
 * happened. Dice values arrive inside roll actions, so an action log replays
 * to exactly the same match on any machine (client, server, tests).
 */
import { PATH_LENGTH, SEATS, SEAT_TRACK_OFFSET, TRACK, TRACK_LENGTH, type Seat } from './classicBoard';

/** Pawn progress values: -1 in the yard, 0–55 on the path, 56 finished. */
export const YARD = -1;
export const FINISH_STEP = PATH_LENGTH - 1;
/** Last step that is on the shared loop; later steps are in the home lane. */
export const LAST_SHARED_STEP = TRACK_LENGTH - 2;
/** LOCKED RULE: the third consecutive six ends the turn with no move. */
export const SIX_LIMIT = 3;

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
  /** Two friendly pawns on a shared square block opponents from landing or passing. */
  blockades: boolean;
}

export const CLASSIC_RULES: RulesConfig = {
  pawnsPerPlayer: 4,
  bonusOnSix: true,
  bonusOnCapture: true,
  bonusOnFinish: false,
  stackBonuses: false,
  blockades: true,
};

export type Phase = 'roll' | 'move' | 'over';

export interface TurnState {
  seat: Seat;
  phase: Phase;
  /** The die waiting to be used (move phase only). */
  die: number | null;
  /** Consecutive sixes rolled so far in this turn (0–2). */
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
  /** Seats in the order they brought every pawn home. */
  finishOrder: Seat[];
  /** Number of actions applied so far. */
  version: number;
}

export type Action = { type: 'roll'; seat: Seat; value: number } | { type: 'move'; seat: Seat; pawn: number };

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
}

export type GameEvent =
  | { type: 'rolled'; seat: Seat; value: number }
  | { type: 'thirdSixForfeit'; seat: Seat }
  | { type: 'noLegalMove'; seat: Seat; value: number }
  | { type: 'moved'; seat: Seat; pawn: number; from: number; to: number }
  | { type: 'captured'; seat: Seat; pawn: number; by: Seat }
  | { type: 'pawnFinished'; seat: Seat; pawn: number }
  | { type: 'seatFinished'; seat: Seat; place: number }
  | { type: 'bonusRoll'; seat: Seat; reason: 'six' | 'capture' | 'finish' }
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
  if (playerCount === 4) return [0, 1, 2, 3];
  throw new RuleError('The classic board seats 2 to 4 players');
};

export function createMatch(options: { players?: number; seats?: Seat[]; config?: Partial<RulesConfig> } = {}): MatchState {
  const config = { ...CLASSIC_RULES, ...options.config };
  const seats = options.seats ? [...options.seats] : defaultSeats(options.players ?? 4);
  if (seats.length < 2 || seats.length > 4 || new Set(seats).size !== seats.length || seats.some((s) => !SEATS.includes(s)))
    throw new RuleError('Seats must be 2 to 4 distinct classic seats');
  if (![2, 3, 4].includes(config.pawnsPerPlayer)) throw new RuleError('Pawns per player must be 2, 3 or 4');
  return {
    config,
    seats,
    pawns: SEATS.map((s) => (seats.includes(s) ? Array<number>(config.pawnsPerPlayer).fill(YARD) : [])),
    turn: { seat: seats[0]!, phase: 'roll', die: null, sixes: 0, pendingBonus: 0 },
    finishOrder: [],
    version: 0,
  };
}

/** Shared-loop square a pawn stands on, or null in the yard, lane or finish. */
export const trackIndexAt = (seat: Seat, step: number): number | null =>
  step < 0 || step > LAST_SHARED_STEP ? null : (seat * SEAT_TRACK_OFFSET + step) % TRACK_LENGTH;

const pawnsOn = (state: MatchState, seat: Seat, trackIndex: number): number[] =>
  state.pawns[seat]!.flatMap((step, pawn) => (trackIndexAt(seat, step) === trackIndex ? [pawn] : []));

const opponentsOf = (state: MatchState, seat: Seat) => state.seats.filter((s) => s !== seat);

const blockadeAt = (state: MatchState, mover: Seat, trackIndex: number): boolean =>
  state.config.blockades && opponentsOf(state, mover).some((s) => pawnsOn(state, s, trackIndex).length >= 2);

/** Every move the given die allows the seat whose turn it is. */
export function legalMoves(state: MatchState, die: number | null = state.turn.die): LegalMove[] {
  if (die === null || state.turn.phase === 'over') return [];
  const seat = state.turn.seat;
  const moves: LegalMove[] = [];
  state.pawns[seat]!.forEach((from, pawn) => {
    if (from === FINISH_STEP) return;
    if (from === YARD && die !== 6) return; // a six is required to enter
    const to = from === YARD ? 0 : from + die;
    if (to > FINISH_STEP) return; // finishing needs the exact number
    // Squares travelled over, then the landing square. Entering only touches the start.
    for (let step = from === YARD ? 0 : from + 1; step <= to; step++) {
      const idx = trackIndexAt(seat, step);
      if (idx !== null && blockadeAt(state, seat, idx)) return;
    }
    const landing = trackIndexAt(seat, to);
    const captures: PawnRef[] =
      landing === null || TRACK[landing]!.safe
        ? []
        : opponentsOf(state, seat).flatMap((s) => pawnsOn(state, s, landing).map((p) => ({ seat: s, pawn: p })));
    moves.push({ pawn, from, to, captures, finishes: to === FINISH_STEP });
  });
  return moves;
}

const clone = (s: MatchState): MatchState => ({
  config: { ...s.config },
  seats: [...s.seats],
  pawns: s.pawns.map((p) => [...p]),
  turn: { ...s.turn },
  finishOrder: [...s.finishOrder],
  version: s.version,
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
  events.push({ type: 'turnPassed', seat: next });
}

/** After a roll is fully resolved: take an earned extra roll, or pass the turn. */
function continueOrPass(state: MatchState, earned: number, events: GameEvent[]) {
  const total = state.turn.pendingBonus + earned;
  if (total > 0) state.turn = { ...state.turn, phase: 'roll', die: null, pendingBonus: total - 1 };
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

function applyMove(state: MatchState, pawn: number, events: GameEvent[]) {
  const seat = state.turn.seat;
  const die = state.turn.die!;
  const move = legalMoves(state).find((m) => m.pawn === pawn);
  if (!move) throw new RuleError('That pawn cannot move with this roll');
  state.pawns[seat]![pawn] = move.to;
  events.push({ type: 'moved', seat, pawn, from: move.from, to: move.to });
  for (const c of move.captures) {
    state.pawns[c.seat]![c.pawn] = YARD;
    events.push({ type: 'captured', seat: c.seat, pawn: c.pawn, by: seat });
  }
  if (move.finishes) events.push({ type: 'pawnFinished', seat, pawn });

  if (state.pawns[seat]!.every((step) => step === FINISH_STEP)) {
    state.finishOrder.push(seat);
    events.push({ type: 'seatFinished', seat, place: state.finishOrder.length });
    const remaining = state.seats.filter((s) => !state.finishOrder.includes(s));
    if (remaining.length <= 1) {
      state.finishOrder.push(...remaining);
      state.turn = { seat, phase: 'over', die: null, sixes: 0, pendingBonus: 0 };
      events.push({ type: 'matchOver', order: [...state.finishOrder] });
    } else passTurn(state, events); // a finished seat has nothing left to roll for
    return;
  }

  const { bonusOnSix, bonusOnCapture, bonusOnFinish, stackBonuses } = state.config;
  const reasons: ('six' | 'capture' | 'finish')[] = [];
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
    if (!Number.isInteger(action.value) || action.value < 1 || action.value > 6) throw new RuleError('Die must be 1 to 6');
    applyRoll(state, action.value, events);
  } else if (action.type === 'move') {
    if (prev.turn.phase !== 'move') throw new RuleError('Roll the die first');
    applyMove(state, action.pawn, events);
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
  const fresh = createMatch({ seats: s.seats, config: s.config }); // validates seats and config
  if (s.pawns.length !== fresh.pawns.length) fail('pawn lists');
  s.pawns.forEach((list, seat) => {
    if (!Array.isArray(list) || list.length !== fresh.pawns[seat]!.length) fail('pawn count');
    if (list.some((p) => !Number.isInteger(p) || p < YARD || p > FINISH_STEP)) fail('pawn position');
  });
  const t = s.turn;
  if (!s.seats.includes(t.seat) || !['roll', 'move', 'over'].includes(t.phase)) fail('turn');
  if ((t.phase === 'move') !== (t.die !== null)) fail('die');
  if (t.die !== null && (!Number.isInteger(t.die) || t.die < 1 || t.die > 6)) fail('die value');
  if (!Number.isInteger(t.sixes) || t.sixes < 0 || t.sixes >= SIX_LIMIT) fail('six streak');
  if (!Number.isInteger(t.pendingBonus) || t.pendingBonus < 0) fail('bonus');
  if (!Array.isArray(s.finishOrder) || s.finishOrder.some((x) => !s.seats.includes(x))) fail('finish order');
  if (!Number.isInteger(s.version) || s.version < 0) fail('version');
  return clone(s);
}
