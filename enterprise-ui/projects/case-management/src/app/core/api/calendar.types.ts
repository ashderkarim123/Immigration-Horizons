/**
 * DTOs for /api/v1/staff/calendar* and manual calendar events, shaped exactly like
 * server/services/calendarService.js and server/services/calendarEvents.js.
 * The calendar is a read-time projection: every item points back at the module that owns its date.
 */

// Mirrors EVENT_TYPES in server/utils/calendarConstants.js; calendar-schema-contract.test.js fails if they drift.
export const CALENDAR_EVENT_TYPES = [
  { value: 'appointment', label: 'Appointment' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'interview', label: 'Interview' },
  { value: 'biometrics', label: 'Biometrics' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'milestone', label: 'Milestone' },
  { value: 'other', label: 'Other' },
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number]['value'];
export type CalendarEventStatus = 'scheduled' | 'completed' | 'cancelled';

/** What kind of date an item is; also the filter vocabulary of GET /staff/calendar?kinds=. */
export const CALENDAR_KINDS = [
  { value: 'target_filing', label: 'Filing dates' },
  { value: 'task_due', label: 'Tasks' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'document_due', label: 'Document deadlines' },
  { value: 'query_due', label: 'Query response dates' },
  { value: 'uscis_response', label: 'USCIS response dates' },
  { value: 'manual_event', label: 'Manual events' },
] as const;

export type CalendarKind = (typeof CALENDAR_KINDS)[number]['value'];
export type CalendarScope = 'mine' | 'team';

/** Date-only items carry a plain calendar date that never shifts; timed items carry exact instants. */
export interface CalendarTime {
  mode: 'date' | 'datetime';
  /** YYYY-MM-DD when mode is 'date' (the first day of a multi-day all-day event). */
  date: string | null;
  /** YYYY-MM-DD, last day of a multi-day all-day event; null otherwise. */
  endDate: string | null;
  startAt: string | null;
  endAt: string | null;
  /** IANA zone the event was scheduled in (timed items), else null. */
  timeZone: string | null;
  allDay: boolean;
}

export interface CalendarLink {
  /** Router path, e.g. /cases/:id */
  path: string;
  queryParams: Record<string, string>;
}

export interface CalendarItem {
  id: string;
  sourceType: 'case' | 'task' | 'document_request' | 'query' | 'uscis' | 'manual_event';
  sourceId: string;
  sourceField: 'targetFilingDate' | 'dueDate' | 'scheduledFor' | 'responseDueAt' | null;
  kind: CalendarKind;
  case: { id: string; caseNumber: string; title: string } | null;
  title: string;
  description: string;
  time: CalendarTime;
  status: string;
  priority: string | null;
  actionRequired: boolean;
  /** Assignee or owner display name where it is safe to show. */
  person: string | null;
  link: CalendarLink;
  clientVisible: boolean;
  actions: { canEdit: boolean; canCancel: boolean };
}

export interface CalendarResponse {
  items: CalendarItem[];
  range: { from: string; to: string; timeZone: string };
  /** Sources the actor may not see are simply absent; this lists which kinds were queried. */
  kinds: CalendarKind[];
  scope: CalendarScope;
  /** True when a source had more rows than one response carries; narrow the range or filters. */
  truncated: boolean;
}

export interface CalendarConfig {
  timeZone: {
    resolved: string;
    source: 'user' | 'practice' | 'utc';
    userValue: string | null;
    practice: { value: string | null; configured: boolean; invalid: boolean };
  };
  kinds: { value: CalendarKind; label: string }[];
  scopes: CalendarScope[];
  canManage: boolean;
  maxRangeDays: number;
  reminders: { deadlineReminders: boolean; appointmentReminders: boolean };
}

export interface CalendarFilters {
  kinds: CalendarKind[];
  scope: CalendarScope;
  caseId: string | null;
  includeCompleted: boolean;
}

/** A manual case event as Staff see it (never exposed to clients in this shape). */
export interface CaseCalendarEventDto {
  id: string;
  caseId: string;
  eventType: CalendarEventType;
  title: string;
  description: string;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startAt: string | null;
  endAt: string | null;
  /** The same instants as wall-clock "YYYY-MM-DDTHH:mm" in timeZone, ready for the editor. */
  startLocal: string | null;
  endLocal: string | null;
  timeZone: string | null;
  location: string;
  meetingUrl: string | null;
  attendees: { id: string; name: string }[];
  clientVisible: boolean;
  clientTitle: string;
  clientDescription: string;
  status: CalendarEventStatus;
  actions: { canEdit: boolean; canCancel: boolean };
}

export interface CreateCalendarEventInput {
  eventType: CalendarEventType;
  title: string;
  description: string;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startLocal: string | null;
  endLocal: string | null;
  timeZone: string | null;
  location: string;
  meetingUrl: string | null;
  attendeeIds: string[];
  clientVisible: boolean;
  clientTitle: string;
  clientDescription: string;
}

export type UpdateCalendarEventInput = Partial<CreateCalendarEventInput>;

export const calendarKindLabel = (kind: string): string => CALENDAR_KINDS.find((k) => k.value === kind)?.label ?? kind;
