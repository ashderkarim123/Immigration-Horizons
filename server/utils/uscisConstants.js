/**
 * USCIS filing tracking vocabulary (ADR-026). Mirrored by
 * src/lib/content/uscis-constants.ts and pinned by
 * docs/architecture/uscis-schema-contract.json from both sides.
 */

/** Normalized operational categories. The observed official title is always stored and shown separately. */
const STATUS_CATEGORIES = [
  'filed',
  'received',
  'actively_reviewed',
  'notice_issued',
  'rfe_issued',
  'noid_issued',
  'response_received',
  'interview_scheduled',
  'approved',
  'denied',
  'transferred',
  'closed',
  'other',
];

const STATUS_SOURCES = ['manual', 'uscis_api'];
const TRACKING_PROVIDERS = ['none', 'uscis_case_status'];

const LIMITS = {
  title: 150,
  formType: 40,
  formSubType: 80,
  serviceCenter: 120,
  statusTitle: 200,
  statusDescription: 2000,
};

/** Currently documented Case Status API receipt shape: three letters + ten digits. */
const PROVIDER_RECEIPT_PATTERN = /^[A-Z]{3}\d{10}$/;
/** Manual entry is looser (other identifiers exist) but is still bounded and alphanumeric. */
const MANUAL_RECEIPT_PATTERN = /^[A-Z0-9]{5,20}$/;

/** trim, uppercase, drop spaces and hyphens. Never "corrects" characters. Empty becomes null. */
function normalizeReceipt(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toUpperCase().replace(/[\s-]/g, '');
  return normalized || null;
}

const isProviderReceipt = (receipt) => PROVIDER_RECEIPT_PATTERN.test(receipt || '');
const isManualReceipt = (receipt) => MANUAL_RECEIPT_PATTERN.test(receipt || '');

/** "IOE1234567890" -> "IOE••••••7890", for logs and error context. */
const maskReceipt = (receipt) => (receipt ? `${receipt.slice(0, 3)}${'•'.repeat(Math.max(0, receipt.length - 7))}${receipt.slice(-4)}` : '');

module.exports = {
  STATUS_CATEGORIES,
  STATUS_SOURCES,
  TRACKING_PROVIDERS,
  LIMITS,
  PROVIDER_RECEIPT_PATTERN,
  MANUAL_RECEIPT_PATTERN,
  normalizeReceipt,
  isProviderReceipt,
  isManualReceipt,
  maskReceipt,
};
