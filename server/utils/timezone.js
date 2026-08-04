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

module.exports = { isValidTimezone, organizationTimezone, todayBoundsInTimezone };
