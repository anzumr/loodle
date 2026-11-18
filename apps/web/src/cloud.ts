import { sanitizeProgress, sanitizeWardrobe, type Progress, type Wardrobe } from '@loodl/rules';

/** What is kept in the cloud for a signed-in player. Mirrors the server's profile. */
export interface CloudProfile {
  name: string;
  avatar: number;
  progress: Progress;
  wardrobe: Wardrobe;
  challenges: string[];
}

/**
 * Combine this device's progress with the account's cloud save the first time they meet.
 * The save with more XP is kept as a whole (so coins are never added twice); owned items,
 * achievements and solved challenges from both are kept.
 */
export function mergeProfiles(local: CloudProfile, cloud: CloudProfile): CloudProfile {
  const base = cloud.progress.xp >= local.progress.xp ? cloud : local;
  const other = base === cloud ? local : cloud;
  const progress = sanitizeProgress({
    ...base.progress,
    achievements: [...new Set([...base.progress.achievements, ...other.progress.achievements])],
  });
  const wardrobe = sanitizeWardrobe({
    owned: [...new Set([...base.wardrobe.owned, ...other.wardrobe.owned])],
    equipped: base.wardrobe.equipped,
  });
  return {
    name: base.name !== 'Guest' ? base.name : other.name,
    avatar: base.avatar,
    progress,
    wardrobe,
    challenges: [...new Set([...base.challenges, ...other.challenges])],
  };
}

export type CloudState = 'off' | 'loading' | 'synced' | 'saving' | 'error';

export async function loadCloud(): Promise<{ enabled: boolean; profile: CloudProfile | null }> {
  const response = await fetch('/api/profile', { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Cloud load failed (${response.status})`);
  return response.json();
}

export async function saveCloud(profile: CloudProfile): Promise<CloudProfile> {
  const response = await fetch('/api/profile', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!response.ok) throw new Error(`Cloud save failed (${response.status})`);
  return (await response.json()).profile;
}
