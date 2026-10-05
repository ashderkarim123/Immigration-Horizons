import { isValidTimezone } from "../timezone";

/**
 * Display formatting for client calendar items. A date-only value is a calendar day and is always rendered in UTC so it
 * can never slip a day; a timed value is rendered in the zone it was scheduled in, with the zone named, so nobody has to
 * guess which clock "2:30 PM" refers to.
 */
export function formatCalendarDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatCalendarInstant(iso: string, timeZone: string | null): string {
  const zone = isValidTimezone(timeZone) ? timeZone : "UTC";
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone, timeZoneName: "short" }).format(new Date(iso));
}
