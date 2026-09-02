import { cn } from "@/lib/utils";

/**
 * Status pill. Tones map to meaning, not to a palette choice at the call
 * site — so "overdue" looks the same in the operations board, the case
 * page, and the query queues.
 *
 * `gold` uses gold-700 text on a gold-50 fill: gold-500 as text fails AA
 * on light backgrounds (see the project's gold contrast rule).
 */
export type BadgeTone = "neutral" | "positive" | "warning" | "danger" | "gold";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-navy-50 text-navy-700",
  positive: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  gold: "bg-gold-50 text-gold-700",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Human-readable label for a snake_case enum value. */
export function humanize(value: unknown): string {
  return String(value ?? "").replace(/_/g, " ");
}

const CASE_STAGE_TONES: Record<string, BadgeTone> = {
  approved: "positive",
  filed: "positive",
  denied: "danger",
  closed: "neutral",
  archived: "neutral",
  client_review: "warning",
  ready_to_file: "gold",
};

export function stageTone(stage: unknown): BadgeTone {
  return CASE_STAGE_TONES[String(stage)] ?? "neutral";
}

const PRIORITY_TONES: Record<string, BadgeTone> = {
  urgent: "danger",
  high: "warning",
  medium: "neutral",
  low: "neutral",
  normal: "neutral",
};

export function priorityTone(priority: unknown): BadgeTone {
  return PRIORITY_TONES[String(priority)] ?? "neutral";
}

const DOCUMENT_STATUS_TONES: Record<string, BadgeTone> = {
  accepted: "positive",
  rejected: "danger",
  quarantined: "danger",
  uploaded: "warning",
  pending_review: "warning",
  replacement_requested: "warning",
};

export function documentStatusTone(status: unknown): BadgeTone {
  return DOCUMENT_STATUS_TONES[String(status)] ?? "neutral";
}

const CLIENT_STATUS_TONES: Record<string, BadgeTone> = {
  active: "positive",
  pending: "warning",
  locked: "danger",
  disabled: "danger",
};

export function clientStatusTone(status: unknown): BadgeTone {
  return CLIENT_STATUS_TONES[String(status)] ?? "neutral";
}
