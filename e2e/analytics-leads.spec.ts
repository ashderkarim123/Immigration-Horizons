import { test, expect, type Page } from "@playwright/test";

/**
 * Phase 16 measurement contract, in a real browser against the production build: a lead is counted once and only
 * when the server accepted it, link intent carries a placement and never text, and private surfaces send nothing.
 * Nothing is sent to Google here: the tags are production-only, so the test reads what the app QUEUES on
 * `window.dataLayer`. The queue is mirrored into sessionStorage so events survive the page navigations under test.
 */
type Queued = ["event", string, Record<string, unknown>];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const record = (item: unknown) => {
      try {
        const all = JSON.parse(sessionStorage.getItem("__ga") ?? "[]");
        all.push(Array.from(item as ArrayLike<unknown>));
        sessionStorage.setItem("__ga", JSON.stringify(all));
      } catch {
        /* the recorder must never break the page under test */
      }
    };
    const layer: unknown[] = [];
    const push = layer.push.bind(layer);
    layer.push = (...items: unknown[]) => {
      items.forEach(record);
      return push(...items);
    };
    Object.defineProperty(window, "dataLayer", { configurable: true, get: () => layer, set: () => undefined });
  });
});

const queued = async (page: Page): Promise<Queued[]> =>
  (await page.evaluate(() => JSON.parse(sessionStorage.getItem("__ga") ?? "[]"))) as Queued[];
const named = (events: Queued[], name: string) => events.filter((e) => e[0] === "event" && e[1] === name);

/** Events are queued by an effect just after the UI updates, so assertions wait for them instead of racing the render. */
const waitForEvent = (page: Page, name: string, count = 1) =>
  expect.poll(async () => named(await queued(page), name).length, { timeout: 15_000 }).toBe(count);
/** For "must NOT fire" checks: once the submit attempt is recorded, give any wrong event a moment to appear. */
async function settleAfterSubmit(page: Page) {
  await waitForEvent(page, "lead_form_submit_attempt");
  await page.waitForTimeout(750);
}

async function fillContact(page: Page) {
  await page.getByLabel("Full name").fill("Casey Example");
  await page.getByLabel("Email").fill("casey.example@browser.ih.test");
  await page.getByLabel("Message").fill("Synthetic enquiry from the analytics browser test.");
}

test("contact: one attempt, then exactly one generate_lead after the server accepts, with no personal data", async ({ page }) => {
  await page.goto("/contact?utm_source=newsletter&utm_medium=email&utm_campaign=october_guides");
  await fillContact(page);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible();
  await waitForEvent(page, "generate_lead");
  await page.waitForTimeout(750); // a second, duplicate event would show up here

  const events = await queued(page);
  expect(named(events, "lead_form_submit_attempt")).toHaveLength(1);
  const leads = named(events, "generate_lead");
  expect(leads).toHaveLength(1);
  expect(leads[0][2]).toEqual({ form_name: "contact", event_version: "1" });
  expect(named(events, "form_error")).toHaveLength(0);

  const all = JSON.stringify(events);
  for (const private_ of ["casey.example", "Casey", "Synthetic enquiry", "newsletter", "october_guides"]) {
    expect(all, `${private_} must never reach analytics`).not.toContain(private_);
  }
});

test("contact: a validation failure is a form_error with a category, and never a lead", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send message" }).click();
  // The form shows a summary alert plus one per invalid field (and Next adds an empty route announcer), so match the summary.
  await expect(page.getByRole("alert").filter({ hasText: "Please correct the highlighted fields." })).toBeVisible();
  await waitForEvent(page, "form_error");
  await page.waitForTimeout(750);

  const events = await queued(page);
  expect(named(events, "generate_lead")).toHaveLength(0);
  const errors = named(events, "form_error");
  expect(errors).toHaveLength(1);
  expect(errors[0][2]).toMatchObject({ form_name: "contact", error_category: "validation", event_version: "1" });
  expect(String(errors[0][2].error_fields)).toContain("name");
});

test("a bot that fills the honeypot sees a success but is not counted as a lead", async ({ page }) => {
  await page.goto("/contact");
  await fillContact(page);
  await page.locator("#company").fill("Acme Spam Ltd");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("heading", { name: "Message sent" })).toBeVisible();
  await settleAfterSubmit(page);

  const events = await queued(page);
  expect(named(events, "generate_lead")).toHaveLength(0);
  expect(named(events, "form_error")).toHaveLength(0);
});

test("consultation: the accepted lead is reported ONCE before the browser leaves for the portal", async ({ page }) => {
  await page.goto("/consultation?utm_source=google&utm_medium=cpc&gclid=test123");
  await page.getByLabel("Full name").fill("Casey Example");
  await page.getByLabel("Email").fill("casey.consult@browser.ih.test");
  await page.getByLabel("Service you're interested in").selectOption({ index: 1 });
  await page.getByLabel("Tell us about your situation").fill("Synthetic consultation request from the analytics browser test.");
  await page.getByRole("button", { name: "Request my free consultation" }).click();

  // The server no longer redirects: the form reports the lead, then follows `redirectTo`.
  await page.waitForURL(/\/portal\//, { timeout: 30_000 });
  const events = await queued(page);
  const leads = named(events, "generate_lead");
  expect(leads, "the accepted consultation must survive the navigation to the untagged portal").toHaveLength(1);
  expect(leads[0][2]).toMatchObject({ form_name: "consultation", event_version: "1" });
  expect(named(events, "lead_form_submit_attempt")).toHaveLength(1);
  const all = JSON.stringify(events);
  for (const private_ of ["casey.consult", "Casey", "Synthetic consultation", "test123", "google"]) {
    expect(all, `${private_} must never reach analytics`).not.toContain(private_);
  }
});

test("a consultation CTA click records its placement and type, never its text or destination", async ({ page }) => {
  await page.goto("/");
  await page.locator('header a[href="/consultation"]:visible').first().click();
  await page.waitForURL(/\/consultation/);

  await waitForEvent(page, "cta_consultation_click");
  const clicks = named(await queued(page), "cta_consultation_click");
  expect(clicks).toHaveLength(1);
  expect(clicks[0][2]).toEqual({ page_type: "home", cta_placement: "header", link_type: "consultation", cta_id: "free_consultation", event_version: "1" });
});

test("the floating WhatsApp button records link intent with no number and no link text", async ({ page }) => {
  await page.goto("/about");
  await page.locator('a[data-cta-placement="floating"]').evaluate((a) => {
    // Observe the click without leaving the page: intent is recorded on click, before navigation.
    a.addEventListener("click", (e) => e.preventDefault());
    (a as HTMLElement).click();
  });
  const clicks = named(await queued(page), "click_whatsapp");
  expect(clicks).toHaveLength(1);
  expect(clicks[0][2]).toEqual({ page_type: "about", cta_placement: "floating", link_type: "whatsapp", event_version: "1" });
  expect(JSON.stringify(clicks)).not.toMatch(/\d{7,}|wa\.me|whatsapp\.com/);
});

test("the client portal sends no analytics, even when a visitor clicks a consultation link there", async ({ page }) => {
  await page.goto("/portal/login");
  const link = page.locator('a[href="/consultation"]').first();
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL(/\/consultation/);
  // The portal layout never mounts the tracker, so leaving it records nothing; only the marketing page may.
  expect(named(await queued(page), "cta_consultation_click")).toHaveLength(0);
});
