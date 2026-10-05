/**
 * Calendar time rules (ADR-027 / Phase 12 §33). Pure functions; no database.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const T = require('../utils/calendarTime');

const ZONES = ['UTC', 'America/New_York', 'Asia/Karachi', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];

test('a date-only deadline stays on its calendar day whatever zone the viewer is in', () => {
  const stored = new Date('2026-10-31T00:00:00.000Z'); // how Task / DocumentRequest / USCIS / target dates are stored
  assert.equal(T.dateOnly(stored), '2026-10-31');
  // The projection never looks at a viewer zone, so there is nothing to shift. Prove the window logic agrees for every zone:
  for (const zone of ZONES) {
    const w = T.queryWindow({ from: '2026-10-31', to: '2026-10-31', zone });
    assert.ok(stored >= w.dateFrom && stored <= w.dateTo, `${zone}: date-only value falls in the one-day window`);
    assert.equal(T.dateOnly(w.dateFrom), '2026-10-31');
  }
  // A late-evening local time is a different UTC day, which is exactly why date-only values must not use instants:
  assert.equal(T.dateOnly(new Date('2026-10-31T23:30:00-04:00')), '2026-11-01');
  assert.equal(T.dateOnly(null), null);
  assert.equal(T.dateOnly('not a date'), null);
});

test('a timed instant renders as the right wall-clock time in the selected zone', () => {
  const instant = new Date('2026-10-20T18:30:00.000Z');
  assert.equal(T.instantToLocal(instant, 'UTC'), '2026-10-20T18:30');
  assert.equal(T.instantToLocal(instant, 'America/New_York'), '2026-10-20T14:30'); // EDT, UTC-4
  assert.equal(T.instantToLocal(instant, 'Asia/Karachi'), '2026-10-20T23:30'); // UTC+5, no DST
  assert.equal(T.instantToLocal(instant, 'Asia/Tokyo'), '2026-10-21T03:30'); // next day locally
  assert.equal(T.instantToLocal(null, 'UTC'), null);
});

test('wall-clock to instant is DST-correct in America/New_York', () => {
  // before and after the 2026-03-08 spring-forward (02:00 -> 03:00)
  assert.equal(T.localToInstant('2026-03-07T12:00', 'America/New_York').toISOString(), '2026-03-07T17:00:00.000Z'); // EST
  assert.equal(T.localToInstant('2026-03-09T12:00', 'America/New_York').toISOString(), '2026-03-09T16:00:00.000Z'); // EDT
  // a time that does not exist (02:30 on the gap day) moves forward rather than failing
  assert.equal(T.localToInstant('2026-03-08T02:30', 'America/New_York').toISOString(), '2026-03-08T07:30:00.000Z');
  // fall-back day 2026-11-01: the repeated 01:30 resolves to the first occurrence (EDT)
  assert.equal(T.localToInstant('2026-11-01T01:30', 'America/New_York').toISOString(), '2026-11-01T05:30:00.000Z');
  assert.equal(T.localToInstant('2026-11-02T01:30', 'America/New_York').toISOString(), '2026-11-02T06:30:00.000Z'); // EST again
  // round trip
  for (const local of ['2026-03-09T12:00', '2026-07-04T09:15', '2026-12-25T23:59']) {
    assert.equal(T.instantToLocal(T.localToInstant(local, 'America/New_York'), 'America/New_York'), local);
  }
  // a calendar day is 23 or 25 hours on a DST day, and the window respects that
  const gapDay = T.queryWindow({ from: '2026-03-08', to: '2026-03-08', zone: 'America/New_York' });
  assert.equal((gapDay.instantTo - gapDay.instantFrom + 1) / 3600000, 23);
  const backDay = T.queryWindow({ from: '2026-11-01', to: '2026-11-01', zone: 'America/New_York' });
  assert.equal((backDay.instantTo - backDay.instantFrom + 1) / 3600000, 25);
});

test('local times that cannot be read are refused, not guessed', () => {
  for (const bad of ['2026-10-20', '2026-10-20 14:30', '2026-13-40T10:00', 'tomorrow', '', null, undefined, 42, '2026-10-20T25:00']) {
    assert.equal(T.localToInstant(bad, 'UTC'), null, String(bad));
  }
});

test('IANA zone validation: real zones pass, abbreviations, offsets and junk do not', () => {
  for (const ok of ['UTC', 'America/New_York', 'Asia/Karachi', 'Europe/London', 'Asia/Tokyo']) assert.equal(T.isValidTimezone(ok), true, ok);
  for (const bad of ['EST', 'PST', 'GMT+5', '+05:00', 'Mars/Olympus', 'America/', '', null, undefined, 5, 'new york']) assert.equal(T.isValidTimezone(bad), false, String(bad));
});

test('timezone resolution: employee zone, then practice zone, then UTC; nothing is guessed', () => {
  assert.deepEqual(T.resolveTimeZone('Asia/Karachi', { PRACTICE_TIME_ZONE: 'America/New_York' }), { zone: 'Asia/Karachi', source: 'user' });
  assert.deepEqual(T.resolveTimeZone('', { PRACTICE_TIME_ZONE: 'America/New_York' }), { zone: 'America/New_York', source: 'practice' });
  assert.deepEqual(T.resolveTimeZone(undefined, { PRACTICE_TIME_ZONE: 'Europe/London' }), { zone: 'Europe/London', source: 'practice' });
  assert.deepEqual(T.resolveTimeZone('', {}), { zone: 'UTC', source: 'utc' });
  assert.deepEqual(T.resolveTimeZone('Not/AZone', {}), { zone: 'UTC', source: 'utc' }, 'an invalid stored zone is ignored');
  assert.deepEqual(T.resolveTimeZone('', { PRACTICE_TIME_ZONE: 'EST' }), { zone: 'UTC', source: 'utc' }, 'an invalid practice zone falls to UTC');

  assert.deepEqual(T.practiceTimeZone({}), { value: null, configured: false, invalid: false });
  assert.deepEqual(T.practiceTimeZone({ PRACTICE_TIME_ZONE: 'EST' }), { value: null, configured: false, invalid: true });
  assert.deepEqual(T.practiceTimeZone({ PRACTICE_TIME_ZONE: 'America/New_York' }), { value: 'America/New_York', configured: true, invalid: false });
});

test('query windows are bounded and validated', () => {
  assert.ok(!T.queryWindow({ from: '2026-10-01', to: '2026-10-31', zone: 'UTC' }).error);
  assert.equal(T.queryWindow({ from: '2026-10-01', to: '2026-10-31', zone: 'UTC' }).days, 31);
  assert.ok(!T.queryWindow({ from: '2026-01-01', to: '2026-04-03', zone: 'UTC' }).error, 'exactly 93 days is allowed');
  assert.match(T.queryWindow({ from: '2026-01-01', to: '2026-04-04', zone: 'UTC' }).error, /at most 93 days/);
  assert.match(T.queryWindow({ from: '2000-01-01', to: '2030-01-01', zone: 'UTC' }).error, /at most/, 'no all-history query');
  assert.match(T.queryWindow({ from: '2026-10-31', to: '2026-10-01', zone: 'UTC' }).error, /not be before/);
  for (const bad of [undefined, '', '2026-1-1', 'today', '2026-02-30']) assert.match(T.queryWindow({ from: bad, to: '2026-10-01', zone: 'UTC' }).error, /YYYY-MM-DD/, String(bad));
});

test('calendar-day arithmetic', () => {
  assert.equal(T.daysBetween('2026-10-20', '2026-10-21'), 1);
  assert.equal(T.daysBetween('2026-10-20', '2026-10-20'), 0);
  assert.equal(T.daysBetween('2026-10-20', '2026-10-13'), -7);
  assert.equal(T.daysBetween('2026-03-07', '2026-03-09'), 2, 'unaffected by DST');
  assert.equal(T.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(T.todayInZone('Asia/Tokyo', new Date('2026-10-20T20:00:00Z')), '2026-10-21');
  assert.equal(T.todayInZone('America/New_York', new Date('2026-10-20T20:00:00Z')), '2026-10-20');
  assert.equal(T.isDateString('2026-02-29'), false);
  assert.equal(T.isDateString('2028-02-29'), true);
});
