const multer = require('multer');

const { createApiError } = require('./apiError');
const { provider } = require('../../services/documentUploadService');
const { maxFileSizeBytes } = require('../../services/documentValidation');

/**
 * Streams one multipart `file` field into the private temp area and records
 * its storage key / original name / declared type on `req`. Shared by the
 * staff document upload and the chat-attachment upload so both land in the
 * same secure pipeline (ADR-004 §8). Any failure removes the temp file.
 */
function createSingleFileUploadMiddleware() {
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

module.exports = { parseSingleFileUpload: createSingleFileUploadMiddleware() };
