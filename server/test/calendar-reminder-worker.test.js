/**
 * Reminder buckets (pure) and the worker loop (no database): disabled by default, never overlaps itself, backs off on
 * failure, stops cleanly. The worker keeps no "last run" state, so there is nothing else to test here: duplicate safety
 * is the Notification dedupeKey, covered against a real database in calendar-reminders.integration.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { deadlineBucket, timedBucket, OVERDUE_LOOKBACK_DAYS } = require('../services/calendarReminderService');
const worker = require('../workers/calendarReminderWorker');

test('deadline buckets: 7 days, tomorrow, today, overdue; nothing further out or long past', () => {
  const today = '2026-10-14';
  const expected = { '2026-10-22': null, '2026-10-21': 'due_within_7_days', '2026-10-16': 'due_within_7_days', '2026-10-15': 'due_tomorrow', '2026-10-14': 'due_today', '2026-10-13': 'overdue' };
  for (const [date, bucket] of Object.entries(expected)) assert.equal(deadlineBucket(date, today), bucket, date);
  assert.equal(deadlineBucket('2026-09-30', today), 'overdue', 'exactly the lookback is still reminded');
  assert.equal(deadlineBucket('2026-09-29', today), null, 'beyond the lookback is not');
  assert.equal(OVERDUE_LOOKBACK_DAYS, 14);
});

test('deadline buckets count calendar days across a DST change, not 24-hour blocks', () => {
  assert.equal(deadlineBucket('2026-03-09', '2026-03-08'), 'due_tomorrow');
  assert.equal(deadlineBucket('2026-11-02', '2026-11-01'), 'due_tomorrow');
});

test('timed buckets: within 1 hour, within 24 hours, otherwise none; past is never reminded', () => {
  const now = new Date('2026-10-14T12:00:00Z');
  const at = (ms) => new Date(now.getTime() + ms);
  assert.equal(timedBucket(at(30 * 60000), now), 'within_1_hour');
  assert.equal(timedBucket(at(60 * 60000), now), 'within_1_hour');
  assert.equal(timedBucket(at(60 * 60000 + 1), now), 'within_24_hours');
  assert.equal(timedBucket(at(24 * 3600000), now), 'within_24_hours');
  assert.equal(timedBucket(at(24 * 3600000 + 1), now), null);
  assert.equal(timedBucket(now, now), null);
  assert.equal(timedBucket(at(-60000), now), null);
});

test('the worker is disabled unless CALENDAR_REMINDERS_ENABLED is exactly "true", and the interval has a floor', () => {
  for (const v of [undefined, '', 'false', 'TRUE', '1', 'yes']) assert.equal(worker.isEnabled({ CALENDAR_REMINDERS_ENABLED: v }), false, String(v));
  assert.equal(worker.isEnabled({ CALENDAR_REMINDERS_ENABLED: 'true' }), true);
  assert.equal(worker.intervalFrom({}), worker.DEFAULT_INTERVAL_MS);
  assert.equal(worker.intervalFrom({ CALENDAR_REMINDER_INTERVAL_MS: '300000' }), 300000);
  assert.equal(worker.intervalFrom({ CALENDAR_REMINDER_INTERVAL_MS: '10' }), worker.MIN_INTERVAL_MS);
  assert.equal(worker.intervalFrom({ CALENDAR_REMINDER_INTERVAL_MS: 'abc' }), worker.DEFAULT_INTERVAL_MS);
});

/** A manual scheduler: the test decides when the next pass fires, so nothing waits on a real clock. */
function manualClock() {
  const pending = [];
  return {
    schedule: (fn, ms) => {
      const entry = { fn, ms, cancelled: false };
      pending.push(entry);
      return entry;
    },
    cancel: (entry) => {
      entry.cancelled = true;
    },
    next: () => pending.filter((p) => !p.cancelled && !p.fired).at(-1),
    async fire() {
      const entry = this.next();
      entry.fired = true;
      await entry.fn();
      return entry;
    },
  };
}
const ok = { totals: { candidates: 1, created: 1, alreadySent: 0 } };

test('the loop runs a pass, then waits the interval; a failure backs off and the loop carries on', async () => {
  const clock = manualClock();
  const logs = [];
  let calls = 0;
  const loop = worker.startLoop({
    run: async () => {
      calls += 1;
      if (calls === 1 || calls === 2) throw new Error('db down');
      return ok;
    },
    intervalMs: 60000,
    log: (l) => logs.push(l),
    schedule: clock.schedule,
    cancel: clock.cancel,
  });

  assert.equal(clock.next().ms, 0, 'the first pass runs immediately');
  await clock.fire();
  assert.deepEqual([calls, clock.next().ms], [1, 120000], 'first failure: double the interval');
  await clock.fire();
  assert.deepEqual([calls, clock.next().ms], [2, 240000], 'second failure: doubles again');
  await clock.fire();
  assert.deepEqual([calls, clock.next().ms], [3, 60000], 'success resets to the normal interval');
  assert.ok(logs.some((l) => /pass failed \(db down\)/.test(l)) && logs.some((l) => /pass ok/.test(l)));
  await loop.stop();
});

test('backoff is capped', async () => {
  const clock = manualClock();
  worker.startLoop({ run: async () => { throw new Error('x'); }, intervalMs: 600000, log: () => {}, schedule: clock.schedule, cancel: clock.cancel, maxBackoffMs: 900000 });
  await clock.fire();
  assert.equal(clock.next().ms, 900000);
  await clock.fire();
  assert.equal(clock.next().ms, 900000);
});

test('stop waits for the pass in flight, schedules nothing more, and passes never overlap', async () => {
  const clock = manualClock();
  let release;
  let running = 0;
  let maxRunning = 0;
  const loop = worker.startLoop({
    run: () => new Promise((resolve) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      release = () => { running -= 1; resolve(ok); };
    }),
    intervalMs: 60000,
    log: () => {},
    schedule: clock.schedule,
    cancel: clock.cancel,
  });

  const firing = clock.fire();
  let stopped = false;
  const stopping = loop.stop().then(() => { stopped = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(stopped, false, 'stop does not resolve while a pass is running');
  release();
  await Promise.all([firing, stopping]);
  assert.equal(stopped, true);
  assert.equal(maxRunning, 1);
  assert.equal(clock.next(), undefined, 'nothing is scheduled after stop');
});

test('the worker is not registered with PM2 and the production default is off', () => {
  const root = path.join(__dirname, '../..');
  for (const f of ['ecosystem.config.js', 'server/ecosystem.config.js']) {
    const file = path.join(root, f);
    if (fs.existsSync(file)) assert.ok(!/calendarReminderWorker|ih-reminders/.test(fs.readFileSync(file, 'utf8')), `${f} must not start the worker`);
  }
  assert.match(fs.readFileSync(path.join(root, 'server/.env.example'), 'utf8'), /^CALENDAR_REMINDERS_ENABLED=false$/m);
});
