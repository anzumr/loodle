import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  CHALLENGES_PER_DAY,
  applyMatch,
  challengesFor,
  levelFor,
  matchReward,
  newProgress,
  sanitizeProgress,
  xpForLevel,
  type MatchSummary,
} from '../src';

const match = (over: Partial<MatchSummary> = {}): MatchSummary => ({
  id: 'm1',
  kind: 'solo',
  variant: 'classic',
  players: 4,
  place: 1,
  captures: 2,
  pawnsHome: 4,
  sixes: 6,
  aiLevel: 'medium',
  ...over,
});
const DAY = '2026-11-16';

describe('levels', () => {
  it('starts at level 1 and needs more XP for each level', () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: 120 });
    expect(levelFor(119).level).toBe(1);
    expect(levelFor(120)).toEqual({ level: 2, into: 0, needed: 240 });
    for (let l = 1; l < 30; l++) expect(xpForLevel(l + 2) - xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l + 1) - xpForLevel(l));
  });
});

describe('match rewards', () => {
  it('pays more for a better place, captures and pawns home', () => {
    const win = matchReward(match({ kind: 'online' }));
    expect(win.xp).toBeGreaterThan(matchReward(match({ kind: 'online', place: 2 })).xp);
    expect(matchReward(match({ kind: 'online', place: 2 })).xp).toBeGreaterThan(matchReward(match({ kind: 'online', place: 4 })).xp);
    expect(win.xp).toBeGreaterThan(matchReward(match({ kind: 'online', captures: 0 })).xp);
    expect(win.coins).toBe(Math.round(win.xp / 4));
  });

  it('pays solo matches half of online ones', () => {
    const online = matchReward(match({ kind: 'online' })).xp;
    expect(matchReward(match({ kind: 'solo' })).xp).toBe(Math.round(online / 2));
  });

  it('caps what captures and pawns can add, so padding a match does not pay', () => {
    expect(matchReward(match({ captures: 500, pawnsHome: 99 }))).toEqual(matchReward(match({ captures: 10, pawnsHome: 4 })));
  });

  it('still pays something for finishing last', () => {
    expect(matchReward(match({ place: 4, captures: 0, pawnsHome: 0 })).xp).toBeGreaterThan(0);
  });
});

describe('applying a match', () => {
  it('adds XP, coins and stats', () => {
    const { progress, reward } = applyMatch(newProgress(), match(), DAY);
    expect(reward!.xp).toBeGreaterThan(0);
    expect(progress.xp).toBe(reward!.xp);
    expect(progress.coins).toBe(reward!.coins);
    expect(progress.stats).toMatchObject({ matches: 1, wins: 1, captures: 2, pawnsHome: 4, sixes: 6, onlineMatches: 0 });
  });

  it('never rewards the same match twice', () => {
    const first = applyMatch(newProgress(), match(), DAY).progress;
    const again = applyMatch(first, match(), DAY);
    expect(again.reward).toBeNull();
    expect(again.progress).toBe(first);
  });

  it('does not change the record it was given', () => {
    const start = newProgress();
    const copy = JSON.stringify(start);
    applyMatch(start, match(), DAY);
    expect(JSON.stringify(start)).toBe(copy);
  });

  it('reports a level-up', () => {
    let p = newProgress();
    let levelled = false;
    for (let i = 0; i < 6; i++) {
      const r = applyMatch(p, match({ id: `m${i}`, kind: 'online' }), DAY);
      p = r.progress;
      if (r.reward!.levelAfter > r.reward!.levelBefore) levelled = true;
    }
    expect(levelled).toBe(true);
    expect(levelFor(p.xp).level).toBeGreaterThan(1);
  });

  it('counts online results separately', () => {
    const { progress } = applyMatch(newProgress(), match({ kind: 'online' }), DAY);
    expect(progress.stats).toMatchObject({ onlineMatches: 1, onlineWins: 1 });
  });
});

describe('achievements', () => {
  it('unlock once, pay coins once, and are listed in the reward', () => {
    const first = applyMatch(newProgress(), match(), DAY);
    const ids = first.reward!.achievements.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['first_match', 'first_win']));
    const second = applyMatch(first.progress, match({ id: 'm2' }), DAY);
    expect(second.reward!.achievements.map((a) => a.id)).not.toContain('first_match');
    expect(new Set(second.progress.achievements).size).toBe(second.progress.achievements.length);
  });

  it('require the real condition', () => {
    const lost = applyMatch(newProgress(), match({ place: 3 }), DAY);
    expect(lost.progress.achievements).toEqual(['first_match']);
    const expert = applyMatch(newProgress(), match({ aiLevel: 'expert' }), DAY);
    expect(expert.progress.achievements).toEqual(expect.arrayContaining(['beat_hard', 'beat_expert']));
    const easyOnline = applyMatch(newProgress(), match({ kind: 'online', aiLevel: undefined }), DAY);
    expect(easyOnline.progress.achievements).toContain('online_win');
    expect(easyOnline.progress.achievements).not.toContain('beat_hard');
  });

  it('have unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('daily challenges', () => {
  it('offers three distinct challenges, the same for everyone on a day', () => {
    for (const date of ['2026-11-16', '2026-11-17', '2027-01-01', '2026-02-28', '2026-07-04']) {
      const list = challengesFor(date);
      expect(list).toHaveLength(CHALLENGES_PER_DAY);
      expect(new Set(list.map((c) => c.id)).size).toBe(CHALLENGES_PER_DAY);
      expect(challengesFor(date).map((c) => c.id)).toEqual(list.map((c) => c.id));
    }
  });

  it('pays each challenge once when its goal is reached, and resets the next day', () => {
    let p = newProgress();
    let paid = 0;
    for (let i = 0; i < 4; i++) {
      const r = applyMatch(p, match({ id: `d${i}`, variant: 'race' }), DAY);
      paid += r.reward!.challenges.length;
      p = r.progress;
    }
    expect(paid).toBe(p.daily.done.length);
    expect(paid).toBeGreaterThan(0);
    expect(new Set(p.daily.done).size).toBe(p.daily.done.length);
    const next = applyMatch(p, match({ id: 'tomorrow', place: 4, captures: 0, pawnsHome: 0, sixes: 0 }), '2026-11-17').progress;
    expect(next.daily.date).toBe('2026-11-17');
    expect(next.daily.done.length).toBeLessThanOrEqual(1);
  });
});

describe('stored progress', () => {
  it('round-trips through JSON', () => {
    const p = applyMatch(newProgress(), match(), DAY).progress;
    expect(sanitizeProgress(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('repairs malformed or tampered data instead of trusting it', () => {
    expect(sanitizeProgress(null)).toEqual(newProgress());
    expect(sanitizeProgress('nonsense')).toEqual(newProgress());
    const repaired = sanitizeProgress({ xp: -50, coins: 'lots', stats: { wins: NaN }, achievements: ['first_win', 'made_up', 'first_win'], rewarded: [1, 'a'] });
    expect(repaired).toMatchObject({ xp: 0, coins: 0, achievements: ['first_win'], rewarded: ['a'] });
    expect(repaired.stats.wins).toBe(0);
  });
});
