import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startTestDb, stopTestDb, clearCollections } from "./helpers/testDb";

import { ClientUser } from "../src/lib/models/ClientUser";
import { ClientCase } from "../src/lib/models/ClientCase";
import { CaseWorkspace } from "../src/lib/models/CaseWorkspace";
import { WorkspaceMember } from "../src/lib/models/WorkspaceMember";
import { DocumentCategory } from "../src/lib/models/DocumentCategory";
import { CaseDocument } from "../src/lib/models/CaseDocument";

import { getAccessibleDocumentCenter, getAccessibleDocument } from "../src/lib/auth/document-policy";

before(startTestDb);
after(stopTestDb);
beforeEach(clearCollections);

async function seedCaseWithMember(membershipStatus: "active" | "invited" | "removed" | "suspended") {
  const email = `doc-policy-${Date.now()}-${Math.random()}@example.com`;
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

test("an active member can access the document center", async () => {
  const { client, caseDoc } = await seedCaseWithMember("active");
  const center = await getAccessibleDocumentCenter(String(caseDoc._id), String(client._id));
  assert.ok(center);
});

test("a removed member immediately loses document-center access", async () => {
  const { client, caseDoc } = await seedCaseWithMember("removed");
  const center = await getAccessibleDocumentCenter(String(caseDoc._id), String(client._id));
  assert.equal(center, null);
});

test("a suspended member has no document-center access", async () => {
  const { client, caseDoc } = await seedCaseWithMember("suspended");
  const center = await getAccessibleDocumentCenter(String(caseDoc._id), String(client._id));
  assert.equal(center, null);
});

test("an invited (not yet active) member has no document-center access", async () => {
  const { client, caseDoc } = await seedCaseWithMember("invited");
  const center = await getAccessibleDocumentCenter(String(caseDoc._id), String(client._id));
  assert.equal(center, null);
});

test("the client-visible category list never includes an employees_only category", async () => {
  const { client, caseDoc, workspace } = await seedCaseWithMember("active");
  await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: "Public",
    slug: "public",
    order: 1,
    visibility: "client_visible",
    allowedUploaderTypes: "both",
  });
  await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: "Internal",
    slug: "internal",
    order: 2,
    visibility: "employees_only",
    allowedUploaderTypes: "employee",
  });

  const center = await getAccessibleDocumentCenter(String(caseDoc._id), String(client._id));
  assert.equal(center!.categories.length, 1);
  assert.equal(center!.categories[0].slug, "public");
});

test("getAccessibleDocument returns null for an employees_only document even for an active member", async () => {
  const { client, caseDoc, workspace } = await seedCaseWithMember("active");
  const category = await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: "Internal",
    slug: "internal",
    order: 1,
    visibility: "employees_only",
    allowedUploaderTypes: "employee",
  });
  const document = await CaseDocument.create({
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    uploadedByType: "client",
    uploadedByClient: client._id,
    originalName: "x.pdf",
    displayName: "x.pdf",
    storageKey: "a".repeat(48),
    mimeType: "application/pdf",
    detectedMimeType: "application/pdf",
    extension: ".pdf",
    size: 10,
    checksum: "b".repeat(64),
    visibility: "employees_only",
  });

  const accessible = await getAccessibleDocument(String(document._id), String(client._id));
  assert.equal(accessible, null);
});

test("getAccessibleDocument returns null for a quarantined document even for the uploading client", async () => {
  const { client, caseDoc, workspace } = await seedCaseWithMember("active");
  const category = await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: "Public",
    slug: "public",
    order: 1,
    visibility: "client_visible",
    allowedUploaderTypes: "both",
  });
  const document = await CaseDocument.create({
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    uploadedByType: "client",
    uploadedByClient: client._id,
    originalName: "x.pdf",
    displayName: "x.pdf",
    storageKey: "a".repeat(48),
    mimeType: "application/pdf",
    detectedMimeType: "application/pdf",
    extension: ".pdf",
    size: 10,
    checksum: "b".repeat(64),
    visibility: "client_visible",
    status: "quarantined",
  });

  const accessible = await getAccessibleDocument(String(document._id), String(client._id));
  assert.equal(accessible, null);
});

test("a nonexistent document id and another client's document return the identical null", async () => {
  const { caseDoc, workspace } = await seedCaseWithMember("active");
  const { client: otherClient } = await seedCaseWithMember("active");
  const category = await DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: "Public",
    slug: "public",
    order: 1,
    visibility: "client_visible",
    allowedUploaderTypes: "both",
  });
  const document = await CaseDocument.create({
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    uploadedByType: "employee",
    uploadedByAdmin: "507f1f77bcf86cd799439011",
    originalName: "x.pdf",
    displayName: "x.pdf",
    storageKey: "a".repeat(48),
    mimeType: "application/pdf",
    detectedMimeType: "application/pdf",
    extension: ".pdf",
    size: 10,
    checksum: "b".repeat(64),
    visibility: "client_visible",
  });

  const forOtherClient = await getAccessibleDocument(String(document._id), String(otherClient._id));
  const forNonexistentId = await getAccessibleDocument("507f1f77bcf86cd799439099", String(otherClient._id));
  assert.equal(forOtherClient, null);
  assert.equal(forNonexistentId, null);
});
