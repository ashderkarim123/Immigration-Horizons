import { cn } from "@/lib/utils";

/**
 * The approved hero illustration: an open doorway framing a sunrise, a path
 * toward it, and two document motifs. Inline SVG with brand hex values so it
 * costs no request and no JavaScript; the only motion is a CSS float on the
 * documents, suppressed by prefers-reduced-motion in globals.css.
 */
export function HeroVisual({ alt, className }: { alt: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 500 400"
      role="img"
      aria-label={alt}
      className={cn("h-auto w-full", className)}
    >
      <defs>
        <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6F2E9" />
          <stop offset="1" stopColor="#F3E3D8" />
        </linearGradient>
        <linearGradient id="hero-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E1E8E1" />
          <stop offset="1" stopColor="#CDD9D0" />
        </linearGradient>
        <clipPath id="hero-frame">
          <rect x="40" y="20" width="420" height="360" rx="28" />
        </clipPath>
      </defs>
      <rect x="40" y="20" width="420" height="360" rx="28" fill="url(#hero-sky)" stroke="rgba(22,75,59,.14)" />
      <g clipPath="url(#hero-frame)">
        <ellipse cx="250" cy="250" rx="300" ry="38" fill="#F3E3D8" opacity=".7" />
        <ellipse cx="250" cy="262" rx="300" ry="30" fill="#E9C6B5" opacity=".35" />
        <path d="M190 236 A60 60 0 0 1 310 236 Z" fill="#C9774F" />
        <rect x="178" y="244" width="144" height="8" rx="4" fill="#C9774F" />
        <rect x="40" y="252" width="420" height="140" fill="url(#hero-ground)" />
        <path
          d="M250 260 C 290 285, 170 300, 215 330 C 262 362, 160 372, 200 400 L 300 400 C 330 372, 240 362, 285 330 C 330 300, 215 285, 250 260 Z"
          fill="#164B3B"
        />
        <path d="M40 20 L170 95 L170 320 L40 390 Z" fill="#164B3B" />
        <path d="M460 20 L330 95 L330 320 L460 390 Z" fill="#164B3B" />
        <path d="M40 20 L170 95 L170 320 L40 390 Z" fill="#10372B" opacity=".35" />
        <path d="M170 95 L170 320" stroke="#C9774F" strokeWidth="3" />
        <path d="M330 95 L330 320" stroke="#C9774F" strokeWidth="3" />
      </g>
      <g className="animate-float-slow" transform="translate(372 56)" fill="#fff" stroke="rgba(22,75,59,.25)">
        <rect width="64" height="80" rx="8" />
        <g stroke="#164B3B" strokeWidth="3" strokeLinecap="round">
          <path d="M14 22h36M14 36h36M14 50h24" />
        </g>
        <circle cx="48" cy="62" r="8" fill="#C9774F" stroke="none" />
      </g>
      <g transform="translate(64 300)" fill="#fff" stroke="rgba(22,75,59,.25)">
        <rect width="78" height="56" rx="8" />
        <g stroke="#164B3B" strokeWidth="3" strokeLinecap="round">
          <path d="M14 18h50M14 30h50M14 42h30" />
        </g>
      </g>
    </svg>
  );
}
