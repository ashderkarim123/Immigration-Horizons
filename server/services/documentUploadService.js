const mongoose = require('mongoose');
const fsp = require('fs/promises');

const CaseDocument = require('../models/CaseDocument');
const DocumentVersion = require('../models/DocumentVersion');
const DocumentCategory = require('../models/DocumentCategory');
const DocumentRequest = require('../models/DocumentRequest');
const CaseActivity = require('../models/CaseActivity');
const ClientCase = require('../models/ClientCase');
const AdminUser = require('../models/admin/User');

const { withOptionalTransaction } = require('../utils/transaction');
const { LocalPrivateStorageProvider } = require('./storage/localPrivateStorageProvider');
const scanner = require('./storage/scanner');
const { validateFileSignature, sanitizeDisplayName, maxFileSizeBytes } = require('./documentValidation');
const { notify } = require('../utils/notify');
const { emitDocumentUploadedMessage } = require('./systemMessageService');

/**
 * Best-effort — an audit/notification failure must never turn an
 * already-committed upload into a reported failure (same principle as
 * caseConversion.js's "Audit + notify" section).
 */
async function auditAndNotifyUpload({ document, caseId, workspaceId, actorName, isReplacement }) {
  try {
    await CaseActivity.record({
      caseId,
      workspaceId,
      type: isReplacement ? 'document_replacement_uploaded' : 'document_uploaded',
      message: `"${document.displayName}" ${isReplacement ? 'replaced' : 'uploaded'} by ${actorName}.`,
    });

    await emitDocumentUploadedMessage({
      workspaceId,
      documentId: document._id,
      versionNumber: document.versionCount,
      displayName: document.displayName,
      clientVisible: document.visibility === 'client_visible',
    });

    if (document.uploadedByType !== 'client') return; // only client uploads need to reach an employee's inbox

    const caseDoc = await ClientCase.findById(caseId).select('projectManager caseNumber').lean();
    if (!caseDoc || !caseDoc.projectManager) return;
    const manager = await AdminUser.findById(caseDoc.projectManager).select('name').lean();
    if (!manager) return;

    await notify({
      recipientName: manager.name,
      title: isReplacement ? 'Document replacement uploaded' : 'Document uploaded',
      message: `A client uploaded "${document.displayName}" on case ${caseDoc.caseNumber}.`,
      type: isReplacement ? 'document_replacement_uploaded' : 'document_uploaded',
      relatedCase: caseId,
      relatedDocument: document._id,
    });
  } catch (err) {
    console.error('[documents] audit/notify failed after a successful upload:', err.message);
  }
}

const provider = new LocalPrivateStorageProvider();

function isVersionConflict(err) {
  return err instanceof mongoose.Error.VersionError;
}

/** Mirrors interactionService.js's saveGuarded — VersionError -> a controlled conflict, not a 500 (ADR-004 §20). */
async function saveGuarded(doc, options) {
  try {
    await doc.save(options);
  } catch (err) {
    if (isVersionConflict(err)) {
      const conflictError = new Error('This document was updated by someone else. Please reload and try again.');
      conflictError.isVersionConflict = true;
      throw conflictError;
    }
    throw err;
  }
}

async function cleanupOnRejection(storageKey) {
  await provider.deleteTemp(storageKey).catch(() => {});
}

async function cleanupOnCommitFailure(storageKey, quarantined) {
  if (quarantined) {
    await provider.deleteQuarantined(storageKey).catch((err) => {
      console.error(`[documents] Orphan storage object left in quarantine/ after a DB failure: ${storageKey}`, err.message);
    });
  } else {
    await provider.delete(storageKey).catch((err) => {
      console.error(`[documents] Orphan storage object left in active/ after a DB failure: ${storageKey}`, err.message);
    });
  }
}

/**
 * Validates an already-temp-written file (checksum/signature/duplicate),
 * then commits it to active or quarantine storage. Shared by the initial
 * upload and version-replacement paths — see ADR-004 §9/§17.
 */
async function validateAndCommit({ storageKey, caseId, category, extension, declaredMimeType }) {
  const { size, checksum } = await provider.checksumTempFile(storageKey);

  if (size > maxFileSizeBytes()) {
    await cleanupOnRejection(storageKey);
    return { outcome: 'validation_error', errors: { file: `File exceeds the maximum allowed size (${Math.floor(maxFileSizeBytes() / (1024 * 1024))}MB).` } };
  }

  const buffer = await fsp.readFile(provider.resolveTempPath(storageKey));
  const signatureResult = await validateFileSignature({ declaredMimeType, extension, buffer });
  if (!signatureResult.valid) {
    await cleanupOnRejection(storageKey);
    return { outcome: 'validation_error', errors: { file: signatureResult.reason } };
  }

  const duplicate = await CaseDocument.findOne({
    case: caseId,
    checksum,
    category: category._id,
    status: { $ne: 'archived' },
  }).lean();
  if (duplicate) {
    await cleanupOnRejection(storageKey);
    return { outcome: 'duplicate_detected', documentId: duplicate._id };
  }

  const scanResult = await scanner.scan(storageKey, { size, checksum });
  const quarantined = scanResult.status === 'infected' || scanResult.status === 'error';
  if (quarantined) {
    await provider.quarantine(storageKey);
  } else {
    await provider.put(storageKey);
  }

  return {
    outcome: 'validated',
    size,
    checksum,
    quarantined,
    scanResult,
    detectedMimeType: signatureResult.detectedMimeType,
  };
}

/**
 * Full upload pipeline for a brand-new CaseDocument (first version). The
 * caller has already streamed the incoming file to temp/<storageKey> via
 * the storage provider convention (ADR-004 §8) — multer's diskStorage for
 * the admin route, `provider.writeTempFile()` for the portal route.
 */
async function uploadDocument({
  caseId,
  workspaceId,
  categoryId,
  documentRequestId,
  storageKey,
  originalName,
  declaredMimeType,
  extension,
  uploaderType,
  uploaderClientId,
  uploaderAdminId,
  actorName,
}) {
  const category = await DocumentCategory.findOne({ _id: categoryId, case: caseId, active: true });
  if (!category) {
    await cleanupOnRejection(storageKey);
    return { outcome: 'validation_error', errors: { category: 'This category is not available for this case.' } };
  }
  if (category.allowedUploaderTypes !== 'both' && category.allowedUploaderTypes !== uploaderType) {
    await cleanupOnRejection(storageKey);
    return { outcome: 'validation_error', errors: { category: 'This category does not accept uploads from you.' } };
  }

  let request = null;
  if (documentRequestId) {
    request = await DocumentRequest.findOne({ _id: documentRequestId, case: caseId });
    if (!request) {
      await cleanupOnRejection(storageKey);
      return { outcome: 'validation_error', errors: { documentRequest: 'This request was not found for this case.' } };
    }
    if (String(request.category) !== String(categoryId)) {
      await cleanupOnRejection(storageKey);
      return { outcome: 'validation_error', errors: { category: 'This upload must use the requested category.' } };
    }
  }

  const validated = await validateAndCommit({ storageKey, caseId, category, extension, declaredMimeType });
  if (validated.outcome !== 'validated') return validated;

  const { size, checksum, quarantined, scanResult, detectedMimeType } = validated;
  const displayName = sanitizeDisplayName(originalName);

  let document;
  let version;
  try {
    const { result } = await withOptionalTransaction(async (session) => {
      const createdDocument = await CaseDocument.create(
        [
          {
            case: caseId,
            workspace: workspaceId,
            category: categoryId,
            uploadedByType: uploaderType,
            uploadedByClient: uploaderType === 'client' ? uploaderClientId : null,
            uploadedByAdmin: uploaderType === 'employee' ? uploaderAdminId : null,
            originalName,
            displayName,
            storageKey,
            mimeType: declaredMimeType,
            detectedMimeType,
            extension,
            size,
            checksum,
            status: quarantined ? 'quarantined' : 'uploaded',
            visibility: category.visibility,
            scanStatus: scanResult.status,
            scanProvider: 'none',
            scanCompletedAt: new Date(),
            scanMessage: scanResult.message || '',
            versionCount: 1,
            documentRequest: request ? request._id : null,
            uploadedAt: new Date(),
          },
        ],
        { session: session || undefined },
      ).then((docs) => docs[0]);

      const createdVersion = await DocumentVersion.create(
        [
          {
            document: createdDocument._id,
            versionNumber: 1,
            storageKey,
            originalName,
            displayName,
            mimeType: declaredMimeType,
            detectedMimeType,
            extension,
            size,
            checksum,
            uploadedByType: uploaderType,
            uploadedByClient: uploaderType === 'client' ? uploaderClientId : null,
            uploadedByAdmin: uploaderType === 'employee' ? uploaderAdminId : null,
            scanStatus: scanResult.status,
          },
        ],
        { session: session || undefined },
      ).then((docs) => docs[0]);

      createdDocument.currentVersion = createdVersion._id;
      await createdDocument.save({ session: session || undefined });

      if (request && request.status !== 'fulfilled') {
        request.status = 'uploaded';
        await request.save({ session: session || undefined });
      }

      return { createdDocument, createdVersion };
    });
    document = result.createdDocument;
    version = result.createdVersion;
  } catch (err) {
    await cleanupOnCommitFailure(storageKey, quarantined);
    throw err;
  }

  await auditAndNotifyUpload({ document, caseId, workspaceId, actorName: actorName || 'Someone', isReplacement: false });

  return { outcome: 'created', document, version, quarantined };
}

/**
 * Replaces a document's current version — creates a new immutable
 * DocumentVersion, never mutates an existing one (ADR-004 §20/§24).
 */
async function replaceDocumentVersion({
  documentId,
  storageKey,
  originalName,
  declaredMimeType,
  extension,
  uploaderType,
  uploaderClientId,
  uploaderAdminId,
  changeNote,
  actorName,
}) {
  const document = await CaseDocument.findById(documentId);
  if (!document || document.status === 'archived') {
    await cleanupOnRejection(storageKey);
    return { outcome: 'not_found' };
  }

  const category = await DocumentCategory.findById(document.category);
  const validated = await validateAndCommit({
    storageKey,
    caseId: document.case,
    category,
    extension,
    declaredMimeType,
  });
  if (validated.outcome !== 'validated') return validated;

  const { size, checksum, quarantined, scanResult, detectedMimeType } = validated;
  const displayName = sanitizeDisplayName(originalName);
  const nextVersionNumber = document.versionCount + 1;

  let version;
  try {
    const { result } = await withOptionalTransaction(async (session) => {
      const createdVersion = await DocumentVersion.create(
        [
          {
            document: document._id,
            versionNumber: nextVersionNumber,
            storageKey,
            originalName,
            displayName,
            mimeType: declaredMimeType,
            detectedMimeType,
            extension,
            size,
            checksum,
            uploadedByType: uploaderType,
            uploadedByClient: uploaderType === 'client' ? uploaderClientId : null,
            uploadedByAdmin: uploaderType === 'employee' ? uploaderAdminId : null,
            changeNote: changeNote || '',
            scanStatus: scanResult.status,
          },
        ],
        { session: session || undefined },
      ).then((docs) => docs[0]);

      document.currentVersion = createdVersion._id;
      document.versionCount = nextVersionNumber;
      document.originalName = originalName;
      document.displayName = displayName;
      document.storageKey = storageKey;
      document.mimeType = declaredMimeType;
      document.detectedMimeType = detectedMimeType;
      document.extension = extension;
      document.size = size;
      document.checksum = checksum;
      document.status = quarantined ? 'quarantined' : 'pending_review';
      document.scanStatus = scanResult.status;
      document.scanCompletedAt = new Date();
      document.scanMessage = scanResult.message || '';
      // Reset review metadata — a replacement is a new submission (module doc §24 point 8).
      document.reviewedBy = null;
      document.reviewedAt = null;
      document.clientVisibleReviewComment = '';
      document.internalReviewComment = '';

      await saveGuarded(document, { session: session || undefined });

      if (document.documentRequest) {
        const request = await DocumentRequest.findById(document.documentRequest).session(session || null);
        if (request && request.status !== 'fulfilled') {
          request.status = 'uploaded';
          await request.save({ session: session || undefined });
        }
      }

      return { createdVersion };
    });
    version = result.createdVersion;
  } catch (err) {
    await cleanupOnCommitFailure(storageKey, quarantined);
    throw err;
  }

  await auditAndNotifyUpload({
    document,
    caseId: document.case,
    workspaceId: document.workspace,
    actorName: actorName || 'Someone',
    isReplacement: true,
  });

  return { outcome: 'replaced', document, version, quarantined };
}

module.exports = {
  provider,
  saveGuarded,
  isVersionConflict,
  uploadDocument,
  replaceDocumentVersion,
};
