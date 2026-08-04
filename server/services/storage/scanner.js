/**
 * Malware-scanning integration point. See
 * docs/architecture/ADR-004-secure-document-storage.md §12 — no real
 * scanner is wired this cycle; `not_configured` deliberately does not block
 * a document from proceeding to its normal post-upload status, but is never
 * reported as "clean" either.
 */

const { SCAN_STATUSES } = require('../../utils/documentConstants');

/** Always-not-configured scanner used until a real provider is integrated. */
async function nullScan() {
  return { status: 'not_configured', message: 'No malware scanner is configured for this deployment.' };
}

module.exports = { scan: nullScan, SCAN_STATUSES };
