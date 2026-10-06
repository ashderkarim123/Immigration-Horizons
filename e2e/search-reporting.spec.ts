import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

/**
 * Phase 13 browser journey (ADR-028): the PM finds their own work through the command search and cannot find another team's by
 * exact number or a restricted conversation; a specialist's results and source filters follow their role; reports are scoped
 * (PM accessible, admin firm) and move when real data is created; the CSV is the same authorized rows, formula-safe and audited;
 * and removing a membership takes the case out of search, reports and exports on the next request. All data is synthetic.
 */
type Fixture = { password: string; roles: Record<string, { id: string; email: string }> };
type World = { a: { id: string; number: string }; b: { id: string; number: string }; c: { id: string; number: string }; receipt: string };
const ORIGIN = "http://localhost:3180";

async function fixture(page: Page): Promise<Fixture> {
  return (await page.request.get("/__browser_fixture")).json();
}

async function staff(browser: Browser, role: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const data = await fixture(page);
  await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(data.roles[role].email);
  await page.getByLabel(/^Password/).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard/);
  return { page, context, data };
}

/** Opens the command search with the keyboard and types a query; resolves once the dialog is ready. */
async function palette(page: Page, query: string) {
  await page.goto("/staff/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".search-trigger")).toBeVisible(); // the app has started, so its shortcut is listening
  await page.keyboard.press("Control+K");
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox")).toBeFocused();
  await dialog.getByRole("combobox").fill(query);
  return dialog;
}

const metric = async (page: Page, label: string) => {
  const card = page.locator(".metric", { hasText: label }).first();
  await expect(card).toBeVisible();
  return Number(((await card.locator(".m-value").textContent()) ?? "").trim());
};

const csvOf = async (context: BrowserContext, query: string) => {
  const res = await context.request.get(`/api/v1/staff/reports/export.csv?${query}`);
  return { res, text: await res.text() };
};

test("search, reports, CSV and revocation across two teams", async ({ browser, page }) => {
  // ── baselines before the synthetic data exists (other journeys share this database) ──
  const pm = await staff(browser, "pm");
  const admin = await staff(browser, "admin");
  await pm.page.goto("/staff/reports", { waitUntil: "domcontentloaded" });
  const pmCases = await metric(pm.page, "Active cases");
  const pmTasks = await metric(pm.page, "Open tasks");
  await admin.page.goto("/staff/reports?scope=firm", { waitUntil: "domcontentloaded" });
  const firmCases = await metric(admin.page, "Active cases");
  const firmTasks = await metric(admin.page, "Open tasks");

  const world: World = await (await pm.page.request.post("/__browser_search_fixture")).json();

  // ── PM: command search finds assigned work and deep-links to it ───────────
  let dialog = await palette(pm.page, world.a.number);
  await expect(dialog.getByRole("option").first()).toContainText("Zorblax assigned case");
  await expect(dialog.getByRole("option").first()).toContainText("Case");
  await pm.page.keyboard.press("Enter");
  await expect(pm.page).toHaveURL(new RegExp(`/staff/cases/${world.a.id}$`));

  dialog = await palette(pm.page, "Zorblax assigned task");
  await expect(dialog.getByRole("option", { name: /Zorblax assigned task/ })).toBeVisible();
  await dialog.getByRole("option", { name: /Zorblax assigned task/ }).click();
  await expect(pm.page).toHaveURL(new RegExp(`/staff/cases/${world.a.id}\\?tab=tasks`));

  dialog = await palette(pm.page, "Zorblax assigned passport");
  await dialog.getByRole("option", { name: /Zorblax assigned passport/ }).click();
  await expect(pm.page).toHaveURL(/\/staff\/documents\//);

  dialog = await palette(pm.page, "ioe 555-0001111");
  await dialog.getByRole("option", { name: /Zorblax I-140/ }).click();
  await expect(pm.page).toHaveURL(new RegExp(`/staff/cases/${world.a.id}\\?tab=tracking&filing=`));

  // ── PM: another team's exact case number and a restricted conversation are invisible ──
  dialog = await palette(pm.page, world.b.number);
  await expect(dialog.getByText("No results.")).toBeVisible();
  await expect(pm.page.getByText("Zorblax other team case")).toHaveCount(0);
  dialog = await palette(pm.page, "Zorblax confidential review");
  await expect(dialog.getByText("No results.")).toBeVisible();
  const direct = await pm.context.request.get(`/api/v1/staff/search?q=${encodeURIComponent("Zorblax confidential")}&types=conversations`);
  expect((await direct.json()).data.groups.flatMap((g: { items: unknown[] }) => g.items)).toEqual([]); // no row, so the channel name cannot leak

  // the full results page keeps the query in the URL and offers only sources this role can search
  await pm.page.goto("/staff/search?q=Zorblax", { waitUntil: "domcontentloaded" });
  await expect(pm.page.getByRole("heading", { name: "Search", exact: true })).toBeVisible();
  await expect(pm.page.locator(".result", { hasText: "Zorblax assigned case" })).toBeVisible();
  await expect(pm.page.locator(".result", { hasText: "Zorblax other team case" })).toHaveCount(0);
  await expect(pm.page.locator("nav.filters")).toContainText("Cases");

  // ── specialist: assigned case visible, other team hidden, no Clients source ──
  const specialist = await staff(browser, "evidence_collector");
  await specialist.page.goto("/staff/search?q=Zorblax", { waitUntil: "domcontentloaded" });
  await expect(specialist.page.locator(".result", { hasText: "Zorblax assigned case" })).toBeVisible();
  await expect(specialist.page.locator(".result", { hasText: "Zorblax other team" })).toHaveCount(0);
  await expect(specialist.page.locator("nav.filters")).not.toContainText("Clients");
  await expect(specialist.page.locator("nav.filters")).not.toContainText("USCIS");
  expect((await specialist.context.request.get("/api/v1/staff/search?q=Zorblax&type=clients")).status()).toBe(403);

  // ── Reports: the PM's accessible scope moves with real data, never with the other team's ──
  await pm.page.goto("/staff/reports", { waitUntil: "domcontentloaded" });
  await expect(pm.page.getByRole("heading", { name: "Current snapshot" })).toBeVisible();
  await expect(pm.page.getByRole("heading", { name: /^Selected period:/ })).toBeVisible();
  expect(await metric(pm.page, "Active cases")).toBe(pmCases + 2); // cases A and C; B belongs to another team
  expect(await metric(pm.page, "Open tasks")).toBe(pmTasks + 1); // A's task only
  await expect(pm.page.locator("#rep-scope option")).toHaveText(["Everything I can access", "Cases I manage"]);
  expect((await pm.context.request.get("/api/v1/staff/reports/overview?scope=firm")).status()).toBe(403);
  await pm.page.goto("/staff/reports?tab=pipeline", { waitUntil: "domcontentloaded" });
  await expect(pm.page.getByRole("heading", { name: "Active cases — Current snapshot" })).toBeVisible();
  await expect(pm.page.locator("table", { has: pm.page.locator("caption", { hasText: "By stage" }) })).toBeVisible();

  // ── Admin: the firm scope is available and includes both teams ────────────
  await admin.page.goto("/staff/reports?scope=firm", { waitUntil: "domcontentloaded" });
  await expect(admin.page.locator("#rep-scope option")).toHaveText(["Everything I can access", "Cases I manage", "Whole firm"]);
  expect(await metric(admin.page, "Active cases")).toBe(firmCases + 3);
  expect(await metric(admin.page, "Open tasks")).toBe(firmTasks + 2);

  // ── CSV: same authorized rows as the screen, formula-safe, valid headers, audited ──
  await pm.page.goto("/staff/reports?tab=review-queues", { waitUntil: "domcontentloaded" });
  await expect(pm.page.getByRole("heading", { name: /Documents to review: \d+/ })).toBeVisible();
  const exportLink = pm.page.getByRole("link", { name: "Export CSV" });
  await expect(exportLink).toBeVisible();
  const href = (await exportLink.getAttribute("href")) as string;
  expect(href).toBe("/api/v1/staff/reports/export.csv?report=review-queues&scope=accessible");
  const [download] = await Promise.all([pm.page.waitForEvent("download"), exportLink.click()]);
  expect(download.suggestedFilename()).toMatch(/^immigration-horizons-review-queues-\d{4}-\d{2}-\d{2}\.csv$/);

  const exported = await csvOf(pm.context, "report=review-queues&scope=accessible");
  expect(exported.res.status()).toBe(200);
  expect(exported.res.headers()["content-type"]).toMatch(/^text\/csv; charset=utf-8/);
  expect(exported.res.headers()["content-disposition"]).toMatch(/^attachment; filename="immigration-horizons-review-queues-/);
  expect(exported.text).toContain(world.a.number);
  expect(exported.text).toContain(world.c.number);
  expect(exported.text).not.toContain(world.b.number); // the other team's row never leaves the server
  expect(exported.text).not.toContain("Zorblax other team");
  expect(exported.text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`); // neutralized formula, quotes doubled
  expect(exported.text).not.toMatch(/(^|,)"=HYPERLINK/m);
  const adminExport = await csvOf(admin.context, "report=review-queues&scope=firm");
  expect(adminExport.text).toContain(world.b.number);
  expect((await csvOf(specialist.context, "report=review-queues")).res.status()).toBe(403); // no reports.view

  // ── revocation: removing the PM from team A removes it from search, reports and exports ──
  // a project manager cannot simply be removed: reassign the case, then take the PM off the team
  const reassigned = await admin.context.request.patch(`/api/v1/staff/cases/${world.a.id}/project-manager`, { data: { projectManagerId: pm.data.roles.operations_admin.id }, headers: { origin: ORIGIN } });
  expect(reassigned.ok()).toBeTruthy();
  const members = await (await admin.context.request.get(`/api/v1/staff/cases/${world.a.id}/members`)).json();
  const membership = members.data.members.find((m: { employee: { id: string } | null; status: string }) => m.employee?.id === pm.data.roles.pm.id && m.status === "active");
  if (membership) {
    const removed = await admin.context.request.delete(`/api/v1/staff/cases/${world.a.id}/members/${membership.id}`, { headers: { origin: ORIGIN } });
    expect(removed.ok()).toBeTruthy();
  }

  dialog = await palette(pm.page, world.a.number);
  await expect(dialog.getByText("No results.")).toBeVisible();
  await pm.page.goto("/staff/reports", { waitUntil: "domcontentloaded" });
  expect(await metric(pm.page, "Active cases")).toBe(pmCases + 1); // only case C is left
  expect(await metric(pm.page, "Open tasks")).toBe(pmTasks);
  const after = await csvOf(pm.context, "report=review-queues&scope=accessible");
  expect(after.text).not.toContain(world.a.number);
  expect(after.text).toContain(world.c.number);
});

test("command search works on a phone: a full-width sheet, keyboard-free", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  const data = await fixture(page);
  await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(data.roles.pm.email);
  await page.getByLabel(/^Password/).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard/);
  await page.getByRole("button", { name: "Search" }).click();
  const dialog = page.getByRole("dialog", { name: "Search" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(385); // full width sheet
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
