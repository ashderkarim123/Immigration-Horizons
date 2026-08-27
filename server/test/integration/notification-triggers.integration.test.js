process.env.LOGIN_RATE_LIMIT = process.env.LOGIN_RATE_LIMIT || '1000';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');

const ClientUser = require('../../models/ClientUser');
const AdminUser = require('../../models/admin/User');
const ClientCase = require('../../models/ClientCase');
const CaseWorkspace = require('../../models/CaseWorkspace');
const WorkspaceMember = require('../../models/WorkspaceMember');
const DocumentCategory = require('../../models/DocumentCategory');
const CaseDocument = require('../../models/CaseDocument');
const WorkspaceChannel = require('../../models/WorkspaceChannel');
const WorkspaceMessage = require('../../models/WorkspaceMessage');
const Notification = require('../../models/admin/Notification');

const interactionService = require('../../services/interactionService');
const interactionEmail = require('../../services/interactionEmail');
const documentRequestService = require('../../services/documentRequestService');
const documentEmail = require('../../services/documentEmail');
const { reviewDocument } = require('../../services/documentReviewService');
const { createMessage } = require('../../services/messageService');
const collaborationEmail = require('../../services/collaborationEmail');

test.before(async () => {
  await startTestDb();
  const noopMailer = { emails: { send: async () => ({ data: { id: 'test' }, error: null }) } };
  interactionEmail._setMailerForTests(noopMailer);
  documentEmail._setMailerForTests(noopMailer);
  collaborationEmail._setMailerForTests(noopMailer);
});
test.after(async () => {
  interactionEmail._resetMailerForTests();
  documentEmail._resetMailerForTests();
  collaborationEmail._resetMailerForTests();
  await stopTestDb();
});
test.beforeEach(clearCollections);

const SYSTEM_ACTOR = { type: 'system', id: null, name: 'System' };

async function seedCaseWithClient() {
  const pm = await AdminUser.create({ name: 'PM', email: `pm-${Date.now()}-${Math.random()}@example.com`, password: 'x', role: 'pm' });
  const email = `client-${Date.now()}-${Math.random()}@example.com`;
  const client = await ClientUser.create({ email, normalizedEmail: email, passwordHash: 'x', firstName: 'Test', status: 'active' });
  const caseDoc = await ClientCase.create({
    caseNumber: `IH-2026-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title: 'Case',
    caseType: 'other',
    primaryClient: client._id,
    projectManager: pm._id,
    createdBy: pm._id,
    createdByName: pm.name,
  });
  const workspace = await CaseWorkspace.create({ case: caseDoc._id, workspaceType: 'primary', name: 'WS', createdBy: pm._id, createdByName: pm.name });
  const clientMember = await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'client',
    clientUser: client._id,
    workspaceRole: 'client',
    status: 'active',
  });
  const pmMember = await WorkspaceMember.create({
    workspace: workspace._id,
    memberType: 'employee',
    adminUser: pm._id,
    workspaceRole: 'project_manager',
    status: 'active',
  });
  return { pm, client, caseDoc, workspace, clientMember, pmMember };
}

async function seedCaseInteraction({ client, caseDoc, workspace }, actor) {
  const result = await interactionService.createInteraction({
    clientUserId: client._id,
    scopeType: 'case',
    caseId: caseDoc._id,
    workspaceId: workspace._id,
    subject: 'A question',
    description: 'x'.repeat(20),
    type: 'client_question',
    actor,
  });
  assert.equal(result.outcome, 'created');
  return result.interaction;
}

test('scheduleInteraction creates a query_scheduled notification for the client', async () => {
  const scope = await seedCaseWithClient();
  const interaction = await seedCaseInteraction(scope, SYSTEM_ACTOR);

  await interactionService.scheduleInteraction(interaction, { scheduledFor: new Date(Date.now() + 86400000), timezone: 'UTC' }, SYSTEM_ACTOR);

  const notification = await Notification.findOne({ relatedInteraction: interaction._id, type: 'query_scheduled' });
  assert.ok(notification);
  assert.equal(String(notification.recipientClient), String(scope.client._id));
});

test('answerInteraction creates a query_answered notification for the client', async () => {
  const scope = await seedCaseWithClient();
  const interaction = await seedCaseInteraction(scope, SYSTEM_ACTOR);
  const adminActor = { type: 'admin_user', id: scope.pm._id, name: scope.pm.name };

  await interactionService.answerInteraction(interaction, { clientVisibleResponse: 'Here is your answer.' }, adminActor);

  const notification = await Notification.findOne({ relatedInteraction: interaction._id, type: 'query_answered' });
  assert.ok(notification);
  assert.equal(String(notification.recipientClient), String(scope.client._id));
});

test('answerInteraction creates NO notification once the client has been removed from the workspace (removed member receives no event)', async () => {
  const scope = await seedCaseWithClient();
  const interaction = await seedCaseInteraction(scope, SYSTEM_ACTOR);
  const adminActor = { type: 'admin_user', id: scope.pm._id, name: scope.pm.name };

  await WorkspaceMember.updateOne({ _id: scope.clientMember._id }, { $set: { status: 'removed' } });

  await interactionService.answerInteraction(interaction, { clientVisibleResponse: 'Answer after removal.' }, adminActor);

  const notification = await Notification.findOne({ relatedInteraction: interaction._id, type: 'query_answered' });
  assert.equal(notification, null);
});

test('requestClarification and cancelInteraction each create their own client notification type', async () => {
  const scope = await seedCaseWithClient();
  const adminActor = { type: 'admin_user', id: scope.pm._id, name: scope.pm.name };

  const interaction1 = await seedCaseInteraction(scope, SYSTEM_ACTOR);
  await interactionService.requestClarification(interaction1, { clientVisibleQuestion: 'Need more info.' }, adminActor);
  assert.ok(await Notification.findOne({ relatedInteraction: interaction1._id, type: 'query_clarification_requested' }));

  const interaction2 = await seedCaseInteraction(scope, SYSTEM_ACTOR);
  await interactionService.cancelInteraction(interaction2, { reason: 'no longer needed' }, adminActor);
  assert.ok(await Notification.findOne({ relatedInteraction: interaction2._id, type: 'query_cancelled' }));
});

test('addClientFollowUp notifies the assigned employee with a real recipientAdmin id', async () => {
  const scope = await seedCaseWithClient();
  const adminActor = { type: 'admin_user', id: scope.pm._id, name: scope.pm.name };
  const interaction = await seedCaseInteraction(scope, SYSTEM_ACTOR);
  await interactionService.assignInteraction(interaction, String(scope.pm._id), adminActor);

  const clientActor = { type: 'client', id: scope.client._id, name: 'Test Client' };
  await interactionService.addClientFollowUp(interaction, 'One more thing', clientActor);

  const notification = await Notification.findOne({ relatedInteraction: interaction._id, type: 'query_client_follow_up' });
  assert.ok(notification);
  assert.equal(String(notification.recipientAdmin), String(scope.pm._id));
});

async function seedCategory(caseDoc, workspace) {
  return DocumentCategory.create({
    case: caseDoc._id,
    workspace: workspace._id,
    name: 'Identity Documents',
    slug: `identity-documents-${Math.random().toString(36).slice(2)}`,
    order: 1,
    visibility: 'client_visible',
    allowedUploaderTypes: 'both',
  });
}

test('createDocumentRequest and cancelDocumentRequest each create their own client notification type', async () => {
  const scope = await seedCaseWithClient();
  const category = await seedCategory(scope.caseDoc, scope.workspace);
  const adminActor = { type: 'admin_user', id: scope.pm._id, name: scope.pm.name };

  const created = await documentRequestService.createDocumentRequest({
    caseId: scope.caseDoc._id,
    workspaceId: scope.workspace._id,
    categoryId: category._id,
    title: 'Passport copy',
    instructions: '',
    requestedFromMemberId: scope.clientMember._id,
    requestedByAdminId: scope.pm._id,
    actor: adminActor,
  });
  assert.equal(created.outcome, 'created');
  assert.ok(await Notification.findOne({ relatedDocumentRequest: created.request._id, type: 'document_requested' }));

  await documentRequestService.cancelDocumentRequest({ requestId: created.request._id, actor: adminActor });
  assert.ok(await Notification.findOne({ relatedDocumentRequest: created.request._id, type: 'document_request_cancelled' }));
});

async function seedClientUploadedDocument(scope, category) {
  return CaseDocument.create({
    case: scope.caseDoc._id,
    workspace: scope.workspace._id,
    category: category._id,
    uploadedByType: 'client',
    uploadedByClient: scope.client._id,
    originalName: 'passport.pdf',
    displayName: 'Passport',
    storageKey: `test/${Math.random().toString(36).slice(2)}`,
    mimeType: 'application/pdf',
    detectedMimeType: 'application/pdf',
    extension: '.pdf',
    size: 1024,
    checksum: 'x'.repeat(64),
    visibility: 'client_visible',
    status: 'uploaded',
  });
}

test('reviewDocument(accepted) creates a document_accepted notification for the uploading client', async () => {
  const scope = await seedCaseWithClient();
  const category = await seedCategory(scope.caseDoc, scope.workspace);
  const document = await seedClientUploadedDocument(scope, category);
  const adminActor = { type: 'admin_user', id: scope.pm._id, name: scope.pm.name };

  await reviewDocument({ documentId: document._id, decision: 'accepted', actor: adminActor });

  const notification = await Notification.findOne({ relatedDocument: document._id, type: 'document_accepted' });
  assert.ok(notification);
  assert.equal(String(notification.recipientClient), String(scope.client._id));
});

test('reviewDocument(needs_replacement) creates a document_replacement_requested notification for the client', async () => {
  const scope = await seedCaseWithClient();
  const category = await seedCategory(scope.caseDoc, scope.workspace);
  const document = await seedClientUploadedDocument(scope, category);
  const adminActor = { type: 'admin_user', id: scope.pm._id, name: scope.pm.name };

  await reviewDocument({ documentId: document._id, decision: 'needs_replacement', clientVisibleReviewComment: 'Please rescan.', actor: adminActor });

  assert.ok(await Notification.findOne({ relatedDocument: document._id, type: 'document_replacement_requested' }));
});

async function seedChannel(scope) {
  return WorkspaceChannel.create({
    workspace: scope.workspace._id,
    case: scope.caseDoc._id,
    name: 'General',
    slug: `general-${Math.random().toString(36).slice(2)}`,
    order: 1,
    channelType: 'standard',
    visibility: 'clients_and_team',
  });
}

test('an employee mentioning a client creates an in-app notification for that client (not just an email)', async () => {
  const scope = await seedCaseWithClient();
  const channel = await seedChannel(scope);

  const result = await createMessage({
    channel,
    senderType: 'employee',
    senderAdminId: scope.pm._id,
    senderDisplayName: scope.pm.name,
    body: 'Hello, mentioning you.',
    mentionWorkspaceMemberIds: [String(scope.clientMember._id)],
  });
  assert.equal(result.outcome, 'created');

  const notification = await Notification.findOne({ relatedChannel: channel._id, type: 'message_mention' });
  assert.ok(notification);
  assert.equal(String(notification.recipientClient), String(scope.client._id));
});

test('an employee replying to a CLIENT-authored message notifies that client (Cycle 6 left this un-notified; Cycle 7 closes it)', async () => {
  const scope = await seedCaseWithClient();
  const channel = await seedChannel(scope);

  const clientMessage = await WorkspaceMessage.create({
    workspace: scope.workspace._id,
    case: scope.caseDoc._id,
    channel: channel._id,
    senderType: 'client',
    senderClient: scope.client._id,
    senderDisplayName: 'Test Client',
    body: 'Original client message',
  });

  const result = await createMessage({
    channel,
    senderType: 'employee',
    senderAdminId: scope.pm._id,
    senderDisplayName: scope.pm.name,
    body: 'Replying to your message',
    parentMessageId: String(clientMessage._id),
  });
  assert.equal(result.outcome, 'created');

  const notification = await Notification.findOne({ relatedChannel: channel._id, type: 'message_reply' });
  assert.ok(notification);
  assert.equal(String(notification.recipientClient), String(scope.client._id));
});
