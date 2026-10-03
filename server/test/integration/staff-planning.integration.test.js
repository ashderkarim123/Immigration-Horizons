process.env.LOGIN_RATE_LIMIT = "1000";
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createApp } = require("../../app");
const {
  startTestDb,
  stopTestDb,
  clearCollections,
} = require("../helpers/testDb");
const { seedAdminUser, loginStaffAs } = require("../helpers/auth");
const Lead = require("../../models/Consultation");
const ClientUser = require("../../models/ClientUser");
const WorkspaceMember = require("../../models/WorkspaceMember");
const Task = require("../../models/admin/Task");
const Notification = require("../../models/admin/Notification");
const Delivery = require("../../models/admin/DeliveryRecord");
const Activity = require("../../models/admin/ActivityLog");
const Interaction = require("../../models/ConsultationInteraction");
const { createClientCase } = require("../../services/caseConversion");
let app;
test.before(async () => {
  await startTestDb();
  app = createApp();
});
test.after(stopTestDb);
test.beforeEach(clearCollections);
async function staff(role) {
  const credentials = await seedAdminUser({ role });
  return {
    user: credentials.user,
    agent: await loginStaffAs(request.agent(app), credentials),
  };
}
async function lead(extra = {}) {
  return Lead.create({
    name: "Planning client",
    email: "planning@ih.test",
    message: "Please review my inquiry.",
    service: "EB-2 NIW",
    ...extra,
  });
}
async function caseFixture(pm) {
  const customer = await ClientUser.create({
    firstName: "Planning",
    lastName: "Client",
    email: "client-planning@ih.test",
    normalizedEmail: "client-planning@ih.test",
    passwordHash: "x",
    status: "active",
  });
  const result = await createClientCase({
    clientId: customer._id,
    input: {
      title: "Planning case",
      caseType: "eb2_niw",
      projectManagerId: pm.user._id,
    },
    actor: { type: "admin_user", id: pm.user._id, name: pm.user.name },
  });
  return { customer, caseDoc: result.case };
}
test("Staff lead assignment validates the complete team, records the actor and notifies new assignees once", async () => {
  const pm = await staff("pm"),
    reviewer = await staff("reviewer"),
    record = await lead();
  const path = `/api/v1/staff/leads/${record._id}/assign`,
    body = {
      ownerId: String(pm.user._id),
      assignees: [{ user: String(reviewer.user._id), taskType: "QC Review" }],
    };
  assert.equal((await pm.agent.post(path).send(body)).status, 200);
  assert.equal((await Lead.findById(record._id)).status, "assigned");
  assert.equal(
    await Notification.countDocuments({ relatedLead: record._id }),
    2,
  );
  assert.equal((await pm.agent.post(path).send(body)).status, 200);
  assert.equal(
    await Notification.countDocuments({ relatedLead: record._id }),
    2,
  );
  assert.equal(
    (
      await pm.agent
        .post(path)
        .send({ ...body, ownerId: String(reviewer.user._id) })
    ).status,
    422,
  );
  assert.equal(
    String((await Lead.findById(record._id)).owner),
    String(pm.user._id),
  );
  assert.equal(
    String((await Activity.findOne({ lead: record._id })).meta.actorId),
    String(pm.user._id),
  );
  assert.equal((await reviewer.agent.post(path).send(body)).status, 403);
});
test("converted lead access is concealed after membership removal, including notes and delivery", async () => {
  const pm = await staff("pm"),
    outsider = await staff("pm"),
    { caseDoc } = await caseFixture(pm),
    record = await lead({ convertedCase: caseDoc._id });
  const path = `/api/v1/staff/leads/${record._id}`;
  assert.equal((await pm.agent.get(path)).status, 200);
  assert.equal((await outsider.agent.get(path)).status, 404);
  await WorkspaceMember.updateMany(
    { adminUser: pm.user._id },
    { $set: { status: "removed" } },
  );
  assert.equal((await pm.agent.get(path)).status, 404);
  assert.equal(
    (await pm.agent.post(`${path}/notes`).send({ content: "Do not save" }))
      .status,
    404,
  );
  assert.equal(
    (
      await pm.agent
        .post(`${path}/delivery`)
        .send({ state: "delivered", method: "email" })
    ).status,
    404,
  );
  assert.equal((await pm.agent.get("/api/v1/staff/leads")).body.data.total, 0);
});
test("historical consultation initialization is idempotent and delivery keeps its audit and durable notification", async () => {
  const pm = await staff("pm"),
    { customer } = await caseFixture(pm),
    record = await lead({
      clientUser: customer._id,
      owner: pm.user._id,
      ownerName: pm.user.name,
    });
  const path = `/api/v1/staff/leads/${record._id}`;
  assert.equal(
    (await pm.agent.post(`${path}/initialize-interaction`).send({})).status,
    200,
  );
  assert.equal(
    (await pm.agent.post(`${path}/initialize-interaction`).send({})).status,
    200,
  );
  assert.equal(
    await Interaction.countDocuments({ consultation: record._id }),
    1,
  );
  assert.equal(
    (
      await pm.agent
        .post(`${path}/delivery/files`)
        .send({ name: "Final package", url: "javascript:bad", status: "ready" })
    ).status,
    422,
  );
  assert.equal(
    (
      await pm.agent
        .post(`${path}/delivery/files`)
        .send({
          name: "Final package",
          url: "https://example.test/package",
          status: "ready",
        })
    ).status,
    200,
  );
  const body = {
    state: "delivered",
    method: "email",
    confirmationNote: "Delivery confirmed",
  };
  assert.equal(
    (await pm.agent.post(`${path}/delivery`).send(body)).status,
    200,
  );
  assert.equal(
    (await pm.agent.post(`${path}/delivery`).send(body)).status,
    200,
  );
  const delivery = await Delivery.findOne({ lead: record._id });
  assert.equal(delivery.deliveredBy, pm.user.name);
  assert.ok(delivery.deliveredAt);
  assert.equal(
    await Notification.countDocuments({
      relatedLead: record._id,
      type: "lead_delivered",
    }),
    1,
  );
  assert.equal((await Lead.findById(record._id)).status, "delivered");
});
test("sprint task changes preserve case scope and specialist ownership rights", async () => {
  const pm = await staff("pm"),
    outsider = await staff("pm"),
    specialist = await staff("petition_writer"),
    { caseDoc } = await caseFixture(pm);
  const task = await Task.create({
    case: caseDoc._id,
    title: "Scoped planning task",
    assignee: specialist.user._id,
  });
  const result = await pm.agent
    .post("/api/v1/staff/planning/sprints")
    .send({
      name: "Review sprint",
      startDate: "2026-10-01",
      endDate: "2026-10-10",
    });
  assert.equal(result.status, 200);
  const path = `/api/v1/staff/planning/tasks/${task._id}`,
    body = { sprintId: result.body.data.id };
  assert.equal((await pm.agent.patch(path).send(body)).status, 200);
  assert.equal((await outsider.agent.patch(path).send(body)).status, 404);
  assert.equal((await specialist.agent.patch(path).send(body)).status, 403);
  assert.equal(
    (await outsider.agent.get("/api/v1/staff/planning")).body.data.tasks.length,
    0,
  );
});
test('restricted-channel notifications disappear immediately when channel access is removed', async () => {
  const pm = await staff('pm'), {caseDoc} = await caseFixture(pm);
  const member = await WorkspaceMember.findOne({adminUser:pm.user._id});
  const channel = await require('../../models/WorkspaceChannel').create({case:caseDoc._id,workspace:member.workspace,name:'Restricted review',slug:'restricted-review',visibility:'restricted_members',channelType:'standard',order:99});
  const channelMember = await require('../../models/ChannelMember').create({channel:channel._id,workspaceMember:member._id});
  const notice = await Notification.create({recipientType:'employee',recipientAdmin:pm.user._id,title:'Restricted message',message:'Private conversation',type:'new_lead',relatedCase:caseDoc._id,relatedChannel:channel._id});
  const path = '/api/v1/staff/notifications';
  assert.ok((await pm.agent.get(path)).body.data.items.some(item => item.id === String(notice._id)));
  await require('../../models/ChannelMember').updateOne({_id:channelMember._id},{status:'removed',removedAt:new Date()});
  assert.ok((await pm.agent.get(path)).body.data.items.every(item => item.id !== String(notice._id)));
  assert.equal((await pm.agent.post(`${path}/read`).send({id:notice._id})).status,404);
});

test("Staff notifications target immutable recipients, hide removed case records, and save only valid preferences", async () => {
  const pm = await staff("pm"),
    outsider = await staff("pm"),
    { caseDoc } = await caseFixture(pm);
  const notice = await Notification.create({
    recipientType: "employee",
    recipientAdmin: pm.user._id,
    title: "Case update",
    message: "Private update",
    type: "case_member_added",
    relatedCase: caseDoc._id,
  });
  await Notification.create({
    recipientName: pm.user.name,
    title: "Legacy name only",
    message: "Do not infer identity",
    type: "new_lead",
  });
  const path = "/api/v1/staff/notifications";
  const convertedLead = await Lead.create({name:'Converted inquiry', email:'converted@example.test', message:'Inquiry', service:'EB-2 NIW', convertedCase:caseDoc._id});
  await Notification.create({recipientType:'employee',recipientAdmin:pm.user._id,title:'Old lead update',message:'Converted case work',type:'new_lead',relatedLead:convertedLead._id});
  const items = (await pm.agent.get(path)).body.data.items;
  assert.equal(items.length, 3); // Includes the canonical PM and converted-lead notices.
  assert.ok(items.some((item) => item.id === String(notice._id)));
  assert.ok(items.every((item) => item.title !== "Legacy name only"));
  assert.equal(
    (await outsider.agent.post(`${path}/read`).send({ id: notice._id })).status,
    404,
  );
  assert.equal(
    (await pm.agent.post(`${path}/read`).send({ id: notice._id })).status,
    200,
  );
  assert.equal(
    (
      await pm.agent
        .patch(`${path}/preferences`)
        .send({
          mentionEmails: false,
          digestEmails: true,
          digestFrequency: "weekly",
        })
    ).status,
    200,
  );
  assert.equal(
    (await pm.agent.get(path)).body.data.preferences.digestFrequency,
    "weekly",
  );
  assert.equal(
    (
      await pm.agent
        .patch(`${path}/preferences`)
        .send({
          mentionEmails: "false",
          digestEmails: true,
          digestFrequency: "weekly",
        })
    ).status,
    422,
  );
  await WorkspaceMember.updateMany(
    { adminUser: pm.user._id },
    { $set: { status: "removed" } },
  );
  assert.equal((await pm.agent.get(path)).body.data.items.length, 0);
  assert.equal(
    (await pm.agent.post(`${path}/read`).send({ id: notice._id })).status,
    404,
  );
});
