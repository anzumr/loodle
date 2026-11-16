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
/** Quick Play: countdown once two players are in, so others can still join. */
export const PUBLIC_START_DELAY_MS = 8_000;
/** Quick Play: how long to look for people before computer players fill the empty seats. */
export const BOT_FILL_MS = 15_000;
/** Pause before a computer player acts, so its turn can be followed. */
export const BOT_DELAY_MS = 1_200;
const BOT_NAMES = ['Pip', 'Dot', 'Rook', 'Vex'];

export class RoomError extends Error {}

interface Player {
  /** Secret chosen by the client; proves who they are when they reconnect. Never sent to others. */
  token: string;
  name: string;
  seat: Seat | null;
  connected: boolean;
  /** A computer player added by Quick Play. Always shown as a bot, never as a person. */
  bot: boolean;
}

/** What every client is allowed to see. */
export interface RoomView {
  code: string;
  variant: Variant;
  /** Index into `players` of the host. */
  host: number;
  players: { name: string; seat: Seat | null; connected: boolean; bot: boolean }[];
  match: MatchState | null;
  actionDeadline: number | null;
  /** True for Quick Play rooms: anyone can be matched in and the match starts by itself. */
  public: boolean;
  /** Quick Play: when the match will start, if a countdown is running. */
  startsAt: number | null;
}

/** 3–16 letters, numbers or underscores; anything else becomes "Guest". */
export const cleanName = (name: unknown): string =>
  typeof name === 'string' && /^[A-Za-z0-9_]{3,16}$/.test(name) ? name : 'Guest';

export class Room {
  private players: Player[] = [];
  private match: MatchState | null = null;
  private actionDeadline: number | null = null;
  private botAt = 0;
  private startsAt: number | null = null;
  private readonly created = Date.now();
  /** Last time anything happened, for clearing out abandoned rooms. */
  touched = Date.now();

  constructor(
    readonly code: string,
    readonly variant: Variant,
    private dice: Dice,
    readonly isPublic = false,
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
    this.players.push({ token, name: cleanName(name), seat: null, connected: true, bot: false });
    this.scheduleStart();
  }

  /** Open to Quick Play matchmaking: not started and not full. */
  get joinable(): boolean {
    return this.isPublic && !this.match && this.players.length < MAX_PLAYERS && !this.empty;
  }

  /** Quick Play rooms start by themselves: at once when full, after a short countdown otherwise. */
  private scheduleStart(now = Date.now()) {
    if (!this.isPublic || this.match) return;
    if (this.players.length < 2) this.startsAt = null;
    else if (this.players.length >= MAX_PLAYERS) this.startsAt = now;
    else this.startsAt ??= now + PUBLIC_START_DELAY_MS;
  }

  /**
   * Quick Play housekeeping while waiting. Fills empty seats with bots when nobody
   * else turns up, and starts the match when the countdown ends. Returns true if anything changed.
   */
  lobbyTick(now = Date.now()): boolean {
    if (!this.isPublic || this.match || this.empty) return false;
    if (this.players.length < 2 && now >= Math.max(this.created, this.touched) + BOT_FILL_MS) {
      while (this.players.length < MAX_PLAYERS)
        this.players.push({ token: `bot:${this.players.length}`, name: BOT_NAMES[this.players.length - 1]!, seat: null, connected: true, bot: true });
      this.startsAt = now;
    }
    if (this.startsAt === null || now < this.startsAt) return false;
    this.begin();
    return true;
  }

  /** After a finished match, return everyone still here to the waiting room for another game. */
  rematch(token: string) {
    this.find(token);
    if (!this.match || this.match.turn.phase !== 'over') throw new RoomError('The match is not over yet');
    this.touched = Date.now();
    this.match = null;
    this.actionDeadline = null;
    this.startsAt = null;
    this.players = this.players.filter((p) => p.connected && !p.bot);
    this.players.forEach((p) => (p.seat = null));
    this.scheduleStart();
  }

  disconnect(token: string) {
    const player = this.players.find((p) => p.token === token);
    if (!player) return;
    // Before the match starts a dropped player simply leaves; afterwards the seat is held for them.
    if (this.match) player.connected = false;
    else {
      this.players = this.players.filter((p) => p !== player);
      this.scheduleStart();
    }
  }

  start(token: string) {
    this.touched = Date.now();
    if (this.players[0] !== this.find(token)) throw new RoomError('Only the host can start the match');
    if (this.match) throw new RoomError('The match has already started');
    if (this.players.length < 2) throw new RoomError('At least two players are needed');
    this.begin();
  }

  private begin() {
    this.touched = Date.now();
    this.startsAt = null;
    const seats = defaultSeats(this.players.length);
    this.players.forEach((p, i) => (p.seat = seats[i]!));
    this.match = createMatch({ seats, config: VARIANTS[this.variant] });
    this.actionDeadline = Date.now() + ACTION_TIMEOUT_MS;
    this.botAt = Date.now() + BOT_DELAY_MS;
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
    this.botAt = Date.now() + BOT_DELAY_MS;
    return result.events;
  }

  /** One authoritative action per deadline. Empty rooms remain idle for expiry. */
  tick(now = Date.now()): GameEvent[] {
    if (this.empty || !this.match || this.actionDeadline === null) return [];
    const seat = this.match.turn.seat;
    // Bots act after a short pause; people get the full time limit before the server plays for them.
    const bot = this.players.some((p) => p.bot && p.seat === seat);
    if (now < (bot ? this.botAt : this.actionDeadline)) return [];
    return this.apply(applyAction(this.match, this.match.turn.phase === 'roll'
      ? { type: 'roll', seat, value: this.dice.roll() }
      : { type: 'move', seat, pawn: chooseMove(this.match, 'medium', () => 0.5) }));
  }

  get empty(): boolean {
    return this.players.every((p) => p.bot || !p.connected);
  }

  view(): RoomView {
    return {
      code: this.code,
      variant: this.variant,
      host: 0,
      players: this.players.map(({ name, seat, connected, bot }) => ({ name, seat, connected, bot })),
      match: this.match,
      actionDeadline: this.actionDeadline,
      public: this.isPublic,
      startsAt: this.startsAt,
    };
  }
}
