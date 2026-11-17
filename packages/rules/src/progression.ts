/**
 * Player progression: XP, levels, coins, achievements and daily challenges.
 *
 * Pure functions over a plain JSON record, so the same code can run in the
 * browser today and on the server once accounts have a database. Rewards never
 * touch dice, legal moves or anything else inside a match.
 */

export interface Stats {
  matches: number;
  wins: number;
  captures: number;
  pawnsHome: number;
  sixes: number;
  onlineMatches: number;
  onlineWins: number;
}

export interface Progress {
  xp: number;
  coins: number;
  stats: Stats;
  /** Ids of unlocked achievements, in the order they were earned. */
  achievements: string[];
  daily: {
    /** Calendar day (YYYY-MM-DD) these challenges belong to. */
    date: string;
    progress: Record<string, number>;
    /** Challenge ids already completed and paid out today. */
    done: string[];
  };
  /** Recent match ids that have been rewarded, so a match can never pay twice. */
  rewarded: string[];
}

/** What happened to one player in one finished match. */
export interface MatchSummary {
  /** Unique per match. */
  id: string;
  kind: 'solo' | 'online';
  variant: 'classic' | 'race' | 'clash';
  players: number;
  /** 1 for the winner. */
  place: number;
  captures: number;
  pawnsHome: number;
  sixes: number;
  /** Difficulty of the computer rivals in a solo match. */
  aiLevel?: 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';
}

export interface Reward {
  xp: number;
  coins: number;
  levelBefore: number;
  levelAfter: number;
  achievements: Achievement[];
  challenges: Challenge[];
}

export const newProgress = (): Progress => ({
  xp: 0,
  coins: 0,
  stats: { matches: 0, wins: 0, captures: 0, pawnsHome: 0, sixes: 0, onlineMatches: 0, onlineWins: 0 },
  achievements: [],
  daily: { date: '', progress: {}, done: [] },
  rewarded: [],
});

// ---------- levels ----------

/** Total XP needed to reach a level. Level 1 is where everyone starts. */
export const xpForLevel = (level: number): number => 60 * (level - 1) * level;

export function levelFor(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return { level, into: xp - xpForLevel(level), needed: xpForLevel(level + 1) - xpForLevel(level) };
}

// ---------- match rewards ----------

/** Solo matches against the computer earn half of what an online match does. */
export const SOLO_MULTIPLIER = 0.5;

/** XP and coins for one match, before achievements and challenges. */
export function matchReward(m: MatchSummary): { xp: number; coins: number } {
  const placeBonus = m.place === 1 ? 60 : m.place === 2 ? 30 : m.place === 3 ? 15 : 0;
  // Bigger tables are harder to win, so the place bonus grows a little with them.
  const table = 1 + Math.max(0, m.players - 2) * 0.1;
  const raw = 20 + placeBonus * table + Math.min(m.captures, 10) * 5 + Math.min(m.pawnsHome, 4) * 8;
  const xp = Math.round(raw * (m.kind === 'online' ? 1 : SOLO_MULTIPLIER));
  return { xp, coins: Math.round(xp / 4) };
}

// ---------- achievements ----------

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  /** Coins paid once, when it unlocks. */
  coins: number;
  earned(stats: Stats, match: MatchSummary): boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first_match', title: 'First Roll', detail: 'Finish your first match', coins: 20, earned: (s) => s.matches >= 1 },
  { id: 'first_win', title: 'Winner', detail: 'Win a match', coins: 30, earned: (s) => s.wins >= 1 },
  { id: 'wins_10', title: 'On a Roll', detail: 'Win 10 matches', coins: 100, earned: (s) => s.wins >= 10 },
  { id: 'captures_10', title: 'Hunter', detail: 'Capture 10 pawns', coins: 40, earned: (s) => s.captures >= 10 },
  { id: 'captures_50', title: 'Menace', detail: 'Capture 50 pawns', coins: 120, earned: (s) => s.captures >= 50 },
  { id: 'home_25', title: 'Homebody', detail: 'Bring 25 pawns home', coins: 60, earned: (s) => s.pawnsHome >= 25 },
  { id: 'sixes_50', title: 'Lucky Hand', detail: 'Roll 50 sixes', coins: 60, earned: (s) => s.sixes >= 50 },
  { id: 'online_win', title: 'Table Champion', detail: 'Win an online match', coins: 60, earned: (s) => s.onlineWins >= 1 },
  { id: 'beat_hard', title: 'Giant Slayer', detail: 'Beat Hard or Expert rivals', coins: 60, earned: (_, m) => m.kind === 'solo' && m.place === 1 && (m.aiLevel === 'hard' || m.aiLevel === 'expert') },
  { id: 'beat_expert', title: 'Grandmaster', detail: 'Beat Expert rivals', coins: 120, earned: (_, m) => m.kind === 'solo' && m.place === 1 && m.aiLevel === 'expert' },
  { id: 'quick_win', title: 'Speedster', detail: 'Win a Quick Race or Quick Clash', coins: 40, earned: (_, m) => m.place === 1 && m.variant !== 'classic' },
  { id: 'big_table', title: 'Full House', detail: 'Win a match with six or more players', coins: 80, earned: (_, m) => m.place === 1 && m.players >= 6 },
];

// ---------- daily challenges ----------

export interface Challenge {
  id: string;
  title: string;
  goal: number;
  xp: number;
  coins: number;
  /** How much this match adds toward the goal. */
  count(match: MatchSummary): number;
}

const CHALLENGE_POOL: readonly Challenge[] = [
  { id: 'play_2', title: 'Play 2 matches', goal: 2, xp: 30, coins: 20, count: () => 1 },
  { id: 'win_1', title: 'Win a match', goal: 1, xp: 40, coins: 30, count: (m) => (m.place === 1 ? 1 : 0) },
  { id: 'capture_3', title: 'Capture 3 pawns', goal: 3, xp: 30, coins: 20, count: (m) => m.captures },
  { id: 'home_4', title: 'Bring 4 pawns home', goal: 4, xp: 30, coins: 20, count: (m) => m.pawnsHome },
  { id: 'sixes_5', title: 'Roll 5 sixes', goal: 5, xp: 25, coins: 15, count: (m) => m.sixes },
  { id: 'quick_1', title: 'Finish a Quick match', goal: 1, xp: 25, coins: 15, count: (m) => (m.variant === 'classic' ? 0 : 1) },
  { id: 'top2_2', title: 'Finish in the top two twice', goal: 2, xp: 35, coins: 25, count: (m) => (m.place <= 2 ? 1 : 0) },
];

export const CHALLENGES_PER_DAY = 3;

/** The same three challenges for everyone on a given day. */
export function challengesFor(date: string): Challenge[] {
  let seed = 0;
  for (const ch of date) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const start = seed % CHALLENGE_POOL.length;
  // A stride that shares no factor with the pool size visits distinct challenges.
  const stride = 1 + (Math.floor(seed / CHALLENGE_POOL.length) % (CHALLENGE_POOL.length - 1));
  const safeStride = CHALLENGE_POOL.length % stride === 0 && stride !== 1 ? 1 : stride;
  return Array.from({ length: CHALLENGES_PER_DAY }, (_, i) => CHALLENGE_POOL[(start + i * safeStride) % CHALLENGE_POOL.length]!);
}

// ---------- applying a match ----------

const REWARDED_MEMORY = 50;

/**
 * Add a finished match to a player's progress. Returns the new record and what
 * was earned, or `reward: null` if this match was already counted.
 */
export function applyMatch(prev: Progress, match: MatchSummary, today: string): { progress: Progress; reward: Reward | null } {
  if (prev.rewarded.includes(match.id)) return { progress: prev, reward: null };
  const base = matchReward(match);
  const won = match.place === 1;
  const stats: Stats = {
    matches: prev.stats.matches + 1,
    wins: prev.stats.wins + (won ? 1 : 0),
    captures: prev.stats.captures + match.captures,
    pawnsHome: prev.stats.pawnsHome + match.pawnsHome,
    sixes: prev.stats.sixes + match.sixes,
    onlineMatches: prev.stats.onlineMatches + (match.kind === 'online' ? 1 : 0),
    onlineWins: prev.stats.onlineWins + (match.kind === 'online' && won ? 1 : 0),
  };

  const unlocked = ACHIEVEMENTS.filter((a) => !prev.achievements.includes(a.id) && a.earned(stats, match));

  const daily = prev.daily.date === today ? { ...prev.daily, progress: { ...prev.daily.progress }, done: [...prev.daily.done] } : { date: today, progress: {}, done: [] };
  const completed: Challenge[] = [];
  for (const challenge of challengesFor(today)) {
    if (daily.done.includes(challenge.id)) continue;
    const value = Math.min(challenge.goal, (daily.progress[challenge.id] ?? 0) + challenge.count(match));
    daily.progress[challenge.id] = value;
    if (value >= challenge.goal) {
      daily.done.push(challenge.id);
      completed.push(challenge);
    }
  }

  const xp = base.xp + completed.reduce((sum, c) => sum + c.xp, 0);
  const coins = base.coins + completed.reduce((sum, c) => sum + c.coins, 0) + unlocked.reduce((sum, a) => sum + a.coins, 0);
  const progress: Progress = {
    xp: prev.xp + xp,
    coins: prev.coins + coins,
    stats,
    achievements: [...prev.achievements, ...unlocked.map((a) => a.id)],
    daily,
    rewarded: [...prev.rewarded, match.id].slice(-REWARDED_MEMORY),
  };
  return {
    progress,
    reward: { xp, coins, levelBefore: levelFor(prev.xp).level, levelAfter: levelFor(progress.xp).level, achievements: unlocked, challenges: completed },
  };
}

/** Rebuild a valid record from stored data, discarding anything malformed. */
export function sanitizeProgress(input: unknown): Progress {
  const fresh = newProgress();
  if (!input || typeof input !== 'object') return fresh;
  const raw = input as Partial<Progress>;
  const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  const stats = (raw.stats ?? {}) as Partial<Stats>;
  const daily = (raw.daily ?? {}) as Partial<Progress['daily']>;
  const known = new Set(ACHIEVEMENTS.map((a) => a.id));
  return {
    xp: count(raw.xp),
    coins: count(raw.coins),
    stats: Object.fromEntries(Object.keys(fresh.stats).map((k) => [k, count(stats[k as keyof Stats])])) as unknown as Stats,
    achievements: [...new Set(strings(raw.achievements).filter((id) => known.has(id)))],
    daily: {
      date: typeof daily.date === 'string' ? daily.date : '',
      progress: Object.fromEntries(Object.entries(daily.progress ?? {}).map(([k, v]) => [k, count(v)])),
      done: strings(daily.done),
    },
    rewarded: strings(raw.rewarded).slice(-REWARDED_MEMORY),
  };
}
