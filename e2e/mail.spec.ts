import { test, expect, type Browser } from "@playwright/test";

/**
 * Shared Outlook mailbox journey (ADR-030), against the real Staff API and an in-memory fake Microsoft: a PM reads a message
 * (its script never runs), downloads the attachment, replies from the shared address, links the message to their case and finds
 * it again from the case; a specialist has no mailbox at all. All data is synthetic.
 */
type Fixture = { password: string; caseId: string; roles: Record<string, { id: string; email: string }> };

async function staff(browser: Browser, role: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const data: Fixture = await (await page.request.get("/__browser_fixture")).json();
  await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(data.roles[role].email);
  await page.getByLabel(/^Password/).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard/);
  return { page, context, data };
}

test("mail: read, download, reply, link to a case, and the specialist has no mailbox", async ({ browser }) => {
  const pm = await staff(browser, "pm");
  const subject = (await (await pm.page.request.post("/__browser_mail_fixture")).json()).subject as string;

  // ── open the inbox from the navigation ──
  await pm.page.getByRole("link", { name: /^Mail(, \d+ unread)?$/ }).click(); // the unread badge is part of the link name
  await expect(pm.page).toHaveURL(/\/staff\/mail/);
  await expect(pm.page.getByText("Shared mailbox: info@immigrationhorizons.com")).toBeVisible();
  const row = pm.page.locator(".list-pane .row", { hasText: subject });
  await expect(row).toHaveClass(/unread/);
  await row.click();
  await expect(pm.page).toHaveURL(/message=/);
  await expect(pm.page.getByRole("heading", { name: subject })).toBeVisible();
  await expect(pm.page.locator(".detail-pane .body").getByText("Hello team, when is the filing date?")).toBeVisible();
  await expect(pm.page.getByText("Images in emails are not loaded")).toBeVisible();
  expect(await pm.page.evaluate(() => (window as unknown as { __mailPwned?: number }).__mailPwned)).toBeUndefined(); // the script in the email never ran
  await expect(row).not.toHaveClass(/unread/);
  expect((await (await pm.page.request.get("/__browser_mail_state")).json()).unread).toBe(0);

  // ── the attachment arrives as a file ──
  const [download] = await Promise.all([pm.page.waitForEvent("download"), pm.page.getByRole("button", { name: "passport.pdf" }).click()]);
  expect(download.suggestedFilename()).toBe("passport.pdf");

  // ── reply as the shared mailbox ──
  await pm.page.getByRole("button", { name: "Reply", exact: true }).click();
  const dialog = pm.page.getByRole("dialog", { name: "Reply" });
  await dialog.getByRole("textbox", { name: "Message", exact: true }).fill("Thank you, we will confirm the filing date this week.");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(pm.page.getByRole("status").filter({ hasText: "Message sent." })).toBeVisible();
  await expect(dialog).toBeHidden();
  const sent = (await (await pm.page.request.get("/__browser_mail_state")).json()).sent as { subject: string; body: string }[];
  expect(sent.map((m) => m.body)).toContain("Thank you, we will confirm the filing date this week.");

  // ── an empty reply is refused by the server and keeps the dialog ──
  await pm.page.getByRole("button", { name: "Reply", exact: true }).click();
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog.getByText("Write a message.")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // ── link the message to the PM's case, then find it from the case ──
  await pm.page.getByRole("button", { name: "Link to a case" }).click();
  await pm.page.getByLabel("Case", { exact: true }).fill("Browser immigration case");
  await pm.page.getByRole("button", { name: /Browser immigration case/ }).click();
  await pm.page.getByRole("button", { name: "Link message" }).click();
  await expect(pm.page.getByRole("status").filter({ hasText: "Message linked to the case." })).toBeVisible();
  await expect(pm.page.getByRole("region", { name: "Linked cases" })).toBeVisible();
  await expect(row).toContainText("Linked to 1 case");

  await pm.page.goto(`/staff/cases/${pm.data.caseId}?tab=mail`, { waitUntil: "domcontentloaded" });
  const caseEmail = pm.page.getByRole("link", { name: subject });
  await expect(caseEmail).toBeVisible();
  await caseEmail.click();
  await expect(pm.page).toHaveURL(/\/staff\/mail\?message=/);
  await expect(pm.page.getByRole("heading", { name: subject })).toBeVisible();

  // ── a specialist on the same case has no Mail: no navigation entry, no tab, and the API refuses ──
  const writer = await staff(browser, "petition_writer");
  await expect(writer.page.getByRole("link", { name: /^Mail(, \d+ unread)?$/ })).toHaveCount(0);
  await writer.page.goto(`/staff/cases/${writer.data.caseId}`, { waitUntil: "domcontentloaded" });
  await expect(writer.page.getByRole("button", { name: "Tasks", exact: true })).toBeVisible();
  await expect(writer.page.getByRole("button", { name: "Emails", exact: true })).toHaveCount(0);
  const refused = await writer.page.request.get("/api/v1/staff/mail/messages");
  expect(refused.status()).toBe(403);
  expect((await refused.text())).not.toContain(subject);
  await Promise.all([pm.context.close(), writer.context.close()]);
});
