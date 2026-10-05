/**
 * Mirrors server/utils/uscisConstants.js (ADR-026); both are pinned by
 * docs/architecture/uscis-schema-contract.json. The portal only reads this domain.
 */
export const USCIS_STATUS_CATEGORIES = [
  "filed",
  "received",
  "actively_reviewed",
  "notice_issued",
  "rfe_issued",
  "noid_issued",
  "response_received",
  "interview_scheduled",
  "approved",
  "denied",
  "transferred",
  "closed",
  "other",
] as const;

export const USCIS_STATUS_SOURCES = ["manual", "uscis_api"] as const;
export const USCIS_TRACKING_PROVIDERS = ["none", "uscis_case_status"] as const;

export const USCIS_LIMITS = {
  title: 150,
  formType: 40,
  formSubType: 80,
  serviceCenter: 120,
  statusTitle: 200,
  statusDescription: 2000,
} as const;

export type UscisStatusCategory = (typeof USCIS_STATUS_CATEGORIES)[number];
