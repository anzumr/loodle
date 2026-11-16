import { Pawn } from './icons';

/**
 * Built-in profile pictures: a pawn portrait in one of eight colours.
 * These are placeholders for the illustrated avatar collection.
 */
const COLOURS: [light: string, dark: string][] = [
  ['#ff7b7b', '#a3121a'],
  ['#5fe08f', '#0b7436'],
  ['#ffe27a', '#b97a00'],
  ['#6cc4ff', '#0f67b0'],
  ['#c79bff', '#5b2aa8'],
  ['#5fe3d6', '#0c7a70'],
  ['#ffb26b', '#b3540a'],
  ['#ff9ad1', '#a3206c'],
];

export const AVATAR_NAMES = ['Red', 'Green', 'Gold', 'Blue', 'Violet', 'Teal', 'Orange', 'Pink'];

export function Avatar({ id, size = 42 }: { id: number; size?: number }) {
  const [light, dark] = COLOURS[id] ?? COLOURS[0]!;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, color: '#fff', background: `radial-gradient(circle at 35% 30%, ${light}, ${dark})` }}
      aria-hidden="true"
    >
      <Pawn style={{ width: size * 0.56 }} />
    </span>
  );
}
