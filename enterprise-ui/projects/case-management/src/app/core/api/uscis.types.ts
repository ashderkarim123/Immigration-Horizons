/**
 * DTOs for /api/v1/staff/uscis* and /staff/cases/:id/uscis, shaped exactly like
 * server/services/uscisTracking.js. Actions come from the server; the UI never infers them from a role.
 */

// Mirrors STATUS_CATEGORIES in server/utils/uscisConstants.js; uscis-schema-contract.test.js fails if they drift.
export const USCIS_STATUS_CATEGORIES = [
  { value: 'filed', label: 'Filed' },
  { value: 'received', label: 'Received' },
  { value: 'actively_reviewed', label: 'Actively reviewed' },
  { value: 'notice_issued', label: 'Notice issued' },
  { value: 'rfe_issued', label: 'Request for evidence (RFE)' },
  { value: 'noid_issued', label: 'Notice of intent to deny (NOID)' },
  { value: 'response_received', label: 'Response received' },
  { value: 'interview_scheduled', label: 'Interview scheduled' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'closed', label: 'Closed' },
  { value: 'other', label: 'Other' },
] as const;

export type UscisStatusCategory = (typeof USCIS_STATUS_CATEGORIES)[number]['value'];
export type UscisStatusSource = 'manual' | 'uscis_api';

export const uscisCategoryLabel = (category: string | null | undefined): string =>
  USCIS_STATUS_CATEGORIES.find((c) => c.value === category)?.label ?? 'Not recorded';

export interface UscisProviderStatus {
  configured: boolean;
  enabled: boolean;
  environment: 'sandbox' | 'production';
}

export interface UscisFilingActions {
  canEdit: boolean;
  canAddStatus: boolean;
  canArchive: boolean;
  canSync: boolean;
}

export interface UscisCurrentStatus {
  category: UscisStatusCategory;
  title: string;
  description: string;
  occurredAt: string;
  source: UscisStatusSource;
  actionRequired: boolean;
  responseDueAt: string | null;
}

export interface UscisFiling {
  id: string;
  caseId: string;
  title: string;
  formType: string;
  formSubType: string | null;
  receiptNumber: string | null;
  providerEligible: boolean;
  filedAt: string | null;
  receiptDate: string | null;
  serviceCenter: string | null;
  clientVisible: boolean;
  archived: boolean;
  provider: {
    type: 'none' | 'uscis_case_status';
    enabled: boolean;
    lastCheckedAt: string | null;
    lastSuccessfulSyncAt: string | null;
    lastErrorAt: string | null;
    lastErrorCode: string | null;
  };
  currentStatus: UscisCurrentStatus | null;
  updatedAt: string;
  createdAt: string;
  actions: UscisFilingActions;
}

export interface UscisEvent {
  id: string;
  statusCategory: UscisStatusCategory;
  statusTitle: string;
  statusDescription: string;
  occurredAt: string;
  observedAt: string;
  source: UscisStatusSource;
  actionRequired: boolean;
  responseDueAt: string | null;
  clientVisible: boolean;
  createdByName: string;
  createdAt: string;
}

export interface UscisFilingDetail {
  filing: UscisFiling;
  events: UscisEvent[];
  eventTotal: number;
}

export interface UscisCaseList {
  filings: UscisFiling[];
  actions: { canCreate: boolean };
}

/** A row of the cross-case queue: the filing plus where it lives. */
export interface UscisQueueRow extends UscisFiling {
  case: { id: string; caseNumber: string; title: string } | null;
  client: { displayName: string } | null;
  projectManager: { name: string } | null;
}

/** Body for POST /cases/:id/uscis and PATCH /uscis/:id. */
export interface UscisFilingFields {
  title: string;
  formType: string;
  formSubType: string | null;
  receiptNumber: string | null;
  serviceCenter: string | null;
  filedAt: string | null;
  receiptDate: string | null;
  clientVisible: boolean;
}

/** Body for POST /uscis/:id/status-events. */
export interface UscisStatusFields {
  statusCategory: UscisStatusCategory;
  statusTitle: string;
  statusDescription: string;
  occurredAt: string;
  actionRequired: boolean;
  responseDueAt: string | null;
  clientVisible: boolean;
}
