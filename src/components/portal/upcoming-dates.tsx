import Link from "next/link";

import { Badge } from "@/components/app/badge";
import { formatCalendarDate, formatCalendarInstant } from "@/lib/calendar/format";
import type { ClientCalendarItem } from "@/lib/calendar/client-view";

const KIND_LABEL: Record<ClientCalendarItem["kind"], string> = {
  document_due: "Document",
  appointment: "Appointment",
  uscis_response: "USCIS",
  event: "Event",
};

export const NO_UPCOMING_DATES = "No upcoming dates have been shared for this case.";

function when(item: ClientCalendarItem): string {
  if (item.mode === "datetime" && item.startAt) return formatCalendarInstant(item.startAt, item.timeZone);
  const start = formatCalendarDate(item.date as string);
  return item.endDate ? `${start} to ${formatCalendarDate(item.endDate)}` : start;
}

/** Read-only list of dates the team has shared with the client. Dates link to the page that owns them. */
export function UpcomingDates({ items, limit }: { items: ClientCalendarItem[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  if (shown.length === 0) return <p className="text-ink-500 text-sm">{NO_UPCOMING_DATES}</p>;
  return (
    <ul className="divide-ink-200 divide-y text-sm">
      {shown.map((item) => (
        <li key={item.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="text-navy-800 font-semibold">{item.title}</p>
            <p className="text-ink-600 mt-0.5">{item.mode === "datetime" ? <time dateTime={item.startAt as string}>{when(item)}</time> : <time dateTime={item.date as string}>{when(item)}</time>}</p>
            {item.description ? <p className="text-ink-500 mt-1 whitespace-pre-line">{item.description}</p> : null}
            <Link href={item.href} className="text-navy-700 mt-1 inline-block text-xs font-semibold hover:underline">
              Open
              <span className="sr-only"> {item.title}</span>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {item.pastDue ? <Badge tone="danger">Past due</Badge> : null}
            <Badge tone="neutral">{KIND_LABEL[item.kind]}</Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}
