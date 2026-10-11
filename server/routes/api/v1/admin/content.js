/**
 * Admin API — website content (ADR-029 Gate B). Reads need the console's own gate (admin.cms.access, enforced by the
 * parent router); every mutation needs its module capability. No business rule lives here: each handler adapts JSON
 * to the same service the EJS route calls.
 */
const express = require('express');
const multer = require('multer');
const upload = require('../../../../middleware/upload');
const { createApiError, handle } = require('../../../../middleware/api/apiError');
const { requireAdminCapability: needs } = require('../../../../middleware/api/adminAuth');
const { can } = require('../../../../utils/permissions');
const { contextOf } = require('../../../../services/cms/common');
const dashboard = require('../../../../services/cms/dashboard');
const blog = require('../../../../services/cms/blog');
const faqs = require('../../../../services/cms/faqs');
const testimonials = require('../../../../services/cms/testimonials');
const media = require('../../../../services/cms/media');
const seo = require('../../../../services/cms/seo');

const router = express.Router();

const manage = (req, capability) => ({ canManage: can(req, capability) });

router.get('/dashboard', handle((req) => dashboard.overview({
  canManageUsers: can(req, 'users.manage'), canViewSecurity: can(req, 'security_events.view'), canManageBlog: can(req, 'blog.manage'),
})));

// ---- Blog ----
router.get('/blog', handle((req) => blog.list(req.query, manage(req, 'blog.manage'))));
router.get('/blog/:id', handle((req) => blog.get(req.params.id, manage(req, 'blog.manage'))));
router.post('/blog', needs('blog.manage'), handle(async (req) => blog.toDto(await blog.create(contextOf(req), req.body), { canManage: true }), 201));
router.patch('/blog/:id', needs('blog.manage'), handle(async (req) => blog.toDto(await blog.update(contextOf(req), req.params.id, req.body), { canManage: true })));
router.post('/blog/:id/publish', needs('blog.manage'), handle(async (req) => blog.toDto(await blog.setPublished(contextOf(req), req.params.id, (req.body || {}).published), { canManage: true })));
router.delete('/blog/:id', needs('blog.manage'), handle(async (req) => { await blog.remove(contextOf(req), req.params.id); return { deleted: true }; }));

// ---- FAQs ----
router.get('/faqs', handle((req) => faqs.list(req.query, manage(req, 'faqs.manage'))));
router.get('/faqs/:id', handle((req) => faqs.get(req.params.id, manage(req, 'faqs.manage'))));
router.post('/faqs', needs('faqs.manage'), handle(async (req) => faqs.toDto(await faqs.create(contextOf(req), req.body), { canManage: true }), 201));
router.patch('/faqs/:id', needs('faqs.manage'), handle(async (req) => faqs.toDto(await faqs.update(contextOf(req), req.params.id, req.body), { canManage: true })));
router.delete('/faqs/:id', needs('faqs.manage'), handle(async (req) => { await faqs.remove(contextOf(req), req.params.id); return { deleted: true }; }));

// ---- Testimonials ----
router.get('/testimonials', handle((req) => testimonials.list(req.query, manage(req, 'testimonials.manage'))));
router.get('/testimonials/:id', handle((req) => testimonials.get(req.params.id, manage(req, 'testimonials.manage'))));
router.post('/testimonials', needs('testimonials.manage'), handle(async (req) => testimonials.toDto(await testimonials.create(contextOf(req), req.body), { canManage: true }), 201));
router.patch('/testimonials/:id', needs('testimonials.manage'), handle(async (req) => testimonials.toDto(await testimonials.update(contextOf(req), req.params.id, req.body), { canManage: true })));
router.delete('/testimonials/:id', needs('testimonials.manage'), handle(async (req) => { await testimonials.remove(contextOf(req), req.params.id); return { deleted: true }; }));

// ---- Media ----
/**
 * The existing upload policy (image extension + MIME allowlist, 5 MB, sanitized filename), answering in JSON. The
 * CSRF token is a header, so the parent router has already verified it before a byte reaches the disk.
 */
function parseUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      return next(error.code === 'LIMIT_FILE_SIZE'
        ? createApiError(413, 'file_too_large', 'The image is larger than the 5 MB limit.', [{ field: 'file', message: 'The image is larger than the 5 MB limit.' }])
        : createApiError(400, 'invalid_upload', 'The upload could not be processed.'));
    }
    // The fileFilter's own refusal: its message names the allowed types and nothing else.
    return next(createApiError(422, 'validation_error', error.message, [{ field: 'file', message: error.message }]));
  });
}

router.get('/media', handle((req) => media.list(req.query, manage(req, 'media.manage'))));
router.post('/media', needs('media.manage'), parseUpload, handle(async (req) => media.toDto(
  await media.register(contextOf(req), req.file, { altText: (req.body || {}).altText, uploadedBy: req.admin.name }), { canManage: true }), 201));
router.patch('/media/:id/alt', needs('media.manage'), handle(async (req) => media.toDto(await media.updateAlt(contextOf(req), req.params.id, (req.body || {}).altText), { canManage: true })));
router.delete('/media/:id', needs('media.manage'), handle(async (req) => { await media.remove(contextOf(req), req.params.id); return { deleted: true }; }));

// ---- Services (code-owned, read-only) and SEO ----
router.get('/services', handle(async () => ({ items: await seo.listServices() })));
router.get('/seo', handle((req) => seo.list(manage(req, 'seo.manage'))));
router.get('/seo/:pageRef', handle((req) => seo.get(req.params.pageRef, manage(req, 'seo.manage'))));
router.put('/seo/:pageRef', needs('seo.manage'), handle((req) => seo.save(contextOf(req), req.params.pageRef, req.body)));

module.exports = router;
