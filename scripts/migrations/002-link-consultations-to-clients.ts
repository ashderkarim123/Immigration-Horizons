import { ClientUser } from "../../src/lib/models/ClientUser";
import { Consultation } from "../../src/lib/models/Consultation";
import { addSample, emptyReport, noteUnresolved, type Migration } from "./types";

/**
 * `Consultation.clientUser` is written in exactly one place — portal
 * activation — and only for the single consultation the invitation was
 * issued against (`src/app/api/portal/activate/route.ts`).
 *
 * The portal lists a client's consultations with
 * `Consultation.find({ clientUser })`, so every other enquiry the same
 * person submitted is invisible to them, and to the admin's client
 * overview, forever. Someone who submitted three enquiries before
 * activating sees one.
 *
 * ## What "verified matching" means here
 *
 * Module 11 requires linking "only through verified matching rules". The
 * rule used is deliberately narrow, because a wrong link exposes one
 * person's immigration enquiry to another:
 *
 *   - the client account must be `active` — activation proves the person
 *     controls that inbox, which is the only verification available;
 *   - the consultation's email must normalise to exactly ONE such account;
 *   - the consultation must not already be linked.
 *
 * A shared or recycled address matching two accounts is left alone. So is
 * anything matching a `pending` account, since a pending account has proven
 * nothing yet.
 *
 * This never unlinks or relinks: an existing `clientUser` is treated as
 * authoritative even if the email now points elsewhere.
 */
function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export const migration: Migration = {
  id: "002-link-consultations-to-clients",
  description: "Link unlinked consultations to the activated client account that owns the address.",
  rationale:
    "Activation links only the one consultation its invitation named, so a client's other " +
    "enquiries never appear in their portal. Links only where the address resolves to exactly " +
    "one ACTIVE client account; shared, ambiguous and pending-account addresses are left alone.",

  async run({ dryRun }) {
    const report = emptyReport();

    const unlinked = await Consultation.find({ clientUser: null })
      .select("_id email name createdAt")
      .lean();

    if (!unlinked.length) return report;

    const addresses = [...new Set(unlinked.map((c) => normalizeEmail(c.email)).filter(Boolean))];

    // One lookup for every candidate address. `normalizedEmail` is unique
    // on ClientUser, so "exactly one active account" is really a status
    // check — but the count is asserted rather than assumed, because the
    // uniqueness index has never been built in production (blocker 1).
    const owners = new Map<string, { id: unknown } | "ambiguous" | "inactive" | "unmatched">();

    for (const address of addresses) {
      const matches = await ClientUser.find({ normalizedEmail: address })
        .select("_id status")
        .lean();

      if (matches.length === 0) {
        owners.set(address, "unmatched");
        continue;
      }
      const active = matches.filter((m) => m.status === "active");
      if (active.length === 1) owners.set(address, { id: active[0]._id });
      else owners.set(address, active.length === 0 ? "inactive" : "ambiguous");
    }

    for (const consultation of unlinked) {
      const address = normalizeEmail(consultation.email);

      if (!address) {
        noteUnresolved(report, "consultation_has_no_email");
        continue;
      }

      const owner = owners.get(address);

      if (!owner || owner === "unmatched") {
        // The overwhelmingly common case: an enquiry from someone who never
        // opened a portal account. Not a problem, and not reported as one.
        report.alreadyDone += 1;
        continue;
      }
      if (owner === "ambiguous" || owner === "inactive") {
        noteUnresolved(
          report,
          owner === "ambiguous"
            ? "address_matches_multiple_active_accounts"
            : "address_matches_only_non_active_accounts",
        );
        addSample(report, `UNRESOLVED ${address} (${owner})`);
        continue;
      }

      report.changed += 1;
      addSample(report, `${address} -> client ${String(owner.id)}`);

      if (!dryRun) {
        // Re-asserting `clientUser: null` in the filter makes this safe to
        // run concurrently with a live activation: whichever writes first
        // wins and the other is a no-op, rather than overwriting a link
        // that was just established.
        await Consultation.updateOne(
          { _id: consultation._id, clientUser: null },
          { $set: { clientUser: owner.id } },
        );
      }
    }

    return report;
  },
};
