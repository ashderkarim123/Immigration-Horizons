import "server-only";

import type { ScanStatus } from "../content/document-constants";

/**
 * Malware-scanning integration point. See
 * docs/architecture/ADR-004-secure-document-storage.md §12 — no real
 * scanner is wired this cycle; `not_configured` deliberately does not block
 * a document from proceeding to its normal post-upload status, but is never
 * reported as "clean" either. Mirrors server/services/storage/scanner.js.
 */

export async function scan(): Promise<{ status: ScanStatus; message: string }> {
  return { status: "not_configured", message: "No malware scanner is configured for this deployment." };
}
