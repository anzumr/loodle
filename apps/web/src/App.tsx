import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AI_LEVELS,
  CLASSIC_RULES,
  finishStepOf,
  QUICK_CLASH_RULES,
  QUICK_RACE_RULES,
  SEAT_NAMES,
  applyAction,
  chooseMove,
  createMatch,
  deserializeMatch,
  legalMoves,
  serializeMatch,
  type AiLevel,
  type GameEvent,
  type MatchState,
  type Seat,
} from '@loodl/rules';
import { BoardScene, type CameraMode, type Quality } from './scene/BoardScene';
import { Logo } from './ui/Logo';
import { Die } from './ui/Die';
import { Tutorial } from './ui/Tutorial';
import { AccountPanel, type Account } from './ui/AccountPanel';
import { play, setSoundEnabled, type Sfx } from './sound';
import { COSMETICS, buyCosmetic, equipCosmetic, sanitizeWardrobe, type Wardrobe } from '@loodl/rules';
import { chooseLegalMove, diceLeft } from '@loodl/rules';
import { WAGER_STAKES, canWager, wagerMultiplier } from '@loodl/rules';
import { ACHIEVEMENTS, AVATAR_COUNT, applyMatch, challengesFor, cleanAvatar, levelFor, sanitizeProgress, validateUsername, type Progress, type Reward } from '@loodl/rules';
import { AVATAR_NAMES, Avatar } from './ui/Avatar';
import { connect, playerToken, rememberedRoom, rememberRoom, type Connection, type ConnectionStatus, type RoomView, type ServerMessage } from './net';
import { Back, Chest, Chevron, Crown, Gear, LinkIcon, Pawn, People } from './ui/icons';

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

const SAVE_KEY = 'loodl.match';

const VARIANTS = {
  classic: { label: 'Classic', rules: CLASSIC_RULES, blurb: 'Full game: bring all four pawns home' },
  race: { label: 'Race', rules: QUICK_RACE_RULES, blurb: 'Quick: one pawn starts out, first to bring two home wins' },
  clash: { label: 'Clash', rules: QUICK_CLASH_RULES, blurb: 'Quick: 3 points per capture, 2 per pawn home, first to 10' },
} as const;
type Variant = keyof typeof VARIANTS;

const HOW_TO_PLAY = [
  'Roll the die on your turn. You need a six to bring a pawn out of your yard.',
  'Tap a glowing pawn to move it forward by the number you rolled.',
  'Land on an opponent to send that pawn back to its yard. You roll again.',
  'Pawns on a star or on any coloured start square are safe.',
  'Two of your pawns on one square are a safe pair: opponents can pass or share it but cannot capture them.',
  'A six gives you another roll, but a third six in a row ends your turn with no move.',
  'Travel once around the board, up your coloured lane, and land on the centre with the exact number.',
];
const SOUND_KEY = 'loodl.sound';

/** Named computer rivals, one per difficulty. */
const RIVALS: Record<AiLevel, string> = { beginner: 'Pip', easy: 'Dot', medium: 'Rook', hard: 'Vex', expert: 'Sable' };

/** Coins staked on the current solo match, and what a win multiplies them by (fixed at the start). */
interface Wager {
  stake: number;
  multiplier: number;
}

interface Saved {
  match: MatchState;
  humans: Seat[];
  level: AiLevel;
  wager?: Wager | null;
}

const validWager = (w: unknown): Wager | null => {
  const v = w as Partial<Wager> | null;
  return v && typeof v.stake === 'number' && v.stake > 0 && typeof v.multiplier === 'number' && v.multiplier > 1 && v.multiplier <= 10
    ? { stake: Math.floor(v.stake), multiplier: v.multiplier }
    : null;
};

function loadSaved(): Saved | null {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null') as { match: string; humans: Seat[]; level: AiLevel; wager?: unknown } | null;
    if (!raw || !Array.isArray(raw.humans) || !AI_LEVELS.includes(raw.level)) return null;
    const match = deserializeMatch(raw.match);
    return match.turn.phase === 'over' ? null : { match, humans: raw.humans, level: raw.level, wager: validWager(raw.wager) };
  } catch {
    return null;
  }
}

const SOUNDS: Partial<Record<GameEvent['type'], Sfx>> = {
  matchOver: 'win',
  captured: 'capture',
  thirdSixForfeit: 'bust',
  pawnFinished: 'home',
  moved: 'move',
};

const seatName = (seat: Seat) => SEAT_NAMES[seat][0]!.toUpperCase() + SEAT_NAMES[seat].slice(1);

/** Unbiased local die for offline play. Online dice will come from the server. */
function rollDie(): number {
  const buf = new Uint8Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0]! >= 252);
  return (buf[0]! % 6) + 1;
}

/** One short line describing what just happened. */
function describe(events: GameEvent[]): string {
  const find = <T extends GameEvent['type']>(type: T) => events.find((e) => e.type === type) as Extract<GameEvent, { type: T }> | undefined;
  const rolled = find('rolled');
  const over = find('matchOver');
  if (over) return `${seatName(over.order[0]!)} wins!`;
  if (find('thirdSixForfeit')) return rolled?.value2 !== undefined ? 'Third double in a row — turn ends' : 'Third six in a row — turn ends';
  const done = find('seatFinished');
  if (done) return `${seatName(done.seat)} is home — place ${done.place}`;
  const cap = find('captured');
  if (cap) return `${seatName(cap.by)} captured ${seatName(cap.seat)} — roll again`;
  if (find('pawnFinished')) return find('bonusRoll') ? 'Pawn home! Roll again' : 'Pawn home!';
  const none = find('noLegalMove');
  if (none) return none.value === 6 ? 'No move for that six — roll again' : `Rolled ${none.value} — no move`;
  const bonus = find('bonusRoll');
  if (rolled?.value2 !== undefined) {
    const both = `${rolled.value} and ${rolled.value2}`;
    return bonus?.reason === 'double' ? `Double ${both}! Use both, then roll again — tap a pawn` : `Rolled ${both} — tap a pawn`;
  }
  if (bonus) return 'Six! Roll again';
  if (rolled) return `Rolled ${rolled.value} — tap a pawn`;
  return '';
}

/**
 * Room code from an invite link (loodle.online/?join=CODE), read once when the page
 * loads. The code is then removed from the address bar so a reload doesn't rejoin.
 */
const INVITE_CODE: string | null = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('join')) return null;
    const code = (params.get('join') ?? '').trim().toUpperCase();
    params.delete('join');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    return /^[A-Z0-9]{5}$/.test(code) ? code : null;
  } catch {
    return null;
  }
})();

/** A computer or timed-out move, including which die to use in two-dice games. */
const pickMove = (match: MatchState, level: AiLevel) => {
  const m = chooseLegalMove(match, level, Math.random);
  return { pawn: m.pawn, die: match.config.dice === 2 ? m.die : undefined };
};

export function App() {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<BoardScene | null>(null);
  const [screen, setScreen] = useState<Screen>('lobby');
  const [tutorial, setTutorial] = useState(false);
  const [view, setView] = useState<View>('angled');
  const [sheet, setSheet] = useState<'play' | 'settings' | 'help' | 'friends' | 'account' | 'collection' | 'leave' | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [variant, setVariant] = useState<Variant>('classic');
  const [quality, setQuality] = useState<Quality>(loadQuality);
  const saved = useMemo(loadSaved, []);
  const [players, setPlayers] = useState(4);
  const [pawnCount, setPawnCount] = useState<2 | 3 | 4>(4);
  const [diceCount, setDiceCount] = useState<1 | 2>(() => {
    try {
      return localStorage.getItem('loodl.dice') === '2' ? 2 : 1;
    } catch {
      return 1;
    }
  });
  const chooseDice = (n: 1 | 2) => {
    setDiceCount(n);
    try {
      localStorage.setItem('loodl.dice', String(n));
    } catch {
      /* ignore */
    }
  };
  const [solo, setSolo] = useState(true);
  const [level, setLevel] = useState<AiLevel>(saved?.level ?? 'medium');
  const [humans, setHumans] = useState<Seat[]>(saved?.humans ?? [0]);
  /** Stake picked in the mode menu for the next solo match. */
  const [stake, setStake] = useState(0);
  /** Wager on the solo match in play, already paid out of coins. */
  const [wager, setWager] = useState<Wager | null>(saved?.wager ?? null);
  const [wagerResult, setWagerResult] = useState<{ stake: number; payout: number } | null>(null);
  const [sound, setSound] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const [match, setMatch] = useState<MatchState | null>(saved?.match ?? null);
  /** The match currently in play, for timers that finish after it may have changed. */
  const matchRef = useRef(match);
  matchRef.current = match;
  const [message, setMessage] = useState('');
  const [face, setFace] = useState(6);
  const [face2, setFace2] = useState(6);
  /** Two dice: the die the player has chosen to use next. */
  const [pickedDie, setPickedDie] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [online, setOnline] = useState<{ room: RoomView; you: number } | null>(null);
  const [netStatus, setNetStatus] = useState<ConnectionStatus | 'offline'>('offline');
  const [networkSession, setNetworkSession] = useState(false);
  const offlineMatch = useRef<Saved | null>(null);
  const [now, setNow] = useState(Date.now);
  const [netError, setNetError] = useState('');
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('loodl.name') ?? '';
    } catch {
      return '';
    }
  });
  const [avatar, setAvatar] = useState(() => {
    try {
      return cleanAvatar(Number(localStorage.getItem('loodl.avatar') ?? 0));
    } catch {
      return 0;
    }
  });
  const nameCheck = validateUsername(name);
  const chooseAvatar = (id: number) => {
    setAvatar(id);
    try {
      localStorage.setItem('loodl.avatar', String(id));
    } catch {
      /* ignore */
    }
  };
  const rename = (value: string) => {
    const next = value.replace(/[^A-Za-z0-9_]/g, '');
    setName(next);
    try {
      localStorage.setItem('loodl.name', next);
    } catch {
      /* ignore */
    }
  };
  const [code, setCode] = useState('');
  /** Feedback after sharing an invite ("Link copied!"), cleared after a moment. */
  const [inviteNote, setInviteNote] = useState('');
  const shareInvite = async (roomCode: string) => {
    const url = `${window.location.origin}/?join=${roomCode}`;
    const say = (note: string) => {
      setInviteNote(note);
      window.setTimeout(() => setInviteNote(''), 2500);
    };
    // Phones get the system share sheet; elsewhere the link goes on the clipboard.
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title: 'Play LOODL with me', text: `Join my LOODL room ${roomCode}`, url });
        return;
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say('Link copied!');
    } catch {
      // Clipboard blocked: show the link so it can be copied by hand.
      setInviteLink(url);
    }
  };
  const [inviteLink, setInviteLink] = useState('');
  const [progress, setProgress] = useState<Progress>(() => {
    try {
      return sanitizeProgress(JSON.parse(localStorage.getItem('loodl.progress') ?? 'null'));
    } catch {
      return sanitizeProgress(null);
    }
  });
  const [reward, setReward] = useState<Reward | null>(null);
  const [wardrobe, setWardrobe] = useState<Wardrobe>(() => {
    try {
      return sanitizeWardrobe(JSON.parse(localStorage.getItem('loodl.wardrobe') ?? 'null'));
    } catch {
      return sanitizeWardrobe(null);
    }
  });
  const store = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: lasts for this visit only */
    }
  };
  const equip = (id: string) => {
    const next = equipCosmetic(wardrobe, id);
    setWardrobe(next);
    store('loodl.wardrobe', next);
  };
  const buy = (id: string) => {
    const result = buyCosmetic(wardrobe, id, progress.coins, levelFor(progress.xp).level);
    if (!result.ok) return;
    const paid = { ...progress, coins: result.coins };
    const next = equipCosmetic(result.wardrobe, id);
    setProgress(paid);
    setWardrobe(next);
    store('loodl.progress', paid);
    store('loodl.wardrobe', next);
  };
  /** What this player has done in the current match, for rewards. */
  const tally = useRef({ captures: 0, sixes: 0 });
  const mySeat = useRef<Seat | null>(null);
  const rewardedMatch = useRef<MatchState | null>(null);
  const countEvents = (events: GameEvent[]) => {
    for (const e of events) {
      if (e.type === 'rolled' && e.seat === mySeat.current) tally.current.sixes += (e.value === 6 ? 1 : 0) + (e.value2 === 6 ? 1 : 0);
      if (e.type === 'captured' && e.by === mySeat.current) tally.current.captures++;
    }
  };
  const rank = levelFor(progress.xp);
  const today = new Date().toISOString().slice(0, 10);
  const conn = useRef<Connection | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/auth/session').then(async (response) => {
      if (response.ok) {
        const result = await response.json() as { user: Account | null };
        if (active) setAccount(result.user);
      }
    }).catch(() => { /* Offline guest play does not require the server. */ });
    return () => { active = false; };
  }, []);

  const restoreOffline = () => {
    setOnline(null);
    setNetworkSession(false);
    setNetStatus('offline');
    setMatch(offlineMatch.current?.match ?? null);
    if (offlineMatch.current) {
      setHumans(offlineMatch.current.humans);
      setLevel(offlineMatch.current.level);
      setWager(offlineMatch.current.wager ?? null);
    }
    setScreen('lobby');
  };

  const leaveRoom = () => {
    conn.current?.send({ t: 'leave' });
    conn.current?.close();
    conn.current = null;
    rememberRoom(null);
    restoreOffline();
  };

  /** Create a room, or join one by code. The server owns the match from here on. */
  const enterRoom = (first: { t: 'create' | 'quick'; variant: string; dice: 1 | 2 } | { t: 'join'; code: string }) => {
    setNetError('');
    if (!networkSession) offlineMatch.current = match ? { match, humans, level, wager } : null;
    setWager(null);
    setNetworkSession(true);
    try {
      localStorage.setItem('loodl.name', name);
    } catch {
      /* ignore */
    }
    conn.current?.close();
    conn.current = connect(
      { ...first, token: playerToken(), name, avatar },
      (m: ServerMessage) => {
        if (m.t === 'error') return setNetError(m.message);
        setOnline({ room: m.room, you: m.you });
        setNow(Date.now());
        setCode(m.room.code);
        setNetError('');
        const mine = m.room.players[m.you]?.seat;
        if (!m.room.match || mine === null || mine === undefined) {
          // Waiting room: before the first match, or back here after a rematch.
          setMatch(null);
          setScreen('lobby');
          setSheet('friends');
          return;
        }
        setHumans([mine]);
        setMatch(m.room.match);
        setSheet(null);
        setScreen('board');
        const rolled = m.events.find((e) => e.type === 'rolled');
        if (rolled && rolled.type === 'rolled') {
          setFace(rolled.value);
          if (rolled.value2 !== undefined) setFace2(rolled.value2);
        }
        else if (m.room.match.turn.die !== null) setFace(m.room.match.turn.die);
        countEvents(m.events);
        if (m.room.match.version === 0) tally.current = { captures: 0, sixes: 0 };
        if (m.events.length) setMessage(describe(m.events));
        const sfx = (Object.keys(SOUNDS) as GameEvent['type'][]).find((type) => m.events.some((e) => e.type === type));
        if (sfx) play(SOUNDS[sfx]!);
        else if (rolled) play('roll');
      },
      (status) => {
        setNetStatus(status);
        if (status === 'failed') {
          conn.current = null;
          restoreOffline();
          setSheet('friends');
        }
      },
    );
  };

  useEffect(() => {
    // An invite link (?join=CODE) wins over a room remembered from last time.
    const previousRoom = INVITE_CODE ?? rememberedRoom();
    if (previousRoom) {
      setCode(previousRoom);
      setSheet('friends');
      enterRoom({ t: 'join', code: previousRoom });
    }
    return () => { conn.current?.close(); conn.current = null; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const moves = useMemo(() => (match?.turn.phase === 'move' ? legalMoves(match) : []), [match]);
  // If every legal move starts from the same spot there is nothing to choose.
  const human = !!match && humans.includes(match.turn.seat) && (!networkSession || netStatus === 'connected');
  const left = match ? diceLeft(match) : [];
  const twoDice = match?.config.dice === 2;
  const activeDie = twoDice ? (pickedDie !== null && left.includes(pickedDie) ? pickedDie : (left.find((d) => moves.some((m) => m.die === d)) ?? null)) : null;
  const shownMoves = activeDie === null ? moves : moves.filter((m) => m.die === activeDie);
  const forced = human && moves.length > 0 && moves.every((m) => m.from === moves[0]!.from && m.die === moves[0]!.die);

  const act = useCallback((state: MatchState, action: Parameters<typeof applyAction>[1]) => {
    const result = applyAction(state, action);
    setMatch(result.state);
    countEvents(result.events);
    setMessage(describe(result.events));
    const sfx = (Object.keys(SOUNDS) as GameEvent['type'][]).find((type) => result.events.some((e) => e.type === type));
    if (sfx) play(SOUNDS[sfx]!);
  }, []);

  const move = useCallback(
    (pawn: number) => {
      if (!human) return;
      if (match?.turn.phase !== 'move' || !moves.some((m) => m.pawn === pawn)) return;
      // Use the chosen die if this pawn can; otherwise whichever die it can use.
      const choice = moves.find((m) => m.pawn === pawn && m.die === activeDie) ?? moves.find((m) => m.pawn === pawn)!;
      const die = match.config.dice === 2 ? choice.die : undefined;
      setPickedDie(null);
      if (online) conn.current?.send({ t: 'move', pawn, die });
      else act(match, { type: 'move', seat: match.turn.seat, pawn, die });
    },
    [match, moves, act, online, human, activeDie],
  );

  const roll = () => {
    if (!match || match.turn.phase !== 'roll' || rolling) return;
    if (networkSession && netStatus !== 'connected') return;
    if (online) return void conn.current?.send({ t: 'roll' }); // the server rolls
    setRolling(true);
    setMessage('');
    play('roll');
    const value = rollDie();
    const value2 = match.config.dice === 2 ? rollDie() : undefined;
    window.setTimeout(() => {
      // The match may have been quit or replaced during the roll animation.
      if (matchRef.current !== match) return setRolling(false);
      setFace(value);
      if (value2 !== undefined) setFace2(value2);
      setPickedDie(null);
      setRolling(false);
      act(match, { type: 'roll', seat: match.turn.seat, value, value2 });
    }, 520);
  };

  useEffect(() => {
    if (tutorial) return;
    const s = new BoardScene(host.current!);
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, [tutorial]);

  useEffect(() => {
    if (scene.current) scene.current.onPawnTap = move;
  }, [move, tutorial]);

  useEffect(() => {
    scene.current?.setMode(screen === 'lobby' ? 'lobby' : view);
  }, [screen, view, tutorial]);

  useEffect(() => {
    const showing = screen === 'board' && match;
    scene.current?.setView(
      showing
        ? { pawns: match.pawns, seat: match.turn.seat, movable: forced || !human ? [] : shownMoves.map((m) => m.pawn), boardSeats: match.config.boardSeats }
        : null,
    );
  }, [screen, match, moves, forced, human, tutorial]);

  useEffect(() => {
    if (!forced || screen !== 'board') return;
    const id = window.setTimeout(() => move(moves[0]!.pawn), 650);
    return () => window.clearTimeout(id);
  }, [forced, moves, move, screen]);

  // People get 6 seconds to roll and 12 to choose a pawn, then the game plays for them.
  // Online, the server keeps the same clock and acts itself.
  const [localDeadline, setLocalDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (networkSession || !match || screen !== 'board' || match.turn.phase === 'over' || !human || rolling || forced) {
      setLocalDeadline(null);
      return;
    }
    const wait = match.turn.phase === 'roll' ? 6_000 : 12_000;
    setLocalDeadline(Date.now() + wait);
    const seat = match.turn.seat;
    const id = window.setTimeout(
      () => (match.turn.phase === 'roll' ? roll() : act(match, { type: 'move', seat, ...pickMove(match, 'medium') })),
      wait,
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, screen, human, rolling, forced, networkSession]);
  const deadline = online?.room.actionDeadline ?? localDeadline;

  // Auto roll: when it's your turn to roll, the dice roll for you after a short pause.
  // Choosing a pawn stays with you. Paused while a menu is open.
  const [autoRoll, setAutoRoll] = useState(() => {
    try {
      return localStorage.getItem('loodl.autoroll') === '1';
    } catch {
      return false;
    }
  });
  const toggleAutoRoll = () => {
    setAutoRoll((on) => {
      try {
        localStorage.setItem('loodl.autoroll', on ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !on;
    });
  };
  useEffect(() => {
    if (!autoRoll || !match || screen !== 'board' || sheet !== null || !human || rolling || match.turn.phase !== 'roll') return;
    const id = window.setTimeout(roll, 700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRoll, match, screen, sheet, human, rolling]);

  // Skip to end: once every human is home in a match against the computer, the
  // remaining computer turns can be fast-forwarded (quick, silent, no roll animation).
  const [skipping, setSkipping] = useState(false);
  const humansDone =
    !networkSession && !!match && match.turn.phase !== 'over' && humans.length < match.seats.length && humans.every((s) => match.finishOrder.includes(s));
  useEffect(() => {
    if (!humansDone) setSkipping(false);
  }, [humansDone]);

  // Computer players: roll, then choose a move. They only pick among legal moves.
  useEffect(() => {
    if (networkSession || !match || screen !== 'board' || match.turn.phase === 'over' || human || rolling) return;
    const seat = match.turn.seat;
    if (skipping) {
      // Each frame plays one computer's whole turn.
      const id = window.setTimeout(() => {
        let state = match;
        let events: GameEvent[] = [];
        for (let guard = 0; guard < 60 && state.turn.seat === seat && state.turn.phase !== 'over'; guard++) {
          if (state.turn.phase === 'roll') {
            const value = rollDie();
            const value2 = state.config.dice === 2 ? rollDie() : undefined;
            setFace(value);
            if (value2 !== undefined) setFace2(value2);
            ({ state, events } = applyAction(state, { type: 'roll', seat, value, value2 }));
          } else ({ state, events } = applyAction(state, { type: 'move', seat, ...pickMove(state, level) }));
        }
        setMatch(state);
        setMessage(describe(events));
      }, 25);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(
      () => (match.turn.phase === 'roll' ? roll() : act(match, { type: 'move', seat, ...pickMove(match, level) })),
      match.turn.phase === 'roll' ? 1000 : 700,
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match, screen, human, rolling, level, networkSession, skipping]);

  // Keep the match across reloads.
  useEffect(() => {
    if (networkSession) return; // online matches live on the server; preserve the offline save
    try {
      if (match && match.turn.phase !== 'over') localStorage.setItem(SAVE_KEY, JSON.stringify({ match: serializeMatch(match), humans, level, wager }));
      else localStorage.removeItem(SAVE_KEY);
    } catch {
      /* storage unavailable: the match just won't survive a reload */
    }
  }, [match, humans, level, networkSession, wager]);

  useEffect(() => {
    setSoundEnabled(sound);
    try {
      localStorage.setItem(SOUND_KEY, sound ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }, [sound]);

  useEffect(() => {
    scene.current?.setSkin(wardrobe.equipped.board, wardrobe.equipped.pawn);
  }, [wardrobe]);

  useEffect(() => {
    scene.current?.setQuality(quality);
    try {
      localStorage.setItem(QUALITY_KEY, quality);
    } catch {
      /* storage unavailable: setting just won't persist */
    }
  }, [quality, tutorial]);

  const startMatch = () => {
    const fresh = createMatch({ players, config: { ...VARIANTS[variant].rules, pawnsPerPlayer: pawnCount, dice: diceCount } });
    tally.current = { captures: 0, sixes: 0 };
    setReward(null);
    setWagerResult(null);
    // The stake leaves your coins now; a win pays it back multiplied. Any wager on a
    // match being replaced is lost, the same as quitting it.
    if (solo && stake > 0 && canWager(stake, progress.coins)) {
      const paid = { ...progress, coins: progress.coins - stake };
      setProgress(paid);
      store('loodl.progress', paid);
      setWager({ stake, multiplier: wagerMultiplier(level, players) });
    } else setWager(null);
    setHumans(solo ? [fresh.seats[0]!] : fresh.seats);
    setMatch(fresh);
    setMessage('');
    setSheet(null);
    setScreen('board');
  };

  // Rewards: online matches and solo matches against the computer. Pass & Play earns nothing,
  // because one person controls every seat.
  useEffect(() => {
    mySeat.current = humans.length === 1 ? humans[0]! : null;
  }, [humans]);
  useEffect(() => {
    if (!match || match.turn.phase !== 'over' || rewardedMatch.current === match) return;
    rewardedMatch.current = match;
    const seat = humans.length === 1 ? humans[0]! : null;
    const place = seat === null ? 0 : match.finishOrder.indexOf(seat) + 1;
    if (seat === null || place === 0 || match.seats.length < 2) return setReward(null);
    const payout = !online && wager ? (place === 1 ? Math.floor(wager.stake * wager.multiplier) : 0) : 0;
    setWagerResult(!online && wager ? { stake: wager.stake, payout } : null);
    if (!online) setWager(null);
    const variantOf = match.config.targetScore !== null ? 'clash' : match.config.endOnFirstFinish ? 'race' : 'classic';
    const result = applyMatch(
      progress,
      {
        id: online ? `online:${online.room.code}:${match.version}` : `solo:${Date.now()}`,
        kind: online ? 'online' : 'solo',
        variant: variantOf,
        players: match.seats.length,
        place,
        captures: tally.current.captures,
        pawnsHome: match.pawns[seat]!.filter((p) => p === finishStepOf(match)).length,
        sixes: tally.current.sixes,
        aiLevel: online ? undefined : level,
      },
      today,
    );
    setReward(result.reward);
    if (result.reward || payout) {
      const next = result.reward ? result.progress : progress;
      const paid = payout ? { ...next, coins: next.coins + payout } : next;
      setProgress(paid);
      store('loodl.progress', paid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  // Show the dice the match is actually waiting on, including after a reload or rejoin.
  useEffect(() => {
    const t = match?.turn;
    if (!t || t.phase !== 'move' || t.die === null) return;
    if (typeof t.die2 === 'number') {
      setFace(t.die);
      setFace2(t.die2);
    } else if (match.config.dice === 2) {
      // One die left: keep showing both faces unless neither matches (e.g. after a reload).
      if (face !== t.die && face2 !== t.die) setFace(t.die);
    } else setFace(t.die);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  const turn = match?.turn;
  const over = turn?.phase === 'over';
  const clash = !!match && match.config.targetScore !== null;
  const vsAi = !!match && humans.length < match.seats.length;
  const rival = (seat: Seat) => (online ? (online.room.players.find((pl) => pl.seat === seat)?.name ?? seatName(seat)) : RIVALS[level]);
  // The line under the board. On a computer's turn the colour label above already says who is playing.
  // Only used on the board, but computed every render, so it must cope with no match
  // (for example in an online waiting room).
  const readout = !match
    ? ''
    : networkSession && netStatus !== 'connected'
      ? 'Connection lost — reconnecting…'
      : (forced || !human ? message.replace(' — tap a pawn', '') : message) ||
        (!human
          ? online
            ? online.room.players.find((pl) => pl.seat === match.turn.seat)?.connected === false
              ? `${rival(match.turn.seat)} left — a bot is playing for them`
              : `Waiting for ${rival(match.turn.seat)}…`
            : ''
          : match.turn.phase === 'roll'
            ? 'Roll the die'
            : 'Tap a pawn');
  const who = (seat: Seat) => (!vsAi ? seatName(seat) : humans.includes(seat) ? 'You' : rival(seat));

  return (
    <>
    <div className={`app screen-${screen}`} inert={tutorial || undefined} aria-hidden={tutorial || undefined}>
      <div className="backdrop" aria-hidden="true" />
      <div className="stage" ref={host} />

      {screen === 'lobby' && (
        <div className="ui lobby">
          <header className="topbar">
            <button className="profile profile-button" disabled={networkSession} onClick={() => setSheet('account')} aria-label="Profile and sign-in">
              <Avatar id={avatar} />
              <span className="profile-text">
                <strong>{nameCheck.ok ? nameCheck.name : (account?.name ?? 'Guest')}</strong>
                <small>
                  Lv {rank.level} · {progress.coins} coins
                </small>
                <span className="xp-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round((rank.into / rank.needed) * 100)}%` }} />
                </span>
              </span>
            </button>
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
              <Tile icon={<Pawn />} title="Solo" sub="Play Offline" tone="gold" onClick={() => (setSolo(true), setSheet('play'))} />
              <Tile icon={<People />} title="Friends" sub="Play Together" tone="blue" onClick={() => setSheet('friends')} />
              <Tile icon={<Chest />} title="Collection" sub="Boards & Pawns" tone="red" onClick={() => setSheet('collection')} />
            </nav>
          </div>
        </div>
      )}

      {screen === 'board' && match && turn && (
        <div className="ui board-ui">
          <header className="topbar">
            <button
              className="round-btn"
              aria-label={over ? 'Back to lobby' : 'Leave game'}
              onClick={() => (over ? (online ? leaveRoom() : setScreen('lobby')) : setSheet('leave'))}
            >
              <Back />
            </button>
            {over ? (
              <Logo size="sm" />
            ) : (
              <div className={`turn-pill seat-${SEAT_NAMES[turn.seat]}`} aria-live="polite">
                <i />
                {vsAi && human ? 'Your turn' : `${seatName(turn.seat)}’s turn`}
              </div>
            )}
            <div className="segmented" role="group" aria-label="Camera view">
              <button className={view === 'top' ? 'on' : ''} aria-pressed={view === 'top'} onClick={() => setView('top')}>
                Top
              </button>
              <button className={view === 'angled' ? 'on' : ''} aria-pressed={view === 'angled'} onClick={() => setView('angled')}>
                3D
              </button>
            </div>
          </header>

          <div className="seats" aria-label="Players">
            {match.seats.map((seat) => {
              const home = match.pawns[seat]!.filter((p) => p === finishStepOf(match)).length;
              return (
                <span
                  key={seat}
                  className={`seat seat-${SEAT_NAMES[seat]} ${!over && turn.seat === seat ? 'active' : ''}`}
                  aria-label={`${seatName(seat)}: ${home} of ${match.pawns[seat]!.length} home${clash ? `, ${match.scores[seat]} points` : ''}`}
                >
                  {match.pawns[seat]!.map((_, i) => (
                    <i key={i} className={i < home ? 'home' : ''} />
                  ))}
                  {clash && <b>{match.scores[seat]}</b>}
                </span>
              );
            })}
          </div>

          {!over && (
            <footer className="board-foot">
              {deadline && human && (
                <small role="status" className="turn-timer">
                  {Math.max(0, Math.ceil((deadline - now) / 1000))}s to {turn.phase === 'roll' ? 'roll' : 'move'} · then it plays automatically
                </small>
              )}
              <div className="foot-row">
                <div className={`foot-turn seat-${SEAT_NAMES[turn.seat]}`}>
                  <i aria-hidden="true" />
                  {seatName(turn.seat)} is {turn.phase === 'roll' ? 'rolling' : 'moving'}
                  {human && (vsAi || online) ? ' (you)' : ''}
                </div>
                {wager && !online && (
                  <span className="wager-chip" title="Coins at stake on this match">
                    {wager.stake} at stake · win {Math.floor(wager.stake * wager.multiplier)}
                  </span>
                )}
                {!humansDone && (
                  <button className={`auto-toggle ${autoRoll ? 'on' : ''}`} role="switch" aria-checked={autoRoll} onClick={toggleAutoRoll}>
                    <span className="knob" aria-hidden="true" />
                    Auto roll
                  </button>
                )}
              </div>
              {readout && (
                <div className="readout" aria-live="polite">
                  {readout}
                </div>
              )}
              {humansDone && (
                <button className="mode on skip-btn" disabled={skipping} onClick={() => setSkipping(true)}>
                  <span>
                    <strong>{skipping ? 'Fast-forwarding…' : 'Skip to end'}</strong>
                    <small>{skipping ? 'Playing out the computer turns' : 'You are home. Fast-forward the computer players.'}</small>
                  </span>
                  {!skipping && <Chevron />}
                </button>
              )}
              <div className="roll-row">
                {twoDice ? (
                  <div className="dice-pair" role="group" aria-label="Dice — tap one to choose which to use">
                    {[face, face2].map((value, i) => {
                      // Match each die face to a die still waiting to be used; the rest are spent.
                      const waiting = [...left];
                      const spent = [face, face2].map((v) => {
                        const k = waiting.indexOf(v);
                        if (k < 0) return true;
                        waiting.splice(k, 1);
                        return false;
                      });
                      const used = turn.phase === 'move' && !rolling && spent[i]!;
                      const firstMatch = [face, face2].findIndex((v, j) => v === activeDie && !spent[j]);
                      const chosen = turn.phase === 'move' && !rolling && !used && firstMatch === i;
                      return (
                        <button
                          key={i}
                          className={`die-btn ${used ? 'used' : ''} ${chosen ? 'chosen' : ''}`}
                          disabled={!human || turn.phase !== 'move' || used || rolling}
                          aria-pressed={chosen}
                          onClick={() => setPickedDie(value)}
                        >
                          <Die value={value} rolling={rolling} skin={wardrobe.equipped.dice} />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <Die value={face} rolling={rolling} skin={wardrobe.equipped.dice} />
                )}
                <button className="play-btn roll-btn" onClick={roll} disabled={!human || turn.phase !== 'roll' || rolling}>
                  ROLL
                </button>
              </div>
            </footer>
          )}
        </div>
      )}

      {screen === 'board' && match && over && (
        <div className="scrim">
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Results">
            <div className="sheet-head">
              <h2>{vsAi && humans.includes(match.finishOrder[0]!) ? 'You win!' : `${seatName(match.finishOrder[0]!)} wins!`}</h2>
              <Crown style={{ width: 44 }} />
            </div>
            {reward ? (
              <div className="setting stacked reward" aria-live="polite">
                <strong>
                  +{reward.xp} XP · +{reward.coins} coins
                  {reward.levelAfter > reward.levelBefore ? ` · Level ${reward.levelAfter}!` : ''}
                </strong>
                {reward.achievements.map((a) => (
                  <small key={a.id}>Achievement unlocked: {a.title} (+{a.coins} coins)</small>
                ))}
                {reward.challenges.map((c) => (
                  <small key={c.id}>Daily challenge done: {c.title}</small>
                ))}
              </div>
            ) : (
              humans.length !== 1 && <p className="hint">Pass &amp; Play matches don’t earn XP or coins.</p>
            )}
            {wagerResult && (
              <div className={`setting wager-result ${wagerResult.payout ? 'won' : 'lost'}`} aria-live="polite">
                <strong>{wagerResult.payout ? `Wager won: +${wagerResult.payout} coins` : `Wager lost: −${wagerResult.stake} coins`}</strong>
                <small>Staked {wagerResult.stake}</small>
              </div>
            )}
            {match.finishOrder.map((seat, i) => (
              <div className="setting" key={seat}>
                <span className={`place seat-${SEAT_NAMES[seat]}`}>
                  <i />
                  <strong>{vsAi ? `${seatName(seat)} · ${who(seat)}` : seatName(seat)}</strong>
                </span>
                <strong>
                  {clash ? `${match.scores[seat]} pts · ` : ''}
                  {['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][i]}
                </strong>
              </div>
            ))}
            <button className="mode on" onClick={online ? () => conn.current?.send({ t: 'rematch' }) : startMatch}>
              <span>
                <strong>Play again</strong>
                {online && <small>{online.room.public ? 'Find a new match with the players still here' : 'Back to the room with the same players'}</small>}
              </span>
              <Chevron />
            </button>
            <button className="mode" onClick={() => (online ? leaveRoom() : (setMatch(null), setScreen('lobby')))}>
              <span>
                <strong>Back to lobby</strong>
              </span>
            </button>
          </div>
        </div>
      )}

      {sheet === 'leave' && (
        <Sheet title="Leave game?" onClose={() => setSheet(null)}>
          <button className="mode on" onClick={() => setSheet(null)}>
            <span>
              <strong>Keep playing</strong>
            </span>
            <Chevron />
          </button>
          {online ? (
            <button className="mode" onClick={() => (setSheet(null), leaveRoom())}>
              <span>
                <strong>Leave game</strong>
                <small>A bot plays your pawns for the rest of the match. You can't rejoin.</small>
              </span>
            </button>
          ) : (
            <>
              <button className="mode" onClick={() => (setSheet(null), setScreen('lobby'))}>
                <span>
                  <strong>Save and exit</strong>
                  <small>Resume this match later from Play</small>
                </span>
              </button>
              <button className="mode" onClick={() => (setSheet(null), setMatch(null), setWager(null), setScreen('lobby'))}>
                <span>
                  <strong>Quit match</strong>
                  <small>{wager ? `End this match and lose your ${wager.stake}-coin wager` : 'End this match without saving'}</small>
                </span>
              </button>
            </>
          )}
        </Sheet>
      )}

      {sheet === 'play' && (
        <Sheet title="Choose a mode" onClose={() => setSheet(null)}>
          {match && match.turn.phase !== 'over' && (
            <button className="mode on" onClick={() => (setSheet(null), setScreen('board'))}>
              <span>
                <strong>Resume match</strong>
                <small>{seatName(match.turn.seat)} to play</small>
              </span>
              <Chevron />
            </button>
          )}
          <div className="setting stacked">
            <span>
              <strong>{variant === 'classic' ? 'Classic Ludo' : `Quick ${VARIANTS[variant].label}`}</strong>
              <small>{VARIANTS[variant].blurb}</small>
            </span>
            <div className="segmented compact" role="group" aria-label="Game mode">
              {(Object.keys(VARIANTS) as Variant[]).map((v) => (
                <button key={v} className={variant === v ? 'on' : ''} aria-pressed={variant === v} onClick={() => setVariant(v)}>
                  {VARIANTS[v].label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span>
              <strong>Opponents</strong>
              <small>{solo ? 'You against the computer' : 'Share this device'}</small>
            </span>
            <div className="segmented" role="group" aria-label="Opponents">
              <button className={solo ? 'on' : ''} aria-pressed={solo} onClick={() => setSolo(true)}>
                Solo
              </button>
              <button className={!solo ? 'on' : ''} aria-pressed={!solo} onClick={() => setSolo(false)}>
                Pass &amp; Play
              </button>
            </div>
          </div>
          <div className="setting stacked">
            <span>
              <strong>Players</strong>
              <small>{players <= 4 ? 'Classic board' : `${players}-sided board, one arm each`}</small>
            </span>
            <div className="segmented compact wide" role="group" aria-label="Number of players">
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button key={n} className={players === n ? 'on' : ''} aria-pressed={players === n} onClick={() => setPlayers(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span>
              <strong>Pawns each</strong>
            </span>
            <div className="segmented" role="group" aria-label="Pawns per player">
              {([2, 3, 4] as const).map((n) => (
                <button key={n} className={pawnCount === n ? 'on' : ''} aria-pressed={pawnCount === n} onClick={() => setPawnCount(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span>
              <strong>Dice</strong>
              <small>{diceCount === 2 ? 'Use each die on any pawn · doubles roll again' : 'One die per roll'}</small>
            </span>
            <div className="segmented" role="group" aria-label="Dice per roll">
              {([1, 2] as const).map((n) => (
                <button key={n} className={diceCount === n ? 'on' : ''} aria-pressed={diceCount === n} onClick={() => chooseDice(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {solo && (
            <div className="setting stacked">
              <span>
                <strong>Rival: {RIVALS[level]}</strong>
              </span>
              <div className="segmented compact" role="group" aria-label="Difficulty">
                {AI_LEVELS.map((l) => (
                  <button key={l} className={level === l ? 'on' : ''} aria-pressed={level === l} onClick={() => setLevel(l)}>
                    {l[0]!.toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {solo && (
            <div className="setting stacked">
              <span>
                <strong>Wager</strong>
                <small>
                  {stake > 0
                    ? `Stake ${stake} coins · win to get ${Math.floor(stake * wagerMultiplier(level, players))} back (×${wagerMultiplier(level, players)}) · lose it otherwise`
                    : `No wager · you have ${progress.coins} coins`}
                </small>
              </span>
              <div className="segmented compact wide" role="group" aria-label="Wager in coins">
                {WAGER_STAKES.map((n) => (
                  <button
                    key={n}
                    className={stake === n ? 'on' : ''}
                    aria-pressed={stake === n}
                    disabled={!canWager(n, progress.coins)}
                    onClick={() => setStake(n)}
                  >
                    {n === 0 ? 'None' : n >= 1000 ? `${n / 1000}k` : n}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            className={`mode ${match && match.turn.phase !== 'over' ? '' : 'on'}`}
            disabled={solo && !canWager(stake, progress.coins)}
            onClick={startMatch}
          >
            <span>
              <strong>Start new match</strong>
              <small>
                {VARIANTS[variant].label} · {players} players{solo ? ` · ${level}` : ''}
                {solo && stake > 0 ? ` · ${stake}-coin wager` : ''}
                {match && match.turn.phase !== 'over' && wager ? ` · your current ${wager.stake}-coin wager is lost` : ''}
              </small>
            </span>
            <Chevron />
          </button>
          <button className="mode" onClick={() => setSheet('help')}>
            <span>
              <strong>How to play</strong>
              <small>The rules in one minute</small>
            </span>
            <Chevron />
          </button>
          <button className="mode" onClick={() => (setSheet(null), setTutorial(true))}>
            <span>
              <strong>Learn by playing</strong>
              <small>Eight guided lessons on the board</small>
            </span>
            <Chevron />
          </button>
          <button className="mode" onClick={() => setSheet('friends')}>
            <span>
              <strong>Friends</strong>
              <small>Private room with an invite code</small>
            </span>
            <Chevron />
          </button>
          <button className="mode" onClick={() => enterRoom({ t: 'quick', variant, dice: diceCount })}>
            <span>
              <strong>Quick Play</strong>
              <small>Online match with whoever is around · {variant === 'classic' ? 'Classic' : `Quick ${VARIANTS[variant].label}`}</small>
            </span>
            <Chevron />
          </button>
          {[
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

      {sheet === 'friends' && (
        <Sheet title="Play with friends" onClose={() => (networkSession ? leaveRoom() : null, setSheet(null))}>
          {netError && <p className="net-error">{netError}</p>}
          {networkSession && netStatus !== 'connected' && <p className="hint" role="status">{netStatus === 'connecting' ? 'Connecting…' : 'Connection lost — retrying automatically…'} Close this panel to cancel.</p>}
          {!online && !networkSession ? (
            <>
              <label className="setting">
                <span>
                  <strong>Your name</strong>
                  <small className={name && !nameCheck.ok ? 'bad' : ''}>{name && !nameCheck.ok ? `${nameCheck.reason} — you will appear as Guest` : '3–16 letters, numbers or _'}</small>
                </span>
                <input value={name} maxLength={16} placeholder="Guest" aria-invalid={!!name && !nameCheck.ok} onChange={(e) => rename(e.target.value)} />
              </label>
              <button className="mode on" onClick={() => enterRoom({ t: 'create', variant, dice: diceCount })}>
                <span>
                  <strong>Create a room</strong>
                  <small>{variant === 'classic' ? 'Classic Ludo' : `Quick ${VARIANTS[variant].label}`} · you get a code to share</small>
                </span>
                <Chevron />
              </button>
              <label className="setting">
                <span>
                  <strong>Have a code?</strong>
                </span>
                <input value={code} maxLength={5} placeholder="ABCDE" className="code" onChange={(e) => setCode(e.target.value.toUpperCase())} />
              </label>
              <button className="mode" disabled={code.length !== 5} onClick={() => enterRoom({ t: 'join', code })}>
                <span>
                  <strong>Join room</strong>
                </span>
                <Chevron />
              </button>
            </>
          ) : online ? (
            <>
              {online.room.public ? (
                <div className="setting stacked room-code">
                  <strong className="finding">
                    {online.room.startsAt ? `Starting in ${Math.max(0, Math.ceil((online.room.startsAt - now) / 1000))}s` : 'Finding players…'}
                  </strong>
                  <small>If nobody else joins within 15 seconds, computer players (marked Bot) fill the seats.</small>
                  <small>6 seconds to roll, 12 to move, then automatic play</small>
                </div>
              ) : (
                <>
                  <div className="setting stacked room-code">
                    <small>Share this code</small>
                    <strong>{online.room.code}</strong>
                    <small>6 seconds to roll, 12 to move, then automatic play</small>
                  </div>
                  {!online.room.match && (
                    <button className="mode on" onClick={() => void shareInvite(online.room.code)}>
                      <span>
                        <strong>{inviteNote || 'Copy invite link'}</strong>
                        <small>Anyone who opens the link joins this room</small>
                      </span>
                      <LinkIcon />
                    </button>
                  )}
                  {!online.room.match && inviteLink.endsWith(online.room.code) && (
                    <label className="setting stacked">
                      <small>Copy this link and send it to your friends</small>
                      <input className="invite-link" readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} autoFocus />
                    </label>
                  )}
                </>
              )}
              {online.room.players.map((pl, i) => (
                <div className="setting" key={i}>
                  <strong className="who">
                    <Avatar id={pl.avatar} size={34} />
                    {pl.name}
                    {i === online.you ? ' (you)' : ''}
                  </strong>
                  <small>{pl.bot ? 'Bot' : !pl.connected ? 'Disconnected' : online.room.public ? 'Ready' : i === online.room.host ? 'Host' : 'Joined'}</small>
                </div>
              ))}
              {online.room.public ? null : online.you === online.room.host ? (
                <button className="mode on" disabled={netStatus !== 'connected' || online.room.players.length < 2} onClick={() => conn.current?.send({ t: 'start' })}>
                  <span>
                    <strong>Start match</strong>
                    <small>{online.room.players.length < 2 ? 'Waiting for another player…' : `${online.room.players.length} players ready`}</small>
                  </span>
                  <Chevron />
                </button>
              ) : (
                <p className="hint">Waiting for the host to start…</p>
              )}
            </>
          ) : null}
        </Sheet>
      )}

      {sheet === 'collection' && (
        <Sheet title="Collection" onClose={() => setSheet(null)}>
          <p className="hint">
            {progress.coins} coins · Level {rank.level}. Skins change looks only and never affect dice, moves or results.
          </p>
          {(['board', 'pawn', 'dice'] as const).map((kind) => (
            <div className="setting stacked" key={kind}>
              <strong>{{ board: 'Board skins', pawn: 'Pawn finishes', dice: 'Dice' }[kind]}</strong>
              {COSMETICS.filter((c) => c.kind === kind).map((c) => {
                const owned = wardrobe.owned.includes(c.id);
                const equipped = wardrobe.equipped[kind] === c.id;
                const locked = !owned && rank.level < c.level;
                const short = !owned && !locked && progress.coins < c.price;
                return (
                  <div className="cosmetic" key={c.id}>
                    <span className={`swatch ${c.id}`} aria-hidden="true" />
                    <span>
                      <strong>{c.name}</strong>
                      <small>{c.detail}</small>
                    </span>
                    {equipped ? (
                      <em>Equipped</em>
                    ) : owned ? (
                      <button className="chip-btn" onClick={() => equip(c.id)}>
                        Equip
                      </button>
                    ) : (
                      <button className="chip-btn buy" disabled={locked || short} onClick={() => buy(c.id)}>
                        {locked ? `Level ${c.level}` : `${c.price} coins`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          <p className="hint">Coins are earned by playing. There is nothing to buy with real money.</p>
        </Sheet>
      )}

      {sheet === 'help' && (
        <Sheet title="How to play" onClose={() => setSheet('play')}>
          <button className="mode on" onClick={() => (setSheet(null), setTutorial(true))}>
            <span><strong>Try the interactive tutorial</strong><small>Practice each rule on the board</small></span>
            <Chevron />
          </button>
          <ol className="howto">
            {HOW_TO_PLAY.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </Sheet>
      )}

      {sheet === 'account' && <Sheet title="Your profile" onClose={() => setSheet(null)}>
          <label className="setting">
            <span>
              <strong>Name</strong>
              <small className={name && !nameCheck.ok ? 'bad' : ''}>{name && !nameCheck.ok ? nameCheck.reason : '3–16 letters, numbers or _'}</small>
            </span>
            <input value={name} maxLength={16} placeholder="Guest" aria-invalid={!!name && !nameCheck.ok} onChange={(e) => rename(e.target.value)} />
          </label>
          <div className="setting stacked">
            <span>
              <strong>Picture</strong>
            </span>
            <div className="avatar-grid" role="radiogroup" aria-label="Profile picture">
              {Array.from({ length: AVATAR_COUNT }, (_, id) => (
                <button key={id} role="radio" aria-checked={avatar === id} aria-label={`${AVATAR_NAMES[id]} pawn`} className={avatar === id ? 'on' : ''} onClick={() => chooseAvatar(id)}>
                  <Avatar id={id} size={46} />
                </button>
              ))}
            </div>
          </div>
          <p className="hint">Other players only ever see your name and picture. Names are not unique.</p>
          <div className="setting stacked">
            <span>
              <strong>
                Level {rank.level} · {progress.coins} coins
              </strong>
              <small>
                {rank.into} / {rank.needed} XP to level {rank.level + 1}
              </small>
            </span>
            <span className="xp-bar big" aria-hidden="true">
              <i style={{ width: `${Math.round((rank.into / rank.needed) * 100)}%` }} />
            </span>
            <small>
              {progress.stats.matches} matches · {progress.stats.wins} wins · {progress.stats.captures} captures · {progress.stats.pawnsHome} pawns home
            </small>
          </div>
          <div className="setting stacked">
            <strong>Today’s challenges</strong>
            {challengesFor(today).map((c) => {
              const done = progress.daily.date === today && progress.daily.done.includes(c.id);
              const value = progress.daily.date === today ? (progress.daily.progress[c.id] ?? 0) : 0;
              return (
                <small key={c.id} className={done ? 'done' : ''}>
                  {done ? '✓' : `${value}/${c.goal}`} {c.title} · +{c.xp} XP, +{c.coins} coins
                </small>
              );
            })}
          </div>
          <div className="setting stacked">
            <strong>
              Achievements {progress.achievements.length}/{ACHIEVEMENTS.length}
            </strong>
            {ACHIEVEMENTS.map((a) => (
              <small key={a.id} className={progress.achievements.includes(a.id) ? 'done' : ''}>
                {progress.achievements.includes(a.id) ? '✓' : '○'} {a.title} — {a.detail}
              </small>
            ))}
          </div>
          <p className="hint">Progress is saved on this device only. Solo matches earn half of what online matches do.</p>
          <AccountPanel onChange={setAccount} />
        </Sheet>}

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
          <div className="setting">
            <span>
              <strong>Sound</strong>
            </span>
            <div className="segmented">
              {[true, false].map((on) => (
                <button key={String(on)} className={sound === on ? 'on' : ''} aria-pressed={sound === on} onClick={() => setSound(on)}>
                  {on ? 'On' : 'Off'}
                </button>
              ))}
            </div>
          </div>
        </Sheet>
      )}
    </div>
    {tutorial && <Tutorial quality={quality} onClose={() => (setTutorial(false), setSheet('play'))} />}
    </>
  );
}

function Tile({ icon, title, sub, tone, onClick }: { icon: React.ReactNode; title: string; sub: string; tone: string; onClick?: () => void }) {
  return (
    <button className={`tile tone-${tone}`} disabled={!onClick} onClick={onClick} aria-label={onClick ? title : `${title} — coming soon`}>
      {!onClick && <em>Soon</em>}
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
