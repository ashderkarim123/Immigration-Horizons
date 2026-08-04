import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import os from "os";
import path from "path";
import fsp from "fs/promises";

process.env.SITE_URL = "http://localhost:3000";
// Must be set before src/lib/documents/document-upload-service.ts is first
// imported anywhere in this process (its storage-provider singleton reads
// PRIVATE_DOCUMENT_ROOT at module-evaluation time) — since ESM hoists
// static imports ahead of this file's own top-level statements, every
// module that (transitively) imports document-upload-service.ts is loaded
// dynamically below, inside before(), after this line has already run.
const TEST_STORAGE_ROOT = path.join(
  os.tmpdir(),
  `ih-doc-routes-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);
process.env.PRIVATE_DOCUMENT_ROOT = TEST_STORAGE_ROOT;

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";
import { jsonRequest, formDataRequest, extractCookie, cookieHeader } from "./helpers/http";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { DocumentCategory } from "../src/lib/models/DocumentCategory";
import { CaseDocument } from "../src/lib/models/CaseDocument";
import { DocumentRequest } from "../src/lib/models/DocumentRequest";

import { hashPassword } from "../src/lib/auth/crypto";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/session";

import { POST as loginPOST } from "../src/app/api/portal/login/route";

// Dynamic imports (after PRIVATE_DOCUMENT_ROOT is set above) — see comment.
let uploadRoute: typeof import("../src/app/api/portal/cases/[caseId]/documents/route");
let requestUploadRoute: typeof import("../src/app/api/portal/document-requests/[requestId]/upload/route");
let downloadRoute: typeof import("../src/app/portal/documents/[documentId]/download/route");

before(async () => {
  await startTestDb();
  uploadRoute = await import("../src/app/api/portal/cases/[caseId]/documents/route");
  requestUploadRoute = await import("../src/app/api/portal/document-requests/[requestId]/upload/route");
  downloadRoute = await import("../src/app/portal/documents/[documentId]/download/route");
});
after(async () => {
  await stopTestDb();
  await fsp.rm(TEST_STORAGE_ROOT, { recursive: true, force: true }).catch(() => {});
});
beforeEach(clearCollections);

const STRONG_PASSWORD = "correct-horse-battery-staple";
const MINIMAL_PDF = Buffer.from("%PDF-1.4\n1 0 obj<< >>endobj\ntrailer<< >>\n%%EOF");

async function seedActiveCaseForClient() {
  const email = `route-doc-client-${Date.now()}-${Math.random()}@example.com`;
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
  const member = await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: "client",
    clientUser: client._id,
    workspaceRole: "client",
    status: "active",
  });
  const category = await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: "Identity Documents",
    slug: "identity-documents",
    order: 1,
    visibility: "client_visible",
    allowedUploaderTypes: "both",
  });

  const loginRes = await loginPOST(jsonRequest("/api/portal/login", { email, password: STRONG_PASSWORD }));
  const cookie = cookieHeader(SESSION_COOKIE_NAME, extractCookie(loginRes, SESSION_COOKIE_NAME)!);

  return { client, caseDoc, workspace, member, category, cookie };
}

function pdfFormData(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  formData.set("file", new File([MINIMAL_PDF], "passport.pdf", { type: "application/pdf" }));
  return formData;
}

test("POST /api/portal/cases/:caseId/documents: authenticated client uploads into an allowed category", async () => {
  const { caseDoc, category, cookie } = await seedActiveCaseForClient();

  const res = await uploadRoute.POST(
    formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, pdfFormData({ categoryId: String(category._id) }), { cookie }),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.documentId);

  const created = await CaseDocument.findById(body.documentId).lean();
  assert.equal(created!.uploadedByType, "client");
  assert.equal(created!.status, "uploaded");
});

test("POST /api/portal/cases/:caseId/documents: unauthenticated request is rejected", async () => {
  const { caseDoc, category } = await seedActiveCaseForClient();
  const res = await uploadRoute.POST(
    formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, pdfFormData({ categoryId: String(category._id) })),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(res.status, 401);
});

test("POST /api/portal/cases/:caseId/documents: CSRF — mismatched Origin is rejected", async () => {
  const { caseDoc, category, cookie } = await seedActiveCaseForClient();
  const res = await uploadRoute.POST(
    formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, pdfFormData({ categoryId: String(category._id) }), {
      cookie,
      origin: "https://evil.example.com",
    }),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(res.status, 403);
});

test("POST /api/portal/cases/:caseId/documents: another client's case is denied (cross-client access)", async () => {
  const { caseDoc } = await seedActiveCaseForClient();
  const { cookie: otherCookie } = await seedActiveCaseForClient(); // a different, unrelated client+case

  const category = await DocumentCategory.findOne({ case: caseDoc._id });
  const res = await uploadRoute.POST(
    formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, pdfFormData({ categoryId: String(category!._id) }), {
      cookie: otherCookie,
    }),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(res.status, 404); // not_found, not 403 — never confirm the category/case exists to a non-member
});

test("POST /api/portal/cases/:caseId/documents: upload into an employees_only category is denied", async () => {
  const { caseDoc, workspace, cookie } = await seedActiveCaseForClient();
  const internalCategory = await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: "Internal Strategy",
    slug: "internal-strategy",
    order: 2,
    visibility: "employees_only",
    allowedUploaderTypes: "employee",
  });

  const res = await uploadRoute.POST(
    formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, pdfFormData({ categoryId: String(internalCategory._id) }), {
      cookie,
    }),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  assert.equal(res.status, 404);
});

test("POST /api/portal/cases/:caseId/documents: a duplicate upload returns a controlled conflict, not a second document", async () => {
  const { caseDoc, category, cookie } = await seedActiveCaseForClient();
  const formData1 = pdfFormData({ categoryId: String(category._id) });
  const res1 = await uploadRoute.POST(formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, formData1, { cookie }), {
    params: Promise.resolve({ caseId: String(caseDoc._id) }),
  });
  assert.equal(res1.status, 200);

  const formData2 = pdfFormData({ categoryId: String(category._id) });
  const res2 = await uploadRoute.POST(formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, formData2, { cookie }), {
    params: Promise.resolve({ caseId: String(caseDoc._id) }),
  });
  assert.equal(res2.status, 409);

  const count = await CaseDocument.countDocuments({ case: caseDoc._id });
  assert.equal(count, 1);
});

test("GET /portal/documents/:documentId/download: owner can download, another client cannot", async () => {
  const { caseDoc, category, cookie } = await seedActiveCaseForClient();
  const uploadRes = await uploadRoute.POST(
    formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, pdfFormData({ categoryId: String(category._id) }), { cookie }),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  const { documentId } = await uploadRes.json();

  const ownDownload = await downloadRoute.GET(
    new Request(`http://localhost:3000/portal/documents/${documentId}/download`, { headers: { cookie } }),
    { params: Promise.resolve({ documentId }) },
  );
  assert.equal(ownDownload.status, 200);
  assert.equal(ownDownload.headers.get("content-type"), "application/pdf");
  assert.match(ownDownload.headers.get("content-disposition") ?? "", /attachment/);

  const { cookie: otherCookie } = await seedActiveCaseForClient();
  const deniedDownload = await downloadRoute.GET(
    new Request(`http://localhost:3000/portal/documents/${documentId}/download`, { headers: { cookie: otherCookie } }),
    { params: Promise.resolve({ documentId }) },
  );
  assert.equal(deniedDownload.status, 404);
});

test("GET /portal/documents/:documentId/download: unauthenticated request is rejected", async () => {
  const { caseDoc, category, cookie } = await seedActiveCaseForClient();
  const uploadRes = await uploadRoute.POST(
    formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, pdfFormData({ categoryId: String(category._id) }), { cookie }),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  const { documentId } = await uploadRes.json();

  const res = await downloadRoute.GET(new Request(`http://localhost:3000/portal/documents/${documentId}/download`), {
    params: Promise.resolve({ documentId }),
  });
  assert.equal(res.status, 401);
});

test("POST /api/portal/cases/:caseId/documents: replaceDocumentId creates a second version, not a second document", async () => {
  const { caseDoc, category, cookie } = await seedActiveCaseForClient();
  const uploadRes = await uploadRoute.POST(
    formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, pdfFormData({ categoryId: String(category._id) }), { cookie }),
    { params: Promise.resolve({ caseId: String(caseDoc._id) }) },
  );
  const { documentId } = await uploadRes.json();

  const replaceFormData = new FormData();
  replaceFormData.set("replaceDocumentId", documentId);
  replaceFormData.set("file", new File([Buffer.from(MINIMAL_PDF.toString() + " v2")], "passport-v2.pdf", { type: "application/pdf" }));

  const replaceRes = await uploadRoute.POST(formDataRequest(`/api/portal/cases/${caseDoc._id}/documents`, replaceFormData, { cookie }), {
    params: Promise.resolve({ caseId: String(caseDoc._id) }),
  });
  assert.equal(replaceRes.status, 200);

  const updated = await CaseDocument.findById(documentId).lean();
  assert.equal(updated!.versionCount, 2);

  const count = await CaseDocument.countDocuments({ case: caseDoc._id });
  assert.equal(count, 1);
});

test("POST /api/portal/document-requests/:requestId/upload: fulfills a request and denies another client's request id", async () => {
  const { caseDoc, workspace, member, category, cookie } = await seedActiveCaseForClient();
  const request = await DocumentRequest.create({
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    title: "Please upload your passport",
    requestedFrom: member._id,
    status: "open",
  });

  const res = await requestUploadRoute.POST(
    formDataRequest(`/api/portal/document-requests/${request._id}/upload`, pdfFormData({}), { cookie }),
    { params: Promise.resolve({ requestId: String(request._id) }) },
  );
  assert.equal(res.status, 200);

  const updatedRequest = await DocumentRequest.findById(request._id).lean();
  assert.equal(updatedRequest!.status, "uploaded");

  const { cookie: otherCookie } = await seedActiveCaseForClient();
  const deniedRes = await requestUploadRoute.POST(
    formDataRequest(`/api/portal/document-requests/${request._id}/upload`, pdfFormData({}), { cookie: otherCookie }),
    { params: Promise.resolve({ requestId: String(request._id) }) },
  );
  assert.equal(deniedRes.status, 404);
});
