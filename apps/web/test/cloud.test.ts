import { describe, expect, it } from 'vitest';
import { newProgress, newWardrobe } from '@loodl/rules';
import { mergeProfiles, type CloudProfile } from '../src/cloud';

const profile = (xp: number, coins: number, extra: Partial<CloudProfile> = {}): CloudProfile => ({
  name: 'Player_1',
  avatar: 0,
  progress: { ...newProgress(), xp, coins },
  wardrobe: newWardrobe(),
  challenges: [],
  ...extra,
});

describe('merging this device with the cloud save', () => {
  it('keeps the save with more XP, and never adds coins together', () => {
    const merged = mergeProfiles(profile(100, 50), profile(900, 300));
    expect(merged.progress).toMatchObject({ xp: 900, coins: 300 });
    expect(mergeProfiles(profile(900, 300), profile(100, 50)).progress).toMatchObject({ xp: 900, coins: 300 });
  });

  it('keeps items, achievements and solved challenges from both', () => {
    const local = profile(100, 0, {
      wardrobe: { ...newWardrobe(), owned: [...newWardrobe().owned, 'board_royal'] },
      challenges: ['hunter'],
      progress: { ...newProgress(), xp: 100, achievements: ['first_win'] },
    });
    const cloud = profile(900, 0, {
      wardrobe: { ...newWardrobe(), owned: [...newWardrobe().owned, 'dice_ruby'] },
      challenges: ['homecoming'],
      progress: { ...newProgress(), xp: 900, achievements: ['first_match'] },
    });
    const merged = mergeProfiles(local, cloud);
    expect(merged.wardrobe.owned).toEqual(expect.arrayContaining(['board_royal', 'dice_ruby']));
    expect(merged.challenges.sort()).toEqual(['homecoming', 'hunter']);
    expect(merged.progress.achievements.sort()).toEqual(['first_match', 'first_win']);
  });

  it('prefers a real name over Guest', () => {
    expect(mergeProfiles(profile(10, 0, { name: 'Krazer' }), profile(500, 0, { name: 'Guest' })).name).toBe('Krazer');
  });
});
