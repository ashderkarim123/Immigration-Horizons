import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import vectors from "../docs/architecture/smart-form-engine-vectors.json" with { type: "json" };
import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, extractCookie, cookieHeader, nextTestIp, TEST_ORIGIN } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { SmartFormTemplate } from "../src/lib/models/SmartFormTemplate";
import { CaseSmartForm } from "../src/lib/models/CaseSmartForm";
import { SmartFormAudit } from "../src/lib/models/SmartFormAudit";
import { CaseActivity } from "../src/lib/models/CaseActivity";

import { hashPassword } from "../src/lib/auth/crypto";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";
import { POST as loginPOST } from "../src/app/api/portal/login/route";
import * as formRoute from "../src/app/api/portal/forms/[formId]/route";
import * as answersRoute from "../src/app/api/portal/forms/[formId]/answers/route";
import * as submitRoute from "../src/app/api/portal/forms/[formId]/submit/route";
import * as caseFormsRoute from "../src/app/api/portal/cases/[caseId]/forms/route";

before(startTestDb);
after(stopTestDb);
beforeEach(async () => {
  await clearCollections();
  await Promise.all([CaseSmartForm.init(), SmartFormAudit.init()]);
});

const PASSWORD = "correct-horse-battery-staple";
const SECRET = "Zanzibar-Secret-Street-77";
const STAFF_NOTE = "Staff-only passport observation";
const INTERNAL_NOTE = "Internal reviewer thought";

const COMPLETE = {
  name: "Casey Rivera",
  has_other: false,
  home: { line1: SECRET, city: "Austin", country: "us" },
  trips: [{ when: "2024-01-01", why: "Conference" }],
};

async function seed() {
  const template = await SmartFormTemplate.create({
    key: `vector_form_${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    title: "Vector form",
    caseTypes: ["other"],
    sections: vectors.template.sections,
    status: "published",
  });

  async function client(label: string) {
    const email = `${label}-${Date.now()}-${Math.random()}@example.com`;
    const user = await ClientUser.create({ email, normalizedEmail: email, passwordHash: await hashPassword(PASSWORD), firstName: "Casey", status: "active" });
    const login = await loginPOST(jsonRequest("/api/portal/login", { email, password: PASSWORD }));
    return { user, cookie: cookieHeader(SESSION_COOKIE_NAME, extractCookie(login, SESSION_COOKIE_NAME)!) };
  }

  async function caseFor(owner: { user: { _id: unknown } }) {
    const caseDoc = await ClientCase.create({ caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, title: "Case", caseType: "other", primaryClient: owner.user._id });
    const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: "primary", name: "WS" });
    await WorkspaceMember.create({ workspace: workspace._id, memberType: "client", clientUser: owner.user._id, workspaceRole: "client", status: "active" });
    const form = await CaseSmartForm.create({
      case: caseDoc._id,
      workspace: workspace._id,
      template: template._id,
      templateKey: template.key,
      templateVersion: 1,
      templateTitleSnapshot: "Vector form",
      answers: { staff_note: STAFF_NOTE },
      internalReviewNote: INTERNAL_NOTE,
      clientReviewNote: "Please double-check your address.",
    });
    return { caseDoc, workspace, form };
  }

  const owner = await client("owner");
  const other = await client("other");
  return { template, owner, other, ...(await caseFor(owner)), otherCase: await caseFor(other) };
}

const params = (formId: unknown) => ({ params: Promise.resolve({ formId: String(formId) }) });
const withCookie = (cookie: string, origin: string | null = TEST_ORIGIN) => {
  const headers = new Headers({ "content-type": "application/json", cookie, "x-forwarded-for": nextTestIp() });
  if (origin) headers.set("origin", origin);
  return headers;
};
const get = (path: string, cookie: string) => new Request(`${TEST_ORIGIN}${path}`, { headers: { cookie } });
const patch = (formId: unknown, cookie: string, body: unknown, origin: string | null = TEST_ORIGIN) =>
  answersRoute.PATCH(new Request(`${TEST_ORIGIN}/api/portal/forms/${formId}/answers`, { method: "PATCH", headers: withCookie(cookie, origin), body: JSON.stringify(body) }), params(formId));
const submit = (formId: unknown, cookie: string, body: unknown) =>
  submitRoute.POST(jsonRequest(`/api/portal/forms/${formId}/submit`, body, { cookie }), params(formId));
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests read arbitrary response bodies
const json = async (res: Response) => (await res.json()) as Record<string, any>;

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

test("a client sees their forms, with no staff-only definition, answer or internal note", async () => {
  const { owner, caseDoc, form } = await seed();

  const list = await caseFormsRoute.GET(get(`/api/portal/cases/${caseDoc._id}/forms`, owner.cookie), { params: Promise.resolve({ caseId: String(caseDoc._id) }) });
  assert.equal(list.status, 200);
  assert.deepEqual((await json(list)).forms.map((f: { id: string }) => f.id), [String(form._id)]);

  const res = await formRoute.GET(get(`/api/portal/forms/${form._id}`, owner.cookie), params(form._id));
  assert.equal(res.status, 200);
  const text = JSON.stringify(await res.clone().json());
  assert.equal(text.includes(STAFF_NOTE), false, "staff-only answer leaked");
  assert.equal(text.includes("staff_note"), false, "staff-only field definition leaked");
  assert.equal(text.includes(INTERNAL_NOTE), false, "internal review note leaked");
  assert.equal(text.includes("internalReviewNote"), false);
  const body = await json(res);
  assert.equal(body.form.status, "draft");
  assert.equal(body.form.actions.canEdit, true);
  assert.equal(body.form.clientReviewNote, "", "a review note is only shown while the form is waiting on the client");
});

test("another client's form, a missing form and a malformed id are the same 404; no session is 401", async () => {
  const { owner, otherCase, form } = await seed();

  assert.equal((await formRoute.GET(get(`/api/portal/forms/${otherCase.form._id}`, owner.cookie), params(otherCase.form._id))).status, 404);
  assert.equal((await formRoute.GET(get("/api/portal/forms/64b0f0f0f0f0f0f0f0f0f0f0", owner.cookie), params("64b0f0f0f0f0f0f0f0f0f0f0"))).status, 404);
  assert.equal((await formRoute.GET(get("/api/portal/forms/not-an-id", owner.cookie), params("not-an-id"))).status, 404);
  assert.equal((await patch(otherCase.form._id, owner.cookie, { revision: 1, answers: { name: "x" } })).status, 404);
  assert.equal((await submit(otherCase.form._id, owner.cookie, { revision: 1 })).status, 404);
  assert.equal((await caseFormsRoute.GET(get(`/api/portal/cases/${otherCase.caseDoc._id}/forms`, owner.cookie), { params: Promise.resolve({ caseId: String(otherCase.caseDoc._id) }) })).status, 404);

  assert.equal((await formRoute.GET(new Request(`${TEST_ORIGIN}/api/portal/forms/${form._id}`), params(form._id))).status, 401);
});

test("a removed client member loses access immediately", async () => {
  const { owner, workspace, form } = await seed();
  await WorkspaceMember.updateOne({ workspace: workspace._id, clientUser: owner.user._id }, { status: "removed" });
  assert.equal((await formRoute.GET(get(`/api/portal/forms/${form._id}`, owner.cookie), params(form._id))).status, 404);
});

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

test("autosave stores normalised answers, bumps the revision and audits keys only", async () => {
  const { owner, form } = await seed();
  const res = await patch(form._id, owner.cookie, { revision: 1, answers: COMPLETE });
  assert.equal(res.status, 200);
  const body = await json(res);
  assert.equal(body.form.revision, 2);
  assert.equal(body.form.answers.home.country, "US");
  assert.deepEqual(body.form.progress, { completedRequired: 4, totalRequired: 4, percent: 100 });

  const stored = (await CaseSmartForm.findById(form._id).lean()) as { answers: Record<string, unknown>; lastSavedByType: string };
  assert.equal(stored.lastSavedByType, "client");
  assert.equal(stored.answers.staff_note, STAFF_NOTE, "a client save never touches staff-only answers");

  const audits = await SmartFormAudit.find({ caseSmartForm: form._id }).lean();
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actorType, "client");
  assert.deepEqual([...audits[0].changedFieldKeys].sort(), ["has_other", "home", "name", "trips"]);
  assert.equal(JSON.stringify(audits).includes(SECRET), false, "audit rows must not hold answer values");
});

test("a client cannot write a staff-only or unknown key, and nothing is written", async () => {
  const { owner, form } = await seed();
  const res = await patch(form._id, owner.cookie, { revision: 1, answers: { name: "Ok", staff_note: "tamper", nope: 1 } });
  assert.equal(res.status, 422);
  const body = await json(res);
  assert.ok(body.error.fieldErrors.staff_note);
  assert.ok(body.error.fieldErrors.nope);
  const stored = (await CaseSmartForm.findById(form._id).lean()) as { revision: number; answers: Record<string, unknown> };
  assert.equal(stored.revision, 1);
  assert.equal(stored.answers.staff_note, STAFF_NOTE);
  assert.equal((await patch(form._id, owner.cookie, { answers: { name: "x" } })).status, 422); // revision is mandatory
});

test("a stale revision is a 409 with the current revision, and never overwrites", async () => {
  const { owner, form } = await seed();
  assert.equal((await patch(form._id, owner.cookie, { revision: 1, answers: { name: "First" } })).status, 200);
  const stale = await patch(form._id, owner.cookie, { revision: 1, answers: { name: "Second" } });
  assert.equal(stale.status, 409);
  const body = await json(stale);
  assert.equal(body.error.code, "conflict");
  assert.equal(body.error.current.revision, 2);
  assert.equal(((await CaseSmartForm.findById(form._id).lean()) as { answers: { name: string } }).answers.name, "First");
});

test("two simultaneous saves of the same revision: exactly one wins", async () => {
  const { owner, form } = await seed();
  const results = await Promise.all([
    patch(form._id, owner.cookie, { revision: 1, answers: { name: "A" } }),
    patch(form._id, owner.cookie, { revision: 1, answers: { name: "B" } }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test("a mutation without a trusted Origin is refused", async () => {
  const { owner, form } = await seed();
  assert.equal((await patch(form._id, owner.cookie, { revision: 1, answers: { name: "x" } }, null)).status, 403);
  assert.equal((await patch(form._id, owner.cookie, { revision: 1, answers: { name: "x" } }, "https://evil.example")).status, 403);
  assert.equal((await submitRoute.POST(jsonRequest(`/api/portal/forms/${form._id}/submit`, { revision: 1 }, { cookie: owner.cookie, origin: "https://evil.example" }), params(form._id))).status, 403);
});

// ---------------------------------------------------------------------------
// Submit and the return loop
// ---------------------------------------------------------------------------

test("submit validates on the server, then freezes client editing until staff return the form", async () => {
  const { owner, caseDoc, form } = await seed();

  const incomplete = await submit(form._id, owner.cookie, { revision: 1 });
  assert.equal(incomplete.status, 422);
  assert.ok((await json(incomplete)).error.fieldErrors.name);
  assert.equal(((await CaseSmartForm.findById(form._id).lean()) as { status: string }).status, "draft");

  const saved = await json(await patch(form._id, owner.cookie, { revision: 1, answers: COMPLETE }));
  const submitted = await submit(form._id, owner.cookie, { revision: saved.form.revision });
  assert.equal(submitted.status, 200);
  const body = await json(submitted);
  assert.equal(body.form.status, "submitted");
  assert.equal(body.form.actions.canEdit, false);

  const edit = await patch(form._id, owner.cookie, { revision: body.form.revision, answers: { name: "Tamper" } });
  assert.equal(edit.status, 409);
  assert.equal((await json(edit)).error.code, "invalid_state");
  assert.equal((await submit(form._id, owner.cookie, { revision: body.form.revision })).status, 409);

  const activity = await CaseActivity.find({ case: caseDoc._id, type: "form_submitted" }).lean();
  assert.equal(activity.length, 1);
  assert.equal(activity[0].actorType, "system");
  assert.equal(JSON.stringify(activity).includes(SECRET), false, "case activity must not carry answers");
});

test("when staff return the form the client sees the note and can edit and resubmit; locked is immutable", async () => {
  const { owner, form } = await seed();
  await CaseSmartForm.updateOne({ _id: form._id }, { answers: { ...COMPLETE, staff_note: STAFF_NOTE }, status: "needs_changes", clientReviewNote: "Please confirm your trips.", $inc: { revision: 1 } });

  const view = await json(await formRoute.GET(get(`/api/portal/forms/${form._id}`, owner.cookie), params(form._id)));
  assert.equal(view.form.status, "needs_changes");
  assert.equal(view.form.clientReviewNote, "Please confirm your trips.");
  assert.equal(JSON.stringify(view).includes(INTERNAL_NOTE), false);

  const edited = await patch(form._id, owner.cookie, { revision: view.form.revision, answers: { trips: [{ when: "2024-02-02" }] } });
  assert.equal(edited.status, 200);
  const resubmitted = await submit(form._id, owner.cookie, { revision: (await json(edited)).form.revision });
  assert.equal(resubmitted.status, 200);

  await CaseSmartForm.updateOne({ _id: form._id }, { status: "locked", $inc: { revision: 1 } });
  const locked = await json(await formRoute.GET(get(`/api/portal/forms/${form._id}`, owner.cookie), params(form._id)));
  assert.equal(locked.form.actions.canEdit, false);
  const tamper = await patch(form._id, owner.cookie, { revision: locked.form.revision, answers: { name: "Tamper" } });
  assert.equal(tamper.status, 409);
  assert.equal(((await CaseSmartForm.findById(form._id).lean()) as { answers: { name: string } }).answers.name, "Casey Rivera");
});
