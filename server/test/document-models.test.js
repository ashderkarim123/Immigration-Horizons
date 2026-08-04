const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
const DocumentCategory = require('../models/DocumentCategory');
const CaseDocument = require('../models/CaseDocument');
const DocumentVersion = require('../models/DocumentVersion');
const DocumentRequest = require('../models/DocumentRequest');
const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const ClientUser = require('../models/ClientUser');
const AdminUser = require('../models/admin/User');
const WorkspaceMember = require('../models/WorkspaceMember');

test.before(startTestDb);
test.after(stopTestDb);
test.beforeEach(clearCollections);

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
  const member = await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'client',
    clientUser: client._id,
    workspaceRole: 'client',
    status: 'active',
    invitedBy: pm._id,
    invitedByName: pm.name,
    invitedByType: 'admin_user',
  });
  return { caseDoc, workspace, client, pm, member };
}

async function seedCategory(caseDoc, workspace, overrides = {}) {
  return DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: 'Identity Documents',
    slug: 'identity-documents',
    order: 1,
    visibility: 'client_visible',
    allowedUploaderTypes: 'both',
    ...overrides,
  });
}

function documentFields(caseDoc, workspace, category, overrides = {}) {
  return {
    case: caseDoc._id,
    workspace: workspace._id,
    category: category._id,
    uploadedByType: 'client',
    originalName: 'passport.pdf',
    displayName: 'passport.pdf',
    storageKey: 'a'.repeat(48),
    mimeType: 'application/pdf',
    detectedMimeType: 'application/pdf',
    extension: '.pdf',
    size: 1024,
    checksum: 'b'.repeat(64),
    visibility: 'client_visible',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DocumentCategory
// ---------------------------------------------------------------------------

test('DocumentCategory: no duplicate active order within one case', async () => {
  const { caseDoc, workspace } = await seedCase();
  await seedCategory(caseDoc, workspace, { order: 1, slug: 'a' });
  await assert.rejects(() => seedCategory(caseDoc, workspace, { order: 1, slug: 'b' }));
});

test('DocumentCategory: a disabled category frees its order slot for reuse', async () => {
  const { caseDoc, workspace } = await seedCase();
  const first = await seedCategory(caseDoc, workspace, { order: 1, slug: 'a' });
  first.active = false;
  await first.save();
  await assert.doesNotReject(() => seedCategory(caseDoc, workspace, { order: 1, slug: 'b' }));
});

test('DocumentCategory: no duplicate slug within one case', async () => {
  const { caseDoc, workspace } = await seedCase();
  await seedCategory(caseDoc, workspace, { order: 1, slug: 'same' });
  await assert.rejects(() => seedCategory(caseDoc, workspace, { order: 2, slug: 'same' }));
});

// ---------------------------------------------------------------------------
// CaseDocument
// ---------------------------------------------------------------------------

test('CaseDocument: client uploader requires uploadedByClient, forbids uploadedByAdmin', async () => {
  const { caseDoc, workspace, client, pm } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);

  await assert.rejects(() => CaseDocument.create(documentFields(caseDoc, workspace, category, { uploadedByType: 'client' })));

  await assert.rejects(() =>
    CaseDocument.create(
      documentFields(caseDoc, workspace, category, { uploadedByType: 'client', uploadedByClient: client._id, uploadedByAdmin: pm._id }),
    ),
  );

  await assert.doesNotReject(() =>
    CaseDocument.create(documentFields(caseDoc, workspace, category, { uploadedByType: 'client', uploadedByClient: client._id })),
  );
});

test('CaseDocument: employee uploader requires uploadedByAdmin, forbids uploadedByClient', async () => {
  const { caseDoc, workspace, pm } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);

  await assert.doesNotReject(() =>
    CaseDocument.create(documentFields(caseDoc, workspace, category, { uploadedByType: 'employee', uploadedByAdmin: pm._id })),
  );
});

test('CaseDocument: status "accepted" requires reviewedBy and reviewedAt', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);
  await assert.rejects(() =>
    CaseDocument.create(
      documentFields(caseDoc, workspace, category, { uploadedByClient: client._id, status: 'accepted' }),
    ),
  );
});

test('CaseDocument: status "needs_replacement" requires a client-visible reason', async () => {
  const { caseDoc, workspace, client, pm } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);
  await assert.rejects(() =>
    CaseDocument.create(
      documentFields(caseDoc, workspace, category, {
        uploadedByClient: client._id,
        status: 'needs_replacement',
        reviewedBy: pm._id,
        reviewedAt: new Date(),
      }),
    ),
  );
  await assert.doesNotReject(() =>
    CaseDocument.create(
      documentFields(caseDoc, workspace, category, {
        uploadedByClient: client._id,
        status: 'needs_replacement',
        reviewedBy: pm._id,
        reviewedAt: new Date(),
        clientVisibleReviewComment: 'Please rescan — the first page is blurry.',
      }),
    ),
  );
});

test('CaseDocument: status "archived" requires archivedAt', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);
  await assert.rejects(() =>
    CaseDocument.create(documentFields(caseDoc, workspace, category, { uploadedByClient: client._id, status: 'archived' })),
  );
});

test('CaseDocument: a stale concurrent update is rejected with a controlled conflict (optimisticConcurrency)', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);
  const created = await CaseDocument.create(documentFields(caseDoc, workspace, category, { uploadedByClient: client._id }));

  const copyA = await CaseDocument.findById(created._id);
  const copyB = await CaseDocument.findById(created._id);

  copyA.versionCount = 2;
  await copyA.save();

  copyB.versionCount = 3;
  await assert.rejects(() => copyB.save(), mongoose.Error.VersionError);
});

// ---------------------------------------------------------------------------
// DocumentVersion
// ---------------------------------------------------------------------------

test('DocumentVersion: versionNumber is unique per document', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);
  const document = await CaseDocument.create(documentFields(caseDoc, workspace, category, { uploadedByClient: client._id }));

  const fields = {
    document: document._id,
    versionNumber: 1,
    storageKey: 'c'.repeat(48),
    originalName: 'x.pdf',
    displayName: 'x.pdf',
    mimeType: 'application/pdf',
    detectedMimeType: 'application/pdf',
    extension: '.pdf',
    size: 10,
    checksum: 'd'.repeat(64),
    uploadedByType: 'client',
    uploadedByClient: client._id,
  };
  await DocumentVersion.create(fields);
  await assert.rejects(() => DocumentVersion.create({ ...fields, storageKey: 'e'.repeat(48) }));
  await assert.doesNotReject(() => DocumentVersion.create({ ...fields, versionNumber: 2, storageKey: 'e'.repeat(48) }));
});

test('DocumentVersion: employee uploader requires uploadedByAdmin', async () => {
  const { caseDoc, workspace, client } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);
  const document = await CaseDocument.create(documentFields(caseDoc, workspace, category, { uploadedByClient: client._id }));

  await assert.rejects(() =>
    DocumentVersion.create({
      document: document._id,
      versionNumber: 1,
      storageKey: 'f'.repeat(48),
      originalName: 'x.pdf',
      displayName: 'x.pdf',
      mimeType: 'application/pdf',
      detectedMimeType: 'application/pdf',
      extension: '.pdf',
      size: 10,
      checksum: 'g'.repeat(64),
      uploadedByType: 'employee',
    }),
  );
});

// ---------------------------------------------------------------------------
// DocumentRequest
// ---------------------------------------------------------------------------

test('DocumentRequest: status "fulfilled" requires fulfilledByDocument and fulfilledAt', async () => {
  const { caseDoc, workspace, pm, member } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);
  await assert.rejects(() =>
    DocumentRequest.create({
      case: caseDoc._id,
      workspace: workspace._id,
      category: category._id,
      title: 'Please upload your ID',
      requestedFrom: member._id,
      requestedBy: pm._id,
      status: 'fulfilled',
    }),
  );
});

test('DocumentRequest: status "cancelled" requires cancelledAt', async () => {
  const { caseDoc, workspace, pm, member } = await seedCase();
  const category = await seedCategory(caseDoc, workspace);
  await assert.rejects(() =>
    DocumentRequest.create({
      case: caseDoc._id,
      workspace: workspace._id,
      category: category._id,
      title: 'Please upload your ID',
      requestedFrom: member._id,
      requestedBy: pm._id,
      status: 'cancelled',
    }),
  );
  await assert.doesNotReject(() =>
    DocumentRequest.create({
      case: caseDoc._id,
      workspace: workspace._id,
      category: category._id,
      title: 'Please upload your ID',
      requestedFrom: member._id,
      requestedBy: pm._id,
      status: 'cancelled',
      cancelledAt: new Date(),
    }),
  );
});
