import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader, TEST_ORIGIN } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { USCISFiling } from "../src/lib/models/USCISFiling";
import { USCISStatusEvent } from "../src/lib/models/USCISStatusEvent";

import { hashPassword } from "../src/lib/auth/crypto";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { POST as loginPOST } from "../src/app/api/portal/login/route";
import * as uscisRoute from "../src/app/api/portal/cases/[caseId]/uscis/route";
import { projectClientTracking } from "../src/lib/uscis/client-view";

/**
 * Client Portal USCIS tracking (ADR-026): membership, client-visible filtering, and above all the rule that a
 * newer INTERNAL event can never become the client's "current status".
 */

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const PASSWORD = "correct-horse-battery-staple";
const RECEIPT = "IOE1234567890";
const INTERNAL_TITLE = "INTERNAL: escalate to senior reviewer";
const INTERNAL_DESC = "Internal-only strategy note about the beneficiary";
const HIDDEN_FILING = "Hidden I-485 draft";

async function client(label: string) {
  const email = `${label}-${Date.now()}-${Math.random()}@example.com`;
  const user = await ClientUser.create({ email, normalizedEmail: email, passwordHash: await hashPassword(PASSWORD), firstName: "Casey", status: "active" });
  const login = await loginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }));
  return { user, cookie: cookieHeader(SESSION_COOKIE_NAME, extractCookie(login, SESSION_COOKIE_NAME)!) };
}

async function seed() {
  const owner = await client("owner");
  const other = await client("other");
  const caseDoc = await ClientCase.create({ caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: "Case", caseType: "other", primaryClient: owner.user._id });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: "primary", name: "WS" });
  const membership = await WorkspaceMember.create({ workspace: workspace._id, memberType: "client", clientUser: owner.user._id, workspaceRole: "client", status: "active" });
  const otherCase = await ClientCase.create({ caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: "Other", caseType: "other", primaryClient: other.user._id });
  const otherWorkspace = await CaseWorkspace.create({ case: otherCase._id, workspaceType: "primary", name: "WS2" });
  await WorkspaceMember.create({ workspace: otherWorkspace._id, memberType: "client", clientUser: other.user._id, workspaceRole: "client", status: "active" });
  return { owner, other, caseDoc, workspace, membership };
}

type Ctx = Awaited<ReturnType<typeof seed>>;

async function filing(ctx: Ctx, over: Record<string, unknown> = {}) {
  return USCISFiling.create({ case: ctx.caseDoc._id, workspace: ctx.workspace._id, title: "I-140 petition", formType: "I-140", receiptNumber: RECEIPT, clientVisible: true, trackingProvider: "uscis_case_status", trackingEnabled: true, lastSyncErrorCode: "provider_unavailable", ...over });
}

let tick = 0;
async function event(ctx: Ctx, f: { _id: unknown }, over: Record<string, unknown> = {}) {
  tick += 1;
  return USCISStatusEvent.create({
    filing: f._id,
    case: ctx.caseDoc._id,
    workspace: ctx.workspace._id,
    statusCategory: "received",
    statusTitle: "Case Was Received",
    statusDescription: "We received your case.",
    occurredAt: new Date(Date.UTC(2026, 0, tick)),
    observedAt: new Date(),
    source: "manual",
    clientVisible: true,
    createdByName: "Staff Member",
    providerEventKey: `k-${tick}-${Math.random()}`,
    providerPayloadHash: "hash-secret",
    ...over,
  });
}

const call = (caseId: unknown, cookie?: string) =>
  uscisRoute.GET(new Request(`${TEST_ORIGIN}/api/portal/cases/${caseId}/uscis`, { headers: cookie ? { cookie } : {} }), { params: Promise.resolve({ caseId: String(caseId) }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read arbitrary response bodies
const json = async (res: Response) => (await res.json()) as Record<string, any>;

test("a newer internal event never becomes the client's current status or appears in the history", async () => {
  const ctx = await seed();
  const f = await filing(ctx);
  await event(ctx, f, { statusTitle: "Case Was Received", occurredAt: new Date("2026-02-01") });
  await event(ctx, f, { statusCategory: "rfe_issued", statusTitle: "Request for Additional Evidence Was Mailed", statusDescription: "Send employment letters.", occurredAt: new Date("2026-03-01"), actionRequired: true, responseDueAt: new Date("2026-06-01") });
  // the NEWEST event is internal; the Staff snapshot would show it
  await event(ctx, f, { statusCategory: "notice_issued", statusTitle: INTERNAL_TITLE, statusDescription: INTERNAL_DESC, occurredAt: new Date("2026-04-01"), clientVisible: false, actionRequired: true, responseDueAt: new Date("2026-05-01") });

  const res = await call(ctx.caseDoc._id, ctx.owner.cookie);
  assert.equal(res.status, 200);
  const body = await json(res);
  const [shown] = body.filings;
  assert.equal(shown.currentStatus.title, "Request for Additional Evidence Was Mailed", "current = newest CLIENT-VISIBLE event");
  assert.equal(shown.currentStatus.actionRequired, true);
  assert.equal(shown.currentStatus.responseDueAt, "2026-06-01T00:00:00.000Z", "the visible event's own due date, not the internal one");
  assert.deepEqual(shown.timeline.map((e: { title: string }) => e.title), ["Request for Additional Evidence Was Mailed", "Case Was Received"]);

  const raw = JSON.stringify(body);
  for (const leak of [INTERNAL_TITLE, INTERNAL_DESC, "2026-05-01", "notice_issued"]) assert.ok(!raw.includes(leak), `leaked: ${leak}`);
});

test("when the newest visible event no longer needs action, the action banner and due date disappear", async () => {
  const ctx = await seed();
  const f = await filing(ctx);
  await event(ctx, f, { statusTitle: "RFE mailed", occurredAt: new Date("2026-03-01"), actionRequired: true, responseDueAt: new Date("2026-06-01") });
  await event(ctx, f, { statusTitle: "Response Was Received", statusCategory: "response_received", occurredAt: new Date("2026-04-01"), actionRequired: false });

  const [shown] = (await json(await call(ctx.caseDoc._id, ctx.owner.cookie))).filings;
  assert.deepEqual([shown.currentStatus.title, shown.currentStatus.actionRequired, shown.currentStatus.responseDueAt], ["Response Was Received", false, null]);
});

test("hidden filings, archived filings and filings of other cases are omitted; a due date without action is never shown", async () => {
  const ctx = await seed();
  const visible = await filing(ctx);
  const hidden = await filing(ctx, { title: HIDDEN_FILING, receiptNumber: "LIN2222222222", clientVisible: false });
  const archived = await filing(ctx, { title: "Archived visible", receiptNumber: "LIN3333333333", archivedAt: new Date() });
  const foreign = await USCISFiling.create({ case: (await ClientCase.findOne({ title: "Other" }))!._id, workspace: ctx.workspace._id, title: "Someone else's filing", formType: "I-130", clientVisible: true });
  await event(ctx, visible, { statusTitle: "Visible status", responseDueAt: new Date("2026-06-01"), actionRequired: false });
  await event(ctx, hidden, { statusTitle: "Hidden filing status" });
  await event(ctx, archived, { statusTitle: "Archived status" });
  await event(ctx, foreign, { statusTitle: "Foreign status" });

  const body = await json(await call(ctx.caseDoc._id, ctx.owner.cookie));
  assert.deepEqual(body.filings.map((x: { title: string }) => x.title), ["I-140 petition"]);
  assert.equal(body.filings[0].currentStatus.responseDueAt, null);
  const raw = JSON.stringify(body);
  for (const leak of [HIDDEN_FILING, "Hidden filing status", "Archived", "Foreign", "Someone else", "LIN2222222222"]) assert.ok(!raw.includes(leak), `leaked: ${leak}`);
});

test("a visible filing with only internal events shows the filing but no status; a case with nothing visible is an empty list, not an error", async () => {
  const ctx = await seed();
  assert.deepEqual((await json(await call(ctx.caseDoc._id, ctx.owner.cookie))).filings, []);

  const f = await filing(ctx);
  await event(ctx, f, { statusTitle: INTERNAL_TITLE, clientVisible: false });
  const res = await call(ctx.caseDoc._id, ctx.owner.cookie);
  assert.equal(res.status, 200);
  const [shown] = (await json(res)).filings;
  assert.equal(shown.currentStatus, null);
  assert.deepEqual(shown.timeline, []);
  assert.equal(shown.receiptNumber, RECEIPT);
});

test("the client DTO carries no provider internals, employee data, audit hashes or raw document fields", async () => {
  const ctx = await seed();
  const f = await filing(ctx, { serviceCenter: "Nebraska", createdByName: "Sarah Staff" });
  await event(ctx, f, { source: "uscis_api", providerModifiedAt: new Date(), createdBy: ctx.owner.user._id });

  const body = await json(await call(ctx.caseDoc._id, ctx.owner.cookie));
  const keys = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) (keys.add(k), walk(v));
  };
  walk(body);
  for (const forbidden of ["_id", "__v", "workspace", "case", "createdBy", "createdByName", "updatedBy", "providerEventKey", "providerPayloadHash", "providerModifiedAt", "source", "observedAt", "trackingProvider", "trackingEnabled", "lastSyncErrorCode", "lastSyncErrorAt", "lastCheckedAt", "currentEvent", "clientVisible", "serviceCenter", "statusCategory"]) {
    assert.ok(!keys.has(forbidden), `client DTO exposes ${forbidden}`);
  }
  const raw = JSON.stringify(body);
  for (const leak of ["Sarah Staff", "hash-secret", "provider_unavailable", "Staff Member", String(ctx.owner.user._id)]) assert.ok(!raw.includes(leak), `leaked: ${leak}`);
});

test("membership is required on every request: other clients, removed members and signed-out callers get nothing", async () => {
  const ctx = await seed();
  const f = await filing(ctx);
  await event(ctx, f);

  const asOther = await call(ctx.caseDoc._id, ctx.other.cookie);
  assert.equal(asOther.status, 404);
  const ghost = await call("64b0f0f0f0f0f0f0f0f0f0f0", ctx.owner.cookie);
  assert.equal(ghost.status, 404);
  assert.deepEqual(await json(asOther), await json(ghost), "not-yours and does-not-exist are indistinguishable");
  assert.equal((await call("not-an-id", ctx.owner.cookie)).status, 404);
  assert.ok([401, 403].includes((await call(ctx.caseDoc._id)).status), "signed-out is refused");

  assert.equal((await call(ctx.caseDoc._id, ctx.owner.cookie)).status, 200);
  await WorkspaceMember.updateOne({ _id: ctx.membership._id }, { $set: { status: "removed" } });
  assert.equal((await call(ctx.caseDoc._id, ctx.owner.cookie)).status, 404, "removal takes effect on the very next request");
});

test("the portal endpoint is read-only: no write handlers exist", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal((uscisRoute as Record<string, unknown>)[method], undefined, method);
});

test("projection: newest visible event wins, a tie goes to the later id, filings keep their order", () => {
  const f1 = { _id: "f1", title: "A", formType: "I-140" };
  const f2 = { _id: "f2", title: "B", formType: "I-485" };
  const at = (d: string) => new Date(d);
  const out = projectClientTracking(
    [f1, f2],
    [
      { _id: "e1", filing: "f1", statusTitle: "old", occurredAt: at("2026-01-01") },
      { _id: "e2", filing: "f1", statusTitle: "tie-early-id", occurredAt: at("2026-02-01") },
      { _id: "e3", filing: "f1", statusTitle: "tie-late-id", occurredAt: at("2026-02-01") },
    ],
  );
  assert.deepEqual(out.map((f) => f.id), ["f1", "f2"]);
  assert.equal(out[0].currentStatus?.title, "tie-late-id");
  assert.deepEqual(out[0].timeline.map((e) => e.title), ["tie-late-id", "tie-early-id", "old"]);
  assert.equal(out[1].currentStatus, null);
});
