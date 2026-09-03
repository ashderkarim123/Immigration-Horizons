import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";

import { AdminUser } from "../src/lib/models/AdminUser";
import { ClientUser } from "../src/lib/models/ClientUser";
import { Consultation } from "../src/lib/models/Consultation";
import { Notification } from "../src/lib/models/Notification";
import { hashPassword } from "../src/lib/auth/crypto";

import { migration as recipientIdentity } from "../scripts/migrations/001-notification-recipient-identity";
import { migration as linkConsultations } from "../scripts/migrations/002-link-consultations-to-clients";

/**
 * Migration tests (ADR-014).
 *
 * Two properties get the most attention here, because they are the ones
 * that turn a migration from a chore into an incident:
 *
 *   - **idempotency** — a second pass must change nothing;
 *   - **refusing to guess** — an ambiguous record must be left exactly as
 *     it was, not linked to a best guess. A wrong link on either of these
 *     migrations exposes one person's case activity or immigration enquiry
 *     to someone else.
 */

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

let counter = 0;

async function seedEmployee(name: string, isActive = true) {
  counter += 1;
  return AdminUser.create({
    name,
    email: `emp-${Date.now()}-${counter}@example.com`,
    password: "hashed-elsewhere",
    role: "pm",
    isActive,
  });
}

async function seedClient(email: string, status = "active") {
  return ClientUser.create({
    email,
    normalizedEmail: email.trim().toLowerCase(),
    firstName: "Test",
    lastName: "Client",
    passwordHash: await hashPassword("correct-horse-battery-staple"),
    status,
  });
}

async function seedLegacyNotification(recipientName: string, extra: Record<string, unknown> = {}) {
  // Written through the driver so the Cycle 7 identity fields are genuinely
  // absent, exactly as a pre-Cycle-7 row would be.
  const result = await Notification.collection.insertOne({
    type: "task_assigned",
    title: "A legacy notification",
    message: "written before Cycle 7",
    recipientName,
    recipientId: null,
    recipientType: null,
    recipientAdmin: null,
    recipientClient: null,
    read: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  });
  return result.insertedId;
}

async function seedConsultation(email: string, overrides: Record<string, unknown> = {}) {
  return Consultation.create({
    name: "Jane Applicant",
    email,
    message: "Looking for EB-2 NIW help.",
    service: "EB-2 NIW",
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// 001 — notification recipient identity
// ---------------------------------------------------------------------------

test("001: a legacy notification is linked to the one employee whose name matches", async () => {
  const employee = await seedEmployee("Rahat Ahmed");
  const id = await seedLegacyNotification("Rahat Ahmed");

  const report = await recipientIdentity.run({ dryRun: false });
  assert.equal(report.changed, 1);
  assert.equal(report.unresolved, 0);

  const migrated = await Notification.collection.findOne({ _id: id });
  assert.equal(migrated!.recipientType, "employee");
  assert.equal(String(migrated!.recipientAdmin), String(employee._id));
});

test("001: a dry run reports the same change but writes nothing", async () => {
  await seedEmployee("Rahat Ahmed");
  const id = await seedLegacyNotification("Rahat Ahmed");

  const report = await recipientIdentity.run({ dryRun: true });
  assert.equal(report.changed, 1);

  const untouched = await Notification.collection.findOne({ _id: id });
  assert.equal(untouched!.recipientType, null, "a dry run must not write");
});

test("001: running twice changes nothing the second time", async () => {
  await seedEmployee("Rahat Ahmed");
  await seedLegacyNotification("Rahat Ahmed");

  const first = await recipientIdentity.run({ dryRun: false });
  const second = await recipientIdentity.run({ dryRun: false });

  assert.equal(first.changed, 1);
  assert.equal(second.changed, 0, "idempotency: the second pass must find nothing to do");
});

test("001: an ambiguous name is left untouched and reported, never guessed", async () => {
  // Two active employees share a display name. Picking one would attach a
  // case notification to someone who was never on the case.
  await seedEmployee("Alex Morgan");
  await seedEmployee("Alex Morgan");
  const id = await seedLegacyNotification("Alex Morgan");

  const report = await recipientIdentity.run({ dryRun: false });

  assert.equal(report.changed, 0);
  assert.equal(report.unresolved, 1);
  assert.equal(report.unresolvedReasons.name_matches_multiple_employees, 1);

  const untouched = await Notification.collection.findOne({ _id: id });
  assert.equal(untouched!.recipientType, null, "an ambiguous record must be left exactly as it was");
});

test("001: a name matching only a deactivated employee is not resolved", async () => {
  await seedEmployee("Departed Person", false);
  await seedLegacyNotification("Departed Person");

  const report = await recipientIdentity.run({ dryRun: false });
  assert.equal(report.changed, 0);
  assert.equal(report.unresolvedReasons.name_matches_no_active_employee, 1);
});

test("001: an existing recipientId is trusted over re-deriving from a name", async () => {
  // A row that already carries the id is better evidence than its display
  // string, and must be used even when the name is ambiguous.
  const real = await seedEmployee("Alex Morgan");
  await seedEmployee("Alex Morgan");
  const id = await seedLegacyNotification("Alex Morgan", { recipientId: real._id });

  const report = await recipientIdentity.run({ dryRun: false });
  assert.equal(report.changed, 1);
  assert.equal(report.unresolved, 0);

  const migrated = await Notification.collection.findOne({ _id: id });
  assert.equal(String(migrated!.recipientAdmin), String(real._id));
});

test("001: a name with regex metacharacters is matched literally, not executed", async () => {
  // Display names are user input; an unescaped name would be a regex.
  await seedEmployee("A.C (Ops)");
  await seedLegacyNotification("A.C (Ops)");

  const report = await recipientIdentity.run({ dryRun: false });
  assert.equal(report.changed, 1);

  // And a name that would match if treated as a pattern must not resolve.
  await clearCollections();
  await seedEmployee("AXC (Ops)");
  await seedLegacyNotification("A.C (Ops)");
  const second = await recipientIdentity.run({ dryRun: false });
  assert.equal(second.changed, 0, "'.' must be a literal dot, not any-character");
});

test("001: a notification already carrying identity is never re-processed", async () => {
  const employee = await seedEmployee("Rahat Ahmed");
  await Notification.create({
    type: "task_assigned",
    title: "Modern notification",
    message: "written after Cycle 7",
    recipientType: "employee",
    recipientAdmin: employee._id,
    recipientName: "Rahat Ahmed",
  });

  const report = await recipientIdentity.run({ dryRun: false });
  assert.equal(report.changed, 0);
  assert.equal(report.unresolved, 0);
});

// ---------------------------------------------------------------------------
// 002 — consultation to client linking
// ---------------------------------------------------------------------------

test("002: an unlinked consultation is linked to the active account owning the address", async () => {
  const client = await seedClient("jane@example.com");
  const consultation = await seedConsultation("jane@example.com");

  const report = await linkConsultations.run({ dryRun: false });
  assert.equal(report.changed, 1);

  const linked = await Consultation.findById(consultation._id).lean();
  assert.equal(String((linked as { clientUser: unknown }).clientUser), String(client._id));
});

test("002: matching is case- and whitespace-insensitive, since the form never normalised", async () => {
  const client = await seedClient("jane@example.com");
  const consultation = await seedConsultation("  Jane@Example.COM ");

  const report = await linkConsultations.run({ dryRun: false });
  assert.equal(report.changed, 1);

  const linked = await Consultation.findById(consultation._id).lean();
  assert.equal(String((linked as { clientUser: unknown }).clientUser), String(client._id));
});

test("002: a dry run reports the link but writes nothing", async () => {
  await seedClient("jane@example.com");
  const consultation = await seedConsultation("jane@example.com");

  const report = await linkConsultations.run({ dryRun: true });
  assert.equal(report.changed, 1);

  const untouched = await Consultation.findById(consultation._id).lean();
  assert.equal((untouched as { clientUser: unknown }).clientUser, null);
});

test("002: running twice changes nothing the second time", async () => {
  await seedClient("jane@example.com");
  await seedConsultation("jane@example.com");

  const first = await linkConsultations.run({ dryRun: false });
  const second = await linkConsultations.run({ dryRun: false });

  assert.equal(first.changed, 1);
  assert.equal(second.changed, 0);
});

test("002: every consultation from one address is linked, which is the whole point", async () => {
  // Activation links only the consultation its invitation named. The other
  // two are invisible in the portal until this runs.
  const client = await seedClient("jane@example.com");
  await seedConsultation("jane@example.com");
  await seedConsultation("jane@example.com");
  await seedConsultation("jane@example.com", { clientUser: client._id });

  const report = await linkConsultations.run({ dryRun: false });
  assert.equal(report.changed, 2, "the already-linked one must not be re-counted");
  assert.equal(await Consultation.countDocuments({ clientUser: client._id }), 3);
});

test("002: a pending account is not treated as verified", async () => {
  // Activation is the only proof the person controls that inbox. Without
  // it, linking would hand an enquiry to whoever claimed the address.
  await seedClient("jane@example.com", "pending");
  const consultation = await seedConsultation("jane@example.com");

  const report = await linkConsultations.run({ dryRun: false });
  assert.equal(report.changed, 0);
  assert.equal(report.unresolvedReasons.address_matches_only_non_active_accounts, 1);

  const untouched = await Consultation.findById(consultation._id).lean();
  assert.equal((untouched as { clientUser: unknown }).clientUser, null);
});

test("002: a disabled account is not linked either", async () => {
  await seedClient("jane@example.com", "disabled");
  await seedConsultation("jane@example.com");

  const report = await linkConsultations.run({ dryRun: false });
  assert.equal(report.changed, 0);
  assert.equal(report.unresolved, 1);
});

test("002: an address with no account is normal, not an unresolved problem", async () => {
  // Most enquiries come from people who never open a portal account. That
  // must not show up as a warning an operator has to triage.
  await seedConsultation("stranger@example.com");

  const report = await linkConsultations.run({ dryRun: false });
  assert.equal(report.changed, 0);
  assert.equal(report.unresolved, 0);
  assert.equal(report.alreadyDone, 1);
});

test("002: an existing link is never overwritten, even if the address now points elsewhere", async () => {
  const original = await seedClient("first@example.com");
  const other = await seedClient("second@example.com");
  const consultation = await seedConsultation("second@example.com", { clientUser: original._id });

  await linkConsultations.run({ dryRun: false });

  const unchanged = await Consultation.findById(consultation._id).lean();
  assert.equal(
    String((unchanged as { clientUser: unknown }).clientUser),
    String(original._id),
    "an established link is authoritative; the migration only fills blanks",
  );
  assert.notEqual(String((unchanged as { clientUser: unknown }).clientUser), String(other._id));
});

test("002: a consultation with no email is reported rather than skipped silently", async () => {
  await Consultation.collection.insertOne({
    name: "No Email",
    email: "",
    message: "seed",
    service: "EB-2 NIW",
    clientUser: null,
    createdAt: new Date(),
  });

  const report = await linkConsultations.run({ dryRun: false });
  assert.equal(report.unresolvedReasons.consultation_has_no_email, 1);
});

test("both migrations are safe to run against an empty database", async () => {
  const a = await recipientIdentity.run({ dryRun: false });
  const b = await linkConsultations.run({ dryRun: false });
  for (const report of [a, b]) {
    assert.equal(report.changed, 0);
    assert.equal(report.unresolved, 0);
  }
});
