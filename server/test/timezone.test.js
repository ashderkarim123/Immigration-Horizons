const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidTimezone,
  organizationTimezone,
  todayBoundsInTimezone,
  zonedTimeToUtc,
  formatForDateTimeLocalInput,
  timezoneLabel,
} = require('../utils/timezone');

test('isValidTimezone accepts real IANA Area/Location identifiers', () => {
  assert.equal(isValidTimezone('Asia/Karachi'), true);
  assert.equal(isValidTimezone('America/New_York'), true);
  assert.equal(isValidTimezone('Europe/London'), true);
  assert.equal(isValidTimezone('UTC'), true);
});

test('isValidTimezone rejects fixed-offset abbreviations like EST/PST', () => {
  assert.equal(isValidTimezone('EST'), false);
  assert.equal(isValidTimezone('PST'), false);
  assert.equal(isValidTimezone('GMT'), false);
});

test('isValidTimezone rejects garbage input', () => {
  assert.equal(isValidTimezone('Not/AZone'), false);
  assert.equal(isValidTimezone(''), false);
  assert.equal(isValidTimezone(null), false);
  assert.equal(isValidTimezone(undefined), false);
  assert.equal(isValidTimezone(123), false);
});

test('organizationTimezone defaults to UTC when APP_TIMEZONE is unset', () => {
  const original = process.env.APP_TIMEZONE;
  delete process.env.APP_TIMEZONE;
  try {
    assert.equal(organizationTimezone(), 'UTC');
  } finally {
    if (original !== undefined) process.env.APP_TIMEZONE = original;
  }
});

test('organizationTimezone uses APP_TIMEZONE when valid', () => {
  const original = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = 'Asia/Karachi';
  try {
    assert.equal(organizationTimezone(), 'Asia/Karachi');
  } finally {
    if (original === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = original;
  }
});

test('organizationTimezone falls back to UTC when APP_TIMEZONE is invalid', () => {
  const original = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = 'EST';
  try {
    assert.equal(organizationTimezone(), 'UTC');
  } finally {
    if (original === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = original;
  }
});

test('todayBoundsInTimezone computes correct UTC bounds for a fixed-offset zone (Asia/Karachi, UTC+5, no DST)', () => {
  const now = new Date('2026-08-04T10:00:00Z');
  const { start, end } = todayBoundsInTimezone('Asia/Karachi', now);
  assert.equal(start.toISOString(), '2026-08-03T19:00:00.000Z');
  assert.equal(end.toISOString(), '2026-08-04T19:00:00.000Z');
});

test('todayBoundsInTimezone is DST-aware for a zone that observes it (America/New_York, EDT in August)', () => {
  const now = new Date('2026-08-04T10:00:00Z');
  const { start, end } = todayBoundsInTimezone('America/New_York', now);
  // EDT is UTC-4 in August.
  assert.equal(start.toISOString(), '2026-08-04T04:00:00.000Z');
  assert.equal(end.toISOString(), '2026-08-05T04:00:00.000Z');
});

test('todayBoundsInTimezone bounds are exactly 24 hours apart', () => {
  const { start, end } = todayBoundsInTimezone('America/New_York', new Date('2026-11-02T12:00:00Z'));
  assert.equal(end.getTime() - start.getTime(), 24 * 60 * 60 * 1000);
});

test('zonedTimeToUtc reproduces the exact scheduling bug: "23:26" in Asia/Karachi is 18:26 UTC, not 23:26 UTC', () => {
  // The real value that shipped a post ~5 hours later than intended: an
  // editor in Pakistan typed "publish now" (23:26 local) into a
  // datetime-local field, and the old code stored it as 23:26 UTC.
  const utc = zonedTimeToUtc('2026-09-04T23:26', 'Asia/Karachi');
  assert.equal(utc.toISOString(), '2026-09-04T18:26:00.000Z');
});

test('zonedTimeToUtc is DST-aware (America/New_York, EDT in August is UTC-4)', () => {
  const utc = zonedTimeToUtc('2026-08-04T09:00', 'America/New_York');
  assert.equal(utc.toISOString(), '2026-08-04T13:00:00.000Z');
});

test('zonedTimeToUtc treats UTC as a no-op', () => {
  const utc = zonedTimeToUtc('2026-09-04T23:26', 'UTC');
  assert.equal(utc.toISOString(), '2026-09-04T23:26:00.000Z');
});

test('zonedTimeToUtc returns null for empty or malformed input', () => {
  assert.equal(zonedTimeToUtc('', 'Asia/Karachi'), null);
  assert.equal(zonedTimeToUtc(undefined, 'Asia/Karachi'), null);
  assert.equal(zonedTimeToUtc('not-a-date', 'Asia/Karachi'), null);
});

test('formatForDateTimeLocalInput is the exact inverse of zonedTimeToUtc', () => {
  const utc = zonedTimeToUtc('2026-09-04T23:26', 'Asia/Karachi');
  assert.equal(formatForDateTimeLocalInput(utc, 'Asia/Karachi'), '2026-09-04T23:26');
});

test('formatForDateTimeLocalInput returns an empty string for a falsy date', () => {
  assert.equal(formatForDateTimeLocalInput(null, 'Asia/Karachi'), '');
  assert.equal(formatForDateTimeLocalInput(undefined, 'Asia/Karachi'), '');
});

test('timezoneLabel shows the zone name and its current UTC offset', () => {
  const now = new Date('2026-09-04T12:00:00Z');
  assert.equal(timezoneLabel('Asia/Karachi', now), 'Asia/Karachi (UTC+05:00)');
  assert.equal(timezoneLabel('UTC', now), 'UTC (UTC+00:00)');
});
