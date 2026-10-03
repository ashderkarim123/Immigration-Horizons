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
