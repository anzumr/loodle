/**
 * Display-name rules, shared by the website (instant feedback) and the server
 * (the check that counts). Names are not unique: two players may share one.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
export const DEFAULT_USERNAME = 'Guest';
/** Number of built-in profile pictures. Avatar ids are 0 to AVATAR_COUNT - 1. */
export const AVATAR_COUNT = 8;

/** Names that could be mistaken for staff or the system. */
const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'system', 'support', 'staff', 'loodl', 'loodle', 'official', 'bot'];

/**
 * A deliberately short starter list. It catches the obvious cases, including
 * simple letter swaps, and will also reject a few innocent names that happen
 * to contain one of these strings. A maintained list or moderation service
 * should replace it before chat or public profiles launch.
 */
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'asshole', 'rapist', 'nazi', 'hitler', 'penis', 'vagina', 'porn'];

const LOOKALIKES: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' };

/** Lower-case, undo common digit-for-letter swaps, drop underscores and repeated letters. */
const normalise = (name: string) =>
  name
    .toLowerCase()
    .replace(/[0134578]/g, (d) => LOOKALIKES[d]!)
    .replace(/_/g, '')
    .replace(/(.)\1+/g, '$1');

export type UsernameCheck = { ok: true; name: string } | { ok: false; reason: string };

export function validateUsername(input: unknown): UsernameCheck {
  if (typeof input !== 'string') return { ok: false, reason: 'Enter a name' };
  const name = input.trim();
  if (name.length < USERNAME_MIN) return { ok: false, reason: `Use at least ${USERNAME_MIN} characters` };
  if (name.length > USERNAME_MAX) return { ok: false, reason: `Use at most ${USERNAME_MAX} characters` };
  if (!/^[A-Za-z0-9_]+$/.test(name)) return { ok: false, reason: 'Use only letters, numbers and underscores' };
  const flat = normalise(name);
  const plain = name.toLowerCase().replace(/_/g, '');
  // Reserved names are matched whole, with digit swaps undone but letters left as typed,
  // so "L00DL" is caught while ordinary names like "Mood" or "Boot" are not.
  const unswapped = plain.replace(/[0134578]/g, (d) => LOOKALIKES[d]!);
  if (RESERVED.includes(plain) || RESERVED.includes(unswapped)) return { ok: false, reason: 'That name is reserved' };
  // Compare against both spellings so "sh1t" and "shiit" are caught as well as "shit".
  const blockedFlat = BLOCKED.map(normalise);
  if (BLOCKED.some((w) => plain.includes(w)) || blockedFlat.some((w) => flat.includes(w))) return { ok: false, reason: 'Please choose a different name' };
  return { ok: true, name };
}

/** The name to actually use: the input if it is acceptable, otherwise "Guest". */
export const cleanUsername = (input: unknown): string => {
  const check = validateUsername(input);
  return check.ok ? check.name : DEFAULT_USERNAME;
};

/** A valid avatar id, falling back to the first avatar. */
export const cleanAvatar = (input: unknown): number =>
  typeof input === 'number' && Number.isInteger(input) && input >= 0 && input < AVATAR_COUNT ? input : 0;
