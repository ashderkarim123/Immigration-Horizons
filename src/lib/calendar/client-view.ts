import "server-only";

import { CaseCalendarEvent } from "../models/CaseCalendarEvent";
import { ConsultationInteraction } from "../models/ConsultationInteraction";
import { DocumentRequest } from "../models/DocumentRequest";
import { USCISFiling } from "../models/USCISFiling";
import { USCISStatusEvent } from "../models/USCISStatusEvent";
import { WorkspaceMember } from "../models/WorkspaceMember";

/**
 * Client-safe upcoming dates (ADR-027). A read-time projection, like the Staff calendar: nothing is copied into a
 * calendar collection. The caller has already passed `getAccessibleCase` (an active client WorkspaceMember); the sources
 * are re-checked here against that same membership and each source's own visibility rule.
 *
 * Eligible sources ONLY:
 *  - document requests addressed to this client's membership that still need action;
 *  - this client's own scheduled case appointments;
 *  - USCIS response dates under the Phase 11 rule (client-visible filing, newest CLIENT-VISIBLE event needs action);
 *  - client-visible manual events, showing clientTitle / clientDescription only.
 * Never: Staff tasks, the internal target filing date, internal query response deadlines, internal manual events or
 * their internal text, meeting links, locations, attendees, or hidden USCIS dates.
 *
 * Every item is built field by field; nothing is spread from a document.
 */

export type ClientCalendarItem = {
  id: string;
  kind: "document_due" | "appointment" | "uscis_response" | "event";
  title: string;
  description: string;
  mode: "date" | "datetime";
  /** YYYY-MM-DD: the calendar day itself, never shifted by a viewer's zone (date-only items). */
  date: string | null;
  endDate: string | null;
  /** ISO instants for timed items, rendered by the page in `timeZone`. */
  startAt: string | null;
  endAt: string | null;
  timeZone: string | null;
  href: string;
  /** True only when a date-only item is past due on every calendar in the world (more than a day ago). */
  pastDue: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PAST_DUE_LOOKBACK_DAYS = 60;
const HORIZON_DAYS = 365;
const MAX_ITEMS = 100;
const DOCUMENT_ACTION_STATUSES = ["open", "replacement_required"];

const day = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => day(new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + n * DAY_MS));

type Id = { toString(): string };
type DocRow = { _id: Id; title: string; dueDate: Date };
type QueryRow = { _id: Id; subject: string; scheduledFor: Date; timezone?: string };
type FilingRow = { _id: Id; title: string };
type EventRow = { filing: Id; actionRequired?: boolean; responseDueAt?: Date | null; statusTitle: string };
type ManualRow = {
  _id: Id;
  clientTitle: string;
  clientDescription?: string;
  allDay: boolean;
  startDate?: string | null;
  endDate?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  timeZone?: string | null;
};

const dateItem = (base: Pick<ClientCalendarItem, "id" | "kind" | "title" | "description" | "href">, date: string, endDate: string | null, pastDueDate: string | null, today: string): ClientCalendarItem => ({
  ...base,
  mode: "date",
  date,
  endDate,
  startAt: null,
  endAt: null,
  timeZone: null,
  pastDue: pastDueDate !== null && pastDueDate < addDays(today, -1),
});

/** Pure projection of already-selected, already-authorized rows. Exported for tests. */
export function projectClientCalendar(
  input: {
    caseId: string;
    documents: DocRow[];
    appointments: QueryRow[];
    uscis: { filings: FilingRow[]; newestVisibleEvents: Map<string, EventRow> };
    events: ManualRow[];
  },
  now: Date,
): ClientCalendarItem[] {
  const today = day(now);
  const items: ClientCalendarItem[] = [];

  for (const d of input.documents) {
    const date = day(d.dueDate);
    items.push(dateItem({ id: `document_request:${d._id}:dueDate`, kind: "document_due", title: `Document due: ${d.title}`, description: "", href: `/portal/cases/${input.caseId}/documents` }, date, null, date, today));
  }

  for (const q of input.appointments) {
    items.push({
      id: `query:${q._id}:scheduledFor`,
      kind: "appointment",
      title: q.subject,
      description: "",
      mode: "datetime",
      date: null,
      endDate: null,
      startAt: new Date(q.scheduledFor).toISOString(),
      endAt: null,
      timeZone: q.timezone || null,
      href: `/portal/queries/${q._id}`,
      pastDue: false,
    });
  }

  for (const f of input.uscis.filings) {
    const e = input.uscis.newestVisibleEvents.get(String(f._id));
    if (!e || !e.actionRequired || !e.responseDueAt) continue;
    const date = day(e.responseDueAt);
    items.push(dateItem({ id: `uscis:${f._id}:responseDueAt`, kind: "uscis_response", title: `USCIS response due: ${f.title}`, description: e.statusTitle, href: `/portal/cases/${input.caseId}/uscis` }, date, null, date, today));
  }

  for (const e of input.events) {
    const common = { id: `manual_event:${e._id}`, kind: "event" as const, title: e.clientTitle, description: e.clientDescription ?? "", href: `/portal/cases/${input.caseId}/calendar` };
    if (e.allDay && e.startDate) {
      items.push(dateItem(common, e.startDate, e.endDate && e.endDate !== e.startDate ? e.endDate : null, null, today));
    } else if (e.startAt) {
      items.push({ ...common, mode: "datetime", date: null, endDate: null, startAt: new Date(e.startAt).toISOString(), endAt: e.endAt ? new Date(e.endAt).toISOString() : null, timeZone: e.timeZone ?? null, pastDue: false });
    }
  }

  const key = (i: ClientCalendarItem) => (i.mode === "date" ? `${i.date}T00:00:00.000Z` : (i.startAt as string));
  return items.sort((a, b) => key(a).localeCompare(key(b)) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, MAX_ITEMS);
}

/** What this client may see coming up on this case. Returns [] (never an error) when nothing has been shared. */
export async function getClientCalendar(params: { caseId: string; workspaceId: string; clientUserId: string }, now: Date = new Date()): Promise<ClientCalendarItem[]> {
  const { caseId, workspaceId, clientUserId } = params;
  const membership = await WorkspaceMember.findOne({ workspace: workspaceId, clientUser: clientUserId, memberType: "client", status: "active" }).select("_id").lean();
  if (!membership) return [];

  const today = day(now);
  const from = new Date(`${addDays(today, -PAST_DUE_LOOKBACK_DAYS)}T00:00:00Z`);
  const to = new Date(`${addDays(today, HORIZON_DAYS)}T23:59:59Z`);

  const [documents, appointments, filings, events] = await Promise.all([
    DocumentRequest.find({ case: caseId, requestedFrom: membership._id, status: { $in: DOCUMENT_ACTION_STATUSES }, dueDate: { $gte: from, $lte: to } })
      .select("title dueDate")
      .limit(MAX_ITEMS)
      .lean(),
    ConsultationInteraction.find({
      clientUser: clientUserId,
      scopeType: "case",
      case: caseId,
      workspace: workspaceId,
      status: { $in: ["scheduled", "rescheduled"] },
      scheduledFor: { $gte: new Date(now.getTime() - HOUR_MS), $lte: to },
    })
      .select("subject scheduledFor timezone")
      .limit(MAX_ITEMS)
      .lean(),
    USCISFiling.find({ case: caseId, clientVisible: true, archivedAt: null }).select("title").limit(MAX_ITEMS).lean(),
    CaseCalendarEvent.find({
      case: caseId,
      clientVisible: true,
      status: "scheduled",
      $or: [
        { allDay: true, $or: [{ endDate: { $gte: addDays(today, -1) } }, { endDate: null, startDate: { $gte: addDays(today, -1) } }], startDate: { $lte: addDays(today, HORIZON_DAYS) } },
        { allDay: false, $or: [{ endAt: { $gte: now } }, { endAt: null, startAt: { $gte: new Date(now.getTime() - HOUR_MS) } }], startAt: { $lte: to } },
      ],
    })
      // Only the client-facing fields are ever selected: the internal ones never leave the database.
      .select("clientTitle clientDescription allDay startDate endDate startAt endAt timeZone")
      .limit(MAX_ITEMS)
      .lean(),
  ]);

  // Phase 11 rule: a client's status for a filing is its newest CLIENT-VISIBLE event, never the Staff snapshot.
  const newestVisibleEvents = new Map<string, EventRow>();
  if (filings.length) {
    const visible = await USCISStatusEvent.find({ filing: { $in: filings.map((f) => f._id) }, clientVisible: true })
      .sort({ occurredAt: -1, _id: -1 })
      .select("filing statusTitle actionRequired responseDueAt")
      .lean();
    for (const e of visible as unknown as EventRow[]) if (!newestVisibleEvents.has(String(e.filing))) newestVisibleEvents.set(String(e.filing), e);
  }

  return projectClientCalendar(
    {
      caseId,
      documents: documents as unknown as DocRow[],
      appointments: appointments as unknown as QueryRow[],
      uscis: { filings: filings as unknown as FilingRow[], newestVisibleEvents },
      events: events as unknown as ManualRow[],
    },
    now,
  );
}
