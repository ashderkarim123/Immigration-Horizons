import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Phase 11 browser journey: Staff records USCIS tracking by hand, a view-only colleague sees it read-only, the
 * client sees only what was shared (a newer INTERNAL update never becomes their status), and removal from the case
 * takes effect immediately. All data is synthetic and nothing here contacts USCIS: manual tracking needs no
 * provider, and the provider is off in this fixture.
 */
type Fixture = {
  password: string;
  roles: Record<string, { id: string; email: string }>;
  client: { id: string; email: string };
  caseId: string;
};

const RECEIPT = "IOE0000000001"; // synthetic, not a real receipt
const RFE_TITLE = "Request for Additional Evidence Was Mailed";
const INTERNAL_TITLE = "INTERNAL escalate to senior reviewer";

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

const trackingUrl = (caseId: string) => `/staff/cases/${caseId}?tab=tracking`;

async function addStatus(page: Page, status: { category: string; title: string; action?: { due: string }; clientVisible: boolean }) {
  await page.getByRole("button", { name: "Add status update" }).click();
  const dialog = page.getByRole("dialog", { name: "Add status update" });
  await dialog.getByLabel("Category").selectOption(status.category);
  await dialog.getByLabel(/Status as shown by USCIS/).fill(status.title);
  const visible = dialog.getByLabel("Show this update to the client");
  if (status.clientVisible) await visible.check();
  else await visible.uncheck();
  if (status.action) {
    await dialog.getByLabel("A response or other action is required").check();
    await dialog.getByLabel("Response due date").fill(status.action.due);
  }
  await dialog.getByRole("button", { name: "Add update" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".timeline-item strong").first()).toHaveText(status.title);
}

test("Staff tracking, read-only colleague, client visibility and immediate removal", async ({ browser, page }) => {
  const data = await fixture(page);

  // ── PM: add a filing and three status updates ─────────────────────────────
  const pm = await staff(browser, "pm");
  await pm.page.goto(trackingUrl(data.caseId));
  await expect(pm.page.getByText("No USCIS filings tracked yet")).toBeVisible();

  await pm.page.getByRole("button", { name: "Add filing" }).click();
  const filingDialog = pm.page.getByRole("dialog", { name: "Add filing" });
  await filingDialog.getByLabel(/^Form type/).fill("I-140");
  await filingDialog.getByLabel(/^Title/).fill("I-140 petition");
  await filingDialog.getByLabel("Receipt number").pressSequentially(RECEIPT.toLowerCase());
  await expect(filingDialog.getByLabel("Receipt number")).toHaveValue(RECEIPT); // uppercased as typed
  await filingDialog.getByLabel("Show this filing to the client in their portal").check();
  await filingDialog.getByRole("button", { name: "Add filing" }).click();
  await expect(filingDialog).toBeHidden();
  await expect(pm.page.locator(".filing-detail")).toContainText(RECEIPT);

  // a duplicate receipt is explained beside the input and keeps the dialog open
  await pm.page.getByRole("button", { name: "Add filing" }).first().click();
  const again = pm.page.getByRole("dialog", { name: "Add filing" });
  await again.getByLabel(/^Form type/).fill("I-485");
  await again.getByLabel(/^Title/).fill("Duplicate attempt");
  await again.getByLabel("Receipt number").fill(RECEIPT);
  await again.getByRole("button", { name: "Add filing" }).click();
  await expect(again.getByText("Another filing already uses this receipt number.")).toBeVisible();
  await again.getByRole("button", { name: "Cancel" }).click();

  await addStatus(pm.page, { category: "received", title: "Case Was Received", clientVisible: true });
  await addStatus(pm.page, { category: "rfe_issued", title: RFE_TITLE, action: { due: "2027-01-31" }, clientVisible: true });
  await addStatus(pm.page, { category: "other", title: INTERNAL_TITLE, clientVisible: false });

  const detail = pm.page.locator(".filing-detail");
  await expect(detail.locator(".current-status")).toContainText(INTERNAL_TITLE); // Staff see the newest, internal or not
  await expect(detail.locator(".timeline-item")).toHaveCount(3);
  await expect(detail).toContainText("Internal only");
  await expect(pm.page.getByRole("button", { name: "Refresh from USCIS" })).toHaveCount(0); // provider is off: no fake control

  // ── queue: the RFE needs action and appears in the cross-case view ────────
  await pm.page.goto("/staff/tracking");
  const row = pm.page.locator("tbody tr", { hasText: RECEIPT });
  await expect(row).toContainText("Yes");
  await expect(row).toContainText("Jan 31, 2027");
  await pm.page.goto("/staff/dashboard");
  await expect(pm.page.getByText("USCIS action required")).toBeVisible();

  // ── reviewer: can read, cannot change ─────────────────────────────────────
  const reviewer = await staff(browser, "reviewer");
  await reviewer.page.goto(trackingUrl(data.caseId));
  await expect(reviewer.page.locator(".filing-detail")).toContainText(RECEIPT);
  for (const name of ["Add filing", "Add status update", "Edit details", "Archive", "Refresh from USCIS"]) {
    await expect(reviewer.page.getByRole("button", { name })).toHaveCount(0);
  }

  // ── client: only what was shared; the newer internal update is invisible ──
  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await clientPage.goto("/portal/login", { waitUntil: "domcontentloaded" });
  await clientPage.getByLabel("Email", { exact: false }).fill(data.client.email);
  await clientPage.getByLabel(/^Password/).fill(data.password);
  await clientPage.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(clientPage).toHaveURL(/\/portal$/);

  await clientPage.goto(`/portal/cases/${data.caseId}/uscis`);
  await expect(clientPage.getByRole("heading", { name: "USCIS Status" })).toBeVisible();
  await expect(clientPage.getByText(RECEIPT)).toBeVisible();
  await expect(clientPage.getByText("Current status")).toBeVisible();
  await expect(clientPage.getByText(RFE_TITLE).first()).toBeVisible();
  await expect(clientPage.getByText("Response due Jan 31, 2027")).toBeVisible();
  await expect(clientPage.getByText("Action needed").first()).toBeVisible();
  await expect(clientPage.locator("body")).not.toContainText(INTERNAL_TITLE);
  await expect(clientPage.locator("body")).not.toContainText("provider");

  // ── removal from the case revokes access on the very next request ─────────
  const members = await (await pm.context.request.get(`/api/v1/staff/cases/${data.caseId}/members`)).json();
  const membership = members.data.members.find((m: { employee: { id: string } | null }) => m.employee?.id === data.roles.reviewer.id);
  const removed = await pm.context.request.delete(`/api/v1/staff/cases/${data.caseId}/members/${membership.id}`, { headers: { origin: "http://localhost:3180" } });
  expect(removed.ok()).toBeTruthy();

  const denied = await reviewer.context.request.get(`/api/v1/staff/cases/${data.caseId}/uscis`);
  expect(denied.status()).toBe(404);
  await reviewer.page.goto(trackingUrl(data.caseId));
  await expect(reviewer.page.getByRole("heading", { name: "Case Not Found", exact: true })).toBeVisible();
});
