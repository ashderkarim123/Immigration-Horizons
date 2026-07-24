import { FileCheck2, ScrollText, Stamp, Users } from "lucide-react";

/**
 * Hero illustration: a wireframe globe with orbiting evidence cards.
 *
 * Deliberately inline SVG plus CSS keyframes — no canvas, no WebGL, no
 * animation library. It costs zero JavaScript, makes no network request,
 * cannot shift layout, and scales to any viewport. All motion is suppressed
 * by the global prefers-reduced-motion rule.
 */

/** Client locations, positioned to read as spread across the globe. */
const markers = [
  { cx: 96, cy: 74, delay: "0s" },
  { cx: 132, cy: 102, delay: "0.7s" },
  { cx: 68, cy: 118, delay: "1.4s" },
  { cx: 112, cy: 142, delay: "2.1s" },
  { cx: 58, cy: 92, delay: "2.8s" },
];

const meridians = [
  { rx: 68, delay: "0s" },
  { rx: 50, delay: "-2.8s" },
  { rx: 30, delay: "-5.6s" },
  { rx: 10, delay: "-8.4s" },
];

const evidenceCards = [
  {
    label: "Petition letter",
    meta: "Drafted from scratch",
    icon: ScrollText,
    className: "-top-2 -left-4 sm:-left-8",
    delay: "0s",
  },
  {
    label: "Recommendation letters",
    meta: "Tailored per recommender",
    icon: Users,
    className: "top-24 -right-2 sm:-right-6",
    delay: "1.6s",
  },
  {
    label: "Exhibit index",
    meta: "Organised for review",
    icon: FileCheck2,
    className: "bottom-16 -left-2 sm:-left-10",
    delay: "3.2s",
  },
  {
    label: "RFE response",
    meta: "Evidence-led",
    icon: Stamp,
    className: "-bottom-1 right-4 sm:right-2",
    delay: "4.8s",
  },
];

export function HeroVisual({ className }: { className?: string }) {
  return (
    <div
      className={`relative mx-auto w-full max-w-md ${className ?? ""}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 200 200"
        className="h-auto w-full"
        role="presentation"
        focusable="false"
      >
        <defs>
          <radialGradient id="globe-fill" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#3e639b" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#08132a" stopOpacity="0.15" />
          </radialGradient>
        </defs>

        <circle cx="100" cy="108" r="68" fill="url(#globe-fill)" />
        <circle
          cx="100"
          cy="108"
          r="68"
          fill="none"
          stroke="#d6ac46"
          strokeOpacity="0.45"
          strokeWidth="1"
        />

        {/* Latitudes */}
        {[-40, -20, 0, 20, 40].map((offset) => (
          <ellipse
            key={offset}
            cx="100"
            cy={108 + offset}
            rx={Math.sqrt(Math.max(68 * 68 - offset * offset, 0))}
            ry="7"
            fill="none"
            stroke="#9cb2d3"
            strokeOpacity="0.3"
            strokeWidth="0.75"
          />
        ))}

        {/* Meridians — the sweeping rx is what reads as rotation */}
        {meridians.map((meridian) => (
          <ellipse
            key={meridian.rx}
            cx="100"
            cy="108"
            rx={meridian.rx}
            ry="68"
            fill="none"
            stroke="#9cb2d3"
            strokeWidth="0.75"
            className="motion-safe:[animation:meridian-sweep_16s_ease-in-out_infinite]"
            style={{ animationDelay: meridian.delay }}
          />
        ))}

        {/* Client markers */}
        {markers.map((marker) => (
          <circle
            key={`${marker.cx}-${marker.cy}`}
            cx={marker.cx}
            cy={marker.cy}
            r="3"
            fill="#e4c46f"
            className="motion-safe:animate-(--animate-pulse-dot)"
            style={{ animationDelay: marker.delay }}
          />
        ))}
      </svg>

      {/* Orbiting deliverables — hidden on the narrowest screens so they can
          never crowd the globe or force horizontal scroll. */}
      <div className="pointer-events-none absolute inset-0 hidden sm:block">
        {evidenceCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`absolute ${card.className} motion-safe:animate-(--animate-float-slow)`}
              style={{ animationDelay: card.delay }}
            >
              <div className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-navy-800/80 px-3.5 py-2.5 shadow-lifted backdrop-blur-md">
                <Icon size={15} className="text-gold-400 shrink-0" />
                <div>
                  <p className="font-sans text-xs font-semibold whitespace-nowrap text-white">
                    {card.label}
                  </p>
                  <p className="text-navy-300 font-sans text-[0.625rem] whitespace-nowrap">
                    {card.meta}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
