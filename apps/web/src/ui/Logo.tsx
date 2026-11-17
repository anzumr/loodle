import { Crown } from './icons';

/**
 * Typeset LOODLE wordmark: gold L·D·L·E, red and blue O's, crown on top.
 * This is a CSS stand-in that follows the approved logo's structure; the
 * final rendered logo artwork should replace it as an image asset.
 */
export function Logo({ size = 'lg', tagline = false }: { size?: 'lg' | 'sm'; tagline?: boolean }) {
  return (
    <div className={`logo logo-${size}`} role="img" aria-label="LOODLE">
      {size === 'lg' && <Crown className="logo-crown" />}
      <div className="logo-word" aria-hidden="true">
        {(['L', 'O', 'O', 'D', 'L', 'E'] as const).map((ch, i) => (
          <span key={i} data-ch={ch} className={`logo-ch logo-ch-${i}`}>
            {ch}
          </span>
        ))}
      </div>
      {tagline && <div className="logo-tagline">ROLL. RIVAL. REPEAT.</div>}
    </div>
  );
}
