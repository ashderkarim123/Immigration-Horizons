/**
 * Media library (ADR-029): the one implementation behind the EJS Media page and /api/v1/admin/media. Files live in
 * the existing public upload directory; the upload policy itself (type, size, filename) stays in middleware/upload.js.
 */
const fs = require('fs/promises');
const path = require('path');
const Media = require('../../models/admin/Media');
const { createApiError } = require('../../middleware/api/apiError');
const { invalid, notFound, isId, searchRegex, pageParams, paged, auditContent } = require('./common');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
const ALT_MAX = 300;
const MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']; // what middleware/upload.js accepts

const toDto = (media, { canManage = false } = {}) => ({
  id: String(media._id),
  url: media.url, // public, root-relative on the admin host; never a filesystem path
  originalName: media.originalName,
  mimeType: media.mimeType || '',
  size: media.size || 0,
  altText: media.altText || '',
  folder: media.folder || '/',
  uploadedBy: media.uploadedBy || '',
  createdAt: media.createdAt,
  actions: { edit: canManage, delete: canManage },
});

function readAlt(value) {
  const alt = value === undefined || value === null ? '' : String(value).trim();
  if (alt.length > ALT_MAX) throw invalid({ altText: `Alt text must be ${ALT_MAX} characters or fewer.` });
  return alt;
}

async function find(id) {
  const media = isId(String(id)) ? await Media.findById(id).lean() : null;
  if (!media) throw notFound('Media item');
  return media;
}

async function list(query = {}, options) {
  const filter = {};
  if (typeof query.folder === 'string' && query.folder && query.folder !== '/') filter.folder = query.folder.slice(0, 120);
  if (MIME_TYPES.includes(query.mimeType)) filter.mimeType = query.mimeType;
  const term = searchRegex(query.search);
  if (term) filter.$or = [{ originalName: term }, { altText: term }];
  const paging = pageParams(query, { defaultLimit: 30, maxLimit: 60 });
  const [total, items, folders] = await Promise.all([
    Media.countDocuments(filter),
    Media.find(filter).sort({ createdAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit).lean(),
    Media.distinct('folder'),
  ]);
  return { ...paged(items.map((item) => toDto(item, options)), total, paging), folders: folders.filter(Boolean).sort(), mimeTypes: MIME_TYPES };
}

/** Records a file multer has already accepted and written. A rejected alt text removes the orphaned file again. */
async function register(ctx, file, { altText, folder, uploadedBy } = {}) {
  if (!file) throw invalid({ file: 'Choose an image to upload.' });
  try {
    const media = await Media.create({
      originalName: path.basename(file.originalname),
      filename: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      url: `/uploads/${file.filename}`,
      altText: readAlt(altText),
      folder: typeof folder === 'string' && folder.trim() ? folder.trim().slice(0, 120) : '/',
      uploadedBy: uploadedBy || 'Admin',
    });
    await auditContent(ctx, 'media', media._id, 'uploaded');
    return media.toObject();
  } catch (error) {
    await fs.unlink(path.join(UPLOAD_DIR, path.basename(file.filename))).catch(() => {});
    throw error;
  }
}

async function updateAlt(ctx, id, altText) {
  const existing = await find(id);
  await Media.updateOne({ _id: existing._id }, { $set: { altText: readAlt(altText) } });
  await auditContent(ctx, 'media', existing._id, 'alt_updated');
  return find(id);
}

/**
 * File first, then the record. A file that is already gone is fine; any other filesystem failure keeps the record,
 * so the library never forgets a file that is still being served.
 */
async function remove(ctx, id, { unlink = fs.unlink } = {}) {
  const existing = await find(id);
  try {
    // basename: the stored name can never walk out of the upload directory.
    await unlink(path.join(UPLOAD_DIR, path.basename(existing.filename)));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[media] could not delete file for', String(existing._id), error.code || error.message);
      throw createApiError(500, 'media_delete_failed', 'The file could not be deleted, so the item was kept. Please try again.');
    }
  }
  await Media.deleteOne({ _id: existing._id });
  await auditContent(ctx, 'media', existing._id, 'deleted');
}

module.exports = { list, register, updateAlt, remove, toDto, UPLOAD_DIR };
