/**
 * One private room: the players in it and, once started, the authoritative match.
 *
 * This class has no networking in it so it can be tested directly. Clients can
 * only ask to roll or to move a pawn; the die value is always produced here.
 */
import {
  CLASSIC_RULES,
  QUICK_CLASH_RULES,
  QUICK_RACE_RULES,
  applyAction,
  chooseMove,
  createMatch,
  defaultSeats,
  type Dice,
  type GameEvent,
  type MatchState,
  type Seat,
} from '@loodl/rules';

export const VARIANTS = { classic: CLASSIC_RULES, race: QUICK_RACE_RULES, clash: QUICK_CLASH_RULES } as const;
export type Variant = keyof typeof VARIANTS;
export const MAX_PLAYERS = 4;
export const ACTION_TIMEOUT_MS = 30_000;

export class RoomError extends Error {}

interface Player {
  /** Secret chosen by the client; proves who they are when they reconnect. Never sent to others. */
  token: string;
  name: string;
  seat: Seat | null;
  connected: boolean;
}

/** What every client is allowed to see. */
export interface RoomView {
  code: string;
  variant: Variant;
  /** Index into `players` of the host. */
  host: number;
  players: { name: string; seat: Seat | null; connected: boolean }[];
  match: MatchState | null;
  actionDeadline: number | null;
}

/** 3–16 letters, numbers or underscores; anything else becomes "Guest". */
export const cleanName = (name: unknown): string =>
  typeof name === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(name) ? name : 'Guest';

export class Room {
  private players: Player[] = [];
  private match: MatchState | null = null;
  private actionDeadline: number | null = null;
  /** Last time anything happened, for clearing out abandoned rooms. */
  touched = Date.now();

  constructor(
    readonly code: string,
    readonly variant: Variant,
    private dice: Dice,
  ) {}

  private find(token: string): Player {
    const player = this.players.find((p) => p.token === token);
    if (!player) throw new RoomError('You are not in this room');
    return player;
  }

  indexOf(token: string): number {
    return this.players.findIndex((p) => p.token === token);
  }

  /** Join, or rejoin after a dropped connection (same token keeps the same seat). */
  join(token: string, name: unknown) {
    this.touched = Date.now();
    const existing = this.players.find((p) => p.token === token);
    if (existing) {
      existing.connected = true;
      return;
    }
    if (this.match) throw new RoomError('That match has already started');
    if (this.players.length >= MAX_PLAYERS) throw new RoomError('That room is full');
    this.players.push({ token, name: cleanName(name), seat: null, connected: true });
  }

  disconnect(token: string) {
    const player = this.players.find((p) => p.token === token);
    if (!player) return;
    // Before the match starts a dropped player simply leaves; afterwards the seat is held for them.
    if (this.match) player.connected = false;
    else this.players = this.players.filter((p) => p !== player);
  }

  start(token: string) {
    this.touched = Date.now();
    if (this.players[0] !== this.find(token)) throw new RoomError('Only the host can start the match');
    if (this.match) throw new RoomError('The match has already started');
    if (this.players.length < 2) throw new RoomError('At least two players are needed');
    const seats = defaultSeats(this.players.length);
    this.players.forEach((p, i) => (p.seat = seats[i]!));
    this.match = createMatch({ seats, config: VARIANTS[this.variant] });
    this.actionDeadline = Date.now() + ACTION_TIMEOUT_MS;
  }

  private turnOf(token: string): { match: MatchState; seat: Seat } {
    const player = this.find(token);
    if (!this.match) throw new RoomError('The match has not started');
    if (player.seat === null || this.match.turn.seat !== player.seat) throw new RoomError('It is not your turn');
    return { match: this.match, seat: player.seat };
  }

  /** The server rolls. The client never supplies a value. */
  roll(token: string): GameEvent[] {
    const { match, seat } = this.turnOf(token);
    return this.apply(applyAction(match, { type: 'roll', seat, value: this.dice.roll() }));
  }

  move(token: string, pawn: unknown): GameEvent[] {
    const { match, seat } = this.turnOf(token);
    if (typeof pawn !== 'number' || !Number.isInteger(pawn)) throw new RoomError('Invalid pawn');
    return this.apply(applyAction(match, { type: 'move', seat, pawn }));
  }

  private apply(result: { state: MatchState; events: GameEvent[] }): GameEvent[] {
    this.touched = Date.now();
    this.match = result.state;
    this.actionDeadline = this.match.turn.phase === 'over' ? null : Date.now() + ACTION_TIMEOUT_MS;
    return result.events;
  }

  /** One authoritative action per deadline. Empty rooms remain idle for expiry. */
  tick(now = Date.now()): GameEvent[] {
    if (this.empty || !this.match || this.actionDeadline === null || now < this.actionDeadline) return [];
    const seat = this.match.turn.seat;
    return this.apply(applyAction(this.match, this.match.turn.phase === 'roll'
      ? { type: 'roll', seat, value: this.dice.roll() }
      : { type: 'move', seat, pawn: chooseMove(this.match, 'medium', () => 0.5) }));
  }

  get empty(): boolean {
    return this.players.every((p) => !p.connected);
  }

  view(): RoomView {
    return {
      code: this.code,
      variant: this.variant,
      host: 0,
      players: this.players.map(({ name, seat, connected }) => ({ name, seat, connected })),
      match: this.match,
      actionDeadline: this.actionDeadline,
    };
  }
}
