import "server-only";

import { USCISFiling } from "../models/USCISFiling";
import { USCISStatusEvent } from "../models/USCISStatusEvent";

/**
 * Client-safe USCIS tracking (ADR-026). The portal only READS this domain, for a caller that
 * has already passed `getAccessibleCase` (active client WorkspaceMember).
 *
 * The rule that matters: a client's "current status" is the newest CLIENT-VISIBLE event. It is
 * never copied from the filing's Staff snapshot, because the newest event may be internal-only.
 * Everything below is built field by field; nothing is spread from a document, so provider
 * internals, employee ids, hashes and hidden events cannot leak by accident.
 */

const MAX_FILINGS = 20;
const MAX_EVENTS = 500;

export type StoredFiling = {
  _id: unknown;
  title: string;
  formType: string;
  receiptNumber?: string | null;
  filedAt?: Date | null;
  receiptDate?: Date | null;
};

export type StoredEvent = {
  _id: unknown;
  filing: unknown;
  statusTitle: string;
  statusDescription?: string;
  occurredAt: Date;
  actionRequired?: boolean;
  responseDueAt?: Date | null;
};

export type ClientTrackingEvent = {
  id: string;
  title: string;
  description: string;
  occurredAt: string;
  actionRequired: boolean;
  responseDueAt: string | null;
};

export type ClientTrackingFiling = {
  id: string;
  title: string;
  formType: string;
  receiptNumber: string | null;
  filedAt: string | null;
  receiptDate: string | null;
  currentStatus: ClientTrackingEvent | null;
  timeline: ClientTrackingEvent[];
};

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

function toClientEvent(e: StoredEvent): ClientTrackingEvent {
  const action = !!e.actionRequired;
  return {
    id: String(e._id),
    title: e.statusTitle,
    description: e.statusDescription ?? "",
    occurredAt: new Date(e.occurredAt).toISOString(),
    actionRequired: action,
    responseDueAt: action ? iso(e.responseDueAt) : null,
  };
}

/** Newest first: occurredAt, then the later id (the same order Staff uses for its snapshot). */
const newestFirst = (a: StoredEvent, b: StoredEvent) =>
  new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || String(b._id).localeCompare(String(a._id));

/** Pure projection: `events` must already be limited to client-visible ones. Exported for tests. */
export function projectClientTracking(filings: StoredFiling[], visibleEvents: StoredEvent[]): ClientTrackingFiling[] {
  const byFiling = new Map<string, StoredEvent[]>();
  for (const e of visibleEvents) byFiling.set(String(e.filing), [...(byFiling.get(String(e.filing)) ?? []), e]);

  return filings.map((f) => {
    const timeline = (byFiling.get(String(f._id)) ?? []).sort(newestFirst).map(toClientEvent);
    return {
      id: String(f._id),
      title: f.title,
      formType: f.formType,
      receiptNumber: f.receiptNumber ?? null,
      filedAt: iso(f.filedAt),
      receiptDate: iso(f.receiptDate),
      currentStatus: timeline[0] ?? null,
      timeline,
    };
  });
}

export async function getClientTracking(caseId: string): Promise<ClientTrackingFiling[]> {
  const filings = (await USCISFiling.find({ case: caseId, clientVisible: true, archivedAt: null })
    .sort({ createdAt: 1 })
    .limit(MAX_FILINGS)
    .select("title formType receiptNumber filedAt receiptDate")
    .lean()) as unknown as StoredFiling[];
  if (!filings.length) return [];

  const events = (await USCISStatusEvent.find({ filing: { $in: filings.map((f) => f._id) }, clientVisible: true })
    .sort({ occurredAt: -1, _id: -1 })
    .limit(MAX_EVENTS)
    .select("filing statusTitle statusDescription occurredAt actionRequired responseDueAt")
    .lean()) as unknown as StoredEvent[];

  return projectClientTracking(filings, events);
}
