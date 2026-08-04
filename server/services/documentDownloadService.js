const CaseDocument = require('../models/CaseDocument');
const DocumentVersion = require('../models/DocumentVersion');
const DocumentAccessLog = require('../models/DocumentAccessLog');
const { provider } = require('./documentUploadService');

/**
 * Resolves and authorizes a download request, then returns everything the
 * route needs to stream a response — the route itself never touches the
 * storage provider or DocumentAccessLog directly, so every download goes
 * through this one, audited path (ADR-004 §14/§16).
 *
 * `versionId` is optional — omitted means "current version." Quarantined
 * documents are never downloadable through this function, for anyone.
 */
async function resolveDownload({ documentId, versionId, actor }) {
  const document = await CaseDocument.findById(documentId);
  if (!document) {
    return { outcome: 'not_found' };
  }

  let version;
  if (versionId) {
    version = await DocumentVersion.findOne({ _id: versionId, document: document._id });
    if (!version) {
      await DocumentAccessLog.record({ documentId: document._id, versionId: null, caseId: document.case, actor, result: 'not_found' });
      return { outcome: 'not_found' };
    }
  } else {
    version = await DocumentVersion.findById(document.currentVersion);
    if (!version) {
      await DocumentAccessLog.record({ documentId: document._id, versionId: null, caseId: document.case, actor, result: 'not_found' });
      return { outcome: 'not_found' };
    }
  }

  if (document.status === 'quarantined') {
    await DocumentAccessLog.record({ documentId: document._id, versionId: version._id, caseId: document.case, actor, result: 'denied' });
    return { outcome: 'denied' };
  }

  let stream;
  try {
    stream = await provider.getStream(version.storageKey);
  } catch (err) {
    await DocumentAccessLog.record({ documentId: document._id, versionId: version._id, caseId: document.case, actor, result: 'not_found' });
    return { outcome: 'not_found' };
  }

  await DocumentAccessLog.record({ documentId: document._id, versionId: version._id, caseId: document.case, actor, result: 'success' });

  return {
    outcome: 'ok',
    document,
    version,
    stream,
    filename: version.displayName,
    contentType: version.detectedMimeType,
  };
}

module.exports = { resolveDownload };
