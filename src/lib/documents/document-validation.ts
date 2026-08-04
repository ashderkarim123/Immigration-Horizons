import "server-only";

import path from "path";
import { fileTypeFromBuffer } from "file-type";
import {
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MIME_TO_DETECTED_EXTENSIONS,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_MAX_FILES_PER_REQUEST,
} from "../content/document-constants";

/**
 * Mirrors server/services/documentValidation.js exactly — see
 * docs/architecture/ADR-004-secure-document-storage.md §9. Next.js is ESM
 * natively, so `file-type` is a normal static import here (no dynamic
 * import interop needed, unlike the server/ CommonJS side).
 */
const HARD_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const HARD_MAX_FILES_PER_REQUEST = 20;

export function maxFileSizeBytes(): number {
  const configured = parseInt(process.env.DOCUMENT_MAX_FILE_SIZE_BYTES || "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(configured, HARD_MAX_FILE_SIZE_BYTES);
  }
  return DEFAULT_MAX_FILE_SIZE_BYTES;
}

export function maxFilesPerRequest(): number {
  const configured = parseInt(process.env.DOCUMENT_MAX_FILES_PER_REQUEST || "", 10);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(configured, HARD_MAX_FILES_PER_REQUEST);
  }
  return DEFAULT_MAX_FILES_PER_REQUEST;
}

export function sanitizeDisplayName(originalName: string): string {
  const base = path.basename(String(originalName || "file"));
  let cleaned = base.normalize("NFC").replace(/[\x00-\x1f\x7f]/g, "").trim();
  if (!cleaned) cleaned = "file";
  if (cleaned.length > 200) cleaned = cleaned.slice(0, 200);
  return cleaned;
}

export function extensionOf(filename: string): string {
  return path.extname(String(filename || "")).toLowerCase();
}

export async function detectSignature(buffer: Buffer) {
  return fileTypeFromBuffer(buffer);
}

export type SignatureValidationResult =
  | { valid: true; detectedMimeType: string; detectedExtension: string }
  | { valid: false; reason: string };

export async function validateFileSignature(params: {
  declaredMimeType: string;
  extension: string;
  buffer: Buffer;
}): Promise<SignatureValidationResult> {
  const { declaredMimeType, extension, buffer } = params;

  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    return { valid: false, reason: `File extension "${extension}" is not allowed.` };
  }
  if (!ALLOWED_MIME_TYPES.includes(declaredMimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { valid: false, reason: `File type "${declaredMimeType}" is not allowed.` };
  }

  const detected = await detectSignature(buffer);
  if (!detected) {
    return { valid: false, reason: "Could not verify this file's contents against a known, safe file type." };
  }
  if (!ALLOWED_MIME_TYPES.includes(detected.mime as (typeof ALLOWED_MIME_TYPES)[number])) {
    return { valid: false, reason: `This file's actual contents ("${detected.mime}") are not an allowed type.` };
  }
  const expectedExtensions = MIME_TO_DETECTED_EXTENSIONS[declaredMimeType] || [];
  if (!expectedExtensions.includes(detected.ext)) {
    return { valid: false, reason: "The declared file type does not match its actual contents." };
  }

  return { valid: true, detectedMimeType: detected.mime, detectedExtension: detected.ext };
}
