/**
 * One calendar reminder pass (ADR-027), by hand. DRY RUN by default: it reads the authoritative sources and prints how many
 * reminders it WOULD create, by source and bucket, and writes nothing (not even a default preference row). Output is counts
 * only: never a case, client, task, receipt or recipient name.
 *
 *   node scripts/runCalendarReminders.js            # dry run
 *   node scripts/runCalendarReminders.js --apply    # create the notifications (idempotent; safe to repeat)
 *
 * Review a dry run before enabling the worker anywhere. Never point a first run at production without a backup and review.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const { runReminders } = require('../services/calendarReminderService');

const redact = (uri) => uri.replace(/\/\/[^@/]+@/, '//<redacted>@');

/** Runs one pass against the current connection and logs safe counts. Exported so tests use a disposable database. */
async function run({ apply = false, now = new Date(), log = console.log } = {}) {
  const result = await runReminders({ apply, now });
  const verb = apply ? 'created' : 'would create';
  const made = apply ? result.totals.created : result.totals.wouldCreate;
  log(`[calendar-reminders] Mode: ${apply ? 'APPLY (writes notifications)' : 'DRY RUN (writes nothing)'}`);
  log(`[calendar-reminders] Candidates ${result.totals.candidates}; ${verb} ${made}; already sent ${result.totals.alreadySent}; skipped by preference ${result.totals.skippedByPreference}.`);
  for (const [source, counts] of Object.entries(result.bySource)) {
    log(`[calendar-reminders]   ${source}: candidates ${counts.candidates}, ${verb} ${apply ? counts.created : counts.wouldCreate}`);
  }
  const buckets = Object.entries(result.byBucket).map(([b, n]) => `${b}=${n}`).join(', ');
  log(`[calendar-reminders] By bucket: ${buckets || 'none'}.`);
  if (!apply) log('[calendar-reminders] Dry run only. Re-run with --apply to create these notifications.');
  return result;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<') || uri.includes('>')) {
    console.error('[calendar-reminders] MONGODB_URI is not set (or still has placeholder values). Refusing to run.');
    process.exit(1);
  }
  console.log(`[calendar-reminders] Target: ${redact(uri)}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    await run({ apply: process.argv.includes('--apply') });
  } finally {
    await mongoose.connection.close();
  }
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      console.error('[calendar-reminders] Failed:', err.message);
      process.exit(1);
    },
  );
}

module.exports = { run };
