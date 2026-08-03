import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { ClientUser } from "../src/lib/models/ClientUser";
import { PortalInvitation } from "../src/lib/models/PortalInvitation";
import { Consultation } from "../src/lib/models/Consultation";
import {
  linkOrInviteAfterConsultation,
  splitName,
} from "../src/lib/auth/invitations";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

async function makeConsultation(email: string) {
  const doc = await Consultation.create({
    name: "Ada Lovelace",
    email,
    service: "EB-2 NIW",
    message: "Test message long enough to pass validation.",
  });
  return String(doc._id);
}

test("splitName splits on first whitespace", () => {
  assert.deepEqual(splitName("Ada Lovelace"), { firstName: "Ada", lastName: "Lovelace" });
  assert.deepEqual(splitName("Cher"), { firstName: "Cher", lastName: "" });
  assert.deepEqual(splitName("  Ada   Countess Lovelace "), {
    firstName: "Ada",
    lastName: "Countess Lovelace",
  });
});

test("new consultation from an unknown email creates exactly one pending invitation", async () => {
  const email = "new-client@example.com";
  const consultationId = await makeConsultation(email);

  const outcome = await linkOrInviteAfterConsultation({ email, name: "Ada Lovelace", consultationId });

  assert.equal(outcome, "invitation_issued");
  const invitations = await PortalInvitation.find({ normalizedEmail: email });
  assert.equal(invitations.length, 1);
  assert.equal(invitations[0].usedAt, null);
  assert.equal(invitations[0].revokedAt, null);
  assert.equal(invitations[0].firstName, "Ada");
  assert.equal(invitations[0].lastName, "Lovelace");
});

test("a repeat submission from the same unknown email revokes the old invitation and issues exactly one new active one", async () => {
  const email = "repeat@example.com";
  const firstConsultation = await makeConsultation(email);
  await linkOrInviteAfterConsultation({ email, name: "Ada Lovelace", consultationId: firstConsultation });

  const secondConsultation = await makeConsultation(email);
  await linkOrInviteAfterConsultation({ email, name: "Ada Lovelace", consultationId: secondConsultation });

  const all = await PortalInvitation.find({ normalizedEmail: email });
  assert.equal(all.length, 2, "both invitation records persist for audit purposes");

  const active = all.filter((i) => !i.revokedAt && !i.usedAt);
  assert.equal(active.length, 1, "only one invitation is left redeemable");
  assert.equal(String(active[0].consultation), secondConsultation);
});

test("existing client is linked without creating a duplicate account or invitation", async () => {
  const email = "existing@example.com";
  const client = await ClientUser.create({
    email,
    normalizedEmail: email,
    passwordHash: "irrelevant",
    status: "active",
  });

  const consultationId = await makeConsultation(email);
  const outcome = await linkOrInviteAfterConsultation({ email, name: "Ada Lovelace", consultationId });

  assert.equal(outcome, "linked_existing_client");
  assert.equal(await PortalInvitation.countDocuments({ normalizedEmail: email }), 0);
  assert.equal(await ClientUser.countDocuments({ normalizedEmail: email }), 1);

  const consultation = await Consultation.findById(consultationId);
  assert.equal(String(consultation!.clientUser), String(client._id));
});

test("a consultation already linked to a client is never relinked to a different one", async () => {
  const email = "shared-inbox@example.com";
  const originalOwner = await ClientUser.create({
    email: "original-owner@example.com",
    normalizedEmail: "original-owner@example.com",
    passwordHash: "irrelevant",
    status: "active",
  });
  const consultationId = await makeConsultation(email);
  await Consultation.updateOne({ _id: consultationId }, { $set: { clientUser: originalOwner._id } });

  await ClientUser.create({
    email,
    normalizedEmail: email,
    passwordHash: "irrelevant",
    status: "active",
  });

  await linkOrInviteAfterConsultation({ email, name: "Someone Else", consultationId });

  const consultation = await Consultation.findById(consultationId);
  assert.equal(
    String(consultation!.clientUser),
    String(originalOwner._id),
    "clientUser must stay pinned to whoever it was already linked to",
  );
});

test("email is normalized (case/whitespace) for linking", async () => {
  const email = "Mixed.Case@Example.com";
  await ClientUser.create({
    email: "mixed.case@example.com",
    normalizedEmail: "mixed.case@example.com",
    passwordHash: "irrelevant",
    status: "active",
  });

  const consultationId = await makeConsultation(email);
  const outcome = await linkOrInviteAfterConsultation({ email, name: "Ada", consultationId });

  assert.equal(outcome, "linked_existing_client");
});
