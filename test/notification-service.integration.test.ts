import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { Notification } from "../src/lib/models/Notification";

import {
  notifyClient,
  getOrCreatePreferences,
  updateClientPreferences,
  listForClient,
  getUnreadCountForClient,
  markReadForClient,
  markAllReadForClient,
} from "../src/lib/notifications/notification-service";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

async function seedClientWithCase(membershipStatus: "active" | "removed" = "active") {
  const email = `client-${Date.now()}-${Math.random()}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: "x", status: "active" });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: "Case",
    caseType: "other",
    primaryClient: client._id,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: "primary", name: "WS" });
  await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "client",
    clientUser: client._id,
    workspaceRole: "client",
    status: membershipStatus,
  });
  return { client, caseDoc, workspace };
}

test("notifyClient creates a notification for an active member with the workspace guard", async () => {
  const { client, workspace } = await seedClientWithCase("active");
  const n = await notifyClient({ clientUserId: client._id, requireActiveWorkspace: workspace._id, title: "T", message: "M", type: "query_answered" });
  assert.ok(n);
});

test("notifyClient creates nothing for a removed member (removed member receives no event)", async () => {
  const { client, workspace } = await seedClientWithCase("removed");
  const n = await notifyClient({ clientUserId: client._id, requireActiveWorkspace: workspace._id, title: "T", message: "M", type: "document_accepted" });
  assert.equal(n, null);
  assert.equal(await Notification.countDocuments({}), 0);
});

test("getOrCreatePreferences is lazy and stable across calls", async () => {
  const { client } = await seedClientWithCase();
  const first = await getOrCreatePreferences({ recipientType: "client", recipientClientId: client._id });
  const second = await getOrCreatePreferences({ recipientType: "client", recipientClientId: client._id });
  assert.equal(String(first._id), String(second._id));
});

test("updateClientPreferences persists the new values", async () => {
  const { client } = await seedClientWithCase();
  const updated = await updateClientPreferences({ clientUserId: client._id, updates: { mentionEmails: false, digestFrequency: "off" } });
  assert.equal(updated.mentionEmails, false);
  assert.equal(updated.digestFrequency, "off");
});

test("listForClient/getUnreadCountForClient/markReadForClient/markAllReadForClient scope strictly to the caller", async () => {
  const a = await seedClientWithCase();
  const b = await seedClientWithCase();

  const nA = await notifyClient({ clientUserId: a.client._id, title: "A", message: "A", type: "query_answered" });
  await notifyClient({ clientUserId: b.client._id, title: "B", message: "B", type: "query_answered" });

  assert.equal((await listForClient({ clientUserId: a.client._id })).length, 1);
  assert.equal(await getUnreadCountForClient(a.client._id), 1);

  const wrongOwner = await markReadForClient({ notificationId: nA!._id, clientUserId: b.client._id });
  assert.equal(wrongOwner, null);

  const rightOwner = await markReadForClient({ notificationId: nA!._id, clientUserId: a.client._id });
  assert.ok(rightOwner);
  assert.equal(await getUnreadCountForClient(a.client._id), 0);
  assert.equal(await getUnreadCountForClient(b.client._id), 1);

  await markAllReadForClient(b.client._id);
  assert.equal(await getUnreadCountForClient(b.client._id), 0);
});
