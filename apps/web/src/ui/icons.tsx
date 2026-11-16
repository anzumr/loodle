import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

export const Crown = (p: P) => (
  <svg viewBox="0 0 64 44" {...p}>
    <defs>
      <linearGradient id="crownGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff0a6" />
        <stop offset="0.5" stopColor="#ffc93a" />
        <stop offset="1" stopColor="#d98a0b" />
      </linearGradient>
    </defs>
    <path
      d="M6 36 2 12l15 10L32 3l15 19 15-10-4 24z"
      fill="url(#crownGold)"
      stroke="#8a5200"
      strokeWidth="2.5"
      strokeLinejoin="round"
    />
    <rect x="6" y="35" width="52" height="7" rx="3" fill="url(#crownGold)" stroke="#8a5200" strokeWidth="2.5" />
    <circle cx="32" cy="25" r="4" fill="#e5262f" stroke="#8a5200" strokeWidth="1.5" />
    <circle cx="2.5" cy="11" r="2.5" fill="#ffe27a" />
    <circle cx="32" cy="3" r="2.8" fill="#ffe27a" />
    <circle cx="61.5" cy="11" r="2.5" fill="#ffe27a" />
  </svg>
);

export const Gear = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
  </svg>
);

export const Pawn = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="12" cy="6" r="4" />
    <path d="M9.5 10.5h5l1.5 7h-8zM6 18.5h12a1.5 1.5 0 0 1 1.5 1.5v1.5h-15V20A1.5 1.5 0 0 1 6 18.5z" />
  </svg>
);

export const People = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="8.5" cy="8" r="3.5" />
    <circle cx="16.5" cy="9" r="3" opacity="0.75" />
    <path d="M2 20c0-3.6 2.9-6.5 6.5-6.5S15 16.4 15 20z" />
    <path d="M16 20c0-2-.6-3.800-1.7-5.200a5.5 5.5 0 0 1 7.7 5.200z" opacity="0.75" />
  </svg>
);

export const Chest = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M3 10a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v1H3z" />
    <path d="M3 12.5h7.5V15h3v-2.5H21V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" opacity="0.8" />
  </svg>
);

export const Back = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const Chevron = (p: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
