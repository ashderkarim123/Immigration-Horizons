import { AdminUser } from "../../src/lib/models/AdminUser";
import { Notification } from "../../src/lib/models/Notification";
import { addSample, emptyReport, noteUnresolved, type Migration } from "./types";

/**
 * Cycle 7 (ADR-006 §1) replaced name-keyed notification recipients with
 * immutable identity fields. Every notification written before that carries
 * only `recipientName` — a display string — and none of
 * `recipientType`/`recipientAdmin`/`recipientClient`.
 *
 * The consequence is not cosmetic. The identity-keyed indexes and every
 * query built on them since Cycle 7 filter on `recipientType`, so a legacy
 * notification is invisible to them: it exists, it is unread, and the
 * recipient will never see it.
 *
 * Matching is by name because a name is all the legacy rows have. That is
 * exactly why this migration refuses to guess: a name that matches two
 * active employees, or none, is left untouched and reported. Attaching a
 * notification to the wrong employee would leak whatever it says about a
 * case to someone who was never on it.
 */
export const migration: Migration = {
  id: "001-notification-recipient-identity",
  description: "Backfill immutable recipient identity onto pre-Cycle-7 notifications.",
  rationale:
    "Legacy notifications are keyed only by display name and are therefore invisible to every " +
    "identity-keyed query written since Cycle 7. Names are resolved to AdminUser ids only when " +
    "exactly one active employee matches; ambiguous and unmatched names are left untouched.",

  async run({ dryRun }) {
    const report = emptyReport();

    // Only rows that have a legacy name and no identity yet. Re-running
    // after a successful pass matches nothing, which is what makes this
    // idempotent rather than merely repeatable.
    const legacy = await Notification.find({
      recipientType: null,
      recipientName: { $nin: [null, ""] },
    })
      .select("_id recipientName recipientId title")
      .lean();

    if (!legacy.length) return report;

    // Resolve every distinct name once rather than per document — a busy
    // deployment can hold thousands of notifications across a handful of
    // employees.
    const names = [...new Set(legacy.map((n) => String(n.recipientName)))];
    const resolution = new Map<string, { id: unknown } | "ambiguous" | "unmatched">();

    for (const name of names) {
      // Case-insensitive, anchored, and escaped: a display name is user
      // input and may contain regex metacharacters.
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matches = await AdminUser.find({
        name: new RegExp(`^${escaped}$`, "i"),
        isActive: true,
      })
        .select("_id")
        .lean();

      if (matches.length === 1) resolution.set(name, { id: matches[0]._id });
      else resolution.set(name, matches.length === 0 ? "unmatched" : "ambiguous");
    }

    for (const notification of legacy) {
      const name = String(notification.recipientName);
      const resolved = resolution.get(name);

      // A legacy row that already carried recipientId can use it directly —
      // it is the same identity these fields are being backfilled with, so
      // trusting it is strictly better than re-deriving from a name.
      const adminId =
        notification.recipientId ?? (resolved && resolved !== "ambiguous" && resolved !== "unmatched"
          ? resolved.id
          : null);

      if (!adminId) {
        noteUnresolved(report, resolved === "ambiguous" ? "name_matches_multiple_employees" : "name_matches_no_active_employee");
        addSample(report, `UNRESOLVED "${name}" — ${String(notification.title || "").slice(0, 40)}`);
        continue;
      }

      report.changed += 1;
      addSample(report, `"${name}" -> employee ${String(adminId)}`);

      if (!dryRun) {
        await Notification.updateOne(
          { _id: notification._id },
          { $set: { recipientType: "employee", recipientAdmin: adminId } },
        );
      }
    }

    return report;
  },
};
