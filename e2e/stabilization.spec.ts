import { test, expect, type Page } from "@playwright/test";
type Fixture = {
  password: string;
  roles: Record<string, { id: string; email: string }>;
  client: { id: string; email: string };
  caseId: string;
  requestId: string;
  categoryId: string;
  leadId: string;
};
async function fixture(page: Page): Promise<Fixture> {
  return (await page.request.get("/__browser_fixture")).json();
}
async function staffLogin(page: Page, role = "pm") {
  const data = await fixture(page);
  await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill(data.roles[role].email);
  await page.getByLabel(/^Password/).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard/);
  return data;
}
async function clientLogin(page: Page) {
  const data = await fixture(page);
  await page.goto("/portal/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email", { exact: false }).fill(data.client.email);
  await page.getByLabel(/^Password/).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
  return data;
}

test("correct staff credentials cannot create a CMS session; CMS and staff sessions stay separate", async ({
  page,
}) => {
  const data = await fixture(page);
  for (const role of [
    "operations_admin",
    "pm",
    "petition_writer",
    "business_plan_specialist",
    "recommendation_letter_specialist",
    "uscis_forms_specialist",
    "evidence_collector",
    "reviewer",
    "viewer",
  ]) {
    await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    await page.locator('[name="username"]').fill(data.roles[role].email);
    await page.locator('[name="password"]').fill(data.password);
    await page.getByRole("button", { name: /sign in|login/i }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin\/login/);
  }
  await staffLogin(page);
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/login/);
  expect((await page.request.get("/api/v1/staff/me")).status()).toBe(200);
});

test("dashboards and case workflows remain usable on desktop, tablet, and mobile with keyboard navigation", async ({
  page,
}, testInfo) => {
  const data = await staffLogin(page);
  await expect(
    page
      .getByRole("navigation", { name: "Staff navigation" })
      .locator("svg path")
      .first(),
  ).toHaveAttribute("d", /^M/);
  for (const [name, width, height] of [
    ["desktop", 1440, 900],
    ["tablet", 768, 1024],
    ["mobile", 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/staff/dashboard", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Dashboard", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
    if (width <= 768) {
      await page.getByRole("button", { name: "Toggle menu" }).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#staff-navigation")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("button", { name: "Toggle menu" }),
      ).toBeFocused();
    }
    await page.screenshot({
      path: testInfo.outputPath(`staff-${name}.png`),
      fullPage: true,
    });
    await page.goto(`/staff/cases/${data.caseId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", {
        name: "Browser immigration case",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Documents", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Request document", exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`case-${name}.png`),
      fullPage: true,
    });
  }
});

test("client sees requested upload before case details, with category and type already bound", async ({
  page,
}, testInfo) => {
  const data = await clientLogin(page);
  await expect(
    page.getByRole("heading", { name: "Action required", exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Current passport/ }).click();
  await expect(page).toHaveURL(
    new RegExp(`/portal/cases/${data.caseId}/documents`),
  );
  const request = page.locator(`#request-${data.requestId}`);
  await expect(request).toContainText("Upload all pages clearly.");
  expect(await request.locator("select").count()).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("client-upload-mobile.png"),
    fullPage: true,
  });
});

test("two sessions complete document, intake, messaging and case preparation workflows", async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const staffContext = await browser.newContext(),
    clientContext = await browser.newContext();
  const pm = await staffContext.newPage(),
    client = await clientContext.newPage();
  const data = await staffLogin(pm);
  await clientLogin(client);
  // Retry only ECONNRESET on idempotent reads; never retry mutations or HTTP failures.
  const read = async (url: string) =>
    (
      await (
        await pm.request.get(`/api/v1/staff${url}`, { maxRetries: 2 })
      ).json()
    ).data;
  // The client uses the real requested upload form; staff sees the same record.
  await client.goto(`/portal/cases/${data.caseId}/documents`, {
    waitUntil: "domcontentloaded",
  });
  const request = client.locator(`#request-${data.requestId}`);
  await request.locator("input[type=file]").setInputFiles({
    name: "passport.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj<< >>endobj\ntrailer<< >>\n%%EOF"),
  });
  await request
    .getByRole("button", { name: "Upload requested document" })
    .click();
  await expect(client).toHaveURL(/\/documents\/[a-f0-9]{24}$/);
  const documentId = client.url().split("/").at(-1)!;
  const center = await read(`/cases/${data.caseId}/documents`);
  expect(
    center.documents.find((d: { id: string }) => d.id === documentId)
      .documentType,
  ).toBe("Passport");
  await pm.goto(`/staff/documents/${documentId}`, {
    waitUntil: "domcontentloaded",
  });
  await pm
    .getByLabel("Decision", { exact: true })
    .selectOption("needs_replacement");
  await pm
    .getByLabel("Client-visible comment", { exact: true })
    .fill("The scan is blurry. Please upload all pages.");
  await pm
    .getByLabel("Internal comment", { exact: true })
    .fill("STAFF ONLY REVIEW NOTE");
  await pm.getByRole("button", { name: "Save review", exact: true }).click();
  await expect
    .poll(async () => (await read(`/documents/${documentId}`)).document.status)
    .toBe("needs_replacement");
  await client.reload({ waitUntil: "domcontentloaded" });
  await expect(
    client.getByText("The scan is blurry. Please upload all pages.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(client.getByText("STAFF ONLY REVIEW NOTE")).toHaveCount(0);
  await client.locator("input[type=file]").setInputFiles({
    name: "clear-passport.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n2 0 obj<< >>endobj\ntrailer<< >>\n%%EOF"),
  });
  await client.getByRole("button", { name: /Upload replacement/i }).click();
  await expect
    .poll(
      async () =>
        (await read(`/documents/${documentId}`)).document.versionCount,
    )
    .toBe(2);
  await pm.reload({ waitUntil: "domcontentloaded" });
  await pm.getByLabel("Decision", { exact: true }).selectOption("accepted");
  await pm
    .getByLabel("Client-visible comment", { exact: true })
    .fill("Accepted, thank you.");
  await pm.getByRole("button", { name: "Save review", exact: true }).click();
  await expect
    .poll(async () => (await read(`/documents/${documentId}`)).document.status)
    .toBe("accepted");
  // General upload asks for meaningful metadata and derives the subject from login.
  await client.goto(`/portal/cases/${data.caseId}/documents`, {
    waitUntil: "domcontentloaded",
  });
  const general = client
    .locator("form")
    .filter({ has: client.getByLabel("Document title") });
  await general
    .getByLabel("Category", { exact: true })
    .selectOption(data.categoryId);
  await general
    .getByLabel("Document type", { exact: true })
    .selectOption("Passport");
  await general.getByLabel("Document title").fill("Supporting passport copy");
  await general
    .getByLabel("Description (optional)")
    .fill("Extra evidence for review");
  const dropped = await client.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(
        ["%PDF-1.4\n3 0 obj<< >>endobj\ntrailer<< >>\n%%EOF"],
        "support.pdf",
        { type: "application/pdf" },
      ),
    );
    return transfer;
  });
  await general
    .locator("div[ondrop], .border-dashed")
    .dispatchEvent("drop", { dataTransfer: dropped });
  await expect(general.getByRole("status")).toContainText("support.pdf");
  await general.getByRole("button", { name: /Upload/ }).click();
  await expect(client).toHaveURL(/\/documents\/[a-f0-9]{24}$/);
  // PM provisions the existing immutable templates through the actual case UI.
  await pm.goto(`/staff/cases/${data.caseId}?tab=forms`, {
    waitUntil: "domcontentloaded",
  });
  await pm.getByRole("button", { name: "Add case forms" }).click();
  await expect
    .poll(async () =>
      (await read(`/cases/${data.caseId}/forms`)).forms.some(
        (f: { templateKey: string }) => f.templateKey === "personal_contact",
      ),
    )
    .toBe(true);
  const forms = await read(`/cases/${data.caseId}/forms`);
  const formId = forms.forms.find(
    (f: { templateKey: string }) => f.templateKey === "personal_contact",
  ).id;
  await client.goto(`/portal/cases/${data.caseId}/forms/${formId}`, {
    waitUntil: "domcontentloaded",
  });
  await client.getByLabel(/^Date of birth/).fill("1990-01-01");
  await client.getByLabel(/^Country of birth/).selectOption("PK");
  await client.getByLabel(/^Country of citizenship/).selectOption("PK");
  await client
    .getByLabel("Street address", { exact: true })
    .fill("12 Example Street");
  await client.getByLabel("City", { exact: true }).fill("Karachi");
  await client.getByLabel("Country", { exact: true }).selectOption("PK");
  await client
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await expect
    .poll(async () => (await read(`/forms/${formId}`)).status)
    .toBe("submitted");
  const openStaffForm = async () => {
    await pm.goto(`/staff/cases/${data.caseId}?tab=forms`, {
      waitUntil: "domcontentloaded",
    });
    await pm
      .locator(".form-card")
      .filter({
        has: pm.getByRole("heading", {
          name: "Personal & Contact Information",
          exact: true,
        }),
      })
      .getByRole("button", { name: "Open form", exact: true })
      .click();
  };
  await openStaffForm();
  await pm
    .getByRole("button", { name: "Return for changes", exact: true })
    .click();
  await pm.locator("#client-note").fill("Please confirm your current address.");
  await pm.locator("#internal-note").fill("STAFF ONLY INTAKE NOTE");
  await pm
    .getByRole("button", { name: "Return to client", exact: true })
    .click();
  await expect
    .poll(async () => (await read(`/forms/${formId}`)).status)
    .toBe("needs_changes");
  await client.reload({ waitUntil: "domcontentloaded" });
  await expect(
    client.getByText("Please confirm your current address.", { exact: true }),
  ).toBeVisible();
  await expect(client.getByText("STAFF ONLY INTAKE NOTE")).toHaveCount(0);
  await client
    .getByRole("button", { name: "Resubmit for review", exact: true })
    .click();
  await expect
    .poll(async () => (await read(`/forms/${formId}`)).status)
    .toBe("submitted");
  await openStaffForm();
  await pm.getByRole("button", { name: "Approve", exact: true }).click();
  await pm
    .getByRole("region", { name: "Review", exact: true })
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await expect
    .poll(async () => (await read(`/forms/${formId}`)).status)
    .toBe("approved");
  expect((await read(`/forms/${formId}`)).actions.canLock).toBe(false);
  // Client and PM converse through the existing shared chat domain.
  const channels = await read(`/cases/${data.caseId}/channels`);
  const channelId = channels.channels.find(
    (c: { name: string }) => c.name === "General",
  ).id;
  await client.goto(`/portal/cases/${data.caseId}/messages/${channelId}`, {
    waitUntil: "domcontentloaded",
  });
  await client
    .getByLabel("Message", { exact: true })
    .fill("Client browser question");
  await client.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    client.getByText("Client browser question", { exact: true }),
  ).toBeVisible();
  await pm.goto("/staff/messages?filter=unread", {
    waitUntil: "domcontentloaded",
  });
  await expect(
    pm.getByText("Client browser question", { exact: false }).first(),
  ).toBeVisible();
  await pm.goto(`/staff/cases/${data.caseId}?tab=chat&channel=${channelId}`, {
    waitUntil: "domcontentloaded",
  });
  await pm.getByLabel("Message", { exact: true }).fill("Staff browser reply");
  await pm.getByRole("button", { name: "Send", exact: true }).click();
  await client.reload({ waitUntil: "domcontentloaded" });
  await expect(
    client.getByText("Staff browser reply", { exact: true }),
  ).toBeVisible();
  // Case task uses the same dialog as global tasks and persists an actual task.
  await pm.goto(`/staff/cases/${data.caseId}?tab=tasks&action=task`, {
    waitUntil: "domcontentloaded",
  });
  await pm.locator("#task-title").fill("Prepare browser evidence");
  await pm.getByRole("button", { name: "Create Task", exact: true }).click();
  await expect(
    pm.getByText("Prepare browser evidence", { exact: true }),
  ).toBeVisible();
  await pm.goto(`/staff/cases/${data.caseId}?tab=evidence`, {
    waitUntil: "domcontentloaded",
  });
  await pm
    .getByRole("button", { name: "Add Requirement", exact: true })
    .click();
  const custom = pm.getByRole("dialog", {
    name: "Add Evidence Requirement",
    exact: true,
  });
  await custom.locator("#custom-title").fill("Browser evidence");
  await custom.getByLabel("Section", { exact: true }).fill("Identity");
  await custom
    .getByRole("button", { name: "Add Requirement", exact: true })
    .click();
  const evidenceRow = pm
    .getByRole("row")
    .filter({ has: pm.getByText("Browser evidence", { exact: true }) });
  await evidenceRow
    .getByRole("button", { name: "Details", exact: true })
    .click();
  await pm
    .getByLabel("Link a case document", { exact: true })
    .selectOption(documentId);
  await pm.getByRole("button", { name: "Link", exact: true }).click();
  await expect(
    pm.getByRole("button", { name: "Unlink clear-passport.pdf", exact: true }),
  ).toBeVisible();
  await evidenceRow
    .getByRole("button", { name: "Update", exact: true })
    .click();
  await pm.locator("#evidence-status").selectOption("satisfied");
  await pm.getByRole("button", { name: "Save Status", exact: true }).click();
  await expect(evidenceRow).toContainText("satisfied");
  await pm.goto(`/staff/cases/${data.caseId}?tab=petition`, {
    waitUntil: "domcontentloaded",
  });
  await pm
    .getByRole("button", { name: "Create primary petition", exact: true })
    .click();
  await expect(pm.getByText(/Revision 0|Revision 1/).first()).toBeVisible();
  await pm.locator("#section-body").fill("Browser petition drafting text.");
  await expect(
    pm.getByRole("status").filter({ hasText: /Saved/ }),
  ).toBeVisible();
  await pm.reload({ waitUntil: "domcontentloaded" });
  await expect(pm.locator("#section-body")).toHaveValue(
    "Browser petition drafting text.",
  );
  await pm.goto(`/staff/cases/${data.caseId}?tab=packet`, {
    waitUntil: "domcontentloaded",
  });
  await pm.getByRole("button", { name: /Create initial packet/ }).click();
  await expect(
    pm.getByRole("button", { name: "Print manifest" }),
  ).toBeVisible();
  await pm.getByRole("button", { name: "Show available", exact: true }).click();
  const choice = pm.getByLabel("Item to add", { exact: true });
  const documentOption = choice
    .getByRole("option")
    .filter({ hasText: "clear-passport.pdf" });
  await expect(documentOption).toHaveCount(1);
  await choice.selectOption((await documentOption.getAttribute("value"))!);
  await pm.getByRole("button", { name: "Add", exact: true }).click();
  await expect(
    pm.getByRole("region", { name: "Packet items", exact: true }),
  ).toContainText("clear-passport.pdf");
  await staffContext.close();
  await clientContext.close();
});

test("first login enforces the 12-character password contract", async ({
  page,
}) => {
  const data = await fixture(page);
  await page.goto("/staff/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email address").fill("first-login@browser.ih.test");
  await page.getByLabel(/^Password/).fill(data.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/setup-password/);
  await page
    .getByLabel("Current Password", { exact: true })
    .fill(data.password);
  await page.getByLabel("New Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm New Password", { exact: true }).fill("short");
  await expect(
    page.getByRole("button", { name: "Update Password" }),
  ).toBeDisabled();
  await page
    .getByLabel("New Password", { exact: true })
    .fill("Permanent-Password-123!");
  await page
    .getByLabel("Confirm New Password", { exact: true })
    .fill("Permanent-Password-123!");
  await page.getByRole("button", { name: "Update Password" }).click();
  await expect(page).toHaveURL(/\/staff\/dashboard/);
});

test("Operations Admin manages a case while reviewer, specialist and removed-member rights stay scoped", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const operationsContext = await browser.newContext(),
    writerContext = await browser.newContext(),
    reviewerContext = await browser.newContext();
  const operations = await operationsContext.newPage(),
    writer = await writerContext.newPage(),
    reviewer = await reviewerContext.newPage();
  const data = await staffLogin(operations, "operations_admin");
  await expect(
    operations.getByText("Operations overview", { exact: true }),
  ).toBeVisible();
  await operations.goto("/staff/cases/new", { waitUntil: "domcontentloaded" });
  await operations
    .getByLabel("Client", { exact: true })
    .selectOption(data.client.id);
  await operations.getByLabel("Case title").fill("Operations browser case");
  await operations
    .getByLabel("Case type", { exact: true })
    .selectOption("eb2_niw");
  await operations
    .getByLabel("Project manager", { exact: true })
    .selectOption(data.roles.pm.id);
  await operations
    .getByRole("button", { name: "Create case", exact: true })
    .click();
  await expect(operations).toHaveURL(/\/staff\/cases\/[a-f0-9]{24}$/);
  const caseId = operations.url().split("/").at(-1)!;
  await expect(
    operations.getByRole("heading", {
      name: "Operations browser case",
      exact: true,
    }),
  ).toBeVisible();
  await operations
    .getByRole("button", { name: "Change PM", exact: true })
    .click();
  await operations
    .getByLabel("Project manager", { exact: true })
    .selectOption(data.roles.admin.id);
  await operations
    .getByRole("button", { name: "Save PM", exact: true })
    .click();
  await expect(
    operations.getByText("Browser admin", { exact: true }),
  ).toBeVisible();
  await operations.getByRole("button", { name: "Team", exact: true }).click();
  for (const role of ["petition_writer", "reviewer"]) {
    await operations
      .getByRole("button", { name: "Add Team Member", exact: true })
      .click();
    await operations
      .getByLabel("Select Employee", { exact: true })
      .selectOption(data.roles[role].id);
    await operations
      .getByLabel("Assignment Role", { exact: true })
      .selectOption(role === "reviewer" ? "reviewer" : "contributor");
    await operations
      .locator(".modal-card")
      .getByRole("button", { name: "Add Member", exact: true })
      .click();
    await expect(
      operations.getByRole("cell", { name: `Browser ${role}`, exact: true }),
    ).toBeVisible();
  }
  await operations.goto(`/staff/cases/${caseId}?tab=tasks&action=task`, {
    waitUntil: "domcontentloaded",
  });
  await operations.locator("#task-title").fill("Writer assigned browser work");
  await operations
    .getByLabel("Assignee", { exact: true })
    .selectOption(data.roles.petition_writer.id);
  await operations
    .getByRole("button", { name: "Create Task", exact: true })
    .click();
  await expect(
    operations.getByText("Writer assigned browser work", { exact: true }),
  ).toBeVisible();
  await operations.goto(`/staff/cases/${caseId}?tab=chat`, {
    waitUntil: "domcontentloaded",
  });
  await operations.getByText("Manage conversations", { exact: true }).click();
  await operations.locator("[name=newName]").fill("Restricted browser review");
  await operations
    .getByLabel("Audience", { exact: true })
    .selectOption("restricted_members");
  await operations
    .getByRole("button", { name: "Create channel", exact: true })
    .click();
  await expect(
    operations
      .locator(".channel-btn")
      .filter({ hasText: "Restricted browser review" }),
  ).toBeVisible();
  await operations
    .locator(".channel-btn")
    .filter({ hasText: "Restricted browser review" })
    .click();
  await operations
    .getByRole("button", { name: "Load members", exact: true })
    .click();
  const restrictedWriter = operations
    .locator("ih-channel-management li")
    .filter({ hasText: "Browser petition_writer" })
    .first();
  await restrictedWriter
    .getByRole("button", { name: "Add access", exact: true })
    .click();
  await expect(
    restrictedWriter.getByRole("button", {
      name: "Remove access",
      exact: true,
    }),
  ).toBeVisible();
  await staffLogin(writer, "petition_writer");
  await staffLogin(reviewer, "reviewer");
  await writer.goto(`/staff/cases/${caseId}?tab=tasks`, {
    waitUntil: "domcontentloaded",
  });
  await writer.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(writer.getByLabel("Assignee", { exact: true })).toHaveCount(0);
  await writer
    .locator("#task-description")
    .fill("Specialist updated their own assigned task");
  await writer.getByRole("button", { name: "Save Task", exact: true }).click();
  await writer
    .getByLabel("Status of Writer assigned browser work", { exact: true })
    .selectOption("in_progress");
  await reviewer.goto(`/staff/cases/${caseId}?tab=tasks`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    reviewer.getByText("Writer assigned browser work", { exact: true }),
  ).toBeVisible();
  await expect(
    reviewer.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await expect(
    reviewer.getByRole("button", { name: "New Task", exact: true }),
  ).toHaveCount(0);
  expect(
    (
      await reviewer.request.patch(`/api/v1/staff/cases/${caseId}/stage`, {
        data: { stage: "intake" },
        headers: { Origin: "http://localhost:3180" },
      })
    ).status(),
  ).toBe(403);
  await operations.goto(`/staff/cases/${caseId}?tab=team`, {
    waitUntil: "domcontentloaded",
  });
  await operations
    .getByRole("row")
    .filter({
      has: operations.getByRole("cell", {
        name: "Browser petition_writer",
        exact: true,
      }),
    })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await operations
    .getByRole("button", { name: "Remove Member", exact: true })
    .click();
  await expect
    .poll(async () =>
      (await writer.request.get(`/api/v1/staff/cases/${caseId}`)).status(),
    )
    .toBe(404);
  expect(
    (
      await writer.request.get(`/api/v1/staff/cases/${caseId}/channels`)
    ).status(),
  ).toBe(404);
  expect(
    (await writer.request.get(`/api/v1/staff/cases/${caseId}/tasks`)).status(),
  ).toBe(404);
  await writer.reload({ waitUntil: "domcontentloaded" });
  await expect(
    writer.getByRole("heading", { name: "Case Not Found", exact: true }),
  ).toBeVisible();
  await operationsContext.close();
  await writerContext.close();
  await reviewerContext.close();
});

test("lead intake, team planning, delivery and notifications work from Staff without a CMS session", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const data = await staffLogin(page);
  await page.goto(`/staff/intake/${data.leadId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("heading", { name: "Browser intake inquiry", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("qualified");
  await page
    .getByRole("button", { name: "Save progress", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Changes saved." }),
  ).toBeVisible();
  await page
    .getByLabel("Note for staff", { exact: true })
    .fill("Intake browser note");
  await page
    .getByRole("button", { name: "Add internal note", exact: true })
    .click();
  await expect(
    page.getByText("Intake browser note", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Prepared file name", { exact: true })
    .fill("Prepared browser package");
  await page.getByLabel("File status", { exact: true }).selectOption("ready");
  await page
    .getByRole("button", { name: "Add prepared file", exact: true })
    .click();
  await expect(
    page.getByText("Prepared browser package · ready", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Delivery status", { exact: true })
    .selectOption("ready");
  await page
    .getByRole("button", { name: "Save delivery", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await (
            await page.request.get(`/api/v1/staff/leads/${data.leadId}`)
          ).json()
        ).data.delivery.state,
    )
    .toBe("ready");
  await page
    .getByRole("button", { name: "Start consultation", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open consultation", exact: true }),
  ).toBeVisible();
  await page.goto("/staff/planning", { waitUntil: "domcontentloaded" });
  await page
    .getByLabel("Sprint name", { exact: true })
    .fill("Browser review sprint");
  await page.getByLabel("Start date", { exact: true }).fill("2026-10-01");
  await page.getByLabel("End date", { exact: true }).fill("2026-10-10");
  await page
    .getByRole("button", { name: "Create sprint", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser review sprint", exact: true }),
  ).toBeVisible();
  await page.goto("/staff/notifications", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Digest frequency", { exact: true })
    .selectOption("weekly");
  await page
    .getByRole("button", { name: "Save email preferences", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Email preferences saved.",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByLabel("Digest frequency", { exact: true }),
  ).toHaveValue("weekly");
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/login/);
});
