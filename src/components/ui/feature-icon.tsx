import {
  BadgeCheck,
  Briefcase,
  Clock,
  FileText,
  Globe,
  Headset,
  ShieldCheck,
  Target,
} from "lucide-react";

import type { IconName } from "@/lib/content/about";
import { cn } from "@/lib/utils";

const icons = {
  target: Target,
  document: FileText,
  briefcase: Briefcase,
  shield: ShieldCheck,
  clock: Clock,
  headset: Headset,
  globe: Globe,
  badge: BadgeCheck,
} as const satisfies Record<IconName, unknown>;

/** 44px tile, Lucide at 1.75 stroke. The only icon family on the site. */
export function FeatureIcon({
  name,
  tone = "navy",
  className,
}: {
  name: IconName;
  tone?: "navy" | "gold" | "inverse";
  className?: string;
}) {
  const Icon = icons[name];
  const tones = {
    navy: "bg-navy-50 text-navy-800",
    gold: "bg-gold-50 text-gold-700",
    inverse: "bg-white/10 text-gold-500",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-xl",
        tones[tone],
        className,
      )}
      aria-hidden
    >
      <Icon size={22} strokeWidth={1.75} />
    </span>
  );
}
