/**
 * Calendar time rules (ADR-027). All zone arithmetic goes through Luxon; nothing here parses locale strings.
 *
 * Two kinds of value, deliberately kept apart:
 *  - date-only deadlines (task / document request / USCIS response / target filing): stored as a Mongo Date whose UTC
 *    calendar date IS the date. They are projected as "YYYY-MM-DD" and never shifted by any viewer's timezone.
 *  - exact instants (appointments, timed events): UTC instants, rendered in a selected IANA zone.
 */
const { DateTime } = require('luxon');
const { isValidTimezone } = require('./timezone');

const MAX_RANGE_DAYS = 93;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The firm's fallback zone from PRACTICE_TIME_ZONE. Absent or invalid means "not configured" (UTC is used, never a guessed region). */
function practiceTimeZone(env = process.env) {
  const configured = env.PRACTICE_TIME_ZONE;
  if (configured && isValidTimezone(configured)) return { value: configured, configured: true, invalid: false };
  return { value: null, configured: false, invalid: !!configured };
}

/** employee zone -> practice zone -> UTC. Never inferred from an IP address. */
function resolveTimeZone(userZone, env = process.env) {
  if (userZone && isValidTimezone(userZone)) return { zone: userZone, source: 'user' };
  const practice = practiceTimeZone(env);
  if (practice.value) return { zone: practice.value, source: 'practice' };
  return { zone: 'UTC', source: 'utc' };
}

const isDateString = (s) => typeof s === 'string' && DATE_PATTERN.test(s) && DateTime.fromISO(s, { zone: 'utc' }).isValid;

/** "YYYY-MM-DD" (UTC calendar date) of a stored date-only value, or null. */
function dateOnly(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : DateTime.fromJSDate(d, { zone: 'utc' }).toISODate();
}

/** Date at UTC midnight for a "YYYY-MM-DD" string. */
const dateStringToUtc = (s) => DateTime.fromISO(s, { zone: 'utc' }).toJSDate();

/** Wall-clock "YYYY-MM-DDTHH:mm" in an IANA zone to the exact UTC instant, or null if it cannot be read. */
function localToInstant(local, zone) {
  if (typeof local !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(local)) return null;
  const dt = DateTime.fromISO(local, { zone });
  return dt.isValid ? dt.toJSDate() : null;
}

/** The inverse of localToInstant: an instant as wall-clock "YYYY-MM-DDTHH:mm" in the zone (used to prefill the editor). */
function instantToLocal(instant, zone) {
  return instant ? DateTime.fromJSDate(new Date(instant), { zone }).toFormat("yyyy-LL-dd'T'HH:mm") : null;
}

/** "Tue, Oct 20 at 2:30 PM EDT": an instant as a person in `zone` would read it (used in reminder text). */
const formatInstant = (instant, zone) => DateTime.fromJSDate(new Date(instant), { zone }).setLocale('en-US').toFormat("ccc, LLL d 'at' h:mm a ZZZZ");

/** Today's calendar date in a zone. */
const todayInZone = (zone, now = new Date()) => DateTime.fromJSDate(now, { zone }).toISODate();

/** Whole calendar days from `a` to `b` ("YYYY-MM-DD"); negative when b is earlier. */
const daysBetween = (a, b) => Math.round(DateTime.fromISO(b, { zone: 'utc' }).diff(DateTime.fromISO(a, { zone: 'utc' }), 'days').days);

const addDays = (dateStr, n) => DateTime.fromISO(dateStr, { zone: 'utc' }).plus({ days: n }).toISODate();

/**
 * A bounded query window. `from`/`to` are inclusive calendar dates in the viewer's zone. Date-only sources are compared
 * by UTC date; exact instants by [start of `from`, end of `to`] in that zone. An unbounded or oversized range is refused.
 */
function queryWindow({ from, to, zone, maxDays = MAX_RANGE_DAYS }) {
  if (!isDateString(from) || !isDateString(to)) return { error: 'from and to must be dates in the form YYYY-MM-DD.' };
  if (to < from) return { error: 'to must not be before from.' };
  const days = daysBetween(from, to) + 1;
  if (days > maxDays) return { error: `The range may cover at most ${maxDays} days.` };
  return {
    from,
    to,
    days,
    dateFrom: dateStringToUtc(from),
    dateTo: dateStringToUtc(to),
    instantFrom: DateTime.fromISO(from, { zone }).startOf('day').toJSDate(),
    instantTo: DateTime.fromISO(to, { zone }).endOf('day').toJSDate(),
  };
}

module.exports = {
  MAX_RANGE_DAYS,
  isValidTimezone,
  practiceTimeZone,
  resolveTimeZone,
  isDateString,
  dateOnly,
  dateStringToUtc,
  localToInstant,
  instantToLocal,
  formatInstant,
  todayInZone,
  daysBetween,
  addDays,
  queryWindow,
};
