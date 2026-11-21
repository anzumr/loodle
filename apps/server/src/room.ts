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
  cleanAvatar,
  cleanUsername,
  chooseLegalMove,
  createMatch,
  defaultSeats,
  rollFor,
  type Dice,
  type GameEvent,
  type MatchState,
  type Seat,
} from '@loodl/rules';

export const VARIANTS = { classic: CLASSIC_RULES, race: QUICK_RACE_RULES, clash: QUICK_CLASH_RULES } as const;
export type Variant = keyof typeof VARIANTS;
/** Private rooms: up to eight players, on the larger boards from five. */
export const MAX_PLAYERS = 8;
/** Quick Play rooms fill to four, with bots if needed, so matches stay short. */
export const QUICK_PLAYERS = 4;
/** Time a player has to roll before the server rolls for them. */
export const ROLL_TIMEOUT_MS = 6_000;
/** Time a player has to choose a pawn before the server moves for them. */
export const MOVE_TIMEOUT_MS = 12_000;
/** Turn timer the host can pick for a private room. Relaxed doubles both limits. */
export type TimerSetting = 'normal' | 'relaxed';
const TIMER_FACTOR: Record<TimerSetting, number> = { normal: 1, relaxed: 2 };
/** Quick Play: countdown once two players are in, so others can still join. */
export const PUBLIC_START_DELAY_MS = 8_000;
/** Quick Play: how long to look for people before computer players fill the empty seats. */
export const BOT_FILL_MS = 15_000;
/** Pause before a computer player acts, so its turn can be followed. */
export const BOT_DELAY_MS = 1_200;
const BOT_NAMES = ['Pip', 'Dot', 'Rook', 'Vex', 'Sable', 'Moss', 'Juno'];

/** What the host of a private room can change before the start. */
export interface RoomSettings {
  variant: Variant;
  dice: 1 | 2;
  pawns: 2 | 3 | 4;
  /** 1v1 only: each player moves two colours (classic rules). */
  yards: 1 | 2;
  timer: TimerSetting;
}

export class RoomError extends Error {}

interface Player {
  /** Secret chosen by the client; proves who they are when they reconnect. Never sent to others. */
  token: string;
  name: string;
  /** Which built-in profile picture they chose. */
  avatar: number;
  /** First seat they play, or null before the start. */
  seat: Seat | null;
  /** Every seat they play: one, or two in 1v1 with two yards each. */
  seats: Seat[];
  connected: boolean;
  /** A computer player (Quick Play fill-in, or added by a host). Always shown as a bot, never as a person. */
  bot: boolean;
}

/** What every client is allowed to see. */
export interface RoomView {
  code: string;
  variant: Variant;
  /** Dice per roll in this room's matches. */
  dice: 1 | 2;
  /** Index into `players` of the host. */
  host: number;
  players: { name: string; avatar: number; seat: Seat | null; seats: Seat[]; connected: boolean; bot: boolean }[];
  /** The host's choices (private rooms), also filled in for Quick Play rooms. */
  settings: RoomSettings;
  /** Pawns each player gets in this room's matches. */
  pawns: 2 | 3 | 4;
  /** Most players this room takes. */
  capacity: number;
  match: MatchState | null;
  actionDeadline: number | null;
  /** True for Quick Play rooms: anyone can be matched in and the match starts by itself. */
  public: boolean;
  /** Quick Play: when the match will start, if a countdown is running. */
  startsAt: number | null;
}

/** The shared username rules: 3–16 letters, numbers or underscores, filtered; anything else becomes "Guest". */
export const cleanName = (name: unknown): string => cleanUsername(name);

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
    public variant: Variant,
    private dice: Dice,
    readonly isPublic = false,
    public diceCount: 1 | 2 = 1,
    public pawns: 2 | 3 | 4 = 4,
  ) {}

  /** 1v1 only: one yard each or two. */
  yards: 1 | 2 = 1;
  timer: TimerSetting = 'normal';

  private timeoutFor(match: MatchState) {
    return (match.turn.phase === 'roll' ? ROLL_TIMEOUT_MS : MOVE_TIMEOUT_MS) * TIMER_FACTOR[this.timer];
  }

  private hostOnly(token: string) {
    if (this.isPublic) throw new RoomError('Quick Play rooms cannot be changed');
    if (this.players[0] !== this.find(token)) throw new RoomError('Only the host can change the room');
    if (this.match) throw new RoomError('The match has already started');
    this.touched = Date.now();
  }

  /** Host: change the rules before the start. Anything left out stays as it is. */
  configure(token: string, input: unknown) {
    this.hostOnly(token);
    const raw = (input && typeof input === 'object' ? input : {}) as Partial<Record<keyof RoomSettings, unknown>>;
    if (raw.variant !== undefined) {
      if (typeof raw.variant !== 'string' || !Object.hasOwn(VARIANTS, raw.variant)) throw new RoomError('Unknown mode');
      this.variant = raw.variant as Variant;
    }
    if (raw.dice !== undefined) {
      if (raw.dice !== 1 && raw.dice !== 2) throw new RoomError('Dice must be 1 or 2');
      this.diceCount = raw.dice;
    }
    if (raw.pawns !== undefined) {
      if (raw.pawns !== 2 && raw.pawns !== 3 && raw.pawns !== 4) throw new RoomError('Pawns must be 2, 3 or 4');
      this.pawns = raw.pawns;
    }
    if (raw.yards !== undefined) {
      if (raw.yards !== 1 && raw.yards !== 2) throw new RoomError('Yards must be 1 or 2');
      this.yards = raw.yards;
    }
    if (raw.timer !== undefined) {
      if (raw.timer !== 'normal' && raw.timer !== 'relaxed') throw new RoomError('Unknown timer');
      this.timer = raw.timer;
    }
  }

  /** Host: add a computer player to a private room. */
  addBot(token: string) {
    this.hostOnly(token);
    if (this.players.length >= this.capacity) throw new RoomError('The room is full');
    const n = this.players.filter((p) => p.bot).length;
    this.players.push({ token: `bot:${Date.now()}:${n}`, name: BOT_NAMES[n % BOT_NAMES.length]!, avatar: (n + 4) % 8, seat: null, seats: [], connected: true, bot: true });
  }

  /** Host: remove the most recently added computer player. */
  removeBot(token: string) {
    this.hostOnly(token);
    const index = this.players.map((p) => p.bot).lastIndexOf(true);
    if (index < 0) throw new RoomError('There is no bot to remove');
    this.players.splice(index, 1);
  }

  /** Most players this room takes. */
  get capacity(): number {
    return this.isPublic ? QUICK_PLAYERS : MAX_PLAYERS;
  }

  private find(token: string): Player {
    const player = this.players.find((p) => p.token === token);
    if (!player) throw new RoomError('You are not in this room');
    return player;
  }

  indexOf(token: string): number {
    return this.players.findIndex((p) => p.token === token);
  }

  /** Join, or rejoin after a dropped connection (same token keeps the same seat). */
  join(token: string, name: unknown, avatar?: unknown) {
    this.touched = Date.now();
    const existing = this.players.find((p) => p.token === token);
    if (existing) {
      existing.connected = true;
      return;
    }
    if (this.match) throw new RoomError('That match has already started');
    if (this.players.length >= this.capacity) throw new RoomError('That room is full');
    this.players.push({ token, name: cleanName(name), avatar: cleanAvatar(avatar), seat: null, seats: [], connected: true, bot: false });
    this.scheduleStart();
  }

  /** Open to Quick Play matchmaking: not started and not full. */
  get joinable(): boolean {
    return this.isPublic && !this.match && this.players.length < this.capacity && !this.empty;
  }

  /** Quick Play rooms start by themselves: at once when full, after a short countdown otherwise. */
  private scheduleStart(now = Date.now()) {
    if (!this.isPublic || this.match) return;
    if (this.players.length < 2) this.startsAt = null;
    else if (this.players.length >= this.capacity) this.startsAt = now;
    else this.startsAt ??= now + PUBLIC_START_DELAY_MS;
  }

  /**
   * Quick Play housekeeping while waiting. Fills empty seats with bots when nobody
   * else turns up, and starts the match when the countdown ends. Returns true if anything changed.
   */
  lobbyTick(now = Date.now()): boolean {
    if (!this.isPublic || this.match || this.empty) return false;
    if (this.players.length < 2 && now >= Math.max(this.created, this.touched) + BOT_FILL_MS) {
      while (this.players.length < this.capacity)
        this.players.push({ token: `bot:${this.players.length}`, name: BOT_NAMES[this.players.length - 1]!, avatar: 3 + this.players.length, seat: null, seats: [], connected: true, bot: true });
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
    // Quick Play drops its fill-in bots; bots a host added to a private room stay.
    this.players = this.players.filter((p) => p.connected && (!p.bot || !this.isPublic));
    this.players.forEach((p) => ((p.seat = null), (p.seats = [])));
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
    if (this.yards === 2 && this.players.length === 2) {
      // 1v1 with two yards each: host plays red and yellow, the guest green and blue.
      this.players[0]!.seats = [0, 2];
      this.players[1]!.seats = [1, 3];
      this.players.forEach((p) => (p.seat = p.seats[0]!));
      const config = { ...CLASSIC_RULES, dice: this.diceCount, pawnsPerPlayer: this.pawns, sides: [0, 1, 0, 1] };
      this.match = createMatch({ seats: [0, 1, 2, 3], config });
    } else {
      const seats = defaultSeats(this.players.length);
      this.players.forEach((p, i) => ((p.seat = seats[i]!), (p.seats = [seats[i]!])));
      this.match = createMatch({ seats, config: { ...VARIANTS[this.variant], dice: this.diceCount, pawnsPerPlayer: this.pawns } });
    }
    this.actionDeadline = Date.now() + this.timeoutFor(this.match);
    this.botAt = Date.now() + BOT_DELAY_MS;
  }

  private turnOf(token: string): { match: MatchState; seat: Seat } {
    const player = this.find(token);
    if (!this.match) throw new RoomError('The match has not started');
    if (!player.seats.includes(this.match.turn.seat)) throw new RoomError('It is not your turn');
    return { match: this.match, seat: this.match.turn.seat };
  }

  /** The server rolls. The client never supplies a value. */
  roll(token: string): GameEvent[] {
    const { match, seat } = this.turnOf(token);
    return this.apply(applyAction(match, this.rollAction(match, seat)));
  }

  /** The server rolls every die itself. */
  private rollAction(match: MatchState, seat: Seat) {
    return { type: 'roll' as const, seat, ...rollFor(match, this.dice) };
  }

  move(token: string, pawn: unknown, die?: unknown): GameEvent[] {
    const { match, seat } = this.turnOf(token);
    if (typeof pawn !== 'number' || !Number.isInteger(pawn)) throw new RoomError('Invalid pawn');
    if (die !== undefined && (typeof die !== 'number' || !Number.isInteger(die))) throw new RoomError('Invalid die');
    return this.apply(applyAction(match, { type: 'move', seat, pawn, die: die as number | undefined }));
  }

  private apply(result: { state: MatchState; events: GameEvent[] }): GameEvent[] {
    this.touched = Date.now();
    this.match = result.state;
    this.actionDeadline = this.match.turn.phase === 'over' ? null : Date.now() + this.timeoutFor(this.match);
    this.botAt = Date.now() + BOT_DELAY_MS;
    return result.events;
  }

  /** One authoritative action per deadline. Empty rooms remain idle for expiry. */
  tick(now = Date.now()): GameEvent[] {
    if (this.empty || !this.match || this.actionDeadline === null) return [];
    const seat = this.match.turn.seat;
    // Bots, and players who have left (a bot takes their seat until they return), act after a
    // short pause. People at the table get the full time limit before the server plays for them.
    const bot = this.players.some((p) => p.seats.includes(seat) && (p.bot || !p.connected));
    if (now < (bot ? this.botAt : this.actionDeadline)) return [];
    return this.apply(applyAction(this.match, this.match.turn.phase === 'roll'
      ? this.rollAction(this.match, seat)
      : (() => {
          const m = chooseLegalMove(this.match!, 'medium', () => 0.5);
          return { type: 'move' as const, seat, pawn: m.pawn, die: m.die };
        })()));
  }

  get empty(): boolean {
    return this.players.every((p) => p.bot || !p.connected);
  }

  view(): RoomView {
    return {
      code: this.code,
      variant: this.variant,
      dice: this.diceCount,
      host: 0,
      players: this.players.map(({ name, avatar, seat, seats, connected, bot }) => ({ name, avatar, seat, seats, connected, bot })),
      settings: { variant: this.variant, dice: this.diceCount, pawns: this.pawns, yards: this.yards, timer: this.timer },
      pawns: this.pawns,
      capacity: this.capacity,
      match: this.match,
      actionDeadline: this.actionDeadline,
      public: this.isPublic,
      startsAt: this.startsAt,
    };
  }
}
