/** Wire contract of /api/v1/staff Smart Forms endpoints (ADR-021 §22/§24). */

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'yes_no'
  | 'select'
  | 'multi_select'
  | 'country'
  | 'address'
  | 'repeated_group';

export type FormStatus = 'draft' | 'submitted' | 'needs_changes' | 'approved' | 'locked';

export interface FormCondition {
  field: string;
  op: 'equals' | 'notEquals' | 'isTruthy' | 'isFalsy';
  value?: unknown;
}

export interface FormFieldDef {
  key: string;
  label: string;
  type: FormFieldType;
  required?: boolean;
  staffOnly?: boolean;
  helpText?: string;
  options?: { value: string; label: string }[];
  children?: FormFieldDef[];
  validation?: { maxItems?: number };
  visibilityCondition?: FormCondition;
}

export interface FormSectionDef {
  key: string;
  title: string;
  fields: FormFieldDef[];
}

export interface FormProgress {
  completedRequired: number;
  totalRequired: number;
  percent: number;
}

export interface SmartFormListItem {
  id: string;
  caseId: string;
  title: string;
  templateKey: string;
  templateVersion: number;
  status: FormStatus;
  revision: number;
  progress: FormProgress;
  updatedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  lockedAt: string | null;
}

export interface SmartFormActions {
  canEdit: boolean;
  canSubmit: boolean;
  canReturn: boolean;
  canApprove: boolean;
  canLock: boolean;
}

export type FormAnswers = Record<string, unknown>;

export interface SmartFormDetail extends SmartFormListItem {
  sections: FormSectionDef[];
  answers: FormAnswers;
  lastSavedAt: string | null;
  lastSavedByName: string;
  returnedAt: string | null;
  clientReviewNote: string;
  internalReviewNote: string;
  lockedRevision: number | null;
  actions: SmartFormActions;
}

export interface SmartFormList {
  forms: SmartFormListItem[];
  canProvision: boolean;
}

export interface SmartFormAuditEvent {
  id: string;
  eventType: string;
  fromStatus: FormStatus | null;
  toStatus: FormStatus | null;
  revision: number;
  changedFieldKeys: string[];
  actorType: 'client' | 'employee' | 'system';
  actorName: string;
  createdAt: string | null;
}

/** `{ error: { code, message, fieldErrors } }` — 409s carry `{ revision, status }` in fieldErrors. */
export interface FormApiError {
  error?: {
    code?: string;
    message?: string;
    fieldErrors?: Record<string, string | number> | null;
  };
}
