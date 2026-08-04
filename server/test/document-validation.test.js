const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizeDisplayName,
  extensionOf,
  validateFileSignature,
  maxFileSizeBytes,
  maxFilesPerRequest,
} = require('../services/documentValidation');

const MINIMAL_PDF = Buffer.from('%PDF-1.4\n1 0 obj<< >>endobj\ntrailer<< >>\n%%EOF');
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const MINIMAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const HTML_FILE = Buffer.from('<!DOCTYPE html><html><body><script>alert(1)</script></body></html>');
const FAKE_EXE_RENAMED_AS_PDF = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // "MZ" DOS/PE header

test('a genuine PDF with matching extension/MIME is accepted', async () => {
  const result = await validateFileSignature({ declaredMimeType: 'application/pdf', extension: '.pdf', buffer: MINIMAL_PDF });
  assert.equal(result.valid, true);
  assert.equal(result.detectedMimeType, 'application/pdf');
});

test('a genuine PNG with matching extension/MIME is accepted', async () => {
  const result = await validateFileSignature({ declaredMimeType: 'image/png', extension: '.png', buffer: MINIMAL_PNG });
  assert.equal(result.valid, true);
});

test('a genuine JPEG with matching extension/MIME is accepted', async () => {
  const result = await validateFileSignature({ declaredMimeType: 'image/jpeg', extension: '.jpg', buffer: MINIMAL_JPEG });
  assert.equal(result.valid, true);
});

test('a disallowed extension is rejected', async () => {
  const result = await validateFileSignature({ declaredMimeType: 'application/pdf', extension: '.exe', buffer: MINIMAL_PDF });
  assert.equal(result.valid, false);
});

test('a disallowed declared MIME type is rejected', async () => {
  const result = await validateFileSignature({ declaredMimeType: 'application/zip', extension: '.pdf', buffer: MINIMAL_PDF });
  assert.equal(result.valid, false);
});

test('HTML content is rejected outright, even with an allowed extension/MIME claimed', async () => {
  const result = await validateFileSignature({ declaredMimeType: 'application/pdf', extension: '.pdf', buffer: HTML_FILE });
  assert.equal(result.valid, false);
});

test('a renamed executable (PDF extension, EXE bytes) is rejected by signature mismatch', async () => {
  const result = await validateFileSignature({
    declaredMimeType: 'application/pdf',
    extension: '.pdf',
    buffer: FAKE_EXE_RENAMED_AS_PDF,
  });
  assert.equal(result.valid, false);
});

test('declared MIME/extension not matching actual file contents is rejected (a real JPEG renamed .png)', async () => {
  const result = await validateFileSignature({ declaredMimeType: 'image/png', extension: '.png', buffer: MINIMAL_JPEG });
  assert.equal(result.valid, false);
  assert.match(result.reason, /does not match/i);
});

test('an empty buffer with no detectable signature is rejected, not treated as safe by default', async () => {
  const result = await validateFileSignature({ declaredMimeType: 'application/pdf', extension: '.pdf', buffer: Buffer.alloc(0) });
  assert.equal(result.valid, false);
});

test('sanitizeDisplayName strips control characters and never returns the raw path', () => {
  assert.equal(sanitizeDisplayName('normal-file.pdf'), 'normal-file.pdf');
  assert.equal(sanitizeDisplayName('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeDisplayName('file\x00name.pdf'), 'filename.pdf');
  assert.equal(sanitizeDisplayName(''), 'file');
  assert.equal(sanitizeDisplayName('a'.repeat(300)).length, 200);
});

test('extensionOf lowercases and extracts the extension', () => {
  assert.equal(extensionOf('Document.PDF'), '.pdf');
  assert.equal(extensionOf('no-extension'), '');
});

test('maxFileSizeBytes and maxFilesPerRequest fall back to safe defaults', () => {
  assert.ok(maxFileSizeBytes() > 0);
  assert.ok(maxFilesPerRequest() > 0);
  assert.ok(maxFileSizeBytes() <= 100 * 1024 * 1024);
});

test('maxFileSizeBytes never exceeds the hard cap even if configured higher', () => {
  const original = process.env.DOCUMENT_MAX_FILE_SIZE_BYTES;
  process.env.DOCUMENT_MAX_FILE_SIZE_BYTES = String(500 * 1024 * 1024);
  delete require.cache[require.resolve('../services/documentValidation')];
  const { maxFileSizeBytes: recomputed, HARD_MAX_FILE_SIZE_BYTES } = require('../services/documentValidation');
  assert.equal(recomputed(), HARD_MAX_FILE_SIZE_BYTES);
  if (original === undefined) delete process.env.DOCUMENT_MAX_FILE_SIZE_BYTES;
  else process.env.DOCUMENT_MAX_FILE_SIZE_BYTES = original;
  delete require.cache[require.resolve('../services/documentValidation')];
});
