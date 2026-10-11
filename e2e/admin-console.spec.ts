import { test, expect, request as playwrightRequest, type APIRequestContext, type Browser, type Page } from "@playwright/test";

/**
 * Phase 14 browser journey (ADR-029): the Angular Admin Console, served on its own origin, against the real Admin API and
 * a disposable database. A Super Admin signs in, writes real content (and sees it on the public site), administers
 * settings and an employee account with its one-time credential, and reads the security record; an editor is held to
 * content; an operations admin cannot enter at all; the Staff and CMS identities stay separate; and the legacy EJS console
 * still works on the same data. All data is synthetic.
 */
type Fixture = { password: string; adminOrigin: string; roles: Record<string, { id: string; email: string }> };
const PUBLIC = "http://localhost:3180";
const ADMIN = "http://localhost:3181";
const stamp = Date.now().toString(36);
// A valid 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function fixture(page: Page): Promise<Fixture> {
  return (await page.request.get(`${PUBLIC}/__browser_fixture`)).json();
}

async function openSignIn(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const data = await fixture(page);
  await page.goto(`${ADMIN}/login`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Admin Console" })).toBeVisible();
  return { page, context, data };
}

async function signIn(browser: Browser, role: string) {
  const session = await openSignIn(browser);
  await session.page.getByLabel("Email").fill(session.data.roles[role].email);
  await session.page.locator("#password").fill(session.data.password);
  await session.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(session.page).toHaveURL(`${ADMIN}/dashboard`);
  return session;
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Admin Console" });
const metric = async (page: Page, label: string) => {
  const card = page.locator(".metric", { hasText: label });
  await expect(card).toBeVisible();
  return Number(((await card.locator(".m-value").textContent()) ?? "").trim());
};
const dialog = (page: Page, name: string) => page.getByRole("dialog", { name });
const toast = (page: Page, text: string) => expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible();

/** A Staff-application API client (its own cookie jar) signed in with the given credential. */
async function staffClient(email: string, password: string): Promise<{ api: APIRequestContext; status: number; body: { data?: { mustChangePassword?: boolean } } }> {
  const api = await playwrightRequest.newContext({ baseURL: PUBLIC, extraHTTPHeaders: { Origin: PUBLIC } });
  const res = await api.post("/api/v1/staff/session/login", { data: { email, password } });
  return { api, status: res.status(), body: await res.json().catch(() => ({})) };
}

test("super admin: content, settings, an employee's one-time credential, and the security record", async ({ browser }) => {
  const { page, context, data } = await signIn(browser, "super_admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  const postsBefore = await metric(page, "Blog posts");

  // ── Blog: draft → not public; publish → public, with the script stripped ──
  await nav(page).getByRole("link", { name: "Blog" }).click();
  await page.getByRole("link", { name: "New post" }).click();
  const title = `Browser post ${stamp}`;
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Excerpt").fill("Written through the Admin Console.");
  await page.getByRole("button", { name: "Edit HTML" }).click();
  await page.getByLabel("Content (HTML)").fill('<p>Hello from the Admin Console.</p><script>window.__pwned = 1</script><p onclick="x()">Second paragraph.</p>');
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/content\/blog\/[a-f0-9]{24}$/);
  await expect(page.locator(".page-subtitle .badge")).toHaveText("Draft");
  await page.getByRole("button", { name: "Edit HTML" }).click(); // the saved post reopens in the visual editor
  await expect(page.getByLabel("Content (HTML)")).toHaveValue("<p>Hello from the Admin Console.</p><p>Second paragraph.</p>"); // what the server stored
  const slug = await page.getByLabel("Slug").inputValue();
  expect(slug).toBe(`browser-post-${stamp}`);
  expect((await page.request.get(`${PUBLIC}/blog/${slug}`)).status()).toBe(404); // a draft is not public

  await page.getByLabel("Title").fill(`${title} (edited)`);
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator(".page-subtitle .badge")).toHaveText("Published");
  const live = page.getByRole("link", { name: "View on website" });
  await expect(live).toHaveAttribute("href", `${PUBLIC}/blog/${slug}`);
  const publicPage = await page.request.get(`${PUBLIC}/blog/${slug}`);
  expect(publicPage.status()).toBe(200);
  const html = await publicPage.text();
  expect(html).toContain("Hello from the Admin Console.");
  expect(html).toContain(`${title} (edited)`);
  expect(html).not.toContain("__pwned");

  await nav(page).getByRole("link", { name: "Dashboard" }).click();
  expect(await metric(page, "Blog posts")).toBe(postsBefore + 1);

  // ── FAQ: create, then edit ──
  await nav(page).getByRole("link", { name: "FAQs" }).click();
  const question = `Can anyone guarantee approval? ${stamp}`;
  await page.getByRole("button", { name: "New FAQ" }).click();
  await dialog(page, "New FAQ").getByLabel("Question").fill(question);
  await dialog(page, "New FAQ").getByLabel("Answer").fill("No. USCIS decides every petition on its own evidence.");
  await dialog(page, "New FAQ").getByRole("button", { name: "Save FAQ" }).click();
  const faqRow = page.getByRole("row").filter({ hasText: question });
  await expect(faqRow).toContainText("Published");
  await faqRow.getByRole("button", { name: /^Edit/ }).click();
  await dialog(page, "Edit FAQ").getByLabel("Status").selectOption("draft");
  await dialog(page, "Edit FAQ").getByRole("button", { name: "Save FAQ" }).click();
  await expect(faqRow).toContainText("Draft");

  // ── Testimonial ──
  await nav(page).getByRole("link", { name: "Testimonials" }).click();
  await page.getByRole("button", { name: "New testimonial" }).click();
  const tDialog = dialog(page, "New testimonial");
  await tDialog.getByLabel("Name").fill(`Synthetic Client ${stamp}`);
  await tDialog.getByLabel("Review").fill("Clear, organised and on time.");
  await tDialog.getByLabel("Verification link").fill("javascript:alert(1)");
  await tDialog.getByRole("button", { name: "Save testimonial" }).click();
  await expect(tDialog.getByText("must be a full http(s) URL").first()).toBeVisible(); // refused by the server, shown by the field
  await tDialog.getByLabel("Verification link").fill("https://example.com/review");
  await tDialog.getByRole("button", { name: "Save testimonial" }).click();
  await expect(page.getByRole("row").filter({ hasText: `Synthetic Client ${stamp}` })).toContainText("5 of 5");

  // ── Media: upload an allowed image, set its alt text, and fetch it as the public site would ──
  await nav(page).getByRole("link", { name: "Media" }).click();
  await page.getByLabel("Alt text for the next upload").fill(`Synthetic image ${stamp}`);
  await page.locator('iha-file-dropzone input[type="file"]').setInputFiles({ name: `browser-${stamp}.png`, mimeType: "image/png", buffer: PNG });
  const tile = page.locator(".tile", { hasText: `browser-${stamp}.png` });
  await expect(tile).toBeVisible();
  await tile.getByRole("button", { name: /^Edit alt text/ }).click();
  await tile.getByLabel("Alt text").fill(`Edited alt ${stamp}`);
  await tile.getByRole("button", { name: "Save" }).click();
  await expect(tile.locator(".alt")).toHaveText(`Edited alt ${stamp}`);
  const src = await tile.locator("img").getAttribute("src");
  expect(src).toMatch(/^\/uploads\/browser-[a-z0-9]+-\d+\.png$/);
  const image = await page.request.get(`${ADMIN}${src}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["cross-origin-resource-policy"]).toBe("cross-origin");
  // a disallowed type never leaves the browser, and the server would refuse it as well
  await page.locator('iha-file-dropzone input[type="file"]').setInputFiles({ name: "vector.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg/>") });
  await expect(page.getByRole("alert").filter({ hasText: "Only PNG, JPG, WebP or GIF" })).toBeVisible();

  // ── SEO ──
  await nav(page).getByRole("link", { name: "SEO" }).click();
  await page.getByRole("link", { name: "Edit SEO for Homepage" }).click();
  await page.getByLabel("SEO title").fill(`Immigration Horizons ${stamp}`);
  await page.getByRole("button", { name: "Save metadata" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await nav(page).getByRole("link", { name: "SEO" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Homepage" })).toContainText(`Immigration Horizons ${stamp}`);

  // ── Settings: saved, and still there after a full reload (a fresh session bootstrap) ──
  await nav(page).getByRole("link", { name: "Settings" }).click();
  await page.getByLabel("Company name").fill(`Immigration Horizons ${stamp}`);
  await page.getByRole("button", { name: "Save company" }).click();
  await toast(page, "Company settings saved.");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Company name")).toHaveValue(`Immigration Horizons ${stamp}`);
  await nav(page).getByRole("link", { name: "Integrations" }).click();
  await expect(page.getByRole("row").filter({ hasText: "Database" })).toContainText("Connected");

  // ── Employee: create, capture the one-time credential, and prove it is never retrievable ──
  await nav(page).getByRole("link", { name: "Users" }).click();
  await page.getByRole("link", { name: "New user" }).click();
  const email = `new-hire-${stamp}@browser.ih.test`;
  await page.getByLabel("Name").fill(`New Hire ${stamp}`);
  await page.getByLabel("Sign-in email").fill(email);
  await page.getByLabel("Role").selectOption("pm");
  await page.getByRole("button", { name: "Create user" }).click();
  const credential = dialog(page, "Temporary credential");
  await expect(credential.getByText("Copy this password now. It will not be shown again.")).toBeVisible();
  const firstPassword = await credential.getByLabel("Temporary password").inputValue();
  expect(firstPassword.length).toBeGreaterThanOrEqual(20);
  await credential.getByRole("button", { name: "I have copied it" }).click();
  await expect(page).toHaveURL(/\/users\/[a-f0-9]{24}$/);
  const userId = page.url().split("/").pop()!;
  await expect(page.locator("body")).not.toContainText(firstPassword);
  const later = await context.request.get(`${ADMIN}/api/v1/admin/users/${userId}`);
  expect(later.status()).toBe(200);
  expect(await later.text()).not.toContain(firstPassword);
  expect(await (await context.request.get(`${ADMIN}/api/v1/admin/security-events?limit=100`)).text()).not.toContain(firstPassword);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: `New Hire ${stamp}` })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(firstPassword);

  const firstStaff = await staffClient(email, firstPassword);
  expect(firstStaff.status).toBe(200);
  expect(firstStaff.body.data?.mustChangePassword).toBe(true);
  expect((await firstStaff.api.get("/api/v1/staff/me")).status()).toBe(200);

  // ── Reset: a new one-time credential; the old one and the old session are dead ──
  await page.getByRole("button", { name: "Reset password" }).click();
  await dialog(page, "Reset this password?").getByRole("button", { name: "Reset password" }).click();
  await expect(credential.getByText("The password was reset.")).toBeVisible();
  const secondPassword = await credential.getByLabel("Temporary password").inputValue();
  expect(secondPassword).not.toBe(firstPassword);
  await credential.getByRole("button", { name: "I have copied it" }).click();
  expect((await firstStaff.api.get("/api/v1/staff/me")).status()).toBe(401);
  expect((await staffClient(email, firstPassword)).status).toBe(401);
  const secondStaff = await staffClient(email, secondPassword);
  expect(secondStaff.status).toBe(200);

  // ── Revoke Staff sessions ──
  await page.getByRole("button", { name: "Revoke Staff sessions" }).click();
  await dialog(page, "Revoke Staff sessions?").getByRole("button", { name: "Revoke sessions" }).click();
  await toast(page, "Revoked 1 Staff session.");
  expect((await secondStaff.api.get("/api/v1/staff/me")).status()).toBe(401);

  // ── Security record: the reset is there, attributed, with safe detail and no credential ──
  await nav(page).getByRole("link", { name: "Security Events" }).click();
  await page.locator("#se-type").selectOption("admin_credentials_reset");
  await page.locator("#se-email").fill(email);
  await page.getByRole("button", { name: "Apply filters" }).click();
  const eventRow = page.getByRole("row").filter({ hasText: email });
  await expect(eventRow).toHaveCount(1);
  await expect(eventRow).toContainText("Admin credentials reset");
  await expect(eventRow).toContainText("Browser super_admin");
  await eventRow.getByRole("button", { name: /^Details/ }).click();
  const detail = dialog(page, "Security event");
  await expect(detail).toContainText("reset");
  await expect(detail).not.toContainText(secondPassword);
  await detail.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: /delete|clear log|purge/i })).toHaveCount(0); // a viewer, not a log manager

  // ── Identity boundary: this CMS session is not a Staff identity, and a Staff session is not an Admin identity ──
  expect((await context.request.get(`${PUBLIC}/api/v1/staff/me`)).status()).toBe(401);
  const pm = await staffClient(data.roles.pm.email, data.password);
  expect(pm.status).toBe(200);
  expect((await pm.api.get(`${ADMIN}/api/v1/admin/me`)).status()).toBe(401);
  expect((await pm.api.get(`${ADMIN}/api/v1/admin/users`)).status()).toBe(401);

  // ── Sign out ──
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${ADMIN}/login`);
  expect((await context.request.get(`${ADMIN}/api/v1/admin/me`)).status()).toBe(401);
  await page.goto(`${ADMIN}/users`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${ADMIN}/login`);
  await Promise.all([firstStaff.api.dispose(), secondStaff.api.dispose(), pm.api.dispose(), context.close()]);
});

test("editor: manages content, and cannot reach Users, Settings or Security in the UI or the API", async ({ browser }) => {
  const { page, context } = await signIn(browser, "editor");
  const links = (await nav(page).getByRole("link").allTextContents()).map((text) => text.trim());
  expect(links).toEqual(["Dashboard", "Blog", "FAQs", "Testimonials", "Media", "Services", "SEO"]);
  await expect(page.locator(".metric", { hasText: "Active accounts" })).toHaveCount(0);

  await nav(page).getByRole("link", { name: "FAQs" }).click();
  await page.getByRole("button", { name: "New FAQ" }).click();
  await dialog(page, "New FAQ").getByLabel("Question").fill(`Editor question ${stamp}`);
  await dialog(page, "New FAQ").getByLabel("Answer").fill("Editors manage website content.");
  await dialog(page, "New FAQ").getByRole("button", { name: "Save FAQ" }).click();
  await expect(page.getByRole("row").filter({ hasText: `Editor question ${stamp}` })).toBeVisible();

  for (const path of ["/users", "/settings", "/security", "/roles", "/integrations"]) {
    await page.goto(`${ADMIN}${path}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(`${ADMIN}/dashboard`);
  }
  for (const path of ["/users", "/settings", "/security-events", "/roles", "/integration-status"]) {
    const res = await context.request.get(`${ADMIN}/api/v1/admin${path}`);
    expect(res.status(), path).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
  }
  await context.close();
});

test("operations admin: correct credentials are refused by the Admin Console, and the Staff application still works", async ({ browser }) => {
  const { page, context, data } = await openSignIn(browser);
  await page.getByLabel("Email").fill(data.roles.operations_admin.email);
  await page.locator("#password").fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Invalid email or password.");
  await expect(page).toHaveURL(`${ADMIN}/login`);
  expect((await context.request.get(`${ADMIN}/api/v1/admin/me`)).status()).toBe(401);
  await page.goto(`${ADMIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${ADMIN}/login`);

  await page.goto(`${PUBLIC}/staff/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(data.roles.operations_admin.email);
  await page.getByLabel(/^Password/).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard/);
  // …and that Staff session, in the same browser, is still not an Admin identity.
  expect((await context.request.get(`${ADMIN}/api/v1/admin/me`)).status()).toBe(401);
  await context.close();
});

test("legacy EJS console still works on the same data, and its break-glass login is not an Admin Console identity", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const data = await fixture(page);
  const ejsLogin = async (username: string, password: string) => {
    await page.goto(`${ADMIN}/admin/login`, { waitUntil: "domcontentloaded" });
    await page.locator('[name="username"]').fill(username);
    await page.locator('[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
  };

  await ejsLogin(data.roles.admin.email, data.password);
  await expect(page).toHaveURL(`${ADMIN}/admin`);
  await page.goto(`${ADMIN}/admin/faqs/new`, { waitUntil: "domcontentloaded" });
  const question = `Legacy EJS question ${stamp}`;
  await page.locator('[name="question"]').fill(question);
  await page.locator('[name="answer"]').fill("Written through the legacy console.");
  await page.locator('form.admin-form button[type="submit"]').click();
  await expect(page).toHaveURL(`${ADMIN}/admin/faqs`);
  await expect(page.locator("body")).toContainText(question);

  // One CMS session, one collection: the Angular console (same origin) is already signed in and shows the EJS-written FAQ.
  await page.goto(`${ADMIN}/content/faqs`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("row").filter({ hasText: question })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${ADMIN}/login`);
  await page.goto(`${ADMIN}/admin`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${ADMIN}/admin/login`); // signing out of one signs out of both

  // Break-glass (the fixture's environment credential): EJS only.
  await ejsLogin("admin", "admin");
  await expect(page).toHaveURL(`${ADMIN}/admin`);
  expect((await context.request.get(`${ADMIN}/api/v1/admin/me`)).status()).toBe(401);
  await page.goto(`${ADMIN}/dashboard`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${ADMIN}/login`);
  await page.goto(`${ADMIN}/admin`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(`${ADMIN}/admin`); // the recovery session itself is untouched
  await context.close();
});
