import mongoose from "mongoose";

import { SecurityEvent } from "../src/lib/models/SecurityEvent";
import { PasswordResetToken } from "../src/lib/models/PasswordResetToken";
import { PortalInvitation } from "../src/lib/models/PortalInvitation";
import contract from "../docs/architecture/security-event-contract.json" with { type: "json" };

/**
 * Retention purge (ADR-014 §3), implementing the periods defined in
 * docs/security/DATA_RETENTION.md.
 *
 *   npm run db:purge                          # DRY RUN — counts only
 *   npm run db:purge -- --apply --i-have-a-backup
 *
 * ## Why this is a script and not a TTL index
 *
 * `security_events` deliberately has no TTL index. An audit log that
 * deletes itself on a schedule is worse than one that grows: the deletion
 * is invisible, unreviewable, and happens exactly when an investigation
 * might need the oldest record. Module 11 says the same thing more plainly
 * — "do not implement automatic deletion until policy is approved".
 *
 * So this is a reviewed, manual operation that reports before it deletes.
 *
 * ## Why the model's append-only guard does not block it
 *
 * `SecurityEvent` refuses deletes through Mongoose — that guard exists to
 * stop application code quietly rewriting history (ADR-012 §1), and it must
 * stay. A purge is the one legitimate exception, so it goes through the raw
 * driver collection, below the model layer, where the intent is explicit
 * and impossible to trigger by accident from a route handler.
 */

const args = process.argv.slice(2);
const isApply = args.includes("--apply");
const hasBackupConfirmation = args.includes("--i-have-a-backup");

const daysIndex = args.indexOf("--older-than-days");
const overrideDays = daysIndex !== -1 ? Number(args[daysIndex + 1]) : null;

const RETENTION_DAYS = contract.retentionDays; // 400
const DAY_MS = 24 * 60 * 60 * 1000;

const PRODUCTION_URI_PATTERNS = [
  /mongodb\.net/i,
  /mongodb\+srv:/i,
  /amazonaws\.com/i,
  /azure\.com/i,
  /gcp\.mongodb/i,
  /[/?]prod(uction)?[./?]/i,
];

function redact(uri: string): string {
  return uri.replace(/\/\/[^@/]+@/, "//<redacted>@");
}

async function run() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes("<") || uri.includes(">")) {
    console.error("[db:purge] MONGODB_URI is not set (or holds placeholders). Refusing to run.");
    process.exit(1);
  }

  const days = overrideDays ?? RETENTION_DAYS;

  if (!Number.isFinite(days) || days <= 0) {
    console.error(`[db:purge] --older-than-days must be a positive number (got ${String(overrideDays)}).`);
    process.exit(1);
  }

  // Shortening the audit window is the one thing here that destroys
  // evidence rather than tidying it, so it cannot be done by a stray flag.
  if (days < RETENTION_DAYS) {
    console.error(
      `[db:purge] Refusing to purge security events younger than the ${RETENTION_DAYS}-day retention ` +
        `period defined in docs/security/DATA_RETENTION.md (you asked for ${days}).\n` +
        "Change the policy document first, and the contract fixture with it — not this invocation.",
    );
    process.exit(1);
  }

  const production = PRODUCTION_URI_PATTERNS.some((p) => p.test(uri));
  if (isApply && production && !hasBackupConfirmation) {
    console.error(
      `[db:purge] ${redact(uri)} looks like a production database.\n` +
        "Snapshot security_events first (DEPLOYMENT.md Part 8) — deletions here are not recoverable " +
        "from the application — then re-run with --i-have-a-backup.",
    );
    process.exit(1);
  }

  const cutoff = new Date(Date.now() - days * DAY_MS);

  console.log(`[db:purge] Target: ${redact(uri)}${production ? "  (looks like PRODUCTION)" : ""}`);
  console.log(`[db:purge] Mode:   ${isApply ? "APPLY — this will delete" : "DRY RUN — nothing will be deleted"}`);
  console.log(`[db:purge] Cutoff: ${cutoff.toISOString()} (${days} days)\n`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

  // The raw driver collection, deliberately — see the module comment.
  const securityEvents = mongoose.connection.collection(
    SecurityEvent.collection.collectionName,
  );

  const targets = [
    {
      label: `security_events older than ${days} days`,
      count: () => securityEvents.countDocuments({ createdAt: { $lt: cutoff } }),
      remove: () => securityEvents.deleteMany({ createdAt: { $lt: cutoff } }),
      note: "Audit history. Snapshot before deleting; it cannot be reconstructed.",
    },
    {
      // These have TTL indexes, so this is a safety net for a deployment
      // where the indexes have never been built — which is exactly the
      // state deployment blocker 1 describes.
      label: "expired password reset tokens",
      count: () => PasswordResetToken.collection.countDocuments({ expiresAt: { $lt: new Date() } }),
      remove: () => PasswordResetToken.collection.deleteMany({ expiresAt: { $lt: new Date() } }),
      note: "Single-use and TTL-indexed already; this only matters if the index was never built.",
    },
    {
      label: "expired portal invitations",
      count: () => PortalInvitation.collection.countDocuments({ expiresAt: { $lt: new Date() } }),
      remove: () => PortalInvitation.collection.deleteMany({ expiresAt: { $lt: new Date() } }),
      note: "Same — TTL-indexed, so normally a no-op.",
    },
  ];

  let total = 0;

  for (const target of targets) {
    const count = await target.count();
    total += count;

    console.log(`  ${isApply ? "deleting" : "would delete"}: ${String(count).padStart(7)}  ${target.label}`);
    console.log(`      ${target.note}`);

    if (isApply && count > 0) {
      const result = await target.remove();
      console.log(`      -> deleted ${result.deletedCount}`);
    }
  }

  console.log(
    `\n[db:purge] ${isApply ? "Done" : "Dry run complete"}. ${total} document(s) ` +
      `${isApply ? "removed" : "would be removed"}.`,
  );
  if (!isApply && total > 0) {
    console.log("[db:purge] Nothing was deleted. Re-run with --apply --i-have-a-backup when ready.");
  }

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error("[db:purge] Failed:", err instanceof Error ? err.message : err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
