const express = require('express');
const multer = require('multer');

const CaseDocument = require('../../../../models/CaseDocument');
const DocumentCategory = require('../../../../models/DocumentCategory');
const DocumentRequest = require('../../../../models/DocumentRequest');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { createApiError } = require('../../../../middleware/api/apiError');
const documentPolicy = require('../../../../services/documentPolicy');
const categoryService = require('../../../../services/documentCategoryService');
const requestService = require('../../../../services/documentRequestService');
const reviewService = require('../../../../services/documentReviewService');
const downloadService = require('../../../../services/documentDownloadService');
const { provider, uploadDocument, replaceDocumentVersion } = require('../../../../services/documentUploadService');
const { maxFileSizeBytes, extensionOf } = require('../../../../services/documentValidation');
const staffDocumentManagement = require('../../../../services/staffDocumentManagement');

const router = express.Router();

function actorFromStaff(req) {
  return { type: 'admin_user', id: req.staff._id, name: req.staff.name || 'Employee' };
}

function response(res, req, data, status = 200) {
  return res.status(status).json({ data, meta: { requestId: req.id } });
}

function mapOutcome(result, req, res, mapper) {
  if (result.outcome === 'validation_error') {
    throw createApiError(400, 'validation_error', 'Please correct the highlighted fields.', result.errors);
  }
  if (result.outcome === 'duplicate_detected') {
    throw createApiError(409, 'duplicate_document', 'An identical document already exists in this category.');
  }
  if (result.outcome === 'not_found') {
    throw createApiError(404, 'not_found', 'Document resource not found.');
  }
  return response(res, req, mapper(result), result.outcome === 'created' ? 201 : 200);
}

function createDocumentUploadMiddleware() {
  const parser = multer({
    storage: multer.diskStorage({
      destination: (req, file, callback) => {
        provider.ensureDirs().then(() => callback(null, provider.tempDir)).catch(callback);
      },
      filename: (req, file, callback) => {
        const storageKey = provider.generateStorageKey();
        req.documentStorageKey = storageKey;
        req.documentOriginalName = file.originalname;
        req.documentDeclaredMimeType = file.mimetype;
        callback(null, storageKey);
      },
    }),
    limits: { fileSize: maxFileSizeBytes(), files: 1 },
  }).single('file');

  return (req, res, next) => parser(req, res, async (err) => {
    if (!err) {
      if (!req.file || !req.documentStorageKey) {
        return next(createApiError(400, 'validation_error', 'A document file is required.', { file: 'A document file is required.' }));
      }
      return next();
    }

    if (req.documentStorageKey) await provider.deleteTemp(req.documentStorageKey).catch(() => {});
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(createApiError(413, 'file_too_large', 'The uploaded file exceeds the maximum allowed size.'));
    }
    return next(createApiError(400, 'invalid_upload', 'The document upload could not be processed.'));
  });
}

const parseDocumentUpload = createDocumentUploadMiddleware();

function caseAccess(policyCheck) {
  return async (req, res, next) => {
    try {
      const context = await staffDocumentManagement.resolveCaseContext(req, req.params.caseId, policyCheck);
      if (!context) return next(createApiError(404, 'not_found', 'Case not found.'));
      req.documentCaseContext = context;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function documentAccess(policyCheck) {
  return async (req, res, next) => {
    try {
      const document = await staffDocumentManagement.loadAuthorizedDocument(req, req.params.documentId, policyCheck);
      if (!document) return next(createApiError(404, 'not_found', 'Document not found.'));
      req.authorizedDocument = document;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function categoryAccess() {
  return async (req, res, next) => {
    try {
      const category = await DocumentCategory.findById(req.params.categoryId).lean();
      if (!category || !(await documentPolicy.canManageCategories(req, category.workspace))) {
        return next(createApiError(404, 'not_found', 'Document category not found.'));
      }
      req.authorizedCategory = category;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function requestAccess() {
  return async (req, res, next) => {
    try {
      const request = await DocumentRequest.findById(req.params.requestId).lean();
      if (!request || !(await documentPolicy.canManageDocumentRequests(req, request.workspace))) {
        return next(createApiError(404, 'not_found', 'Document request not found.'));
      }
      req.authorizedDocumentRequest = request;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function cleanupTempOnError(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (err) {
      if (req.documentStorageKey) await provider.deleteTemp(req.documentStorageKey).catch(() => {});
      next(err);
    }
  };
}

function validDate(value) {
  return !value || Number.isFinite(new Date(value).getTime());
}

// GET /api/v1/staff/cases/:caseId/documents
router.get('/cases/:caseId/documents', requireApiCapability('documents.view'), async (req, res, next) => {
  try {
    const center = await staffDocumentManagement.loadAuthorizedDocumentCenter(req, req.params.caseId);
    if (!center) return next(createApiError(404, 'not_found', 'Case not found.'));
    return response(res, req, center);
  } catch (err) {
    return next(err);
  }
});

// GET /api/v1/staff/documents/:documentId
router.get('/documents/:documentId', requireApiCapability('documents.view'), async (req, res, next) => {
  try {
    const detail = await staffDocumentManagement.loadAuthorizedDocumentDetail(req, req.params.documentId);
    if (!detail) return next(createApiError(404, 'not_found', 'Document not found.'));
    return response(res, req, detail);
  } catch (err) {
    return next(err);
  }
});

// POST /api/v1/staff/cases/:caseId/documents
router.post(
  '/cases/:caseId/documents',
  trustedOriginMiddleware,
  requireApiCapability('documents.upload'),
  caseAccess(documentPolicy.canUploadDocument),
  parseDocumentUpload,
  cleanupTempOnError(async (req, res) => {
    const actor = actorFromStaff(req);
    const result = await uploadDocument({
      caseId: req.documentCaseContext.caseDoc._id,
      workspaceId: req.documentCaseContext.workspace._id,
      categoryId: req.body.categoryId,
      documentRequestId: req.body.documentRequestId || null,
      storageKey: req.documentStorageKey,
      originalName: req.documentOriginalName,
      declaredMimeType: req.documentDeclaredMimeType,
      extension: extensionOf(req.documentOriginalName),
      uploaderType: 'employee',
      uploaderAdminId: actor.id,
      actorName: actor.name,
    });
    return mapOutcome(result, req, res, (outcome) => ({
      document: staffDocumentManagement.mapDocument(outcome.document),
      version: staffDocumentManagement.mapVersion(outcome.version),
    }));
  }),
);

// POST /api/v1/staff/documents/:documentId/versions
router.post(
  '/documents/:documentId/versions',
  trustedOriginMiddleware,
  requireApiCapability('documents.upload'),
  documentAccess(documentPolicy.canUploadDocument),
  parseDocumentUpload,
  cleanupTempOnError(async (req, res) => {
    const actor = actorFromStaff(req);
    try {
      const result = await replaceDocumentVersion({
        documentId: req.authorizedDocument._id,
        storageKey: req.documentStorageKey,
        originalName: req.documentOriginalName,
        declaredMimeType: req.documentDeclaredMimeType,
        extension: extensionOf(req.documentOriginalName),
        uploaderType: 'employee',
        uploaderAdminId: actor.id,
        changeNote: req.body.changeNote,
        actorName: actor.name,
      });
      return mapOutcome(result, req, res, (outcome) => ({
        document: staffDocumentManagement.mapDocument(outcome.document),
        version: staffDocumentManagement.mapVersion(outcome.version),
      }));
    } catch (err) {
      if (err.isVersionConflict) throw createApiError(409, 'version_conflict', err.message);
      throw err;
    }
  }),
);

// PATCH /api/v1/staff/documents/:documentId/review
router.patch('/documents/:documentId/review', trustedOriginMiddleware, requireApiCapability('documents.review'), documentAccess(documentPolicy.canReviewDocument), async (req, res, next) => {
  try {
    if (!['accepted', 'needs_replacement', 'rejected'].includes(req.body.decision)) {
      throw createApiError(400, 'validation_error', 'A valid review decision is required.', { decision: 'Choose accepted, needs replacement, or rejected.' });
    }
    const result = await reviewService.reviewDocument({
      documentId: req.authorizedDocument._id,
      decision: req.body.decision,
      clientVisibleReviewComment: req.body.clientVisibleReviewComment,
      internalReviewComment: req.body.internalReviewComment,
      actor: actorFromStaff(req),
    });
    return mapOutcome(result, req, res, (outcome) => ({ document: staffDocumentManagement.mapDocument(outcome.document) }));
  } catch (err) {
    return next(err);
  }
});

// PATCH /api/v1/staff/documents/:documentId/category
router.patch('/documents/:documentId/category', trustedOriginMiddleware, requireApiCapability('documents.review'), documentAccess(documentPolicy.canReviewDocument), async (req, res, next) => {
  try {
    const result = await reviewService.moveDocumentCategory({
      documentId: req.authorizedDocument._id,
      newCategoryId: req.body.categoryId,
      actor: actorFromStaff(req),
    });
    return mapOutcome(result, req, res, (outcome) => ({ document: staffDocumentManagement.mapDocument(outcome.document) }));
  } catch (err) {
    return next(err);
  }
});

// POST /api/v1/staff/documents/:documentId/archive
router.post('/documents/:documentId/archive', trustedOriginMiddleware, requireApiCapability('documents.archive'), documentAccess(documentPolicy.canArchiveDocument), async (req, res, next) => {
  try {
    const result = await reviewService.archiveDocument({ documentId: req.authorizedDocument._id, actor: actorFromStaff(req) });
    return mapOutcome(result, req, res, (outcome) => ({ document: staffDocumentManagement.mapDocument(outcome.document) }));
  } catch (err) {
    return next(err);
  }
});

async function download(req, res, next, versionId) {
  try {
    const actor = actorFromStaff(req);
    const result = await downloadService.resolveDownload({
      documentId: req.authorizedDocument._id,
      versionId,
      actor,
    });
    if (result.outcome === 'not_found') return next(createApiError(404, 'not_found', 'Document file not found.'));
    if (result.outcome === 'denied') return next(createApiError(404, 'not_found', 'Document file not found.'));
    res.set({
      'Content-Disposition': `attachment; filename="${result.filename.replace(/"/g, '')}"`,
      'Content-Type': result.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': 'sandbox',
    });
    result.stream.on('error', next).pipe(res);
  } catch (err) {
    next(err);
  }
}

router.get('/documents/:documentId/download', requireApiCapability('documents.view'), documentAccess(documentPolicy.canViewDocumentCenter), (req, res, next) => download(req, res, next, null));
router.get('/documents/:documentId/versions/:versionId/download', requireApiCapability('document_versions.view'), documentAccess(documentPolicy.canViewDocumentVersions), (req, res, next) => download(req, res, next, req.params.versionId));

// Category management
router.post('/cases/:caseId/document-categories/initialize', trustedOriginMiddleware, requireApiCapability('document_categories.manage'), caseAccess(documentPolicy.canManageCategories), async (req, res, next) => {
  try {
    const result = await categoryService.provisionDefaultCategories({ caseId: req.documentCaseContext.caseDoc._id, workspaceId: req.documentCaseContext.workspace._id });
    return response(res, req, result);
  } catch (err) { return next(err); }
});

router.post('/cases/:caseId/document-categories', trustedOriginMiddleware, requireApiCapability('document_categories.manage'), caseAccess(documentPolicy.canManageCategories), async (req, res, next) => {
  try {
    const result = await categoryService.createCategory({
      caseId: req.documentCaseContext.caseDoc._id,
      workspaceId: req.documentCaseContext.workspace._id,
      name: req.body.name,
      description: req.body.description,
      visibility: req.body.visibility,
      allowedUploaderTypes: req.body.allowedUploaderTypes,
      required: req.body.required,
      actor: actorFromStaff(req),
    });
    return mapOutcome(result, req, res, (outcome) => ({ category: staffDocumentManagement.mapCategory(outcome.category) }));
  } catch (err) { return next(err); }
});

router.patch('/document-categories/:categoryId', trustedOriginMiddleware, requireApiCapability('document_categories.manage'), categoryAccess(), async (req, res, next) => {
  try {
    const result = await categoryService.updateCategory({
      categoryId: req.authorizedCategory._id,
      name: req.body.name,
      description: req.body.description,
      visibility: req.body.visibility,
      allowedUploaderTypes: req.body.allowedUploaderTypes,
      required: req.body.required,
      actor: actorFromStaff(req),
    });
    return mapOutcome(result, req, res, (outcome) => ({ category: staffDocumentManagement.mapCategory(outcome.category) }));
  } catch (err) { return next(err); }
});

router.post('/document-categories/:categoryId/disable', trustedOriginMiddleware, requireApiCapability('document_categories.manage'), categoryAccess(), async (req, res, next) => {
  try {
    const result = await categoryService.disableCategory({ categoryId: req.authorizedCategory._id, actor: actorFromStaff(req) });
    return mapOutcome(result, req, res, (outcome) => ({ category: staffDocumentManagement.mapCategory(outcome.category) }));
  } catch (err) { return next(err); }
});

router.post('/document-categories/:categoryId/reactivate', trustedOriginMiddleware, requireApiCapability('document_categories.manage'), categoryAccess(), async (req, res, next) => {
  try {
    const result = await categoryService.reactivateCategory({ categoryId: req.authorizedCategory._id, actor: actorFromStaff(req) });
    return mapOutcome(result, req, res, (outcome) => ({ category: staffDocumentManagement.mapCategory(outcome.category) }));
  } catch (err) { return next(err); }
});

router.post('/cases/:caseId/document-categories/reorder', trustedOriginMiddleware, requireApiCapability('document_categories.manage'), caseAccess(documentPolicy.canManageCategories), async (req, res, next) => {
  try {
    const result = await categoryService.reorderCategories({
      caseId: req.documentCaseContext.caseDoc._id,
      orderedCategoryIds: req.body.orderedCategoryIds,
      actor: actorFromStaff(req),
    });
    return mapOutcome(result, req, res, () => ({ reordered: true }));
  } catch (err) { return next(err); }
});

// Document requests
router.post('/cases/:caseId/document-requests', trustedOriginMiddleware, requireApiCapability('document_requests.manage'), caseAccess(documentPolicy.canManageDocumentRequests), async (req, res, next) => {
  try {
    if (!validDate(req.body.dueDate)) {
      throw createApiError(400, 'validation_error', 'Due date is invalid.', { dueDate: 'Provide a valid due date.' });
    }
    const actor = actorFromStaff(req);
    const result = await requestService.createDocumentRequest({
      caseId: req.documentCaseContext.caseDoc._id,
      workspaceId: req.documentCaseContext.workspace._id,
      categoryId: req.body.categoryId,
      title: req.body.title,
      instructions: req.body.instructions,
      requestedFromMemberId: req.body.requestedFromMemberId,
      requestedByAdminId: actor.id,
      dueDate: req.body.dueDate,
      actor,
    });
    return mapOutcome(result, req, res, (outcome) => ({ request: staffDocumentManagement.mapRequest(outcome.request) }));
  } catch (err) { return next(err); }
});

router.patch('/document-requests/:requestId', trustedOriginMiddleware, requireApiCapability('document_requests.manage'), requestAccess(), async (req, res, next) => {
  try {
    if (!validDate(req.body.dueDate)) {
      throw createApiError(400, 'validation_error', 'Due date is invalid.', { dueDate: 'Provide a valid due date.' });
    }
    const result = await requestService.updateDocumentRequest({
      requestId: req.authorizedDocumentRequest._id,
      dueDate: req.body.dueDate,
      instructions: req.body.instructions,
      clientVisibleComment: req.body.clientVisibleComment,
      actor: actorFromStaff(req),
    });
    return mapOutcome(result, req, res, (outcome) => ({ request: staffDocumentManagement.mapRequest(outcome.request) }));
  } catch (err) { return next(err); }
});

router.post('/document-requests/:requestId/cancel', trustedOriginMiddleware, requireApiCapability('document_requests.manage'), requestAccess(), async (req, res, next) => {
  try {
    const result = await requestService.cancelDocumentRequest({ requestId: req.authorizedDocumentRequest._id, actor: actorFromStaff(req) });
    return mapOutcome(result, req, res, (outcome) => ({ request: staffDocumentManagement.mapRequest(outcome.request) }));
  } catch (err) { return next(err); }
});

module.exports = router;
