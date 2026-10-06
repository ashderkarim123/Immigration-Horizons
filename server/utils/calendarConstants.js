/**
 * Calendar vocabulary (ADR-027). Mirrored by src/lib/content/calendar-constants.ts and pinned by
 * docs/architecture/calendar-schema-contract.json from both sides.
 */
const EVENT_TYPES = ['appointment', 'consultation', 'interview', 'biometrics', 'meeting', 'deadline', 'milestone', 'other'];
const EVENT_STATUSES = ['scheduled', 'completed', 'cancelled'];

const LIMITS = {
  internalTitle: 200,
  internalDescription: 2000,
  location: 300,
  meetingUrl: 500,
  clientTitle: 200,
  clientDescription: 1000,
  attendees: 25,
};

module.exports = { EVENT_TYPES, EVENT_STATUSES, LIMITS };
