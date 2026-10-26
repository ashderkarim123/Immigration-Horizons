import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * ADR-033 in a real browser: thank-you pages, the sign-up event, instant (but powerless) portal access for a
 * new email, the verification alert, and the guarantees that make it safe. All data is synthetic.
 */
type Queued = ["event", string, Record<string, unknown>];
type Fixture = { client: { email: string } };

const PASSWORD = "Signup-Password-123!";

async function recordAnalytics(page: Page) {
  await page.addInitScript(() => {
    const layer: unknown[] = [];
    const push = layer.push.bind(layer);
    layer.push = (...items: unknown[]) => {
      for (const item of items) {
        try {
          const all = JSON.parse(sessionStorage.getItem("__ga") ?? "[]");
          all.push(Array.from(item as ArrayLike<unknown>));
          sessionStorage.setItem("__ga", JSON.stringify(all));
        } catch {
          /* never break the page under test */
        }
      }
      return push(...items);
    };
    Object.defineProperty(window, "dataLayer", { configurable: true, get: () => layer, set: () => undefined });
  });
}
const events = async (page: Page, name: string) =>
  ((await page.evaluate(() => JSON.parse(sessionStorage.getItem("__ga") ?? "[]"))) as Queued[]).filter((e) => e[1] === name);

async function submitConsultation(page: Page, email: string) {
  await page.goto("/consultation");
  await page.getByLabel("Full name").fill("Casey Example");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Service you're interested in").selectOption({ index: 1 });
  await page.getByLabel("Tell us about your situation").fill("Synthetic consultation request from the sign-up browser test.");
  await page.getByRole("button", { name: "Request my free consultation" }).click();
  await page.waitForURL(/\/consultation\/thank-you/, { timeout: 30_000 });
}

/** The page's verification alert. Next.js also renders an empty role="alert" route announcer, so match by text. */
const alertOf = (page: Page) => page.getByRole("alert").filter({ hasText: "not verified" });

const freshEmail = (label: string) => `${label}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@browser.ih.test`;

async function newVisitor(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await recordAnalytics(page);
  return { context, page };
}

test("a new visitor lands on the thank-you page, continues signed in, and is told to verify their email", async ({ browser }) => {
  const { context, page } = await newVisitor(browser);
  const email = freshEmail("newvisitor");
  await submitConsultation(page, email);

  // Thank-you page: one heading, the portal block, and nothing sensitive in the URL.
  await expect(page.getByRole("heading", { level: 1 })).toContainText("your consultation request is in");
  expect(new URL(page.url()).search).toBe("");
  await expect(page.getByText("Your email isn't verified yet. Open the activation link we emailed you")).toBeVisible();

  // The lead, the sign-up and the thank-you view are each reported exactly once, with no personal data.
  await expect.poll(async () => (await events(page, "thank_you_view")).length).toBe(1);
  expect(await events(page, "generate_lead")).toHaveLength(1);
  const signUps = await events(page, "sign_up");
  expect(signUps).toHaveLength(1);
  expect(signUps[0][2]).toEqual({ method: "consultation_form", event_version: "1" });
  const everything = JSON.stringify(await page.evaluate(() => sessionStorage.getItem("__ga")));
  expect(everything).not.toContain("newvisitor");
  expect(everything).not.toContain("Casey");

  // Continue: signed in to the portal, on the unverified welcome screen with the alert.
  await page.getByRole("button", { name: "Continue to your portal" }).click();
  await page.waitForURL(/\/portal$/);
  await expect(alertOf(page)).toContainText("Your email is not verified yet");
  await expect(alertOf(page)).toContainText("@browser.ih.test");
  await expect(alertOf(page)).not.toContainText("newvisitor"); // masked
  await expect(page.getByRole("button", { name: "Resend activation email" })).toBeVisible();

  // Everything else stays locked: other pages send them back to this screen, and the APIs refuse them.
  for (const path of ["/portal/cases", "/portal/consultations", "/portal/queries", "/portal/profile", "/portal/notifications"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/portal$/);
    await expect(alertOf(page)).toContainText("not verified");
  }
  expect((await context.request.get("/api/portal/cases/64b0f0f0f0f0f0f0f0f0f0f0/calendar")).status()).toBe(401);

  // A link was only just sent, so an immediate resend is refused with a clear message instead of mailing again.
  await page.getByRole("button", { name: "Resend activation email" }).click();
  await expect(page.getByText("Please wait a minute before requesting another")).toBeVisible();
  await context.close();
});

test("verifying the email unlocks the portal, and a session held before verification stops working", async ({ browser }) => {
  // The "attacker" signs up with an address they do not own and keeps their session.
  const attacker = await newVisitor(browser);
  const email = freshEmail("victim");
  await submitConsultation(attacker.page, email);
  await attacker.page.getByRole("button", { name: "Continue to your portal" }).click();
  await attacker.page.waitForURL(/\/portal$/);
  await expect(alertOf(attacker.page)).toContainText("not verified");

  // The real owner opens the emailed link in their own browser and chooses a password.
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  const { token } = await (await ownerPage.request.post("/__browser_activation_token", { data: { email } })).json();
  await ownerPage.goto(`/portal/activate?token=${encodeURIComponent(token)}`);
  await ownerPage.getByLabel("Create a password").fill(PASSWORD);
  await ownerPage.getByLabel("Confirm password").fill(PASSWORD);
  await ownerPage.getByLabel(/I agree to the/).check();
  await ownerPage.getByRole("button", { name: "Activate my account" }).click();
  await ownerPage.waitForURL(/\/portal$/);
  await expect(ownerPage.getByRole("heading", { level: 1 })).toContainText("Welcome back");
  await expect(ownerPage.getByText("not verified")).toHaveCount(0);

  // The attacker's earlier session is dead: it opens nothing, not even the welcome screen.
  await attacker.page.goto("/portal");
  await expect(attacker.page).toHaveURL(/\/portal\/login/);
  expect((await attacker.context.request.get("/api/portal/cases/64b0f0f0f0f0f0f0f0f0f0f0/calendar")).status()).toBe(401);
  await attacker.context.close();
  await owner.close();
});

test("typing an EXISTING client's email into the form signs nobody in", async ({ browser, request }) => {
  const fixture: Fixture = await (await request.get("/__browser_fixture")).json();
  const { context, page } = await newVisitor(browser);
  await submitConsultation(page, fixture.client.email);

  // Same page, but no verification notice, no sign-up event, and the button leads to the sign-in page.
  await expect(page.getByText("Your email isn't verified yet")).toHaveCount(0);
  await expect.poll(async () => (await events(page, "thank_you_view")).length).toBe(1);
  expect(await events(page, "generate_lead")).toHaveLength(1);
  expect(await events(page, "sign_up")).toHaveLength(0);

  await page.getByRole("link", { name: "Continue to your portal" }).click();
  await expect(page).toHaveURL(/\/portal\/login/);
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/portal\/login/); // still signed out
  expect((await context.request.get("/api/portal/cases/64b0f0f0f0f0f0f0f0f0f0f0/calendar")).status()).toBe(401);
  await context.close();
});

test("the thank-you pages are noindex, out of the sitemap, and a bare visit is a view, never a lead", async ({ browser, request }) => {
  for (const path of ["/contact/thank-you", "/consultation/thank-you"]) {
    const html = await (await request.get(path)).text();
    expect(html, path).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  }
  expect(await (await request.get("/sitemap.xml")).text()).not.toContain("thank-you");

  const { context, page } = await newVisitor(browser);
  await page.goto("/consultation/thank-you");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to your portal" })).toHaveCount(0); // no hand-off without a submission
  await expect.poll(async () => (await events(page, "thank_you_view")).length).toBe(1);
  await page.waitForTimeout(500);
  expect(await events(page, "generate_lead")).toHaveLength(0);
  expect(await events(page, "sign_up")).toHaveLength(0);
  await context.close();
});
