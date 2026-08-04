process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const os = require('os');
const path = require('path');

// Must be set before documentUploadService.js (and anything that requires
// it) is first required anywhere in this process — the storage provider
// singleton reads PRIVATE_DOCUMENT_ROOT at module-load time.
process.env.PRIVATE_DOCUMENT_ROOT = path.join(
  os.tmpdir(),
  `ih-doc-lifecycle-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
);

const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const fsp = require('fs/promises');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const ClientUser = require('../../models/ClientUser');
const AdminUser = require('../../models/admin/User');
const DocumentCategory = require('../../models/DocumentCategory');
const CaseDocument = require('../../models/CaseDocument');

const categoryService = require('../../services/documentCategoryService');
const { uploadDocument, replaceDocumentVersion, provider } = require('../../services/documentUploadService');
const { reviewDocument } = require('../../services/documentReviewService');
const scannerModule = require('../../services/storage/scanner');

test.before(startTestDb);
test.after(async () => {
  await stopTestDb();
  await fsp.rm(process.env.PRIVATE_DOCUMENT_ROOT, { recursive: true, force: true }).catch(() => {});
});
test.beforeEach(clearCollections);

const MINIMAL_PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj<< >>endobj\ntrailer<< >>\n%%EOF');

async function seedCase() {
  const pm = await AdminUser.create({ name: 'PM', email: `pm-${Date.now()}-${Math.random()}@example.com`, password: 'x', role: 'pm' });
  const client = await ClientUser.create({
    email: `client-${Date.now()}-${Math.random()}@example.com`,
    normalizedEmail: `client-${Date.now()}-${Math.random()}@example.com`,
    passwordHash: 'x',
    status: 'active',
  });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Case',
    caseType: 'other',
    primaryClient: client._id,
    projectManager: pm._id,
    createdBy: pm._id,
    createdByName: pm.name,
  });
  const workspace = await CaseWorkspace.create({
    case: caseDoc._id,
    workspaceType: 'primary',
    name: 'WS',
    createdBy: pm._id,
    createdByName: pm.name,
  });
  return { caseDoc, workspace, client, pm };
}

async function seedCategory(caseDoc, workspace, overrides = {}) {
  return DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: 'Identity Documents',
    slug: `identity-documents-${Math.random().toString(36).slice(2)}`,
    order: overrides.order ?? 1,
    visibility: 'client_visible',
    allowedUploaderTypes: 'both',
    ...overrides,
  });
}

async function writeAndUpload({ caseDoc, workspace, category, pm, filename = 'passport.pdf' }) {
  const storageKey = provider.generateStorageKey();
  await provider.writeTempFile(Readable.from([MINIMAL_PDF_BYTES]), storageKey);
  return uploadDocument({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    categoryId: category._id,
    storageKey,
    originalName: filename,
    declaredMimeType: 'application/pdf',
    extension: '.pdf',
    uploaderType: 'employee',
    uploaderAdminId: pm._id,
    actorName: pm.name,
  });
}

test('full lifecycle: upload -> accept -> replace produces a second version and resets review', async () => {
  const { caseDoc, workspace, pm } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);

  const uploaded = await writeAndUpload({ caseDoc, workspace, category, pm });
  assert.equal(uploaded.outcome, 'created');
  assert.equal(uploaded.document.status, 'uploaded');
  assert.equal(uploaded.document.versionCount, 1);

  const reviewed = await reviewDocument({
    documentId: uploaded.document._id,
    decision: 'accepted',
    actor: { id: pm._id, name: pm.name, type: 'admin_user' },
  });
  assert.equal(reviewed.outcome, 'updated');
  assert.equal(reviewed.document.status, 'accepted');

  const storageKey2 = provider.generateStorageKey();
  await provider.writeTempFile(Readable.from([Buffer.from(MINIMAL_PDF_BYTES.toString() + ' extra')]), storageKey2);
  const replaced = await replaceDocumentVersion({
    documentId: uploaded.document._id,
    storageKey: storageKey2,
    originalName: 'passport-v2.pdf',
    declaredMimeType: 'application/pdf',
    extension: '.pdf',
    uploaderType: 'employee',
    uploaderAdminId: pm._id,
    actorName: pm.name,
  });
  assert.equal(replaced.outcome, 'replaced');
  assert.equal(replaced.document.versionCount, 2);
  assert.equal(replaced.document.status, 'pending_review');
  assert.equal(replaced.document.reviewedBy, null);

  const persisted = await CaseDocument.findById(uploaded.document._id).lean();
  assert.equal(persisted.versionCount, 2);
  assert.equal(String(persisted.currentVersion), String(replaced.version._id));
});

test('rejecting a document requires a client-visible reason', async () => {
  const { caseDoc, workspace, pm } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);
  const uploaded = await writeAndUpload({ caseDoc, workspace, category, pm });

  const result = await reviewDocument({
    documentId: uploaded.document._id,
    decision: 'rejected',
    actor: { id: pm._id, name: pm.name, type: 'admin_user' },
  });
  assert.equal(result.outcome, 'validation_error');
});

test('duplicate detection: the same checksum in the same case+category does not create a second document', async () => {
  const { caseDoc, workspace, pm } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);

  const first = await writeAndUpload({ caseDoc, workspace, category, pm });
  assert.equal(first.outcome, 'created');

  const second = await writeAndUpload({ caseDoc, workspace, category, pm, filename: 'passport-copy.pdf' });
  assert.equal(second.outcome, 'duplicate_detected');

  const count = await CaseDocument.countDocuments({ case: caseDoc._id });
  assert.equal(count, 1);
});

test('the same checksum in a DIFFERENT category is allowed (deliberate reuse, not a duplicate)', async () => {
  const { caseDoc, workspace, pm } = await seedCase();
  const categoryA = await seedCategory(caseDoc, workspace, { order: 1 });
  const categoryB = await seedCategory(caseDoc, workspace, { order: 2, name: 'Other' });

  const first = await writeAndUpload({ caseDoc, workspace, category: categoryA, pm });
  assert.equal(first.outcome, 'created');

  const storageKey = provider.generateStorageKey();
  await provider.writeTempFile(Readable.from([MINIMAL_PDF_BYTES]), storageKey);
  const second = await uploadDocument({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    categoryId: categoryB._id,
    storageKey,
    originalName: 'passport.pdf',
    declaredMimeType: 'application/pdf',
    extension: '.pdf',
    uploaderType: 'employee',
    uploaderAdminId: pm._id,
    actorName: pm.name,
  });
  assert.equal(second.outcome, 'created');
});

test('a category belonging to a different case is rejected — cross-case upload denied', async () => {
  const { caseDoc: caseA, workspace: workspaceA, pm } = await seedCase();
  const { caseDoc: caseB } = await seedCase();
  const categoryOnA = await seedCategory(caseA, workspaceA);

  const storageKey = provider.generateStorageKey();
  await provider.writeTempFile(Readable.from([MINIMAL_PDF_BYTES]), storageKey);
  const result = await uploadDocument({
    caseId: caseB._id, // uploading against case B...
    workspaceId: workspaceA._id,
    categoryId: categoryOnA._id, // ...with a category that belongs to a different case
    storageKey,
    originalName: 'passport.pdf',
    declaredMimeType: 'application/pdf',
    extension: '.pdf',
    uploaderType: 'employee',
    uploaderAdminId: pm._id,
  });
  assert.equal(result.outcome, 'validation_error');

  const count = await CaseDocument.countDocuments({});
  assert.equal(count, 0);
});

test('an infected scan result quarantines the document and it is excluded from normal access', async () => {
  const originalScan = scannerModule.scan;
  scannerModule.scan = async () => ({ status: 'infected', message: 'test double: simulated infection' });
  try {
    const { caseDoc, workspace, pm } = await seedCase();
    const category = await seedCategory(caseDoc, workspace);
    const result = await writeAndUpload({ caseDoc, workspace, category, pm });
    assert.equal(result.outcome, 'created');
    assert.equal(result.document.status, 'quarantined');
    assert.equal(result.quarantined, true);

    // The storage object must be in quarantine/, not active/.
    await assert.rejects(() => provider.getStream(result.document.storageKey));
  } finally {
    scannerModule.scan = originalScan;
  }
});

test('category provisioning is idempotent — re-running creates no duplicates', async () => {
  const { caseDoc, workspace } = await seedCase();
  const first = await categoryService.provisionDefaultCategories({ caseId: caseDoc._id, workspaceId: workspace._id });
  assert.equal(first.created.length, 19);

  const second = await categoryService.provisionDefaultCategories({ caseId: caseDoc._id, workspaceId: workspace._id });
  assert.equal(second.created.length, 0);

  const total = await DocumentCategory.countDocuments({ case: caseDoc._id });
  assert.equal(total, 19);
});

test('reorderCategories rejects a category id that belongs to a different case', async () => {
  const { caseDoc, workspace } = await seedCase();
  const { caseDoc: otherCase, workspace: otherWorkspace } = await seedCase();
  const own = await seedCategory(caseDoc, workspace, { order: 1 });
  const foreign = await seedCategory(otherCase, otherWorkspace, { order: 1 });

  const result = await categoryService.reorderCategories({
    caseId: caseDoc._id,
    orderedCategoryIds: [String(own._id), String(foreign._id)],
    actor: { id: null, name: 'Test', type: 'system' },
  });
  assert.equal(result.outcome, 'validation_error');
});

test('reorderCategories reassigns order values without a unique-index collision', async () => {
  const { caseDoc, workspace, pm } = await seedCase();
  const a = await seedCategory(caseDoc, workspace, { order: 1, name: 'A' });
  const b = await seedCategory(caseDoc, workspace, { order: 2, name: 'B' });

  const result = await categoryService.reorderCategories({
    caseId: caseDoc._id,
    orderedCategoryIds: [String(b._id), String(a._id)],
    actor: { id: pm._id, name: pm.name, type: 'admin_user' },
  });
  assert.equal(result.outcome, 'updated');

  const reloadedA = await DocumentCategory.findById(a._id);
  const reloadedB = await DocumentCategory.findById(b._id);
  assert.equal(reloadedB.order, 1);
  assert.equal(reloadedA.order, 2);
});
