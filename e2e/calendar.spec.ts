import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Phase 12 browser journey (ADR-027). A PM puts a task and a timed appointment on a case and sees both on the Calendar;
 * changing time zone moves the timed event to the right local day while the date-only task stays on its day. A specialist
 * sees only their case and cannot add events. The client sees the shared appointment and their own document deadline, never
 * the Staff task or the internal event. The reminder engine runs twice and produces one notification. All data is synthetic,
 * created in the disposable fixture database.
 */
type Fixture = { password: string; roles: Record<string, { id: string; email: string }> };
type CalendarFixture = { caseId: string; otherCaseId: string; client: { email: string }; tomorrow: string };

const TASK = "Staff-only cover letter task";
const APPOINTMENT = "Client interview preparation";
const CLIENT_TITLE = "Interview preparation call";
const INTERNAL_EVENT = "INTERNAL strategy huddle";
const ORIGIN = "http://localhost:3180";

const longDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

async function fixture(page: Page): Promise<Fixture> {
  return (await page.request.get("/__browser_fixture")).json();
}
async function calendarFixture(page: Page): Promise<CalendarFixture> {
  return (await page.request.post("/__browser_calendar_fixture")).json();
}

async function staff(browser: Browser, role: string, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  const data = await fixture(page);
  await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(data.roles[role].email);
  await page.getByLabel(/^Password/).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard/);
  return { page, context, data };
}

/** The month cell button of a day, e.g. "Friday, October 16, 2026, 2 items", and the whole cell around it. */
const dayButton = (page: Page, iso: string) => page.locator(`table.month button[aria-label^="${longDay(iso)}"]`);
const dayCell = (page: Page, iso: string) => page.locator("table.month td", { has: page.locator(`button[aria-label^="${longDay(iso)}"]`) });

async function addEvent(page: Page, e: { title: string; day: string; time: string; zone: string; clientTitle?: string }) {
  await page.getByRole("button", { name: "Add event" }).click();
  const dialog = page.getByRole("dialog", { name: "Add calendar event" });
  await dialog.getByLabel(/^Title/).first().fill(e.title);
  await dialog.getByLabel(/^Starts/).fill(`${e.day}T${e.time}`);
  await dialog.getByLabel(/^Time zone/).selectOption(e.zone);
  if (e.clientTitle) {
    await dialog.getByLabel("Show this event to the client in their portal").check();
    await dialog.getByLabel("Title the client will see").fill(e.clientTitle);
  }
  await dialog.getByRole("button", { name: "Add event" }).click();
  await expect(dialog).toBeHidden();
}

test("PM, specialist, client and reminders: dates, time zones and visibility across the calendar", async ({ browser, page }) => {
  const world = await calendarFixture(page);
  const { tomorrow } = world;
  const dayAfter = addDays(tomorrow, 1);

  // ── PM: a case task due tomorrow (date-only), then a timed appointment ─────
  const pm = await staff(browser, "pm");
  await pm.page.goto(`/staff/cases/${world.caseId}?tab=tasks&action=task`, { waitUntil: "domcontentloaded" });
  await pm.page.locator("#task-title").fill(TASK);
  await pm.page.locator("#task-due").fill(tomorrow);
  await pm.page.getByLabel("Assignee", { exact: true }).selectOption(pm.data.roles.pm.id);
  await pm.page.getByRole("button", { name: "Create Task", exact: true }).click();
  await expect(pm.page.getByText(TASK, { exact: true })).toBeVisible();

  // 22:30 in Karachi (UTC+5, no daylight saving) is 17:30 UTC the same evening and 02:30 the NEXT day in Tokyo.
  await pm.page.goto(`/staff/cases/${world.caseId}?tab=calendar`, { waitUntil: "domcontentloaded" });
  await expect(pm.page.getByRole("heading", { name: "Calendar" }).first()).toBeVisible();
  await addEvent(pm.page, { title: APPOINTMENT, day: tomorrow, time: "22:30", zone: "Asia/Karachi", clientTitle: CLIENT_TITLE });
  await addEvent(pm.page, { title: INTERNAL_EVENT, day: tomorrow, time: "10:00", zone: "Asia/Karachi" });

  // the case Calendar tab lists real source dates and the events, each linking to where it lives
  const caseRows = pm.page.locator("ih-calendar-tab .row");
  await expect(caseRows.filter({ hasText: TASK })).toHaveCount(1);
  await expect(caseRows.filter({ hasText: "Calendar passport copy" })).toHaveCount(1);
  await expect(caseRows.filter({ hasText: APPOINTMENT })).toHaveCount(1);
  await expect(caseRows.filter({ hasText: TASK }).getByRole("link", { name: TASK })).toHaveAttribute("href", /tab=tasks/);

  // ── PM: Month view, then Agenda; the other firm case is not here ──────────
  await pm.page.goto(`/staff/calendar?scope=team&month=${tomorrow.slice(0, 7)}`, { waitUntil: "domcontentloaded" });
  await expect(pm.page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  await expect(dayButton(pm.page, tomorrow)).toContainText(/\d/);
  await expect(dayCell(pm.page, tomorrow)).toContainText(TASK);
  // four items on the day (document deadline, task, two events): a cell shows three, all-day items first, then the count
  await expect(dayButton(pm.page, tomorrow)).toHaveAttribute("aria-label", /4 items/);
  await expect(dayCell(pm.page, tomorrow)).toContainText("+1 more");
  await expect(pm.page.locator("table.month")).not.toContainText("Other firm case"); // another team's target filing date

  await dayButton(pm.page, tomorrow).click();
  const panel = pm.page.locator(".day-panel");
  await expect(panel.getByRole("heading", { name: longDay(tomorrow) })).toBeVisible();
  await expect(panel.locator(".row", { hasText: TASK })).toContainText("All day");
  await expect(panel.locator(".row", { hasText: APPOINTMENT })).toContainText("5:30 PM UTC"); // 22:30 Karachi

  await pm.page.getByRole("button", { name: "Agenda", exact: true }).click();
  await expect(pm.page).toHaveURL(/view=agenda/);
  await expect(pm.page.locator("table.month")).toHaveCount(0);
  await expect(pm.page.locator(".agenda-day", { hasText: longDay(tomorrow) })).toBeVisible();
  await expect(pm.page.locator(".agenda .row", { hasText: TASK })).toBeVisible();

  // ── change time zone: the timed event moves to Tokyo's next day, the task does not ──
  await pm.page.getByRole("button", { name: "Month", exact: true }).click();
  await pm.page.getByRole("button", { name: "Time zone & reminders" }).click();
  await pm.page.getByLabel("Your time zone").selectOption("Asia/Tokyo");
  await pm.page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(pm.page.getByText("Times are shown in Asia/Tokyo")).toBeVisible();
  const tomorrowCell = dayCell(pm.page, tomorrow);
  const dayAfterCell = dayCell(pm.page, dayAfter);
  await expect(tomorrowCell).toContainText(TASK); // a date-only deadline stays on its day
  await expect(tomorrowCell).not.toContainText(APPOINTMENT);
  await expect(dayAfterCell).toContainText(APPOINTMENT); // 17:30 UTC is 02:30 the next day in Tokyo
  await dayButton(pm.page, dayAfter).click();
  await expect(pm.page.locator(".day-panel .row", { hasText: APPOINTMENT })).toContainText("2:30 AM");
  await pm.context.request.patch("/api/v1/staff/calendar/preferences", { data: { timeZone: "" }, headers: { origin: ORIGIN } }); // back to the default

  // a manual event opens for editing from the Calendar page
  await pm.page.goto(`/staff/calendar?scope=team&view=agenda&month=${tomorrow.slice(0, 7)}`, { waitUntil: "domcontentloaded" });
  await pm.page.locator(".agenda .row", { hasText: APPOINTMENT }).getByRole("button", { name: APPOINTMENT }).click();
  const editor = pm.page.getByRole("dialog", { name: "Calendar event" });
  await expect(editor.getByLabel(/^Title/).first()).toHaveValue(APPOINTMENT);
  await expect(editor.getByLabel(/^Starts/)).toHaveValue(`${tomorrow}T22:30`); // read back in the zone it was scheduled in
  await expect(editor.getByLabel(/^Time zone/)).toHaveValue("Asia/Karachi");
  await editor.getByRole("button", { name: "Close", exact: true }).click();

  // ── specialist: sees the case they are on, not the other firm case, and cannot add events ──
  const specialist = await staff(browser, "evidence_collector");
  await expect(specialist.page.getByRole("link", { name: "Calendar", exact: true })).toBeVisible();
  await specialist.page.goto(`/staff/calendar?scope=team&month=${tomorrow.slice(0, 7)}`, { waitUntil: "domcontentloaded" });
  const specialistCell = dayCell(specialist.page, tomorrow);
  await expect(specialistCell).toContainText("Calendar passport copy"); // the document deadline of their case
  await expect(specialistCell).toContainText(APPOINTMENT);
  await expect(specialistCell).not.toContainText(TASK); // another employee's task
  await expect(specialist.page.locator("table.month")).not.toContainText("Other firm case");
  await specialist.page.goto(`/staff/cases/${world.caseId}?tab=calendar`, { waitUntil: "domcontentloaded" });
  await expect(specialist.page.locator("ih-calendar-tab .row", { hasText: APPOINTMENT })).toBeVisible();
  await expect(specialist.page.getByRole("button", { name: "Add event" })).toHaveCount(0);
  const blocked = await specialist.context.request.post(`/api/v1/staff/cases/${world.caseId}/calendar-events`, {
    data: { eventType: "meeting", title: "Not allowed", allDay: true, startDate: tomorrow },
    headers: { origin: ORIGIN },
  });
  expect(blocked.status()).toBe(403);
  const hidden = await specialist.context.request.get(`/api/v1/staff/calendar?from=${tomorrow}&to=${tomorrow}&scope=team&caseId=${world.otherCaseId}`);
  expect(hidden.status()).toBe(404); // another team's case is concealed

  // ── a role without calendar.view has no entry and gets a clear message ─────
  const viewer = await staff(browser, "viewer");
  await expect(viewer.page.getByRole("link", { name: "Calendar", exact: true })).toHaveCount(0);
  await viewer.page.goto("/staff/calendar", { waitUntil: "domcontentloaded" });
  await expect(viewer.page.getByText("You do not have access to the calendar.")).toBeVisible();

  // ── reminders: two passes, one notification; the link opens the exact tab ──
  const first = await (await page.request.post("/__browser_run_reminders")).json();
  const second = await (await page.request.post("/__browser_run_reminders")).json();
  expect(first.totals.created).toBeGreaterThan(0);
  expect(second.totals.created).toBe(0);
  expect(second.totals.alreadySent).toBe(first.totals.created);

  await pm.page.goto("/staff/notifications", { waitUntil: "domcontentloaded" });
  const reminder = pm.page.locator("article", { hasText: "Task due tomorrow" });
  await expect(reminder).toHaveCount(1);
  await expect(reminder).toContainText(TASK);
  await reminder.getByRole("link", { name: "Open" }).click();
  await expect(pm.page).toHaveURL(new RegExp(`/staff/cases/${world.caseId}\\?tab=tasks`));
  await expect(pm.page.getByText(TASK, { exact: true })).toBeVisible();

  // ── client: the shared appointment and their own document deadline only ───
  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  const data = await fixture(client);
  await client.goto("/portal/login", { waitUntil: "domcontentloaded" });
  await client.getByLabel("Email", { exact: false }).fill(world.client.email);
  await client.getByLabel(/^Password/).fill(data.password);
  await client.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(client).toHaveURL(/\/portal$/);

  await client.goto(`/portal/cases/${world.caseId}/calendar`, { waitUntil: "domcontentloaded" });
  await expect(client.getByRole("heading", { name: "Upcoming dates" })).toBeVisible();
  const shared = client.locator("li", { hasText: CLIENT_TITLE });
  await expect(shared).toHaveCount(1);
  await expect(shared).toContainText(/10:30 PM/); // the appointment, in the zone it was scheduled in
  await expect(client.locator("li", { hasText: "Document due: Calendar passport copy" })).toHaveCount(1);
  await expect(client.locator("body")).not.toContainText(TASK);
  await expect(client.locator("body")).not.toContainText(INTERNAL_EVENT);
  await expect(client.locator("body")).not.toContainText(APPOINTMENT); // the internal title is never shown
  await expect(client.locator("body")).not.toContainText("Other firm case");

  await client.goto(`/portal/cases/${world.caseId}`, { waitUntil: "domcontentloaded" });
  await expect(client.getByRole("heading", { name: "Upcoming dates" })).toBeVisible();
  await expect(client.locator("li", { hasText: CLIENT_TITLE })).toHaveCount(1);

  await client.goto("/portal/notifications", { waitUntil: "domcontentloaded" });
  await expect(client.locator("li", { hasText: "Document request due tomorrow" })).toHaveCount(1);
  await client.locator("li", { hasText: "Document request due tomorrow" }).getByRole("link", { name: /View/ }).click();
  await expect(client).toHaveURL(new RegExp(`/portal/cases/${world.caseId}/documents`));

  const crossCase = await clientContext.request.get(`/api/portal/cases/${world.otherCaseId}/calendar`);
  expect(crossCase.status()).toBe(404);
});

test("the Calendar is usable on a phone: Agenda replaces the month grid", async ({ browser, page }) => {
  const world = await calendarFixture(page);
  const phone = await staff(browser, "pm", { width: 390, height: 800 });
  await phone.page.goto(`/staff/calendar?scope=team&month=${world.tomorrow.slice(0, 7)}`, { waitUntil: "domcontentloaded" });
  await expect(phone.page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  await expect(phone.page.locator("table.month")).toHaveCount(0);
  await expect(phone.page.locator(".agenda").first()).toBeVisible();
  const overflow = await phone.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1); // no horizontal page scroll
});
