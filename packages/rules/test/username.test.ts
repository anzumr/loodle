import { describe, expect, it } from 'vitest';
import { AVATAR_COUNT, cleanAvatar, cleanUsername, validateUsername } from '../src';

const ok = (name: unknown) => validateUsername(name).ok;

describe('usernames', () => {
  it('accepts 3–16 letters, numbers and underscores', () => {
    for (const name of ['Alex', 'emma_12', 'A_B', 'x'.repeat(16), 'Rohan2026', 'Sophia_']) expect(ok(name)).toBe(true);
  });

  it('rejects wrong lengths, other characters and non-strings', () => {
    for (const name of ['Al', 'x'.repeat(17), 'has space', 'émile', '<script>', 'a-b-c', '', null, 42, undefined]) expect(ok(name)).toBe(false);
  });

  it('trims surrounding spaces before checking', () => {
    expect(validateUsername('  Alex  ')).toEqual({ ok: true, name: 'Alex' });
  });

  it('rejects names that pose as staff or the system', () => {
    for (const name of ['Admin', 'MODERATOR', 'loodl', 'L00DL', 'sys_tem', 'Bot']) expect(ok(name)).toBe(false);
    expect(ok('Botanist')).toBe(true);
    expect(ok('Administrate')).toBe(true);
    expect(ok('Mood')).toBe(true);
    expect(ok('Boot')).toBe(true);
  });

  it('rejects obvious profanity, including letter swaps and stretched spellings', () => {
    for (const name of ['shit', 'Sh1t_head', 'f_u_c_k', 'fuuuck', 'xX_b1tch_Xx', 'N4zi']) expect(ok(name)).toBe(false);
  });

  it('gives a reason the player can act on', () => {
    expect(validateUsername('Al')).toEqual({ ok: false, reason: 'Use at least 3 characters' });
    expect(validateUsername('a b c')).toEqual({ ok: false, reason: 'Use only letters, numbers and underscores' });
  });

  it('falls back to Guest when a name is not acceptable', () => {
    expect(cleanUsername('Alex_12')).toBe('Alex_12');
    expect(cleanUsername('<script>')).toBe('Guest');
    expect(cleanUsername('admin')).toBe('Guest');
    expect(ok('Guest')).toBe(true);
  });
});

describe('avatars', () => {
  it('keeps valid ids and replaces anything else with the first avatar', () => {
    expect(cleanAvatar(AVATAR_COUNT - 1)).toBe(AVATAR_COUNT - 1);
    for (const bad of [-1, AVATAR_COUNT, 1.5, '3', null, undefined, NaN]) expect(cleanAvatar(bad)).toBe(0);
  });
});
