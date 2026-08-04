const path = require('path');
const {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MIME_TO_DETECTED_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_FILES_PER_REQUEST,
} = require('../utils/documentConstants');

/**
 * Centralized, framework-neutral upload validation — shared by the admin
 * (multer) and portal (Web File) upload entry points, which each call these
 * same functions rather than re-implementing the rules. See
 * docs/architecture/ADR-004-secure-document-storage.md §9 and
 * 05_DOCUMENT_MANAGEMENT.md §16.
 *
 * A hard upper bound is enforced regardless of env configuration (module
 * doc §8: "File-size limits must have safe upper bounds") — no
 * environment value can push the effective limit past 100MB.
 */
const HARD_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const HARD_MAX_FILES_PER_REQUEST = 20;

function maxFileSizeBytes() {
  const configured = parseInt(process.env.DOCUMENT_MAX_FILE_SIZE_BYTES, 10);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(configured, HARD_MAX_FILE_SIZE_BYTES);
  }
  return DEFAULT_MAX_FILE_SIZE_BYTES;
}

function maxFilesPerRequest() {
  const configured = parseInt(process.env.DOCUMENT_MAX_FILES_PER_REQUEST, 10);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(configured, HARD_MAX_FILES_PER_REQUEST);
  }
  return DEFAULT_MAX_FILES_PER_REQUEST;
}

/** Display-only sanitization — never used to derive a storage path. */
function sanitizeDisplayName(originalName) {
  const base = path.basename(String(originalName || 'file'));
  let cleaned = base.normalize('NFC').replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!cleaned) cleaned = 'file';
  if (cleaned.length > 200) cleaned = cleaned.slice(0, 200);
  return cleaned;
}

function extensionOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

/**
 * `file-type` (v22, pure ESM) consumed via dynamic import from this
 * CommonJS module — a standard Node interop pattern, not a workaround (see
 * ADR-004 §9). Zip-based formats (docx/xlsx) need more than a small byte
 * prefix to distinguish reliably from a generic zip, so callers pass the
 * full file buffer — safe here because it happens only after the file-size
 * limit (§ above) has already bounded how large that buffer can ever be.
 */
async function detectSignature(buffer) {
  const { fileTypeFromBuffer } = await import('file-type');
  return fileTypeFromBuffer(buffer);
}

/**
 * Cross-checks declared extension/MIME against the file's actual bytes.
 * Unknown/undetectable signatures are rejected outright — "assume unsafe"
 * is the default, not "assume the declared type is correct" (ADR-004 §9).
 */
async function validateFileSignature({ declaredMimeType, extension, buffer }) {
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return { valid: false, reason: `File extension "${extension}" is not allowed.` };
  }
  if (!ALLOWED_MIME_TYPES.includes(declaredMimeType)) {
    return { valid: false, reason: `File type "${declaredMimeType}" is not allowed.` };
  }

  const detected = await detectSignature(buffer);
  if (!detected) {
    return { valid: false, reason: 'Could not verify this file\'s contents against a known, safe file type.' };
  }
  if (!ALLOWED_MIME_TYPES.includes(detected.mime)) {
    return { valid: false, reason: `This file's actual contents ("${detected.mime}") are not an allowed type.` };
  }
  const expectedExtensions = MIME_TO_DETECTED_EXTENSIONS[declaredMimeType] || [];
  if (!expectedExtensions.includes(detected.ext)) {
    return { valid: false, reason: 'The declared file type does not match its actual contents.' };
  }

  return { valid: true, detectedMimeType: detected.mime, detectedExtension: detected.ext };
}

module.exports = {
  maxFileSizeBytes,
  maxFilesPerRequest,
  sanitizeDisplayName,
  extensionOf,
  detectSignature,
  validateFileSignature,
  HARD_MAX_FILE_SIZE_BYTES,
  HARD_MAX_FILES_PER_REQUEST,
};
