/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable browser fixture runner. It never reads a production database URI.
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const { startTestDb, stopTestDb } = require("../server/test/helpers/testDb");
const port = 3180;
Object.assign(process.env, {
  NODE_ENV: "development",
  SITE_URL: `http://localhost:${port}`,
  NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`,
  APP_TIMEZONE: "UTC",
  PRIVATE_DOCUMENT_ROOT: path.join(
    os.tmpdir(),
    `ih-browser-test-${process.pid}`,
  ),
  RESEND_API_KEY: "",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASS: "",
  SESSION_SECRET: "isolated-browser-fixture-only",
  LOGIN_RATE_LIMIT: "1000",
  ADMIN_USERNAME: "",
  ADMIN_PASSWORD: "",
});
async function main() {
  const uri = await startTestDb();
  process.env.MONGODB_URI = uri;
  const { createApp } = require("../server/app");
  const express = require("../server/node_modules/express");
  const bcrypt = require("../server/node_modules/bcryptjs");
  const { seedAdminUser } = require("../server/test/helpers/auth");
  const ClientUser = require("../server/models/ClientUser");
  const CaseWorkspace = require("../server/models/CaseWorkspace");
  const WorkspaceMember = require("../server/models/WorkspaceMember");
  const DocumentCategory = require("../server/models/DocumentCategory");
  const { createClientCase } = require("../server/services/caseConversion");
  const {
    createDocumentRequest,
  } = require("../server/services/documentRequestService");
  const password = "Browser-Password-123!";
  const roles = {};
  for (const role of [
    "super_admin",
    "admin",
    "editor",
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
    const { user } = await seedAdminUser({
      role,
      name: `Browser ${role}`,
      email: `${role}@browser.ih.test`,
      password,
    });
    roles[role] = { id: String(user._id), email: user.email };
  }
  const firstLogin = await seedAdminUser({
    role: "pm",
    name: "First Login PM",
    email: "first-login@browser.ih.test",
    password,
  });
  firstLogin.user.mustChangePassword = true;
  await firstLogin.user.save();
  const client = await ClientUser.create({
    firstName: "Casey",
    lastName: "Browser",
    email: "client@browser.ih.test",
    normalizedEmail: "client@browser.ih.test",
    passwordHash: await bcrypt.hash(password, 12),
    status: "active",
    emailVerifiedAt: new Date(),
  });
  const actor = {
    type: "admin_user",
    id: roles.operations_admin.id,
    name: "Browser Operations",
  };
  const result = await createClientCase({
    clientId: client._id,
    input: {
      title: "Browser immigration case",
      caseType: "eb2_niw",
      projectManagerId: roles.pm.id,
      targetFilingDate: "2026-12-15",
      priority: "high",
    },
    actor,
  });
  const caseDoc = result.case;
  if (!caseDoc)
    throw new Error(`Fixture provisioning failed: ${JSON.stringify(result)}`);
  const workspace = await CaseWorkspace.findOne({ case: caseDoc._id });
  const member = await WorkspaceMember.findOne({
    workspace: workspace._id,
    clientUser: client._id,
  });
  for (const role of ["reviewer", "petition_writer", "evidence_collector"])
    await WorkspaceMember.create({
      workspace: workspace._id,
      memberType: "employee",
      adminUser: roles[role].id,
      workspaceRole: role === "reviewer" ? "reviewer" : "contributor",
      status: "active",
    });
  const category = await DocumentCategory.findOne({
    case: caseDoc._id,
    templateKey: "identity_civil_documents",
  });
  const lead = await require("../server/models/Consultation").create({
    name: "Browser intake inquiry",
    email: client.email,
    message: "Please assess eligibility.",
    service: "EB-2 NIW",
    clientUser: client._id,
    owner: roles.pm.id,
    ownerName: "Browser pm",
  });
  const request = await createDocumentRequest({
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    categoryId: category._id,
    title: "Current passport",
    documentType: "Passport",
    instructions: "Upload all pages clearly.",
    requestedFromMemberId: member._id,
    requestedByAdminId: roles.pm.id,
    actor,
    dueDate: "2026-10-15",
  });
  const fixture = {
    password,
    roles,
    client: { id: String(client._id), email: client.email },
    caseId: String(caseDoc._id),
    workspaceId: String(workspace._id),
    categoryId: String(category._id),
    requestId: String(request.request._id),
    leadId: String(lead._id),
  };
  // Use the release build: no cold route compilation or development overlays.
  const nextApp = require("next")({ dev: false, hostname: "localhost", port });
  await nextApp.prepare();
  const app = express();
  const staticRoot = path.resolve(
    __dirname,
    "../enterprise-ui/dist/case-management/browser",
  );
  app.get("/__browser_fixture", (_req, res) => res.json(fixture));

  // Phase 12 (calendar): its own case, client and dates, so nothing here disturbs the other browser journeys. Created on
  // first request, relative to the real clock, in the disposable database only.
  const isoDay = (offsetDays) =>
    new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
  let calendarFixture = null;
  async function provisionCalendarFixture() {
    const mk = async (label, email) =>
      ClientUser.create({
        firstName: label,
        lastName: "Calendar",
        email,
        normalizedEmail: email,
        passwordHash: await bcrypt.hash(password, 12),
        status: "active",
        emailVerifiedAt: new Date(),
      });
    const calendarClient = await mk("Cal", "calendar-client@browser.ih.test");
    const otherClient = await mk("Other", "calendar-other@browser.ih.test");
    const tomorrow = isoDay(1);
    const created = await createClientCase({
      clientId: calendarClient._id,
      input: { title: "Calendar browser case", caseType: "eb2_niw", projectManagerId: roles.pm.id, priority: "high" },
      actor,
    });
    const other = await createClientCase({
      clientId: otherClient._id,
      input: { title: "Other firm case", caseType: "eb2_niw", projectManagerId: roles.operations_admin.id, targetFilingDate: tomorrow, priority: "high" },
      actor,
    });
    if (!created.case || !other.case) throw new Error("Calendar fixture provisioning failed.");
    const ws = await CaseWorkspace.findOne({ case: created.case._id });
    await WorkspaceMember.create({ workspace: ws._id, memberType: "employee", adminUser: roles.evidence_collector.id, workspaceRole: "contributor", status: "active" });
    const clientMember = await WorkspaceMember.findOne({ workspace: ws._id, clientUser: calendarClient._id });
    const cat = await DocumentCategory.findOne({ case: created.case._id, templateKey: "identity_civil_documents" });
    await createDocumentRequest({
      caseId: created.case._id,
      workspaceId: ws._id,
      categoryId: cat._id,
      title: "Calendar passport copy",
      documentType: "Passport",
      instructions: "Upload all pages clearly.",
      requestedFromMemberId: clientMember._id,
      requestedByAdminId: roles.pm.id,
      actor,
      dueDate: tomorrow,
    });
    return {
      caseId: String(created.case._id),
      otherCaseId: String(other.case._id),
      client: { email: calendarClient.email },
      tomorrow,
    };
  }
  app.post("/__browser_calendar_fixture", async (_req, res) => {
    try {
      calendarFixture = calendarFixture || provisionCalendarFixture();
      res.json(await calendarFixture);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: String(error) });
    }
  });
  // Phase 13 (search and reports): two teams, created on demand in the disposable database only. Team A (PM + specialist)
  // owns a task, a document, a USCIS filing and a restricted conversation the PM is NOT on; team B (operations admin) owns a
  // case with the same search token; case C has a formula-shaped title and a document awaiting review.
  let searchFixture = null;
  async function provisionSearchFixture() {
    const Task = require("../server/models/admin/Task");
    const CaseDocument = require("../server/models/CaseDocument");
    const USCISFiling = require("../server/models/USCISFiling");
    const WorkspaceChannel = require("../server/models/WorkspaceChannel");
    const mk = async (label, email) =>
      ClientUser.create({ firstName: label, lastName: "Search", email, normalizedEmail: email, passwordHash: await bcrypt.hash(password, 12), status: "active", emailVerifiedAt: new Date() });
    const clients = [await mk("SA", "search-a@browser.ih.test"), await mk("SB", "search-b@browser.ih.test"), await mk("SC", "search-c@browser.ih.test")];
    const make = async (client, title, pm) => {
      const created = await createClientCase({ clientId: client._id, input: { title, caseType: "eb2_niw", projectManagerId: pm, priority: "high" }, actor });
      if (!created.case) throw new Error("Search fixture provisioning failed.");
      const workspace = await CaseWorkspace.findOne({ case: created.case._id });
      const category = await DocumentCategory.findOne({ case: created.case._id, templateKey: "identity_civil_documents" });
      return { caseDoc: created.case, workspace, category };
    };
    const a = await make(clients[0], "Zorblax assigned case", roles.pm.id);
    const b = await make(clients[1], "Zorblax other team case", roles.operations_admin.id);
    const c = await make(clients[2], '=HYPERLINK("http://evil.example","click")', roles.pm.id);
    await WorkspaceMember.create({ workspace: a.workspace._id, memberType: "employee", adminUser: roles.evidence_collector.id, workspaceRole: "contributor", status: "active" });
    const doc = (x, name, status) => CaseDocument.create({ case: x.caseDoc._id, workspace: x.workspace._id, category: x.category._id, uploadedByType: "employee", uploadedByAdmin: roles.pm.id, originalName: name + ".pdf", displayName: name, storageKey: "k/" + name, mimeType: "application/pdf", detectedMimeType: "application/pdf", extension: "pdf", size: 1, checksum: "x", visibility: "employees_only", status });
    await doc(a, "Zorblax assigned passport", "pending_review");
    await doc(b, "Zorblax other team passport", "pending_review");
    await doc(c, "Formula case passport", "pending_review");
    const tomorrow = new Date(Date.now() + 86400000);
    await Task.create({ case: a.caseDoc._id, title: "Zorblax assigned task", assignee: roles.pm.id, dueDate: tomorrow });
    await Task.create({ case: b.caseDoc._id, title: "Zorblax other team task", assignee: roles.operations_admin.id, dueDate: tomorrow });
    await USCISFiling.create({ case: a.caseDoc._id, workspace: a.workspace._id, title: "Zorblax I-140", formType: "I-140", receiptNumber: "IOE5550001111", currentStatusTitle: "Case Was Received" });
    await WorkspaceChannel.create({ case: a.caseDoc._id, workspace: a.workspace._id, name: "Zorblax confidential review", slug: "zorblax-confidential", channelType: "private", visibility: "restricted_members", order: 99 });
    return {
      a: { id: String(a.caseDoc._id), number: a.caseDoc.caseNumber },
      b: { id: String(b.caseDoc._id), number: b.caseDoc.caseNumber },
      c: { id: String(c.caseDoc._id), number: c.caseDoc.caseNumber },
      receipt: "IOE5550001111",
    };
  }
  app.post("/__browser_search_fixture", async (_req, res) => {
    try {
      searchFixture = searchFixture || provisionSearchFixture();
      res.json(await searchFixture);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: String(error) });
    }
  });
  // One reminder pass against the disposable database, exactly as the production worker would run it.
  app.post("/__browser_run_reminders", async (_req, res) => {
    try {
      const { runReminders } = require("../server/services/calendarReminderService");
      res.json(await runReminders({ apply: true, now: new Date() }));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: String(error) });
    }
  });
  app.post("/__browser_shutdown", (_req, res) => {
    res.json({ stopped: true });
    setImmediate(shutdown);
  });
  app.use("/staff", express.static(staticRoot));
  app.get("/staff/*", (_req, res) =>
    res.sendFile(path.join(staticRoot, "index.html")),
  );
  const serverApp = createApp();
  app.use((req, res, next) =>
    /^\/(api\/v1|admin|css|images|js)(\/|$)/.test(req.path)
      ? serverApp(req, res, next)
      : next(),
  );
  app.use((req, res) => nextApp.getRequestHandler()(req, res));
  const server = app.listen(port, "localhost", () =>
    console.log(`Browser fixtures ready at http://localhost:${port}`),
  );
  const shutdown = async () => {
    setTimeout(() => process.exit(0), 5000).unref();
    server.close();
    await nextApp.close();
    await stopTestDb();
    const documentRoot = path.resolve(process.env.PRIVATE_DOCUMENT_ROOT);
    const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
    if (
      !documentRoot.startsWith(temporaryRoot) ||
      !path.basename(documentRoot).startsWith("ih-browser-test-")
    )
      throw new Error("Unexpected browser document directory.");
    await fs.rm(documentRoot, { recursive: true, force: true });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
