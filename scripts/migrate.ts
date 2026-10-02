// Loads .env exactly as scripts/createIndexes.ts does. A tsx script is not
// Next.js: nothing reads the environment file for us, so without this the
// script sees an empty environment and reports every setting as missing —
// which looks identical to a genuinely unconfigured server.
import "dotenv/config";

import mongoose from "mongoose";

import { migration as m001 } from "./migrations/001-notification-recipient-identity";
import { migration as m002 } from "./migrations/002-link-consultations-to-clients";
import { migration as m003 } from "./migrations/003-link-tasks-to-cases";
import type { Migration } from "./migrations/types";

/**
 * Migration runner (ADR-014).
 *
 *   npm run db:migrate                      # DRY RUN — reports, writes nothing
 *   npm run db:migrate -- --apply           # actually writes
 *   npm run db:migrate -- --only 001-...    # one migration
 *
 * Four properties, in the order they matter:
 *
 * 1. **Dry run is the default.** `--apply` is the deliberate act. A runner
 *    that writes unless told otherwise gets run by accident exactly once.
 * 2. **Every migration is idempotent.** Each selects only documents not yet
 *    in the target state, so a second pass reports zero changes. Re-running
 *    after a partial failure is the recovery procedure, not a hazard.
 * 3. **Nothing unresolved is discarded.** A record the migration cannot
 *    resolve safely is counted, sampled, and left exactly as it was.
 * 4. **The target is never guessed.** MONGODB_URI must be set explicitly,
 *    and `--apply` against a production-looking URI additionally requires
 *    `--i-have-a-backup`, because module 11 asks for a backup before
 *    production changes and a flag is the only place that can be enforced.
 */

const MIGRATIONS: Migration[] = [m001, m002, m003];

const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const hasBackupConfirmation = args.includes("--i-have-a-backup");
const onlyIndex = args.indexOf("--only");
const only = onlyIndex !== -1 ? args[onlyIndex + 1] : null;

// Same heuristics as the test-database guard, used for the opposite
// purpose: there, to refuse to run; here, to demand an extra confirmation.
const PRODUCTION_URI_PATTERNS = [
  /mongodb\.net/i,
  /mongodb\+srv:/i,
  /amazonaws\.com/i,
  /azure\.com/i,
  /gcp\.mongodb/i,
  /[/?]prod(uction)?[./?]/i,
];

function looksLikeProduction(uri: string): boolean {
  return PRODUCTION_URI_PATTERNS.some((pattern) => pattern.test(uri));
}

function redact(uri: string): string {
  return uri.replace(/\/\/[^@/]+@/, "//<redacted>@");
}

async function run() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes("<") || uri.includes(">")) {
    console.error(
      "[db:migrate] MONGODB_URI is not set (or still holds placeholder values). Refusing to run — " +
        "a migration must be pointed at a database explicitly, never a guess.",
    );
    process.exit(1);
  }

  const production = looksLikeProduction(uri);

  if (isApply && production && !hasBackupConfirmation) {
    console.error(
      `[db:migrate] ${redact(uri)} looks like a production database.\n` +
        "Take a backup first (DEPLOYMENT.md Part 8), then re-run with --i-have-a-backup.\n" +
        "Refusing to write until then.",
    );
    process.exit(1);
  }

  const selected = only ? MIGRATIONS.filter((m) => m.id === only) : MIGRATIONS;

  if (only && !selected.length) {
    console.error(
      `[db:migrate] No migration with id "${only}". Known ids:\n` +
        MIGRATIONS.map((m) => `  - ${m.id}`).join("\n"),
    );
    process.exit(1);
  }

  console.log(`[db:migrate] Target: ${redact(uri)}${production ? "  (looks like PRODUCTION)" : ""}`);
  console.log(`[db:migrate] Mode:   ${isApply ? "APPLY — this will write" : "DRY RUN — nothing will be written"}`);
  console.log(`[db:migrate] Running ${selected.length} migration(s).`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

  let totalChanged = 0;
  let totalUnresolved = 0;

  for (const migration of selected) {
    console.log(`\n${"=".repeat(72)}\n${migration.id}\n${"=".repeat(72)}`);
    console.log(`${migration.description}\n`);
    console.log(`Why: ${migration.rationale}\n`);

    const started = Date.now();
    const report = await migration.run({ dryRun: !isApply });
    const elapsed = Date.now() - started;

    totalChanged += report.changed;
    totalUnresolved += report.unresolved;

    console.log(
      `  ${isApply ? "changed" : "would change"}: ${report.changed}\n` +
        `  already correct:  ${report.alreadyDone}\n` +
        `  UNRESOLVED:       ${report.unresolved}\n` +
        `  took:             ${elapsed}ms`,
    );

    if (report.unresolved) {
      console.log("\n  Unresolved, by reason (these records were NOT touched):");
      for (const [reason, count] of Object.entries(report.unresolvedReasons)) {
        console.log(`    ${reason}: ${count}`);
      }
    }

    if (report.samples.length) {
      console.log("\n  Samples:");
      for (const sample of report.samples) console.log(`    ${sample}`);
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  if (isApply) {
    console.log(`[db:migrate] Applied. ${totalChanged} document(s) changed, ${totalUnresolved} left unresolved.`);
    if (totalUnresolved) {
      console.log(
        "[db:migrate] Unresolved records were deliberately left untouched — a wrong link is worse " +
          "than a missing one. Resolve them by hand, or leave them; re-running is safe either way.",
      );
    }
  } else {
    console.log(
      `[db:migrate] Dry run complete. ${totalChanged} document(s) WOULD change, ` +
        `${totalUnresolved} would be left unresolved.\n` +
        "[db:migrate] Nothing was written. Re-run with --apply when the numbers look right.",
    );
  }

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error("[db:migrate] Failed:", err instanceof Error ? err.message : err);
  // A migration that dies mid-run leaves the documents it already changed
  // changed. Every migration here is idempotent precisely so that re-running
  // is the recovery, rather than a restore.
  console.error("[db:migrate] Re-running is safe: every migration only selects documents not already migrated.");
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
