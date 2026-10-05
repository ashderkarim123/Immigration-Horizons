import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader, TEST_ORIGIN } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { DocumentCategory } from "../src/lib/models/DocumentCategory";
import { DocumentRequest } from "../src/lib/models/DocumentRequest";
import { ConsultationInteraction } from "../src/lib/models/ConsultationInteraction";
import { USCISFiling } from "../src/lib/models/USCISFiling";
import { USCISStatusEvent } from "../src/lib/models/USCISStatusEvent";
import { CaseCalendarEvent } from "../src/lib/models/CaseCalendarEvent";
import { Task } from "../src/lib/models/Task";
import { NotificationPreference } from "../src/lib/models/NotificationPreference";

import { hashPassword } from "../src/lib/auth/crypto";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { POST as loginPOST } from "../src/app/api/portal/login/route";
import { POST as preferencesPOST } from "../src/app/api/portal/notifications/preferences/route";
import * as calendarRoute from "../src/app/api/portal/cases/[caseId]/calendar/route";
import { getClientCalendar, projectClientCalendar } from "../src/lib/calendar/client-view";
import { formatCalendarDate, formatCalendarInstant } from "../src/lib/calendar/format";

/**
 * Client Portal upcoming dates (ADR-027): only client-safe sources, only clientTitle/clientDescription of a shared event,
 * the Phase 11 USCIS visibility rule, stable date-only output, and membership re-checked on every request.
 */

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

const PASSWORD = "correct-horse-battery-staple";
const NOW = new Date("2026-10-14T12:00:00.000Z");
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

const INTERNAL = {
  title: "INTERNAL: weak spot in the beneficiary's employment history",
  description: "Internal-only strategy notes",
  task: "Staff-only task: draft the cover letter",
  query: "INTERNAL response deadline query",
  uscisHidden: "INTERNAL hidden USCIS notice",
};

async function client(label: string) {
  const email = `${label}-${Date.now()}-${Math.random()}@example.com`;
  const user = await ClientUser.create({ email, normalizedEmail: email, passwordHash: await hashPassword(PASSWORD), firstName: "Casey", status: "active" });
  const login = await loginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }));
  return { user, cookie: cookieHeader(SESSION_COOKIE_NAME, extractCookie(login, SESSION_COOKIE_NAME)!) };
}

async function seed() {
  const owner = await client("owner");
  const other = await client("other");
  const caseDoc = await ClientCase.create({ caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: "Case", caseType: "other", primaryClient: owner.user._id, targetFilingDate: day("2026-11-20") });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: "primary", name: "WS" });
  const membership = await WorkspaceMember.create({ workspace: workspace._id, memberType: "client", clientUser: owner.user._id, workspaceRole: "client", status: "active" });
  const otherCase = await ClientCase.create({ caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: "Other", caseType: "other", primaryClient: other.user._id });
  const otherWorkspace = await CaseWorkspace.create({ case: otherCase._id, workspaceType: "primary", name: "WS2" });
  const otherMembership = await WorkspaceMember.create({ workspace: otherWorkspace._id, memberType: "client", clientUser: other.user._id, workspaceRole: "client", status: "active" });
  const category = await DocumentCategory.create({ case: caseDoc._id, workspace: workspace._id, name: "Identity", slug: "identity", order: 1, visibility: "client_visible", allowedUploaderTypes: "both" });
  return { owner, other, caseDoc, workspace, membership, otherCase, otherWorkspace, otherMembership, category };
}
type Ctx = Awaited<ReturnType<typeof seed>>;

const request = (ctx: Ctx, over: Record<string, unknown> = {}) =>
  DocumentRequest.create({ case: ctx.caseDoc._id, workspace: ctx.workspace._id, category: ctx.category._id, title: "Passport copy", requestedFrom: ctx.membership._id, requestedBy: ctx.owner.user._id, dueDate: day("2026-10-22"), ...over });

const manual = (ctx: Ctx, over: Record<string, unknown> = {}) =>
  CaseCalendarEvent.create({
    case: ctx.caseDoc._id, workspace: ctx.workspace._id, internalTitle: INTERNAL.title, internalDescription: INTERNAL.description, allDay: false,
    startAt: new Date("2026-10-20T18:30:00Z"), timeZone: "America/New_York", location: "Internal conference room 4", meetingUrl: "https://meet.example.com/internal-room",
    clientVisible: true, clientTitle: "Interview preparation", clientDescription: "Bring your passport.", ...over,
  });

const call = (caseId: unknown, cookie?: string) =>
  calendarRoute.GET(new Request(`${TEST_ORIGIN}/api/portal/cases/${caseId}/calendar`, { headers: cookie ? { cookie } : {} }), { params: Promise.resolve({ caseId: String(caseId) }) });
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read arbitrary response bodies
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const itemsFor = (ctx: Ctx, now = NOW) => getClientCalendar({ caseId: String(ctx.caseDoc._id), workspaceId: String(ctx.workspace._id), clientUserId: String(ctx.owner.user._id) }, now);

test("the client sees their own document due date, appointment, shared event and client-visible USCIS date, in date order", async () => {
  const ctx = await seed();
  await request(ctx);
  await ConsultationInteraction.create({
    interactionNumber: `INT-${Math.random()}`, scopeType: "case", clientUser: ctx.owner.user._id, case: ctx.caseDoc._id, workspace: ctx.workspace._id,
    subject: "Strategy call", description: "d", type: "scheduled_consultation", status: "scheduled", scheduledFor: new Date("2026-10-18T18:30:00Z"), timezone: "America/New_York", createdByType: "admin",
  });
  await manual(ctx);
  const filing = await USCISFiling.create({ case: ctx.caseDoc._id, workspace: ctx.workspace._id, title: "I-140 petition", formType: "I-140", clientVisible: true });
  await USCISStatusEvent.create({ filing: filing._id, case: ctx.caseDoc._id, workspace: ctx.workspace._id, statusCategory: "rfe_issued", statusTitle: "Request for Evidence", occurredAt: new Date("2026-10-01"), observedAt: NOW, source: "manual", actionRequired: true, responseDueAt: day("2026-10-27"), clientVisible: true });

  const res = await call(ctx.caseDoc._id, ctx.owner.cookie);
  assert.equal(res.status, 200);
  const { items } = await json(res);
  assert.deepEqual(items.map((i: { kind: string }) => i.kind), ["appointment", "event", "document_due", "uscis_response"]);

  const [appointment, event, document, uscis] = items;
  assert.deepEqual([appointment.title, appointment.mode, appointment.startAt, appointment.timeZone], ["Strategy call", "datetime", "2026-10-18T18:30:00.000Z", "America/New_York"]);
  assert.deepEqual([event.title, event.description, event.startAt, event.timeZone], ["Interview preparation", "Bring your passport.", "2026-10-20T18:30:00.000Z", "America/New_York"]);
  assert.deepEqual([document.title, document.mode, document.date, document.href], ["Document due: Passport copy", "date", "2026-10-22", `/portal/cases/${ctx.caseDoc._id}/documents`]);
  assert.deepEqual([uscis.title, uscis.date, uscis.description, uscis.href], ["USCIS response due: I-140 petition", "2026-10-27", "Request for Evidence", `/portal/cases/${ctx.caseDoc._id}/uscis`]);
});

test("internal manual events, Staff tasks, the internal target filing date and internal query deadlines never appear", async () => {
  const ctx = await seed();
  await manual(ctx, { clientVisible: false, clientTitle: "" });
  await Task.create({ case: ctx.caseDoc._id, title: INTERNAL.task, dueDate: day("2026-10-20"), assigneeName: "Staff" });
  await ConsultationInteraction.create({
    interactionNumber: `INT-${Math.random()}`, scopeType: "case", clientUser: ctx.owner.user._id, case: ctx.caseDoc._id, workspace: ctx.workspace._id,
    subject: INTERNAL.query, description: "d", type: "client_question", status: "acknowledged", responseDueAt: day("2026-10-20"), createdByType: "client",
  });

  const body = await json(await call(ctx.caseDoc._id, ctx.owner.cookie));
  assert.deepEqual(body.items, []);
  const raw = JSON.stringify(body);
  for (const leak of [INTERNAL.title, INTERNAL.task, INTERNAL.query, "2026-11-20", "Internal conference room"]) assert.ok(!raw.includes(leak), `leaked: ${leak}`);
});

test("a shared event exposes only the client title and description, never internal text, location, link, attendees or ids of Staff", async () => {
  const ctx = await seed();
  await manual(ctx, { employeeAttendees: [ctx.owner.user._id], createdByName: "Sarah Staff" });
  const body = await json(await call(ctx.caseDoc._id, ctx.owner.cookie));
  const raw = JSON.stringify(body);
  for (const leak of [INTERNAL.title, INTERNAL.description, "Internal conference room", "meet.example.com", "Sarah Staff", "employeeAttendees", "internalTitle", "meetingUrl", "location", "createdBy", "clientVisible", "workspace", "_id"]) {
    assert.ok(!raw.includes(leak), `leaked: ${leak}`);
  }
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].title, "Interview preparation");
});

test("cancelled events are hidden, and an event is hidden once it is over", async () => {
  const ctx = await seed();
  await manual(ctx, { status: "cancelled", cancelledAt: NOW });
  await manual(ctx, { startAt: new Date("2026-10-10T10:00:00Z"), clientTitle: "Already happened" });
  await manual(ctx, { allDay: true, startDate: "2026-10-10", startAt: null, timeZone: null, clientTitle: "Past all-day" });
  await manual(ctx, { allDay: true, startDate: "2026-10-30", endDate: "2026-11-02", startAt: null, timeZone: null, clientTitle: "Window" });
  const items = await itemsFor(ctx);
  assert.deepEqual(items.map((i) => i.title), ["Window"]);
  assert.deepEqual([items[0].date, items[0].endDate], ["2026-10-30", "2026-11-02"]);
});

test("document requests: only this client's, only while action is needed", async () => {
  const ctx = await seed();
  await request(ctx, { title: "Mine open" });
  await request(ctx, { title: "Replacement", status: "replacement_required", dueDate: day("2026-10-25") });
  await request(ctx, { title: "Already uploaded", status: "uploaded" });
  await request(ctx, { title: "Cancelled", status: "cancelled", cancelledAt: NOW });
  await request(ctx, { title: "Someone else's", requestedFrom: ctx.otherMembership._id });
  await request(ctx, { title: "No date", dueDate: null });
  assert.deepEqual((await itemsFor(ctx)).map((i) => i.title), ["Document due: Mine open", "Document due: Replacement"]);
});

test("USCIS: the date follows the newest CLIENT-VISIBLE event; a hidden newer date, a hidden filing and an event without action never show", async () => {
  const ctx = await seed();
  const make = async (title: string, over: Record<string, unknown> = {}) => USCISFiling.create({ case: ctx.caseDoc._id, workspace: ctx.workspace._id, title, formType: "I-140", clientVisible: true, ...over });
  const event = (f: { _id: unknown }, over: Record<string, unknown>) => USCISStatusEvent.create({ filing: f._id, case: ctx.caseDoc._id, workspace: ctx.workspace._id, statusCategory: "rfe_issued", statusTitle: "RFE", occurredAt: new Date("2026-10-01"), observedAt: NOW, source: "manual", actionRequired: true, clientVisible: true, ...over });

  const shown = await make("Shown filing", { actionRequired: true, responseDueAt: day("2026-10-16") });
  await event(shown, { responseDueAt: day("2026-10-27") });
  await event(shown, { occurredAt: new Date("2026-10-05"), statusTitle: INTERNAL.uscisHidden, responseDueAt: day("2026-10-16"), clientVisible: false });

  const hiddenFiling = await make("Hidden filing", { clientVisible: false });
  await event(hiddenFiling, { responseDueAt: day("2026-10-18") });

  const noAction = await make("Resolved filing");
  await event(noAction, { occurredAt: new Date("2026-09-01"), responseDueAt: day("2026-10-19") });
  await event(noAction, { occurredAt: new Date("2026-10-02"), actionRequired: false, responseDueAt: null, statusTitle: "Response received" });

  const archived = await make("Archived filing", { archivedAt: NOW });
  await event(archived, { responseDueAt: day("2026-10-21") });

  const items = await itemsFor(ctx);
  assert.deepEqual(items.map((i) => [i.title, i.date]), [["USCIS response due: Shown filing", "2026-10-27"]], "the client date, not the Staff snapshot's 2026-10-16");
  const raw = JSON.stringify(items);
  for (const leak of [INTERNAL.uscisHidden, "Hidden filing", "Resolved filing", "Archived filing", "2026-10-16", "2026-10-18"]) assert.ok(!raw.includes(leak), `leaked: ${leak}`);
});

test("date-only values are stable: a date stored at UTC midnight is the same calendar day for every client", async () => {
  const ctx = await seed();
  await request(ctx, { dueDate: day("2026-10-31") });
  const [item] = await itemsFor(ctx);
  assert.deepEqual([item.mode, item.date, item.startAt, item.timeZone], ["date", "2026-10-31", null, null]);
  for (const zone of ["UTC", "America/New_York", "Asia/Karachi", "Asia/Tokyo", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
    assert.equal(formatCalendarDate(item.date as string), "Sat, Oct 31, 2026", zone);
  }
  // A timed value is rendered in its own zone and says which.
  assert.match(formatCalendarInstant("2026-10-20T18:30:00.000Z", "America/New_York"), /Tue, Oct 20, 2026.*2:30 PM EDT/);
  assert.match(formatCalendarInstant("2026-10-20T18:30:00.000Z", "Asia/Tokyo"), /Wed, Oct 21, 2026.*3:30 AM/);
  assert.match(formatCalendarInstant("2026-10-20T18:30:00.000Z", null), /6:30 PM UTC/);
  assert.match(formatCalendarInstant("2026-10-20T18:30:00.000Z", "EST"), /UTC/, "an invalid zone falls back to UTC rather than throwing");
});

test("past due is only claimed when a date is more than a day old, so no calendar shows it early", async () => {
  const ctx = await seed();
  await request(ctx, { title: "Due yesterday", dueDate: day("2026-10-13") });
  await request(ctx, { title: "Due two days ago", dueDate: day("2026-10-12") });
  await request(ctx, { title: "Due today", dueDate: day("2026-10-14") });
  const byTitle = Object.fromEntries((await itemsFor(ctx)).map((i) => [i.title, i.pastDue]));
  assert.deepEqual(byTitle, { "Document due: Due two days ago": true, "Document due: Due yesterday": false, "Document due: Due today": false });
});

test("the DTO is built field by field: no Mongo ids, workspace, Staff or provider data", async () => {
  const ctx = await seed();
  await request(ctx);
  await manual(ctx);
  const body = await json(await call(ctx.caseDoc._id, ctx.owner.cookie));
  const keys = new Set<string>();
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) {
        keys.add(k);
        walk(v);
      }
  };
  walk(body);
  assert.deepEqual([...keys].sort(), ["date", "description", "endAt", "endDate", "href", "id", "items", "kind", "mode", "ok", "pastDue", "startAt", "timeZone", "title"]);
});

test("membership is required on every request: other clients, removed members, strangers and signed-out callers get nothing", async () => {
  const ctx = await seed();
  await request(ctx);

  const asOther = await call(ctx.caseDoc._id, ctx.other.cookie);
  const ghost = await call("64b0f0f0f0f0f0f0f0f0f0f0", ctx.owner.cookie);
  assert.deepEqual([asOther.status, ghost.status, (await call("not-an-id", ctx.owner.cookie)).status], [404, 404, 404]);
  assert.deepEqual(await json(asOther), await json(ghost), "not-yours and does-not-exist are indistinguishable");
  assert.ok([401, 403].includes((await call(ctx.caseDoc._id)).status), "signed-out is refused");

  assert.equal((await json(await call(ctx.caseDoc._id, ctx.owner.cookie))).items.length, 1);
  await WorkspaceMember.updateOne({ _id: ctx.membership._id }, { $set: { status: "removed" } });
  assert.equal((await call(ctx.caseDoc._id, ctx.owner.cookie)).status, 404, "removal takes effect on the very next request");
  assert.deepEqual(await itemsFor(ctx), [], "and the projection itself re-checks membership");
});

test("a case with nothing shared is an empty list, not an error; the endpoint is read-only", async () => {
  const ctx = await seed();
  const res = await call(ctx.caseDoc._id, ctx.owner.cookie);
  assert.equal(res.status, 200);
  assert.deepEqual((await json(res)).items, []);
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal((calendarRoute as Record<string, unknown>)[method], undefined, method);
});

test("projection: items sort by day then time, date-only first within a day, and the list is bounded", () => {
  const out = projectClientCalendar(
    {
      caseId: "c1",
      documents: [{ _id: "d1", title: "Doc", dueDate: day("2026-10-20") }],
      appointments: [{ _id: "q1", subject: "Call", scheduledFor: new Date("2026-10-20T09:00:00Z"), timezone: "UTC" }],
      uscis: { filings: [], newestVisibleEvents: new Map() },
      events: [{ _id: "e1", clientTitle: "Earlier", allDay: true, startDate: "2026-10-19" }],
    },
    NOW,
  );
  assert.deepEqual(out.map((i) => i.id), ["manual_event:e1", "document_request:d1:dueDate", "query:q1:scheduledFor"]);
});

test("reminder preferences: the client can switch each category off, and an older form cannot do it by omission", async () => {
  const ctx = await seed();
  const post = (body: Record<string, unknown>) => preferencesPOST(jsonRequest("/api/portal/notifications/preferences", body, { cookie: ctx.owner.cookie }));
  const stored = () => NotificationPreference.findOne({ recipientClient: ctx.owner.user._id }).lean();

  assert.equal((await post({ mentionEmails: true, digestEmails: true, digestFrequency: "daily" })).status, 200);
  assert.deepEqual([(await stored())!.deadlineReminders, (await stored())!.appointmentReminders], [true, true]);

  await post({ mentionEmails: true, digestEmails: true, digestFrequency: "daily", deadlineReminders: false });
  assert.deepEqual([(await stored())!.deadlineReminders, (await stored())!.appointmentReminders], [false, true]);

  await post({ mentionEmails: false, digestEmails: true, digestFrequency: "weekly" });
  assert.deepEqual([(await stored())!.deadlineReminders, (await stored())!.digestFrequency], [false, "weekly"], "a form that does not send the switch leaves it alone");

  await post({ mentionEmails: true, digestEmails: true, digestFrequency: "daily", appointmentReminders: "no" });
  assert.equal((await stored())!.appointmentReminders, true, "a non-boolean is ignored");
});
