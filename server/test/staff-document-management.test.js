const test = require('node:test');
const assert = require('node:assert/strict');

const {
  mapCategory,
  mapDocument,
  mapRequest,
  mapVersion,
} = require('../services/staffDocumentManagement');

function assertNoSensitiveKeys(value) {
  const prohibited = new Set(['storageKey', 'privatePath', 'tempPath', 'storageRoot', 'checksum', 'password', 'passwordHash', 'token', 'tokenHash', 'secret']);
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(prohibited.has(key), false, `DTO leaked prohibited key: ${key}`);
    assertNoSensitiveKeys(nested);
  }
}

test('staff document DTO mappers expose only intentional metadata', () => {
  const category = mapCategory({
    _id: 'category-id', name: 'Identity', slug: 'identity', description: 'Records', order: 1,
    visibility: 'client_visible', allowedUploaderTypes: 'both', required: true, active: true,
    templateKey: 'identity', createdAt: new Date(), updatedAt: new Date(),
  });
  const document = mapDocument({
    _id: 'document-id', displayName: 'passport.pdf', originalName: 'passport.pdf', category: { _id: 'category-id', name: 'Identity' },
    status: 'uploaded', visibility: 'client_visible', mimeType: 'application/pdf', detectedMimeType: 'application/pdf', extension: '.pdf',
    size: 2048, scanStatus: 'not_configured', uploadedByType: 'employee', uploadedByAdmin: { _id: 'staff-id', name: 'Case Manager', email: 'staff@example.test', passwordHash: 'hidden' },
    storageKey: 'private-key', checksum: 'private-checksum', reviewedBy: null, versionCount: 1, documentRequest: null,
    uploadedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
  });
  const version = mapVersion({
    _id: 'version-id', versionNumber: 1, displayName: 'passport.pdf', originalName: 'passport.pdf', mimeType: 'application/pdf', detectedMimeType: 'application/pdf',
    extension: '.pdf', size: 2048, scanStatus: 'not_configured', uploadedByType: 'employee', uploadedByAdmin: { _id: 'staff-id', name: 'Case Manager' },
    storageKey: 'private-version-key', checksum: 'private-version-checksum', changeNote: '', createdAt: new Date(),
  });
  const request = mapRequest({
    _id: 'request-id', category: { _id: 'category-id', name: 'Identity' }, title: 'Passport', instructions: 'Upload a scan',
    requestedFrom: { _id: 'member-id', clientUser: { _id: 'client-id', firstName: 'Amina', lastName: 'Khan', email: 'amina@example.test', tokenHash: 'hidden' } },
    requestedBy: { _id: 'staff-id', name: 'Case Manager' }, status: 'open', createdAt: new Date(), updatedAt: new Date(),
  });

  assert.equal(document.id, 'document-id');
  assert.equal(document.uploadedBy.displayName, 'Case Manager');
  assert.equal(version.versionNumber, 1);
  assert.equal(request.requestedFrom.client.displayName, 'Amina Khan');
  assert.equal(category.name, 'Identity');
  assertNoSensitiveKeys({ category, document, version, request });
});
