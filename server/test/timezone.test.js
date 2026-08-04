const test = require('node:test');
const assert = require('node:assert/strict');

const { isValidTimezone, organizationTimezone, todayBoundsInTimezone } = require('../utils/timezone');

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
