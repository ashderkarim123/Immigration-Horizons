import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import os from "os";
import path from "path";
import fsp from "fs/promises";

process.env.SITE_URL = "http://localhost:3000";
// Must precede the first import of document-upload-service (its storage provider reads this at load);
// every module that reaches it is therefore imported dynamically inside before().
const TEST_STORAGE_ROOT = path.join(os.tmpdir(), `ih-portal-chat-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
process.env.PRIVATE_DOCUMENT_ROOT = TEST_STORAGE_ROOT;

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, formDataRequest, extractCookie, cookieHeader, TEST_ORIGIN } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { WorkspaceChannel } from "../src/lib/models/WorkspaceChannel";
import { ChannelMember } from "../src/lib/models/ChannelMember";
import { WorkspaceMessage } from "../src/lib/models/WorkspaceMessage";
import { DocumentCategory } from "../src/lib/models/DocumentCategory";
import { CaseDocument } from "../src/lib/models/CaseDocument";
import { DocumentVersion } from "../src/lib/models/DocumentVersion";
import { MessageRevision } from "../src/lib/models/MessageRevision";

import { hashPassword } from "../src/lib/auth/crypto";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { getUnreadCountsForChannels } from "../src/lib/collaboration/read-state-service";

import { POST as loginPOST } from "../src/app/api/portal/login/route";
import { POST as replyPOST } from "../src/app/api/portal/messages/[messageId]/replies/route";
import { POST as editPOST } from "../src/app/api/portal/messages/[messageId]/edit/route";
import { POST as deletePOST } from "../src/app/api/portal/messages/[messageId]/delete/route";
import { POST as readPOST } from "../src/app/api/portal/channels/[channelId]/read/route";

let messagesRoute: typeof import("../src/app/api/portal/channels/[channelId]/messages/route");
let attachmentsRoute: typeof import("../src/app/api/portal/channels/[channelId]/attachments/route");
let downloadRoute: typeof import("../src/app/(app)/portal/documents/[documentId]/download/route");

before(async () => {
  await startTestDb();
  messagesRoute = await import("../src/app/api/portal/channels/[channelId]/messages/route");
  attachmentsRoute = await import("../src/app/api/portal/channels/[channelId]/attachments/route");
  downloadRoute = await import("../src/app/(app)/portal/documents/[documentId]/download/route");
});
after(async () => {
  await stopTestDb();
  await fsp.rm(TEST_STORAGE_ROOT, { recursive: true, force: true }).catch(() => {});
});
beforeEach(clearCollections);

const PASSWORD = "correct-horse-battery-staple";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<< >>endobj\ntrailer<< >>\n%%EOF");
const EMPLOYEE_ID = "64b7f0c2a1b2c3d4e5f60718"; // an employee who exists only as the Express-side writer

let order = 100;
async function seedClientCase() {
  const email = `chat-${Date.now()}-${Math.random()}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: await hashPassword(PASSWORD), firstName: "Casey", status: "active" });
  const caseDoc = await ClientCase.create({ caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: "Case", caseType: "other", primaryClient: client._id });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: "primary", name: "WS" });
  const membership = await WorkspaceMember.create({ workspace: workspace._id, memberType: "client", clientUser: client._id, workspaceRole: "client", status: "active" });
  const makeChannel = (name: string, visibility: string, channelType = "standard") =>
    WorkspaceChannel.create({ workspace: workspace._id, case: caseDoc._id, name, slug: `${name.toLowerCase().replace(/\W+/g, "-")}-${(order += 1)}`, order, channelType, visibility });
  const shared = await makeChannel("Client Team", "clients_and_team");
  const login = await loginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }));
  const cookie = cookieHeader(SESSION_COOKIE_NAME, extractCookie(login, SESSION_COOKIE_NAME)!);
  return { client, caseDoc, workspace, membership, shared, makeChannel, cookie };
}

/** What the Express staff API writes: an employee-authored row in the shared collection. */
function employeeSays(channel: { _id: unknown; workspace: unknown; case: unknown }, body: string, extra: Record<string, unknown> = {}) {
  return WorkspaceMessage.create({
    workspace: channel.workspace,
    case: channel.case,
    channel: channel._id,
    senderType: "employee",
    senderAdmin: EMPLOYEE_ID,
    senderDisplayName: "Priya (Case Manager)",
    body,
    idempotencyKey: `emp-${Math.random()}`,
    ...extra,
  });
}

const ctx = (channelId: unknown) => ({ params: Promise.resolve({ channelId: String(channelId) }) });
const getRequest = (path: string, cookie?: string) => new Request(`${TEST_ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });
const list = (channelId: unknown, cookie: string, query = "") => messagesRoute.GET(getRequest(`/api/portal/channels/${channelId}/messages${query}`, cookie), ctx(channelId));
const send = (channelId: unknown, cookie: string, body: Record<string, unknown>) =>
  messagesRoute.POST(jsonRequest(`/api/portal/channels/${channelId}/messages`, { idempotencyKey: `k-${Math.random()}`, ...body }, { cookie }), ctx(channelId));
const upload = (channelId: unknown, cookie: string, bytes: Buffer = PDF, name = "evidence.pdf") => {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
  return attachmentsRoute.POST(formDataRequest(`/api/portal/channels/${channelId}/attachments`, form, { cookie }), ctx(channelId));
};

// ---------------------------------------------------------------------------
// Round trip with the employee writer
// ---------------------------------------------------------------------------

test("employee message written by the staff side shows in the client chat; client reply is stored for the staff side", async () => {
  const { shared, cookie } = await seedClientCase();
  const employee = await employeeSays(shared, "We received your documents.");

  const page = await (await list(shared._id, cookie)).json();
  assert.deepEqual(page.messages.map((m: { body: string }) => m.body), ["We received your documents."]);
  assert.equal(page.messages[0].senderType, "employee");
  assert.equal(page.messages[0].isOwn, false);
  assert.equal(page.messages[0].canEdit, false);
  assert.equal(page.messages[0].canDelete, false);

  const reply = await replyPOST(jsonRequest(`/api/portal/messages/${employee._id}/replies`, { body: "Thank you!", idempotencyKey: "reply-1" }, { cookie }), {
    params: Promise.resolve({ messageId: String(employee._id) }),
  });
  assert.equal(reply.status, 200);
  const stored = await WorkspaceMessage.findOne({ body: "Thank you!" }).lean();
  assert.equal(stored?.senderType, "client");
  assert.equal(String(stored?.threadRoot), String(employee._id));
  assert.equal((await WorkspaceMessage.findById(employee._id).lean())?.replyCount, 1);
});

test("client DTOs never expose employee ids, idempotency keys, deletion reasons or storage data", async () => {
  const { shared, cookie } = await seedClientCase();
  await employeeSays(shared, "Internal-id check");
  const sent = await send(shared._id, cookie, { body: "From client" });
  assert.equal(sent.status, 200);

  const json = JSON.stringify(await (await list(shared._id, cookie)).json());
  for (const forbidden of ["senderAdmin", "senderClient", "idempotencyKey", "deletionReason", "storageKey", "checksum", EMPLOYEE_ID]) {
    assert.ok(!json.includes(forbidden), `client DTO leaked ${forbidden}`);
  }
});

// ---------------------------------------------------------------------------
// Incremental sync
// ---------------------------------------------------------------------------

test("sync returns only what changed after the cursor: new employee messages, edits and deletes, deduplicated", async () => {
  const { shared, cookie } = await seedClientCase();
  await employeeSays(shared, "Welcome");
  const first = await (await list(shared._id, cookie)).json();
  const cursor = first.syncCursor as string;
  assert.ok(cursor);

  const quiet = await (await list(shared._id, cookie, `?since=${encodeURIComponent(cursor)}`)).json();
  assert.equal(quiet.messages.length, 0);
  assert.equal(quiet.syncCursor, cursor);

  await new Promise((r) => setTimeout(r, 5));
  await employeeSays(shared, "New from staff");
  const mine = await (await send(shared._id, cookie, { body: "Mine, will edit" })).json();
  await new Promise((r) => setTimeout(r, 5));
  const edit = await editPOST(jsonRequest(`/api/portal/messages/${mine.messageId}/edit`, { body: "Mine, edited" }, { cookie }), { params: Promise.resolve({ messageId: mine.messageId }) });
  assert.equal(edit.status, 200);

  const changes = await (await list(shared._id, cookie, `?since=${encodeURIComponent(cursor)}`)).json();
  assert.deepEqual(changes.messages.map((m: { body: string }) => m.body).sort(), ["Mine, edited", "New from staff"]);

  const again = await (await list(shared._id, cookie, `?since=${encodeURIComponent(changes.syncCursor)}`)).json();
  assert.equal(again.messages.length, 0);

  const malformed = await list(shared._id, cookie, "?since=%25%25%25");
  assert.equal(malformed.status, 200);
});

test("history paging is cursor based", async () => {
  const { shared, cookie } = await seedClientCase();
  for (let i = 0; i < 5; i += 1) await employeeSays(shared, `m${i}`);
  const page1 = await (await list(shared._id, cookie, "?limit=2")).json();
  assert.deepEqual(page1.messages.map((m: { body: string }) => m.body), ["m3", "m4"]);
  const page2 = await (await list(shared._id, cookie, `?limit=2&before=${encodeURIComponent(page1.nextCursor)}`)).json();
  assert.deepEqual(page2.messages.map((m: { body: string }) => m.body), ["m1", "m2"]);
});

// ---------------------------------------------------------------------------
// Visibility / authorization
// ---------------------------------------------------------------------------

test("staff-only and unreachable channels, guessed ids and malformed ids are one identical 404 — for read, send and upload", async () => {
  const { shared, makeChannel, cookie } = await seedClientCase();
  const internal = await makeChannel("Strategy", "employees_only", "internal");
  const restricted = await makeChannel("Restricted", "restricted_members");
  const stranger = await seedClientCase();

  const targets = [internal._id, restricted._id, "64b7f0c2a1b2c3d4e5f60aaa", "not-an-id"];
  for (const id of targets) {
    assert.equal((await list(id, cookie)).status, 404, `list ${id}`);
    assert.equal((await send(id, cookie, { body: "x" })).status, 404, `send ${id}`);
    assert.equal((await upload(id, cookie)).status, 404, `upload ${id}`);
  }
  assert.equal((await list(shared._id, stranger.cookie)).status, 404);
  assert.equal(await CaseDocument.countDocuments({}), 0);
});

test("a restricted channel opens only for a client with a ChannelMember row", async () => {
  const { makeChannel, membership, cookie } = await seedClientCase();
  const restricted = await makeChannel("Restricted", "restricted_members");
  assert.equal((await list(restricted._id, cookie)).status, 404);
  await ChannelMember.create({ channel: restricted._id, workspaceMember: membership._id, status: "active", addedByType: "system", joinedAt: new Date() });
  assert.equal((await list(restricted._id, cookie)).status, 200);
});

test("a removed client member loses chat access immediately", async () => {
  const { shared, membership, cookie } = await seedClientCase();
  assert.equal((await list(shared._id, cookie)).status, 200);
  await WorkspaceMember.updateOne({ _id: membership._id }, { $set: { status: "removed" } });
  assert.equal((await list(shared._id, cookie)).status, 404);
  assert.equal((await send(shared._id, cookie, { body: "still here?" })).status, 404);
});

test("a staff-only system message inside a client-visible channel is hidden from list, sync and thread replies", async () => {
  const { shared, cookie } = await seedClientCase();
  await employeeSays(shared, "Visible");
  const hidden = await WorkspaceMessage.create({
    workspace: shared.workspace, case: shared.case, channel: shared._id, senderType: "system", senderDisplayName: "System",
    body: '"Strategy.docx" was uploaded.', clientVisible: false,
  });

  const page = await (await list(shared._id, cookie)).json();
  assert.deepEqual(page.messages.map((m: { body: string }) => m.body), ["Visible"]);
  const sync = await (await list(shared._id, cookie, "?since=")).json();
  assert.ok(!JSON.stringify(sync).includes("Strategy.docx"));

  const reply = await replyPOST(jsonRequest(`/api/portal/messages/${hidden._id}/replies`, { body: "probe", idempotencyKey: "probe-1" }, { cookie }), {
    params: Promise.resolve({ messageId: String(hidden._id) }),
  });
  assert.equal(reply.status, 404);
});

test("unauthenticated and cross-origin requests are rejected", async () => {
  const { shared, cookie } = await seedClientCase();
  assert.equal((await messagesRoute.GET(getRequest(`/api/portal/channels/${shared._id}/messages`), ctx(shared._id))).status, 401);
  const crossOrigin = await messagesRoute.POST(jsonRequest(`/api/portal/channels/${shared._id}/messages`, { body: "x" }, { cookie, origin: "https://evil.example" }), ctx(shared._id));
  assert.equal(crossOrigin.status, 403);
  const form = new FormData();
  form.set("file", new File([new Uint8Array(PDF)], "a.pdf", { type: "application/pdf" }));
  const uploadCross = await attachmentsRoute.POST(formDataRequest(`/api/portal/channels/${shared._id}/attachments`, form, { cookie, origin: "https://evil.example" }), ctx(shared._id));
  assert.equal(uploadCross.status, 403);
});

// ---------------------------------------------------------------------------
// Idempotency, edit, delete, read state
// ---------------------------------------------------------------------------

test("double-send with one idempotency key stores one message", async () => {
  const { shared, cookie } = await seedClientCase();
  const a = await (await send(shared._id, cookie, { body: "Once", idempotencyKey: "same-intent" })).json();
  const b = await (await send(shared._id, cookie, { body: "Once", idempotencyKey: "same-intent" })).json();
  assert.equal(a.messageId, b.messageId);
  assert.equal(await WorkspaceMessage.countDocuments({ channel: shared._id }), 1);
});

test("edit records a revision, a stale edit is a controlled 409, delete is soft and keeps the thread", async () => {
  const { shared, cookie } = await seedClientCase();
  const mine = await (await send(shared._id, cookie, { body: "Draft" })).json();
  const id = mine.messageId as string;
  const before = await WorkspaceMessage.findById(id).lean();
  const expectedUpdatedAt = new Date(before!.updatedAt as unknown as string).toISOString();

  const ok = await editPOST(jsonRequest(`/api/portal/messages/${id}/edit`, { body: "Final", expectedUpdatedAt }, { cookie }), { params: Promise.resolve({ messageId: id }) });
  assert.equal(ok.status, 200);
  assert.equal(await MessageRevision.countDocuments({ message: id, action: "edited" }), 1);

  const stale = await editPOST(jsonRequest(`/api/portal/messages/${id}/edit`, { body: "Lost update", expectedUpdatedAt }, { cookie }), { params: Promise.resolve({ messageId: id }) });
  assert.equal(stale.status, 409);
  assert.equal((await WorkspaceMessage.findById(id).lean())?.body, "Final");

  await employeeSays(shared, "Reply from staff", { parentMessage: id, threadRoot: id });
  const del = await deletePOST(jsonRequest(`/api/portal/messages/${id}/delete`, {}, { cookie }), { params: Promise.resolve({ messageId: id }) });
  assert.equal(del.status, 200);
  const stored = await WorkspaceMessage.findById(id).lean();
  assert.ok(stored?.deletedAt);
  assert.equal(await WorkspaceMessage.countDocuments({ threadRoot: id }), 1);
  const page = await (await list(shared._id, cookie)).json();
  assert.equal(page.messages[0].body, "[This message was deleted.]");
  assert.equal(page.messages[0].canDelete, false);
});

test("a client cannot edit or delete an employee's message", async () => {
  const { shared, cookie } = await seedClientCase();
  const employee = await employeeSays(shared, "Staff note");
  const params = { params: Promise.resolve({ messageId: String(employee._id) }) };
  assert.equal((await editPOST(jsonRequest(`/api/portal/messages/${employee._id}/edit`, { body: "hijack" }, { cookie }), params)).status, 403);
  assert.notEqual((await deletePOST(jsonRequest(`/api/portal/messages/${employee._id}/delete`, {}, { cookie }), params)).status, 200);
  assert.equal((await WorkspaceMessage.findById(employee._id).lean())?.body, "Staff note");
});

test("unread counts the employee's messages, never the client's own, and mark-read clears them", async () => {
  const { shared, membership, client, cookie } = await seedClientCase();
  await employeeSays(shared, "One");
  await employeeSays(shared, "Two");
  await send(shared._id, cookie, { body: "My own" });
  const counts = () => getUnreadCountsForChannels({ channelIds: [shared._id], workspaceMemberId: String(membership._id), selfClientId: String(client._id) });
  assert.equal((await counts())[String(shared._id)], 2);

  const read = await readPOST(jsonRequest(`/api/portal/channels/${shared._id}/read`, {}, { cookie }), ctx(shared._id));
  assert.equal(read.status, 200);
  assert.equal((await counts())[String(shared._id)], 0);
});

// ---------------------------------------------------------------------------
// Direct attachments
// ---------------------------------------------------------------------------

test("a client attaches a new file from chat: secure pipeline, Chat Attachments category, retry reuses it, send references it, download works only for members", async () => {
  const { shared, caseDoc, cookie, client } = await seedClientCase();

  const up = await upload(shared._id, cookie);
  assert.equal(up.status, 201);
  const { attachment } = await up.json();

  const document = await CaseDocument.findById(attachment.documentId).lean();
  const category = await DocumentCategory.findById(document!.category).lean();
  assert.equal(category!.templateKey, "chat_attachments");
  assert.equal(document!.visibility, "client_visible");
  assert.equal(String(document!.uploadedByClient), String(client._id));
  assert.equal(await DocumentVersion.countDocuments({ document: attachment.documentId }), 1);

  const retry = await upload(shared._id, cookie);
  assert.equal(retry.status, 200);
  const retried = await retry.json();
  assert.equal(retried.reused, true);
  assert.equal(retried.attachment.documentId, attachment.documentId);
  assert.equal(await CaseDocument.countDocuments({ case: caseDoc._id }), 1);
  assert.equal(await DocumentCategory.countDocuments({ case: caseDoc._id, templateKey: "chat_attachments" }), 1);

  const sent = await send(shared._id, cookie, { body: "Here is my file", attachments: [attachment.documentId] });
  assert.equal(sent.status, 200);
  const page = await (await list(shared._id, cookie)).json();
  assert.equal(page.messages[0].attachments[0].displayName, "evidence.pdf");
  assert.equal(page.messages[0].attachments[0].size, PDF.length);
  assert.ok(!JSON.stringify(page).includes("storageKey"));

  const dl = await downloadRoute.GET(getRequest(`/portal/documents/${attachment.documentId}/download`, cookie), { params: Promise.resolve({ documentId: attachment.documentId }) });
  assert.equal(dl.status, 200);
  const stranger = await seedClientCase();
  const denied = await downloadRoute.GET(getRequest(`/portal/documents/${attachment.documentId}/download`, stranger.cookie), { params: Promise.resolve({ documentId: attachment.documentId }) });
  assert.equal(denied.status, 404);
});

test("upload validation: magic-byte mismatch and empty files are rejected and leave nothing behind", async () => {
  const { shared, cookie } = await seedClientCase();
  const fake = await upload(shared._id, cookie, Buffer.from("MZ definitely not a pdf"), "fake.pdf");
  assert.equal(fake.status, 422);
  assert.equal(await CaseDocument.countDocuments({}), 0);
  const leftovers = await fsp.readdir(path.join(TEST_STORAGE_ROOT, "temp")).catch(() => []);
  assert.deepEqual(leftovers, []);

  const empty = await upload(shared._id, cookie, Buffer.alloc(0), "empty.pdf");
  assert.equal(empty.status, 400);
});

test("a client cannot attach an internal document, even by guessing its id, in a client-visible or restricted channel", async () => {
  const { shared, makeChannel, membership, caseDoc, workspace, cookie } = await seedClientCase();
  const category = await DocumentCategory.create({ case: caseDoc._id, workspace: workspace._id, name: "Internal", slug: "internal", order: 1, visibility: "employees_only", allowedUploaderTypes: "employee" });
  const internalDoc = await CaseDocument.create({
    case: caseDoc._id, workspace: workspace._id, category: category._id, uploadedByType: "employee", uploadedByAdmin: EMPLOYEE_ID,
    originalName: "strategy.pdf", displayName: "strategy.pdf", storageKey: "a".repeat(48), mimeType: "application/pdf", detectedMimeType: "application/pdf",
    extension: "pdf", size: 10, checksum: "c".repeat(64), visibility: "employees_only", versionCount: 1,
  });
  const version = await DocumentVersion.create({
    document: internalDoc._id, versionNumber: 1, storageKey: "a".repeat(48), originalName: "strategy.pdf", displayName: "strategy.pdf",
    mimeType: "application/pdf", detectedMimeType: "application/pdf", extension: "pdf", size: 10, checksum: "c".repeat(64), uploadedByType: "employee", uploadedByAdmin: EMPLOYEE_ID,
  });
  internalDoc.currentVersion = version._id;
  await internalDoc.save();

  const viaShared = await send(shared._id, cookie, { body: "peek", attachments: [String(internalDoc._id)] });
  assert.equal(viaShared.status, 422);

  const restricted = await makeChannel("Restricted", "restricted_members");
  await ChannelMember.create({ channel: restricted._id, workspaceMember: membership._id, status: "active", addedByType: "system", joinedAt: new Date() });
  const viaRestricted = await send(restricted._id, cookie, { body: "peek", attachments: [String(internalDoc._id)] });
  assert.equal(viaRestricted.status, 422);
  assert.equal(await WorkspaceMessage.countDocuments({ body: "peek" }), 0);
});

test("a client can attach an existing client-visible document of the same case, but not one from another case", async () => {
  const mine = await seedClientCase();
  const theirs = await seedClientCase();
  const up = await upload(theirs.shared._id, theirs.cookie, PDF, "theirs.pdf");
  const theirDoc = (await up.json()).attachment.documentId as string;

  const own = await upload(mine.shared._id, mine.cookie, Buffer.from(`${PDF.toString()} mine`), "mine.pdf");
  const ownDoc = (await own.json()).attachment.documentId as string;

  assert.equal((await send(mine.shared._id, mine.cookie, { body: "existing", attachments: [ownDoc] })).status, 200);
  assert.equal((await send(mine.shared._id, mine.cookie, { body: "foreign", attachments: [theirDoc] })).status, 422);
});

test("a reply can carry an attachment, and it is listed in the thread", async () => {
  const { shared, cookie } = await seedClientCase();
  const root = await employeeSays(shared, "Please send the letter");
  const up = await upload(shared._id, cookie);
  const documentId = (await up.json()).attachment.documentId as string;
  const reply = await replyPOST(jsonRequest(`/api/portal/messages/${root._id}/replies`, { body: "Attached", attachments: [documentId], idempotencyKey: "rep-att" }, { cookie }), {
    params: Promise.resolve({ messageId: String(root._id) }),
  });
  assert.equal(reply.status, 200);
  const stored = await WorkspaceMessage.findOne({ body: "Attached" }).lean();
  assert.equal(stored?.attachments.length, 1);
});
