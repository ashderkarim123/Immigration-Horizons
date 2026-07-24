/**
 * Inline SVG illustration of an indexed petition package — a labelled exhibit
 * tab set behind a cover letter. Communicates the "organised, indexed, filing-
 * ready" idea visually. No JavaScript, no external asset, scales cleanly.
 */
export function DocumentStack({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 260"
      className={className}
      role="img"
      aria-label="An organised petition package with a cover letter and tabbed, indexed exhibits."
    >
      <defs>
        <linearGradient id="ds-cover" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#f3f6fb" />
        </linearGradient>
        <filter id="ds-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="8"
            stdDeviation="12"
            floodColor="#0f1f3d"
            floodOpacity="0.14"
          />
        </filter>
      </defs>

      {/* Back exhibit sheets with coloured tabs */}
      {[
        { y: 40, tab: "#446498", label: 34 },
        { y: 30, tab: "#6a88b5", label: 26 },
        { y: 20, tab: "#c9992e", label: 18 },
      ].map((sheet, i) => (
        <g key={i}>
          <rect
            x={70}
            y={sheet.y}
            width={190}
            height={210}
            rx={6}
            fill="#ffffff"
            stroke="#e1e5ec"
            strokeWidth="1"
          />
          <rect
            x={252}
            y={sheet.y + 22}
            width={18}
            height={34}
            rx={3}
            fill={sheet.tab}
          />
        </g>
      ))}

      {/* Front cover letter */}
      <g filter="url(#ds-shadow)">
        <rect
          x={50}
          y={50}
          width={190}
          height={190}
          rx={8}
          fill="url(#ds-cover)"
          stroke="#e1e5ec"
          strokeWidth="1"
        />
      </g>

      {/* Header band */}
      <rect x={50} y={50} width={190} height={40} rx={8} fill="#152c54" />
      <rect x={50} y={78} width={190} height={12} fill="#152c54" />
      <circle cx={70} cy={70} r={9} fill="#c9992e" />
      <rect x={86} y={64} width={70} height={5} rx={2.5} fill="#ffffff" opacity="0.9" />
      <rect x={86} y={74} width={48} height={4} rx={2} fill="#9cb2d3" />

      {/* Body text lines */}
      {[108, 122, 136, 150, 164, 178].map((y, i) => (
        <rect
          key={y}
          x={70}
          y={y}
          width={i % 3 === 2 ? 96 : 150}
          height={5}
          rx={2.5}
          fill="#c9d0db"
        />
      ))}

      {/* Exhibit citation chip */}
      <rect x={70} y={198} width={64} height={22} rx={11} fill="#f7ecd3" />
      <text
        x={102}
        y={213}
        textAnchor="middle"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fontWeight="700"
        fill="#83601a"
      >
        Exhibit 7
      </text>

      {/* Gold verification tick */}
      <circle cx={214} cy={210} r={16} fill="#152c54" />
      <path
        d="M207 210l5 5 9-10"
        fill="none"
        stroke="#e4c46f"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
