import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";

import { ClientUser } from "../src/lib/models/ClientUser";
import { AdminUser } from "../src/lib/models/AdminUser";
import { Consultation } from "../src/lib/models/Consultation";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { ConsultationInteraction } from "../src/lib/models/ConsultationInteraction";
import { InteractionHistory } from "../src/lib/models/InteractionHistory";
import { InteractionUpdate } from "../src/lib/models/InteractionUpdate";

import {
  getAccessibleInteraction,
  listAccessibleInteractions,
  getClientVisibleHistory,
  getClientVisibleUpdates,
} from "../src/lib/auth/interaction-policy";
import {
  createClientInteraction,
  addClientFollowUp,
  confirmClientResolution,
  createInitialConsultationInteraction,
} from "../src/lib/auth/interactions";
import { generateInteractionNumber } from "../src/lib/auth/interaction-number";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

let counter = 0;
function uniqueEmail() {
  counter += 1;
  return `interaction-auth-${Date.now()}-${counter}@example.com`;
}

async function seedClient() {
  const email = uniqueEmail();
  return ClientUser.create({ email, normalizedEmail: email, passwordHash: "x", firstName: "Test", status: "active" });
}

async function seedConsultationInteraction(client: InstanceType<typeof ClientUser>) {
  const consultation = await Consultation.create({
    name: "Test",
    email: client.email,
    message: "x".repeat(20),
    clientUser: client._id,
  });
  const interaction = await ConsultationInteraction.create({
    interactionNumber: generateInteractionNumber(),
    scopeType: "consultation",
    clientUser: client._id,
    consultation: consultation._id,
    subject: "Subject",
    description: "Description long enough.",
    type: "follow_up_query",
    createdByType: "client",
    createdByClient: client._id,
  });
  return { consultation, interaction };
}

async function seedCaseInteraction(client: InstanceType<typeof ClientUser>, membershipStatus = "active") {
  const pm = await AdminUser.create({ name: "PM", isActive: true });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: "Case",
    caseType: "other",
    primaryClient: client._id,
    projectManager: pm._id,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: "primary", name: "Primary" });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "client",
    clientUser: client._id,
    workspaceRole: "client",
    status: membershipStatus,
  });
  const interaction = await ConsultationInteraction.create({
    interactionNumber: generateInteractionNumber(),
    scopeType: "case",
    clientUser: client._id,
    case: caseDoc._id,
    workspace: workspace._id,
    subject: "Case question",
    description: "Case question description.",
    type: "client_question",
    createdByType: "client",
    createdByClient: client._id,
  });
  return { caseDoc, workspace, interaction };
}

// ---------------------------------------------------------------------------
// Row-level access
// ---------------------------------------------------------------------------

test("a client can access their own consultation-scoped interaction", async () => {
  const client = await seedClient();
  const { interaction } = await seedConsultationInteraction(client);
  const result = await getAccessibleInteraction(String(interaction._id), String(client._id));
  assert.ok(result);
});

test("a different client cannot access another client's interaction — same result as nonexistent", async () => {
  const client = await seedClient();
  const { interaction } = await seedConsultationInteraction(client);
  const intruder = await seedClient();

  const asIntruder = await getAccessibleInteraction(String(interaction._id), String(intruder._id));
  const nonexistent = await getAccessibleInteraction(new mongoose.Types.ObjectId().toString(), String(intruder._id));

  assert.equal(asIntruder, null);
  assert.equal(nonexistent, null);
});

test("case-scoped: active member can access, removed member cannot", async () => {
  const activeClient = await seedClient();
  const { interaction: activeInteraction } = await seedCaseInteraction(activeClient, "active");
  assert.ok(await getAccessibleInteraction(String(activeInteraction._id), String(activeClient._id)));

  const removedClient = await seedClient();
  const { interaction: removedInteraction } = await seedCaseInteraction(removedClient, "removed");
  assert.equal(await getAccessibleInteraction(String(removedInteraction._id), String(removedClient._id)), null);
});

test("case-scoped: a pending (not yet active) membership does not grant access", async () => {
  const client = await seedClient();
  const { interaction } = await seedCaseInteraction(client, "invited");
  assert.equal(await getAccessibleInteraction(String(interaction._id), String(client._id)), null);
});

test("an invalid interaction id returns null rather than throwing", async () => {
  const client = await seedClient();
  assert.equal(await getAccessibleInteraction("not-a-valid-id", String(client._id)), null);
});

test("listAccessibleInteractions never includes another client's interactions", async () => {
  const mine = await seedClient();
  const { interaction: myInteraction } = await seedConsultationInteraction(mine);
  const theirs = await seedClient();
  const { interaction: theirInteraction } = await seedConsultationInteraction(theirs);

  const myList = await listAccessibleInteractions(String(mine._id));
  assert.equal(myList.length, 1);
  assert.equal(String(myList[0]._id), String(myInteraction._id));
  assert.ok(myList.every((i) => String(i._id) !== String(theirInteraction._id)));
});

// ---------------------------------------------------------------------------
// Client-side creation
// ---------------------------------------------------------------------------

test("client submits a consultation-scoped query successfully", async () => {
  const client = await seedClient();
  const consultation = await Consultation.create({
    name: "T",
    email: client.email,
    message: "x".repeat(20),
    clientUser: client._id,
  });

  const result = await createClientInteraction({
    clientUserId: String(client._id),
    clientName: client.firstName,
    scopeType: "consultation",
    consultationId: String(consultation._id),
    subject: "A question",
    description: "Some details about my question.",
    type: "follow_up_query",
  });

  assert.equal(result.outcome, "created");
  assert.equal(await ConsultationInteraction.countDocuments({}), 1);
  assert.equal(await InteractionHistory.countDocuments({}), 1);
});

test("client cannot submit a query against another client's consultation", async () => {
  const owner = await seedClient();
  const consultation = await Consultation.create({
    name: "T",
    email: owner.email,
    message: "x".repeat(20),
    clientUser: owner._id,
  });
  const intruder = await seedClient();

  const result = await createClientInteraction({
    clientUserId: String(intruder._id),
    clientName: intruder.firstName,
    scopeType: "consultation",
    consultationId: String(consultation._id),
    subject: "A question",
    description: "Some details.",
    type: "follow_up_query",
  });

  assert.equal(result.outcome, "not_authorized");
  assert.equal(await ConsultationInteraction.countDocuments({}), 0);
});

test("client cannot submit a query against a case they are not an active member of", async () => {
  const client = await seedClient();
  const { caseDoc, workspace } = await seedCaseInteraction(client, "removed");

  const result = await createClientInteraction({
    clientUserId: String(client._id),
    clientName: client.firstName,
    scopeType: "case",
    caseId: String(caseDoc._id),
    workspaceId: String(workspace._id),
    subject: "A question",
    description: "Some details.",
    type: "client_question",
  });

  assert.equal(result.outcome, "not_authorized");
});

test("invalid scope combination is rejected", async () => {
  const client = await seedClient();
  const result = await createClientInteraction({
    clientUserId: String(client._id),
    clientName: client.firstName,
    scopeType: "consultation",
    subject: "A question",
    description: "Some details.",
    type: "follow_up_query",
  });
  assert.equal(result.outcome, "validation_error");
});

// ---------------------------------------------------------------------------
// Follow-up and resolution
// ---------------------------------------------------------------------------

test("client follow-up on an awaiting_client interaction reopens it to submitted", async () => {
  const client = await seedClient();
  const { interaction } = await seedConsultationInteraction(client);
  interaction.status = "awaiting_client";
  await interaction.save();

  const result = await addClientFollowUp(String(interaction._id), String(client._id), client.firstName, "Here is my answer.");
  assert.equal(result.outcome, "added");

  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(updated!.status, "submitted");

  const updates = await InteractionUpdate.find({ interaction: interaction._id });
  assert.equal(updates.length, 1);
  assert.equal(updates[0].visibility, "client_visible");
});

test("client cannot follow up on another client's interaction", async () => {
  const client = await seedClient();
  const { interaction } = await seedConsultationInteraction(client);
  const intruder = await seedClient();

  const result = await addClientFollowUp(String(interaction._id), String(intruder._id), "Intruder", "hi");
  assert.equal(result.outcome, "not_authorized");
});

test("client cannot create an internal update — addClientFollowUp always creates client_visible", async () => {
  const client = await seedClient();
  const { interaction } = await seedConsultationInteraction(client);
  await addClientFollowUp(String(interaction._id), String(client._id), client.firstName, "hi");
  const update = await InteractionUpdate.findOne({ interaction: interaction._id });
  assert.equal(update!.visibility, "client_visible");
});

test("resolution confirmation: resolved closes the interaction", async () => {
  const client = await seedClient();
  const { interaction } = await seedConsultationInteraction(client);
  interaction.status = "answered";
  interaction.answeredAt = new Date();
  interaction.answeredBy = new mongoose.Types.ObjectId();
  interaction.clientVisibleResponse = "Here is your answer.";
  await interaction.save();

  const result = await confirmClientResolution(String(interaction._id), String(client._id), client.firstName, true);
  assert.equal(result.outcome, "updated");

  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(updated!.status, "closed");
  assert.equal(updated!.clientResolutionStatus, "resolved");
  assert.ok(updated!.clientResolvedAt);
});

test("resolution confirmation: needs more help reopens to in_progress and preserves the original answer", async () => {
  const client = await seedClient();
  const { interaction } = await seedConsultationInteraction(client);
  interaction.status = "answered";
  interaction.answeredAt = new Date();
  interaction.answeredBy = new mongoose.Types.ObjectId();
  interaction.clientVisibleResponse = "Original answer text.";
  await interaction.save();

  const result = await confirmClientResolution(
    String(interaction._id),
    String(client._id),
    client.firstName,
    false,
    "Still confused about X.",
  );
  assert.equal(result.outcome, "updated");

  const updated = await ConsultationInteraction.findById(interaction._id);
  assert.equal(updated!.status, "in_progress");
  assert.equal(updated!.clientResolutionStatus, "needs_more_help");
  assert.equal(updated!.clientVisibleResponse, "Original answer text.", "the original answer must not be deleted");
});

// ---------------------------------------------------------------------------
// Client-visible projections never leak internal data
// ---------------------------------------------------------------------------

test("client-visible history never includes entries with an empty clientVisibleSummary", async () => {
  const client = await seedClient();
  const { interaction } = await seedConsultationInteraction(client);
  await InteractionHistory.create({
    interaction: interaction._id,
    eventType: "status_changed",
    actorType: "admin_user",
    actorName: "Staff",
    clientVisibleSummary: "",
    internalMetadata: { secret: "internal-only-detail" },
  });
  await InteractionHistory.create({
    interaction: interaction._id,
    eventType: "acknowledged",
    actorType: "admin_user",
    actorName: "Staff",
    clientVisibleSummary: "Your request has been acknowledged.",
  });

  const history = await getClientVisibleHistory(String(interaction._id));
  assert.equal(history.length, 1);
  assert.equal(history[0].summary, "Your request has been acknowledged.");
});

test("client-visible updates never include internal-visibility entries", async () => {
  const client = await seedClient();
  const { interaction } = await seedConsultationInteraction(client);
  await InteractionUpdate.create({
    interaction: interaction._id,
    authorType: "admin",
    authorAdmin: new mongoose.Types.ObjectId(),
    authorName: "Staff",
    updateType: "employee_note",
    body: "Internal-only note.",
    visibility: "internal",
  });
  await InteractionUpdate.create({
    interaction: interaction._id,
    authorType: "client",
    authorClient: client._id,
    authorName: client.firstName,
    updateType: "client_follow_up",
    body: "My follow-up.",
    visibility: "client_visible",
  });

  const updates = await getClientVisibleUpdates(String(interaction._id));
  assert.equal(updates.length, 1);
  assert.equal(updates[0].body, "My follow-up.");
});

// ---------------------------------------------------------------------------
// Initial-consultation tracking (regression, module doc §14)
// ---------------------------------------------------------------------------

test("initial-consultation tracking is idempotent under a duplicate call", async () => {
  const client = await seedClient();
  const consultation = await Consultation.create({
    name: "T",
    email: client.email,
    message: "x".repeat(20),
    clientUser: client._id,
  });

  const first = await createInitialConsultationInteraction({
    consultationId: String(consultation._id),
    clientUserId: String(client._id),
  });
  const second = await createInitialConsultationInteraction({
    consultationId: String(consultation._id),
    clientUserId: String(client._id),
  });

  assert.equal(first, "created");
  assert.equal(second, "already_exists");
  assert.equal(
    await ConsultationInteraction.countDocuments({ consultation: consultation._id, type: "initial_consultation" }),
    1,
  );
});

test("initial-consultation tracking defers cleanly when no client is linked yet", async () => {
  const consultation = await Consultation.create({ name: "T", email: "no-client@example.com", message: "x".repeat(20) });
  const result = await createInitialConsultationInteraction({
    consultationId: String(consultation._id),
    clientUserId: null,
  });
  assert.equal(result, "deferred_no_client");
  assert.equal(await ConsultationInteraction.countDocuments({}), 0);
});
