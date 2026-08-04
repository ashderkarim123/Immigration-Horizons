import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { WorkspaceChannel } from "../src/lib/models/WorkspaceChannel";
import { WorkspaceMessage } from "../src/lib/models/WorkspaceMessage";
import { ChannelReadState } from "../src/lib/models/ChannelReadState";

import { hashPassword } from "../src/lib/auth/crypto";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";

import { POST as loginPOST } from "../src/app/api/portal/login/route";
import { POST as sendMessagePOST } from "../src/app/api/portal/channels/[channelId]/messages/route";
import { POST as replyPOST } from "../src/app/api/portal/messages/[messageId]/replies/route";
import { POST as editPOST } from "../src/app/api/portal/messages/[messageId]/edit/route";
import { POST as deletePOST } from "../src/app/api/portal/messages/[messageId]/delete/route";
import { POST as readPOST } from "../src/app/api/portal/channels/[channelId]/read/route";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const STRONG_PASSWORD = "correct-horse-battery-staple";

async function seedActiveCaseForClient() {
  const email = `route-collab-client-${Date.now()}-${Math.random()}@example.com`;
  const client = await ClientUser.create({
    email,
    normalizedEmail: email,
    passwordHash: await hashPassword(STRONG_PASSWORD),
    firstName: "Route",
    status: "active",
  });

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
    status: "active",
  });
  const channel = await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    name: "General",
    slug: "general",
    order: 1,
    channelType: "standard",
    visibility: "clients_and_team",
  });

  const loginRes = await loginPOST(jsonRequest("/api/portal/login", { email, password: STRONG_PASSWORD }));
  const cookie = cookieHeader(SESSION_COOKIE_NAME, extractCookie(loginRes, SESSION_COOKIE_NAME)!);

  return { client, caseDoc, workspace, membership, channel, cookie };
}

test("POST /api/portal/channels/:channelId/messages: authenticated client sends a message", async () => {
  const { channel, cookie } = await seedActiveCaseForClient();
  const res = await sendMessagePOST(
    jsonRequest(`/api/portal/channels/${channel._id}/messages`, { body: "Hello team", idempotencyKey: "r1" }, { cookie }),
    { params: Promise.resolve({ channelId: String(channel._id) }) },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.messageId);
  assert.equal(await WorkspaceMessage.countDocuments({ channel: channel._id }), 1);
});

test("POST /api/portal/channels/:channelId/messages: unauthenticated request is rejected", async () => {
  const { channel } = await seedActiveCaseForClient();
  const res = await sendMessagePOST(jsonRequest(`/api/portal/channels/${channel._id}/messages`, { body: "Hi" }), {
    params: Promise.resolve({ channelId: String(channel._id) }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/portal/channels/:channelId/messages: CSRF — mismatched Origin is rejected", async () => {
  const { channel, cookie } = await seedActiveCaseForClient();
  const res = await sendMessagePOST(
    jsonRequest(`/api/portal/channels/${channel._id}/messages`, { body: "Hi" }, { cookie, origin: "https://evil.example.com" }),
    { params: Promise.resolve({ channelId: String(channel._id) }) },
  );
  assert.equal(res.status, 403);
});

test("POST /api/portal/channels/:channelId/messages: another client's channel is denied (cross-client access)", async () => {
  const { channel } = await seedActiveCaseForClient();
  const { cookie: otherCookie } = await seedActiveCaseForClient();
  const res = await sendMessagePOST(
    jsonRequest(`/api/portal/channels/${channel._id}/messages`, { body: "Hi" }, { cookie: otherCookie }),
    { params: Promise.resolve({ channelId: String(channel._id) }) },
  );
  assert.equal(res.status, 404);
});

test("POST /api/portal/channels/:channelId/messages: an employees_only channel is denied to a client", async () => {
  const { caseDoc, workspace, cookie } = await seedActiveCaseForClient();
  const internalChannel = await WorkspaceChannel.create({
    workspace: workspace._id,
    case: caseDoc._id,
    name: "Internal",
    slug: "internal",
    order: 2,
    channelType: "internal",
    visibility: "employees_only",
  });
  const res = await sendMessagePOST(
    jsonRequest(`/api/portal/channels/${internalChannel._id}/messages`, { body: "Hi" }, { cookie }),
    { params: Promise.resolve({ channelId: String(internalChannel._id) }) },
  );
  assert.equal(res.status, 404);
});

test("POST /api/portal/channels/:channelId/messages: duplicate idempotencyKey returns the same message, not a second one", async () => {
  const { channel, cookie } = await seedActiveCaseForClient();
  const res1 = await sendMessagePOST(
    jsonRequest(`/api/portal/channels/${channel._id}/messages`, { body: "Hi", idempotencyKey: "dup-route" }, { cookie }),
    { params: Promise.resolve({ channelId: String(channel._id) }) },
  );
  const res2 = await sendMessagePOST(
    jsonRequest(`/api/portal/channels/${channel._id}/messages`, { body: "Hi", idempotencyKey: "dup-route" }, { cookie }),
    { params: Promise.resolve({ channelId: String(channel._id) }) },
  );
  const body1 = await res1.json();
  const body2 = await res2.json();
  assert.equal(body1.messageId, body2.messageId);
  assert.equal(await WorkspaceMessage.countDocuments({ channel: channel._id }), 1);
});

test("POST /api/portal/messages/:messageId/replies: client replies to an employee's message", async () => {
  const { caseDoc, workspace, channel, cookie } = await seedActiveCaseForClient();
  const parent = await WorkspaceMessage.create({
    workspace: workspace._id,
    case: caseDoc._id,
    channel: channel._id,
    senderType: "employee",
    senderAdmin: "507f1f77bcf86cd799439011",
    senderDisplayName: "PM",
    body: "How can we help?",
  });

  const res = await replyPOST(jsonRequest(`/api/portal/messages/${parent._id}/replies`, { body: "Question here", idempotencyKey: "reply-1" }, { cookie }), {
    params: Promise.resolve({ messageId: String(parent._id) }),
  });
  assert.equal(res.status, 200);

  const updatedParent = await WorkspaceMessage.findById(parent._id).lean();
  assert.equal(updatedParent!.replyCount, 1);
});

test("POST /api/portal/messages/:messageId/edit: client can edit their own message; editing another sender's message is denied", async () => {
  const { channel, cookie, membership } = await seedActiveCaseForClient();
  const own = await WorkspaceMessage.create({
    workspace: membership.workspace,
    case: channel.case,
    channel: channel._id,
    senderType: "client",
    senderClient: membership.clientUser,
    senderDisplayName: "Client",
    body: "Original",
  });
  const employeeMessage = await WorkspaceMessage.create({
    workspace: membership.workspace,
    case: channel.case,
    channel: channel._id,
    senderType: "employee",
    senderAdmin: "507f1f77bcf86cd799439011",
    senderDisplayName: "PM",
    body: "PM message",
  });

  const editOwn = await editPOST(jsonRequest(`/api/portal/messages/${own._id}/edit`, { body: "Updated" }, { cookie }), {
    params: Promise.resolve({ messageId: String(own._id) }),
  });
  assert.equal(editOwn.status, 200);

  const editOther = await editPOST(jsonRequest(`/api/portal/messages/${employeeMessage._id}/edit`, { body: "Hijacked" }, { cookie }), {
    params: Promise.resolve({ messageId: String(employeeMessage._id) }),
  });
  assert.equal(editOther.status, 403);
});

test("POST /api/portal/messages/:messageId/delete: client can delete their own message, and the body is hidden afterward", async () => {
  const { channel, cookie, membership } = await seedActiveCaseForClient();
  const own = await WorkspaceMessage.create({
    workspace: membership.workspace,
    case: channel.case,
    channel: channel._id,
    senderType: "client",
    senderClient: membership.clientUser,
    senderDisplayName: "Client",
    body: "Delete me",
  });

  const res = await deletePOST(jsonRequest(`/api/portal/messages/${own._id}/delete`, {}, { cookie }), {
    params: Promise.resolve({ messageId: String(own._id) }),
  });
  assert.equal(res.status, 200);

  const deleted = await WorkspaceMessage.findById(own._id).lean();
  assert.ok(deleted!.deletedAt);
});

test("POST /api/portal/channels/:channelId/read: marks the channel read and the marker never moves backward", async () => {
  const { channel, cookie, membership } = await seedActiveCaseForClient();
  const older = await WorkspaceMessage.create({
    workspace: membership.workspace,
    case: channel.case,
    channel: channel._id,
    senderType: "employee",
    senderAdmin: "507f1f77bcf86cd799439011",
    senderDisplayName: "PM",
    body: "Older",
  });
  const newer = await WorkspaceMessage.create({
    workspace: membership.workspace,
    case: channel.case,
    channel: channel._id,
    senderType: "employee",
    senderAdmin: "507f1f77bcf86cd799439011",
    senderDisplayName: "PM",
    body: "Newer",
  });

  const markNewer = await readPOST(jsonRequest(`/api/portal/channels/${channel._id}/read`, { lastReadMessageId: String(newer._id) }, { cookie }), {
    params: Promise.resolve({ channelId: String(channel._id) }),
  });
  assert.equal(markNewer.status, 200);

  await readPOST(jsonRequest(`/api/portal/channels/${channel._id}/read`, { lastReadMessageId: String(older._id) }, { cookie }), {
    params: Promise.resolve({ channelId: String(channel._id) }),
  });

  const state = await ChannelReadState.findOne({ channel: channel._id, workspaceMember: membership._id }).lean();
  assert.equal(String(state!.lastReadMessage), String(newer._id));
});
