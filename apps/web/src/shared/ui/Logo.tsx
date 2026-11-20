import { useId } from 'react';
import './logo.css';

/**
 * quoteScout mark: a magnifying glass whose lens + handle form a "Q", scouting three quote bars of different heights.
 * Animated (lens scans, bars re-rank, a glint sweeps the glass); everything stops under prefers-reduced-motion.
 * Decorative: the visible wordmark (or the wrapper's aria-label) names the product.
 */
export function LogoMark({ size = 28, animated = true }: { size?: number; animated?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={`qs-mark${animated ? ' qs-animated' : ''}`}>
      <defs>
        <linearGradient id={`qg${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset=".55" stopColor="#c026d3" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <clipPath id={`qc${id}`}>
          <circle cx="13.5" cy="13.5" r="6.4" />
        </clipPath>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#qg${id})`} />
      {/* quotes being compared: three bars, the lowest one is the find */}
      <g className="qs-bars">
        <rect className="qs-bar qs-bar1" x="9.6" y="11" width="2.2" height="6" rx="1.1" fill="#fff" fillOpacity=".55" />
        <rect className="qs-bar qs-bar2" x="12.4" y="13.6" width="2.2" height="3.4" rx="1.1" fill="#fde68a" />
        <rect className="qs-bar qs-bar3" x="15.2" y="9.6" width="2.2" height="7.4" rx="1.1" fill="#fff" fillOpacity=".55" />
      </g>
      <g className="qs-lens">
        <circle cx="13.5" cy="13.5" r="7.2" fill="none" stroke="#fff" strokeWidth="2.6" />
        <path d="M18.8 18.8 24.6 24.6" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
        <g clipPath={`url(#qc${id})`}>
          <rect className="qs-glint" x="2" y="4" width="3" height="20" fill="#fff" fillOpacity=".55" transform="rotate(25 13.5 13.5)" />
        </g>
      </g>
    </svg>
  );
}

/** Wordmark: "quote" + gradient "Scout" (+ optional ".info" and tagline). */
export function Logo({ size = 28, tagline = false, domain = false, animated = true }: { size?: number; tagline?: boolean; domain?: boolean; animated?: boolean }) {
  return (
    <span className="logo">
      <LogoMark size={size} animated={animated} />
      <span className="logo-text">
        <span className="logo-word">
          quote<span className="logo-accent">Scout</span>
          {domain && <span className="logo-tld">.info</span>}
        </span>
        {tagline && <span className="logo-tag">Procurement intelligence</span>}
      </span>
    </span>
  );
}
