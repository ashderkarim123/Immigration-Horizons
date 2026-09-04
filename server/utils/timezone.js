/**
 * Central timezone utility (ADR-003 §10). No existing organization
 * timezone setting or env var was found anywhere in either app before this
 * cycle — `APP_TIMEZONE` is new, documented, defaults to UTC.
 */

/**
 * True only for a real IANA "Area/Location" timezone identifier (or the
 * literal "UTC") — rejects fixed-offset legacy abbreviations like "EST" or
 * "PST", which Intl itself actually accepts (they're real, if deprecated,
 * tz-database entries) but which the module doc explicitly calls out as
 * unacceptable: they carry no DST information and are exactly the kind of
 * ambiguous input this validation exists to reject. Requiring a "/" (every
 * real Area/Location zone has one) filters those out without a
 * hand-maintained abbreviation blocklist.
 */
function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  if (tz !== 'UTC' && !tz.includes('/')) return false;
  try {
    // Intl throws a RangeError for anything that isn't a real IANA zone —
    // this is the platform's own validation, not a hand-maintained allowlist.
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function organizationTimezone() {
  const configured = process.env.APP_TIMEZONE;
  if (configured && isValidTimezone(configured)) return configured;
  if (configured) {
    console.warn(`[timezone] APP_TIMEZONE="${configured}" is not a valid IANA timezone — falling back to UTC.`);
  }
  return 'UTC';
}

/**
 * Returns the [start, end) UTC Date bounds of "today" in the given IANA
 * timezone — the boundary used by the "Scheduled today" queue. Computed by
 * formatting `now` into that zone's local calendar date, then re-parsing
 * midnight-to-midnight in that zone back to UTC, rather than manually
 * adding/subtracting a fixed offset (which breaks across DST transitions).
 */
function todayBoundsInTimezone(timezone, now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [{ value: year }, , { value: month }, , { value: day }] = formatter.formatToParts(now);

  // en-CA gives YYYY-MM-DD parts; construct local-midnight-as-UTC-string
  // pairs and let the JS Date/Intl machinery resolve the actual UTC instant
  // via a binary-search-free direct approach: use Date.UTC as a first
  // approximation, then correct by the zone's actual offset at that instant.
  const approxUtcMidnight = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const offsetMs = tzOffsetMs(timezone, new Date(approxUtcMidnight));
  const start = new Date(approxUtcMidnight - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Offset (ms) to ADD to a UTC instant to get that zone's local wall-clock time, at the given instant (DST-aware). */
function tzOffsetMs(timezone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - date.getTime();
}

/**
 * Converts a `datetime-local` input value (e.g. "2026-09-04T23:26" — no
 * timezone information travels with it) into the correct UTC instant,
 * reading those digits as wall-clock time IN the given zone rather than in
 * UTC. Without this, `new Date(rawValue)` on a UTC-timezone server (the
 * VPS is set to UTC — see CONTABO_VPS_SETUP.md) reads "11:26 PM in the
 * editor's zone" as "11:26 PM UTC", silently shifting a "publish now"
 * schedule forward by the zone's offset. Exactly the bug that left a blog
 * post unpublished for hours after someone scheduled it for "now".
 */
function zonedTimeToUtc(dateTimeLocalValue, timezone) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(dateTimeLocalValue || '');
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;

  // First pass: treat the typed digits as if they were already UTC.
  const approxUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second || 0),
  );
  // The zone's own offset at that instant (DST-aware) is exactly the
  // correction between "these digits read as UTC" and "these digits read
  // in the zone" — subtract it to land on the true UTC instant.
  const offsetMs = tzOffsetMs(timezone, new Date(approxUtc));
  return new Date(approxUtc - offsetMs);
}

/**
 * The inverse — formats a stored UTC Date as the "YYYY-MM-DDTHH:mm" string
 * a `datetime-local` input expects, in the zone's wall-clock time. So
 * re-opening a scheduled post shows (and, on re-save, preserves) the local
 * time it was actually scheduled for, not its raw UTC digits.
 */
function formatForDateTimeLocalInput(date, timezone) {
  if (!date) return '';
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(new Date(date)).map((p) => [p.type, p.value]));
  // Intl's 24-hour format can render midnight as "24" rather than "00".
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

/** "Asia/Karachi (UTC+05:00)" — so a form field can tell the person typing
 * into it which timezone their input will be read in, without them having
 * to already know their own UTC offset. */
function timezoneLabel(timezone, date = new Date()) {
  const totalMinutes = Math.round(tzOffsetMs(timezone, date) / 60000);
  const sign = totalMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(totalMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${timezone} (UTC${sign}${hh}:${mm})`;
}

// zonedTimeToUtc/formatForDateTimeLocalInput/timezoneLabel are not mirrored
// into src/lib/timezone.ts: they exist to fix a `datetime-local` form field
// in this app's own EJS views, and the Next.js app has no such form. Add
// them there only if a real client-side scheduling UI needs them.
module.exports = {
  isValidTimezone,
  organizationTimezone,
  todayBoundsInTimezone,
  zonedTimeToUtc,
  formatForDateTimeLocalInput,
  timezoneLabel,
};
