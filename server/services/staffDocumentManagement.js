const mongoose = require('mongoose');

const CaseDocument = require('../models/CaseDocument');
const DocumentVersion = require('../models/DocumentVersion');
const DocumentCategory = require('../models/DocumentCategory');
const DocumentRequest = require('../models/DocumentRequest');
const WorkspaceMember = require('../models/WorkspaceMember');
const EvidenceRequirement = require('../models/EvidenceRequirement');
const caseManagement = require('./caseManagement');
const documentPolicy = require('./documentPolicy');

function id(value) {
  return value ? String(value._id || value) : null;
}

function person(value, type) {
  if (!value) return null;
  const displayName = type === 'client'
    ? [value.firstName, value.lastName].filter(Boolean).join(' ') || value.email || 'Client'
    : value.name || value.email || 'Employee';
  return { id: id(value), type, displayName };
}

function mapCategory(category) {
  return {
    id: id(category),
    name: category.name,
    slug: category.slug,
    description: category.description || '',
    order: category.order,
    visibility: category.visibility,
    allowedUploaderTypes: category.allowedUploaderTypes,
    required: !!category.required,
    active: !!category.active,
    templateKey: category.templateKey || null,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

function mapUploader(document) {
  return document.uploadedByType === 'client'
    ? person(document.uploadedByClient, 'client')
    : person(document.uploadedByAdmin, 'employee');
}

function mapDocument(document, { evidenceCount = 0 } = {}) {
  const category = document.category;
  return {
    id: id(document),
    displayName: document.displayName || document.originalName,
    originalName: document.originalName,
    category: category && typeof category === 'object'
      ? { id: id(category), name: category.name }
      : null,
    status: document.status,
    visibility: document.visibility,
    mimeType: document.detectedMimeType || document.mimeType,
    extension: document.extension,
    size: document.size,
    scanStatus: document.scanStatus,
    uploadedBy: mapUploader(document),
    uploadedAt: document.uploadedAt || document.createdAt,
    reviewedBy: person(document.reviewedBy, 'employee'),
    reviewedAt: document.reviewedAt || null,
    clientVisibleReviewComment: document.clientVisibleReviewComment || '',
    internalReviewComment: document.internalReviewComment || '',
    currentVersionNumber: document.versionCount || 0,
    versionCount: document.versionCount || 0,
    documentRequestId: id(document.documentRequest),
    evidenceCount,
    archivedAt: document.archivedAt || null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function mapVersion(version) {
  return {
    id: id(version),
    versionNumber: version.versionNumber,
    displayName: version.displayName || version.originalName,
    originalName: version.originalName,
    mimeType: version.detectedMimeType || version.mimeType,
    extension: version.extension,
    size: version.size,
    scanStatus: version.scanStatus,
    uploadedBy: version.uploadedByType === 'client'
      ? person(version.uploadedByClient, 'client')
      : person(version.uploadedByAdmin, 'employee'),
    changeNote: version.changeNote || '',
    uploadedAt: version.createdAt,
  };
}

function mapRequest(request) {
  const member = request.requestedFrom;
  const client = member && member.clientUser ? person(member.clientUser, 'client') : null;
  return {
    id: id(request),
    category: request.category && typeof request.category === 'object'
      ? { id: id(request.category), name: request.category.name }
      : null,
    title: request.title,
    instructions: request.instructions || '',
    requestedFrom: member ? { id: id(member), client } : null,
    requestedBy: person(request.requestedBy, 'employee'),
    dueDate: request.dueDate || null,
    status: request.status,
    fulfilledByDocumentId: id(request.fulfilledByDocument),
    fulfilledAt: request.fulfilledAt || null,
    clientVisibleComment: request.clientVisibleComment || '',
    internalComment: request.internalComment || '',
    cancelledAt: request.cancelledAt || null,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

function mapClientMember(member) {
  return {
    id: id(member),
    client: person(member.clientUser, 'client'),
    status: member.status,
  };
}

function mapEvidenceReference(requirement) {
  return {
    id: id(requirement),
    title: requirement.title,
    section: requirement.section,
    status: requirement.status,
    importance: requirement.importance,
  };
}

async function resolveCaseContext(req, caseId, policyCheck) {
  const loaded = await caseManagement.loadCaseAndWorkspace(caseId);
  if (!loaded || !(await policyCheck(req, loaded.workspace._id))) return null;
  return loaded;
}

async function loadAuthorizedDocument(req, documentId, policyCheck) {
  if (!mongoose.Types.ObjectId.isValid(documentId)) return null;
  const document = await CaseDocument.findById(documentId).lean();
  if (!document || !(await policyCheck(req, document.workspace))) return null;
  return document;
}

async function capabilities(req, workspaceId) {
  const [canUpload, canReview, canArchive, canManageCategories, canManageRequests, canViewVersions] = await Promise.all([
    documentPolicy.canUploadDocument(req, workspaceId),
    documentPolicy.canReviewDocument(req, workspaceId),
    documentPolicy.canArchiveDocument(req, workspaceId),
    documentPolicy.canManageCategories(req, workspaceId),
    documentPolicy.canManageDocumentRequests(req, workspaceId),
    documentPolicy.canViewDocumentVersions(req, workspaceId),
  ]);
  return { canUpload, canReview, canArchive, canManageCategories, canManageRequests, canViewVersions };
}

async function loadAuthorizedDocumentCenter(req, caseId) {
  const context = await resolveCaseContext(req, caseId, documentPolicy.canViewDocumentCenter);
  if (!context) return null;

  const [categories, documents, requests, clientMembers, actionCapabilities] = await Promise.all([
    DocumentCategory.find({ case: context.caseDoc._id }).sort({ active: -1, order: 1 }).lean(),
    CaseDocument.find({ case: context.caseDoc._id }).populate('category', 'name').populate('uploadedByAdmin', 'name email').populate('uploadedByClient', 'firstName lastName email').populate('reviewedBy', 'name email').sort({ createdAt: -1 }).limit(200).lean(),
    DocumentRequest.find({ case: context.caseDoc._id }).populate('category', 'name').populate({ path: 'requestedFrom', populate: { path: 'clientUser', select: 'firstName lastName email' } }).populate('requestedBy', 'name email').sort({ dueDate: 1, createdAt: -1 }).lean(),
    WorkspaceMember.find({ workspace: context.workspace._id, memberType: 'client', status: { $in: ['active', 'invited'] } }).populate('clientUser', 'firstName lastName email').sort({ createdAt: 1 }).lean(),
    capabilities(req, context.workspace._id),
  ]);

  const documentIds = documents.map((document) => document._id);
  const evidenceCounts = documentIds.length === 0 ? [] : await EvidenceRequirement.aggregate([
    { $match: { case: context.caseDoc._id, linkedDocuments: { $in: documentIds } } },
    { $unwind: '$linkedDocuments' },
    { $match: { linkedDocuments: { $in: documentIds } } },
    { $group: { _id: '$linkedDocuments', count: { $sum: 1 } } },
  ]);
  const countByDocumentId = new Map(evidenceCounts.map((entry) => [String(entry._id), entry.count]));

  return {
    case: { id: id(context.caseDoc), caseNumber: context.caseDoc.caseNumber, title: context.caseDoc.title },
    categories: categories.map(mapCategory),
    documents: documents.map((document) => mapDocument(document, { evidenceCount: countByDocumentId.get(String(document._id)) || 0 })),
    requests: requests.map(mapRequest),
    clientMembers: clientMembers.map(mapClientMember),
    capabilities: actionCapabilities,
  };
}

async function loadAuthorizedDocumentDetail(req, documentId) {
  const baseDocument = await loadAuthorizedDocument(req, documentId, documentPolicy.canViewDocumentCenter);
  if (!baseDocument) return null;

  const [document, actionCapabilities, evidence] = await Promise.all([
    CaseDocument.findById(documentId).populate('category', 'name').populate('uploadedByAdmin', 'name email').populate('uploadedByClient', 'firstName lastName email').populate('reviewedBy', 'name email').populate({ path: 'documentRequest', populate: [{ path: 'category', select: 'name' }, { path: 'requestedFrom', populate: { path: 'clientUser', select: 'firstName lastName email' } }, { path: 'requestedBy', select: 'name email' }] }).lean(),
    capabilities(req, baseDocument.workspace),
    EvidenceRequirement.find({ case: baseDocument.case, linkedDocuments: baseDocument._id }).select('title section status importance').lean(),
  ]);
  const versions = actionCapabilities.canViewVersions
    ? await DocumentVersion.find({ document: baseDocument._id }).populate('uploadedByAdmin', 'name email').populate('uploadedByClient', 'firstName lastName email').sort({ versionNumber: -1 }).lean()
    : [];

  return {
    case: { id: id(baseDocument.case) },
    document: mapDocument(document, { evidenceCount: evidence.length }),
    request: document.documentRequest ? mapRequest(document.documentRequest) : null,
    versions: versions.map(mapVersion),
    relatedEvidence: evidence.map(mapEvidenceReference),
    capabilities: actionCapabilities,
  };
}

module.exports = {
  mapCategory,
  mapDocument,
  mapRequest,
  mapVersion,
  loadAuthorizedDocument,
  loadAuthorizedDocumentCenter,
  loadAuthorizedDocumentDetail,
  resolveCaseContext,
};
