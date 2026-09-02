/**
 * Mirror of `server/utils/timezone.js` (ADR-003 §10). Same `APP_TIMEZONE`
 * env var, same UTC default, same DST-aware day-boundary maths — so the
 * "scheduled today" queue means the same day in both applications.
 *
 * Dependency-free on purpose: no `server-only`, so a component can format
 * a date in the organization's zone without pulling the server bundle in.
 */

/**
 * True only for a real IANA "Area/Location" identifier (or the literal
 * "UTC"). Fixed-offset abbreviations like "EST" are rejected even though
 * `Intl` accepts them — they carry no DST information, which is exactly
 * what this boundary calculation depends on.
 */
export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  if (tz !== "UTC" && !tz.includes("/")) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function organizationTimezone(): string {
  const configured = process.env.APP_TIMEZONE;
  if (isValidTimezone(configured)) return configured;
  if (configured) {
    console.warn(
      `[timezone] APP_TIMEZONE="${configured}" is not a valid IANA timezone — falling back to UTC.`,
    );
  }
  return "UTC";
}

/** Offset (ms) to ADD to a UTC instant to get that zone's wall-clock time. */
function tzOffsetMs(timezone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === "24" ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - date.getTime();
}

/**
 * The [start, end) UTC bounds of "today" in the given zone. Derived from
 * the zone's own offset at that instant rather than a fixed offset, so it
 * stays correct across DST transitions.
 */
export function todayBoundsInTimezone(
  timezone: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [{ value: year }, , { value: month }, , { value: day }] = formatter.formatToParts(now);

  const approxUtcMidnight = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const offsetMs = tzOffsetMs(timezone, new Date(approxUtcMidnight));
  const start = new Date(approxUtcMidnight - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}
