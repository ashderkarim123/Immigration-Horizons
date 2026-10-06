/**
 * Mirrors server/utils/calendarConstants.js (ADR-027); both are pinned by
 * docs/architecture/calendar-schema-contract.json. The portal only reads manual events.
 */
export const CALENDAR_EVENT_TYPES = ["appointment", "consultation", "interview", "biometrics", "meeting", "deadline", "milestone", "other"] as const;
export const CALENDAR_EVENT_STATUSES = ["scheduled", "completed", "cancelled"] as const;

export const CALENDAR_LIMITS = {
  internalTitle: 200,
  internalDescription: 2000,
  location: 300,
  meetingUrl: 500,
  clientTitle: 200,
  clientDescription: 1000,
  attendees: 25,
} as const;
