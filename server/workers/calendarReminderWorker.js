/**
 * Calendar reminder worker (ADR-027): calls the same reminder service as scripts/runCalendarReminders.js on an interval.
 *
 *   CALENDAR_REMINDERS_ENABLED=true        required, otherwise this process exits without touching the database
 *   CALENDAR_REMINDER_INTERVAL_MS=300000   how often a pass runs (minimum 60000)
 *
 * It keeps no "last run" state. Idempotency lives in the Notification dedupeKey, so overlapping workers, a restart in the
 * middle of a pass, or a repeated pass cannot create a second reminder. A failed pass backs off (doubling up to 15 minutes)
 * and the loop carries on. SIGTERM/SIGINT finish the pass in flight and then close the connection.
 *
 * This is NOT registered in ecosystem.config.js: starting it in an environment is a deliberate, separate step.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const { runReminders } = require('../services/calendarReminderService');

const MIN_INTERVAL_MS = 60 * 1000;
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;

const isEnabled = (env = process.env) => env.CALENDAR_REMINDERS_ENABLED === 'true';
const intervalFrom = (env = process.env) => Math.max(MIN_INTERVAL_MS, Number(env.CALENDAR_REMINDER_INTERVAL_MS) || DEFAULT_INTERVAL_MS);

/**
 * The loop, separated from the process so it can be tested: `run` is one pass, `schedule` is setTimeout.
 * Passes never overlap inside one process; across processes the dedupeKey makes overlap harmless.
 */
function startLoop({ run, intervalMs, log = console.log, schedule = setTimeout, cancel = clearTimeout, maxBackoffMs = MAX_BACKOFF_MS }) {
  let timer = null;
  let stopped = false;
  let current = null;
  let failures = 0;

  const tick = async () => {
    timer = null;
    if (stopped) return;
    let delay = intervalMs;
    current = (async () => {
      try {
        const result = await run();
        failures = 0;
        log(`[calendar-reminders] pass ok: candidates ${result.totals.candidates}, created ${result.totals.created ?? 0}, already sent ${result.totals.alreadySent}`);
      } catch (err) {
        failures += 1;
        delay = Math.min(maxBackoffMs, intervalMs * 2 ** failures);
        log(`[calendar-reminders] pass failed (${err.message}); retrying in ${Math.round(delay / 1000)}s`);
      }
    })();
    await current;
    if (!stopped) timer = schedule(tick, delay);
  };

  timer = schedule(tick, 0);
  return {
    /** Stops scheduling and resolves once any pass in flight has finished. */
    async stop() {
      stopped = true;
      if (timer) cancel(timer);
      await current;
    },
  };
}

async function main() {
  if (!isEnabled()) {
    console.log('[calendar-reminders] CALENDAR_REMINDERS_ENABLED is not "true": worker disabled, exiting.');
    return;
  }
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<') || uri.includes('>')) {
    console.error('[calendar-reminders] MONGODB_URI is not set (or still has placeholder values). Refusing to start.');
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const intervalMs = intervalFrom();
  console.log(`[calendar-reminders] worker started, every ${Math.round(intervalMs / 1000)}s`);

  const loop = startLoop({ run: () => runReminders({ apply: true }), intervalMs });
  const shutdown = async (signal) => {
    console.log(`[calendar-reminders] ${signal}: finishing the current pass and stopping`);
    await loop.stop();
    await mongoose.connection.close();
    process.exit(0);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[calendar-reminders] worker failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { isEnabled, intervalFrom, startLoop, MIN_INTERVAL_MS, DEFAULT_INTERVAL_MS, MAX_BACKOFF_MS };
