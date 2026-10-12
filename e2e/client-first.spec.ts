import { test, expect } from "@playwright/test";

/**
 * Client-first workspace, against the real Staff API: a Project Manager signs in and recognises their work by the client's
 * name (the case number is only a reference), reaches the case from the dashboard, and finds it in Cases by typing the
 * client's name. The menu is grouped and reaches Leads without going through the dashboard. All data is synthetic.
 */
type Fixture = { password: string; caseId: string; roles: Record<string, { id: string; email: string }> };

test("staff dashboard and case list are client-first, and the grouped menu reaches every area", async ({ page }) => {
  const data: Fixture = await (await page.request.get("/__browser_fixture")).json();
  await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(data.roles.pm.email);
  await page.getByLabel(/^Password/).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard/);

  // ── the dashboard names the case by its client ──
  const clients = page.getByRole("region", { name: /Clients and active cases/ });
  const row = clients.getByRole("row", { name: /Casey Browser/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Ref IH-");
  await expect(row.getByRole("link", { name: "Casey Browser", exact: true })).toHaveAttribute("href", `/staff/cases/${data.caseId}`);
  await expect(page.getByRole("link", { name: /^IH-\d{4}-/ })).toHaveCount(0); // no link anywhere is named by a case number

  // ── overview cards open what they count ──
  await expect(page.getByRole("link", { name: /Tasks due today/ })).toHaveAttribute("href", "/staff/tasks?due=today");
  await expect(page.getByRole("link", { name: /Overdue tasks/ })).toHaveAttribute("href", "/staff/tasks?due=overdue");

  // ── grouped menu ──
  const nav = page.getByRole("navigation", { name: "Staff navigation" });
  await expect(nav.getByRole("group", { name: "Workspace" }).getByRole("link", { name: "Notifications" })).toBeVisible();
  await expect(nav.getByRole("group", { name: "Clients and leads" }).getByRole("link", { name: "Leads" })).toHaveAttribute("href", "/staff/intake");

  // ── from the dashboard into the case ──
  await row.getByRole("link", { name: "Casey Browser", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/staff/cases/${data.caseId}`));

  // ── Cases: found by the client's name, listed by the client's name ──
  await nav.getByRole("link", { name: "Cases", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search cases" });
  await search.fill("Casey Browser");
  await search.press("Enter");
  const caseRow = page.getByRole("row", { name: /Casey Browser/ }).first();
  await expect(caseRow).toBeVisible();
  await expect(caseRow.getByRole("link", { name: "Casey Browser" })).toHaveAttribute("href", `/staff/cases/${data.caseId}`);
});
