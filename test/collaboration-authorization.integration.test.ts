import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { WorkspaceChannel } from "../src/lib/models/WorkspaceChannel";
import { ChannelMember } from "../src/lib/models/ChannelMember";
import { WorkspaceMessage } from "../src/lib/models/WorkspaceMessage";

import { getAccessibleMessageCenter, getAccessibleChannel, getAccessibleMessage } from "../src/lib/auth/collaboration-policy";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

async function seedCaseWithMember(membershipStatus: "active" | "invited" | "removed" | "suspended") {
  const email = `collab-policy-${Date.now()}-${Math.random()}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: "x", status: "active" });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: "Case",
    caseType: "other",
    primaryClient: client._id,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: "primary", name: "WS" });
  const membership = await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "client",
    clientUser: client._id,
    workspaceRole: "client",
    status: membershipStatus,
  });
  return { client, caseDoc, workspace, membership };
}

test("an active member can access the message center", async () => {
  const { client, caseDoc } = await seedCaseWithMember("active");
  const center = await getAccessibleMessageCenter(String(caseDoc._id), String(client._id));
  assert.ok(center);
});

test("a removed member immediately loses message-center access", async () => {
  const { client, caseDoc } = await seedCaseWithMember("removed");
  const center = await getAccessibleMessageCenter(String(caseDoc._id), String(client._id));
  assert.equal(center, null);
});

test("an invited (not yet active) member has no message-center access", async () => {
  const { client, caseDoc } = await seedCaseWithMember("invited");
  const center = await getAccessibleMessageCenter(String(caseDoc._id), String(client._id));
  assert.equal(center, null);
});

test("the accessible channel list never includes an employees_only channel", async () => {
  const { client, caseDoc, workspace } = await seedCaseWithMember("active");
  await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    name: "Public",
    slug: "public",
    order: 1,
    channelType: "standard",
    visibility: "clients_and_team",
  });
  await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    name: "Internal",
    slug: "internal",
    order: 2,
    channelType: "internal",
    visibility: "employees_only",
  });

  const center = await getAccessibleMessageCenter(String(caseDoc._id), String(client._id));
  assert.equal(center!.channels.length, 1);
  assert.equal(center!.channels[0].slug, "public");
});

test("a restricted_members channel is invisible to a client with no ChannelMember row, and visible once added", async () => {
  const { client, caseDoc, workspace, membership } = await seedCaseWithMember("active");
  const restricted = await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    name: "VIP",
    slug: "vip",
    order: 1,
    channelType: "private",
    visibility: "restricted_members",
  });

  const before = await getAccessibleChannel(String(restricted._id), String(client._id));
  assert.equal(before, null);

  await ChannelMember.create({ channel: restricted._id, workspaceMember: membership._id, status: "active" });
  const after = await getAccessibleChannel(String(restricted._id), String(client._id));
  assert.ok(after);
});

test("getAccessibleMessage returns null for a message in an employees_only channel even for an active member", async () => {
  const { client, caseDoc, workspace } = await seedCaseWithMember("active");
  const channel = await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    name: "Internal",
    slug: "internal",
    order: 1,
    channelType: "internal",
    visibility: "employees_only",
  });
  const message = await WorkspaceMessage.create({
    workspace: workspace._id,
    case: caseDoc._id,
    channel: channel._id,
    senderType: "system",
    senderDisplayName: "System",
    body: "Internal note",
    clientVisible: false,
  });

  const accessible = await getAccessibleMessage(String(message._id), String(client._id));
  assert.equal(accessible, null);
});

test("a nonexistent channel id and another client's channel both return null identically", async () => {
  const { caseDoc, workspace } = await seedCaseWithMember("active");
  const { client: otherClient } = await seedCaseWithMember("active");
  const channel = await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    name: "Public",
    slug: "public",
    order: 1,
    channelType: "standard",
    visibility: "clients_and_team",
  });

  const forOtherClient = await getAccessibleChannel(String(channel._id), String(otherClient._id));
  const forNonexistentId = await getAccessibleChannel("507f1f77bcf86cd799439099", String(otherClient._id));
  assert.equal(forOtherClient, null);
  assert.equal(forNonexistentId, null);
});
