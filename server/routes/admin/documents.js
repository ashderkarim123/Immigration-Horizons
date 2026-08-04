const multer = require('multer');

const DocumentCategory = require('../../models/DocumentCategory');
const CaseDocument = require('../../models/CaseDocument');
const DocumentVersion = require('../../models/DocumentVersion');
const DocumentRequest = require('../../models/DocumentRequest');
const WorkspaceMember = require('../../models/WorkspaceMember');

const { requireCapability } = require('../../utils/permissions');
const { actorFromSession } = require('../../utils/actorSnapshot');
const documentPolicy = require('../../services/documentPolicy');
const caseManagement = require('../../services/caseManagement');
const categoryService = require('../../services/documentCategoryService');
const requestService = require('../../services/documentRequestService');
const reviewService = require('../../services/documentReviewService');
const downloadService = require('../../services/documentDownloadService');
const { provider, uploadDocument, replaceDocumentVersion } = require('../../services/documentUploadService');
const { maxFileSizeBytes, extensionOf } = require('../../services/documentValidation');
const { DOCUMENT_STATUSES } = require('../../utils/documentConstants');

const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      provider
        .ensureDirs()
        .then(() => cb(null, provider.tempDir))
        .catch(cb);
    },
    filename: (req, file, cb) => {
      const key = provider.generateStorageKey();
      req.documentStorageKey = key;
      req.documentOriginalName = file.originalname;
      req.documentDeclaredMimeType = file.mimetype;
      cb(null, key);
    },
  }),
  limits: { fileSize: maxFileSizeBytes(), files: 1 },
});

function handleServiceOutcome(res, req, result, redirectTo) {
  if (result.outcome === 'validation_error') {
    console.warn('[admin/documents] validation error:', result.errors);
  }
  return res.redirect(redirectTo);
}

/**
 * Attaches Cycle 5 document-management routes onto the shared admin router
 * — same pattern as cases.js/queries.js.
 */
module.exports = function attachDocuments(router) {
  // ======================================================================
  // DOCUMENT CENTER
  // ======================================================================

  router.get('/admin/cases/:caseId/documents', requireCapability('documents.view'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
      if (!loaded) return res.redirect('/admin/cases');
      const { caseDoc, workspace } = loaded;

      if (!(await documentPolicy.canViewDocumentCenter(req, workspace._id))) {
        return res.status(403).send('Forbidden: you do not have access to this case.');
      }

      const [categories, documents, requests, clientMembers] = await Promise.all([
        DocumentCategory.find({ case: caseDoc._id, active: true }).sort({ order: 1 }).lean(),
        CaseDocument.find({ case: caseDoc._id, status: { $ne: 'archived' } })
          .sort({ createdAt: -1 })
          .limit(200)
          .lean(),
        DocumentRequest.find({ case: caseDoc._id, status: { $ne: 'cancelled' } })
          .sort({ dueDate: 1 })
          .lean(),
        WorkspaceMember.find({ workspace: workspace._id, memberType: 'client', status: { $in: ['active', 'invited'] } })
          .populate('clientUser', 'email firstName lastName')
          .lean(),
      ]);

      const documentsByCategory = {};
      for (const doc of documents) {
        const key = String(doc.category);
        if (!documentsByCategory[key]) documentsByCategory[key] = [];
        documentsByCategory[key].push(doc);
      }

      const canManageCategories = await documentPolicy.canManageCategories(req, workspace._id);
      const canManageRequests = await documentPolicy.canManageDocumentRequests(req, workspace._id);
      const canUpload = await documentPolicy.canUploadDocument(req, workspace._id);
      const canReview = await documentPolicy.canReviewDocument(req, workspace._id);
      const canArchive = await documentPolicy.canArchiveDocument(req, workspace._id);

      res.render('admin/documents/index', {
        title: `Documents: ${caseDoc.caseNumber} | Admin`,
        caseDoc,
        workspace,
        categories,
        documentsByCategory,
        requests,
        clientMembers,
        canManageCategories,
        canManageRequests,
        canUpload,
        canReview,
        canArchive,
        currentPage: 'cases',
      });
    } catch (err) {
      console.error('[admin/documents/index]', err.message);
      res.redirect(`/admin/cases/${req.params.caseId}`);
    }
  });

  router.get('/admin/documents/:documentId', requireCapability('documents.view'), async (req, res) => {
    try {
      const document = await CaseDocument.findById(req.params.documentId).lean();
      if (!document) return res.status(404).send('Document not found.');

      if (!(await documentPolicy.canViewDocumentCenter(req, document.workspace))) {
        return res.status(403).send('Forbidden.');
      }

      const [category, versions] = await Promise.all([
        DocumentCategory.find({ case: document.case, active: true }).sort({ order: 1 }).lean(),
        documentPolicy.canViewDocumentVersions(req, document.workspace).then((allowed) =>
          allowed ? DocumentVersion.find({ document: document._id }).sort({ versionNumber: -1 }).lean() : [],
        ),
      ]);

      const canReview = await documentPolicy.canReviewDocument(req, document.workspace);
      const canArchive = await documentPolicy.canArchiveDocument(req, document.workspace);
      const canUpload = await documentPolicy.canUploadDocument(req, document.workspace);

      res.render('admin/documents/detail', {
        title: `${document.displayName} | Admin`,
        document,
        categories: category,
        versions,
        canReview,
        canArchive,
        canUpload,
        documentStatuses: DOCUMENT_STATUSES,
        currentPage: 'cases',
      });
    } catch (err) {
      console.error('[admin/documents/detail]', err.message);
      res.redirect('/admin/cases');
    }
  });

  // ======================================================================
  // CATEGORY BACKFILL (existing cases — module doc §12)
  // ======================================================================

  router.post(
    '/admin/cases/:caseId/initialize-document-categories',
    requireCapability('document_categories.manage'),
    async (req, res) => {
      try {
        const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
        if (!loaded) return res.status(404).send('Case not found.');
        const { caseDoc, workspace } = loaded;

        if (!(await documentPolicy.canManageCategories(req, workspace._id))) {
          return res.status(403).send('Forbidden.');
        }

        await categoryService.provisionDefaultCategories({ caseId: caseDoc._id, workspaceId: workspace._id });
        res.redirect(`/admin/cases/${caseDoc._id}/documents`);
      } catch (err) {
        console.error('[admin/documents/initialize-categories]', err.message);
        res.redirect(`/admin/cases/${req.params.caseId}/documents`);
      }
    },
  );

  // ======================================================================
  // CATEGORY MANAGEMENT
  // ======================================================================

  router.post('/admin/cases/:caseId/categories', requireCapability('document_categories.manage'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await documentPolicy.canManageCategories(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      const result = await categoryService.createCategory({
        caseId: caseDoc._id,
        workspaceId: workspace._id,
        name: req.body.name,
        description: req.body.description,
        visibility: req.body.visibility,
        allowedUploaderTypes: req.body.allowedUploaderTypes,
        required: req.body.required === 'on',
        actor,
      });
      handleServiceOutcome(res, req, result, `/admin/cases/${caseDoc._id}/documents`);
    } catch (err) {
      console.error('[admin/documents/categories/create]', err.message);
      res.redirect(`/admin/cases/${req.params.caseId}/documents`);
    }
  });

  router.post('/admin/cases/:caseId/categories/reorder', requireCapability('document_categories.manage'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await documentPolicy.canManageCategories(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      const orderedCategoryIds = Array.isArray(req.body.orderedCategoryIds)
        ? req.body.orderedCategoryIds
        : [req.body.orderedCategoryIds].filter(Boolean);

      const result = await categoryService.reorderCategories({ caseId: caseDoc._id, orderedCategoryIds, actor });
      handleServiceOutcome(res, req, result, `/admin/cases/${caseDoc._id}/documents`);
    } catch (err) {
      console.error('[admin/documents/categories/reorder]', err.message);
      res.redirect(`/admin/cases/${req.params.caseId}/documents`);
    }
  });

  router.post('/admin/categories/:categoryId/update', requireCapability('document_categories.manage'), async (req, res) => {
    try {
      const category = await DocumentCategory.findById(req.params.categoryId).lean();
      if (!category) return res.status(404).send('Category not found.');
      if (!(await documentPolicy.canManageCategories(req, category.workspace))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      const result = await categoryService.updateCategory({
        categoryId: req.params.categoryId,
        name: req.body.name,
        description: req.body.description,
        visibility: req.body.visibility,
        allowedUploaderTypes: req.body.allowedUploaderTypes,
        required: req.body.required === undefined ? undefined : req.body.required === 'on',
        actor,
      });
      handleServiceOutcome(res, req, result, `/admin/cases/${category.case}/documents`);
    } catch (err) {
      console.error('[admin/documents/categories/update]', err.message);
      res.redirect('/admin/cases');
    }
  });

  router.post('/admin/categories/:categoryId/disable', requireCapability('document_categories.manage'), async (req, res) => {
    try {
      const category = await DocumentCategory.findById(req.params.categoryId).lean();
      if (!category) return res.status(404).send('Category not found.');
      if (!(await documentPolicy.canManageCategories(req, category.workspace))) {
        return res.status(403).send('Forbidden.');
      }
      const actor = actorFromSession(req);
      await categoryService.disableCategory({ categoryId: req.params.categoryId, actor });
      res.redirect(`/admin/cases/${category.case}/documents`);
    } catch (err) {
      console.error('[admin/documents/categories/disable]', err.message);
      res.redirect('/admin/cases');
    }
  });

  router.post('/admin/categories/:categoryId/reactivate', requireCapability('document_categories.manage'), async (req, res) => {
    try {
      const category = await DocumentCategory.findById(req.params.categoryId).lean();
      if (!category) return res.status(404).send('Category not found.');
      if (!(await documentPolicy.canManageCategories(req, category.workspace))) {
        return res.status(403).send('Forbidden.');
      }
      const actor = actorFromSession(req);
      await categoryService.reactivateCategory({ categoryId: req.params.categoryId, actor });
      res.redirect(`/admin/cases/${category.case}/documents`);
    } catch (err) {
      console.error('[admin/documents/categories/reactivate]', err.message);
      res.redirect('/admin/cases');
    }
  });

  // ======================================================================
  // DOCUMENT REQUESTS
  // ======================================================================

  router.post('/admin/cases/:caseId/document-requests', requireCapability('document_requests.manage'), async (req, res) => {
    try {
      const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
      if (!loaded) return res.status(404).send('Case not found.');
      const { caseDoc, workspace } = loaded;

      if (!(await documentPolicy.canManageDocumentRequests(req, workspace._id))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      const result = await requestService.createDocumentRequest({
        caseId: caseDoc._id,
        workspaceId: workspace._id,
        categoryId: req.body.categoryId,
        title: req.body.title,
        instructions: req.body.instructions,
        requestedFromMemberId: req.body.requestedFromMemberId,
        requestedByAdminId: actor.id,
        dueDate: req.body.dueDate,
        actor,
      });
      handleServiceOutcome(res, req, result, `/admin/cases/${caseDoc._id}/documents`);
    } catch (err) {
      console.error('[admin/documents/requests/create]', err.message);
      res.redirect(`/admin/cases/${req.params.caseId}/documents`);
    }
  });

  router.post('/admin/document-requests/:requestId/update', requireCapability('document_requests.manage'), async (req, res) => {
    try {
      const request = await DocumentRequest.findById(req.params.requestId).lean();
      if (!request) return res.status(404).send('Request not found.');
      if (!(await documentPolicy.canManageDocumentRequests(req, request.workspace))) {
        return res.status(403).send('Forbidden.');
      }
      const actor = actorFromSession(req);
      await requestService.updateDocumentRequest({
        requestId: req.params.requestId,
        dueDate: req.body.dueDate,
        instructions: req.body.instructions,
        clientVisibleComment: req.body.clientVisibleComment,
        actor,
      });
      res.redirect(`/admin/cases/${request.case}/documents`);
    } catch (err) {
      console.error('[admin/documents/requests/update]', err.message);
      res.redirect('/admin/cases');
    }
  });

  router.post('/admin/document-requests/:requestId/cancel', requireCapability('document_requests.manage'), async (req, res) => {
    try {
      const request = await DocumentRequest.findById(req.params.requestId).lean();
      if (!request) return res.status(404).send('Request not found.');
      if (!(await documentPolicy.canManageDocumentRequests(req, request.workspace))) {
        return res.status(403).send('Forbidden.');
      }
      const actor = actorFromSession(req);
      await requestService.cancelDocumentRequest({ requestId: req.params.requestId, actor });
      res.redirect(`/admin/cases/${request.case}/documents`);
    } catch (err) {
      console.error('[admin/documents/requests/cancel]', err.message);
      res.redirect('/admin/cases');
    }
  });

  // ======================================================================
  // EMPLOYEE UPLOAD
  // ======================================================================

  router.post(
    '/admin/cases/:caseId/documents',
    requireCapability('documents.upload'),
    documentUpload.single('file'),
    async (req, res) => {
      const redirectTo = `/admin/cases/${req.params.caseId}/documents`;
      try {
        const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
        if (!loaded) return res.status(404).send('Case not found.');
        const { caseDoc, workspace } = loaded;

        if (!(await documentPolicy.canUploadDocument(req, workspace._id))) {
          if (req.documentStorageKey) await provider.deleteTemp(req.documentStorageKey).catch(() => {});
          return res.status(403).send('Forbidden.');
        }
        if (!req.documentStorageKey) {
          return res.redirect(redirectTo);
        }

        const actor = actorFromSession(req);
        const result = await uploadDocument({
          caseId: caseDoc._id,
          workspaceId: workspace._id,
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
        handleServiceOutcome(res, req, result, redirectTo);
      } catch (err) {
        console.error('[admin/documents/upload]', err.message);
        if (req.documentStorageKey) await provider.deleteTemp(req.documentStorageKey).catch(() => {});
        res.redirect(redirectTo);
      }
    },
  );

  router.post(
    '/admin/documents/:documentId/version',
    requireCapability('documents.upload'),
    documentUpload.single('file'),
    async (req, res) => {
      try {
        const document = await CaseDocument.findById(req.params.documentId).lean();
        if (!document) return res.status(404).send('Document not found.');

        if (!(await documentPolicy.canUploadDocument(req, document.workspace))) {
          if (req.documentStorageKey) await provider.deleteTemp(req.documentStorageKey).catch(() => {});
          return res.status(403).send('Forbidden.');
        }

        const actor = actorFromSession(req);
        const result = await replaceDocumentVersion({
          documentId: req.params.documentId,
          storageKey: req.documentStorageKey,
          originalName: req.documentOriginalName,
          declaredMimeType: req.documentDeclaredMimeType,
          extension: extensionOf(req.documentOriginalName),
          uploaderType: 'employee',
          uploaderAdminId: actor.id,
          changeNote: req.body.changeNote,
          actorName: actor.name,
        });
        if (result.outcome === 'validation_error') {
          console.warn('[admin/documents/version] validation error:', result.errors);
        }
        res.redirect(`/admin/documents/${req.params.documentId}`);
      } catch (err) {
        // A VersionError from saveGuarded (concurrent replacement race,
        // ADR-004 §20) lands here as a controlled conflict, not a 500.
        console.error('[admin/documents/version]', err.isVersionConflict ? 'version conflict' : err.message);
        if (req.documentStorageKey) await provider.deleteTemp(req.documentStorageKey).catch(() => {});
        res.redirect(`/admin/documents/${req.params.documentId}`);
      }
    },
  );

  // ======================================================================
  // REVIEW / CATEGORY MOVE / ARCHIVE
  // ======================================================================

  router.post('/admin/documents/:documentId/review', requireCapability('documents.review'), async (req, res) => {
    try {
      const document = await CaseDocument.findById(req.params.documentId).lean();
      if (!document) return res.status(404).send('Document not found.');
      if (!(await documentPolicy.canReviewDocument(req, document.workspace))) {
        return res.status(403).send('Forbidden.');
      }

      const actor = actorFromSession(req);
      const result = await reviewService.reviewDocument({
        documentId: req.params.documentId,
        decision: req.body.decision,
        clientVisibleReviewComment: req.body.clientVisibleReviewComment,
        internalReviewComment: req.body.internalReviewComment,
        actor,
      });
      if (result.outcome === 'validation_error') {
        console.warn('[admin/documents/review] validation error:', result.errors);
      }
      res.redirect(`/admin/documents/${req.params.documentId}`);
    } catch (err) {
      console.error('[admin/documents/review]', err.message);
      res.redirect(`/admin/documents/${req.params.documentId}`);
    }
  });

  router.post('/admin/documents/:documentId/category', requireCapability('documents.review'), async (req, res) => {
    try {
      const document = await CaseDocument.findById(req.params.documentId).lean();
      if (!document) return res.status(404).send('Document not found.');
      if (!(await documentPolicy.canReviewDocument(req, document.workspace))) {
        return res.status(403).send('Forbidden.');
      }
      const actor = actorFromSession(req);
      await reviewService.moveDocumentCategory({
        documentId: req.params.documentId,
        newCategoryId: req.body.categoryId,
        actor,
      });
      res.redirect(`/admin/documents/${req.params.documentId}`);
    } catch (err) {
      console.error('[admin/documents/category]', err.message);
      res.redirect(`/admin/documents/${req.params.documentId}`);
    }
  });

  router.post('/admin/documents/:documentId/archive', requireCapability('documents.archive'), async (req, res) => {
    try {
      const document = await CaseDocument.findById(req.params.documentId).lean();
      if (!document) return res.status(404).send('Document not found.');
      if (!(await documentPolicy.canArchiveDocument(req, document.workspace))) {
        return res.status(403).send('Forbidden.');
      }
      const actor = actorFromSession(req);
      await reviewService.archiveDocument({ documentId: req.params.documentId, actor });
      res.redirect(`/admin/cases/${document.case}/documents`);
    } catch (err) {
      console.error('[admin/documents/archive]', err.message);
      res.redirect('/admin/cases');
    }
  });

  // ======================================================================
  // DOWNLOADS
  // ======================================================================

  async function handleDownload(req, res, versionId) {
    const document = await CaseDocument.findById(req.params.documentId).lean();
    if (!document) return res.status(404).send('Not found.');
    if (!(await documentPolicy.canViewDocumentCenter(req, document.workspace))) {
      return res.status(403).send('Forbidden.');
    }

    const actor = actorFromSession(req);
    const result = await downloadService.resolveDownload({
      documentId: req.params.documentId,
      versionId: versionId || null,
      actor: { type: actor.id ? 'admin_user' : 'env_fallback', id: actor.id, name: actor.name },
    });

    if (result.outcome === 'not_found') return res.status(404).send('Not found.');
    if (result.outcome === 'denied') return res.status(403).send('This file is not available for download.');

    res.set({
      'Content-Disposition': `attachment; filename="${result.filename.replace(/"/g, '')}"`,
      'Content-Type': result.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': 'sandbox',
    });
    result.stream.pipe(res);
  }

  router.get('/admin/documents/:documentId/download', requireCapability('documents.view'), async (req, res) => {
    try {
      await handleDownload(req, res, null);
    } catch (err) {
      console.error('[admin/documents/download]', err.message);
      res.status(500).send('Something went wrong.');
    }
  });

  router.get('/admin/documents/:documentId/versions/:versionId/download', requireCapability('document_versions.view'), async (req, res) => {
    try {
      await handleDownload(req, res, req.params.versionId);
    } catch (err) {
      console.error('[admin/documents/version-download]', err.message);
      res.status(500).send('Something went wrong.');
    }
  });
};
