import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startTestDb, stopTestDb, clearCollections } from './helpers/testDb';
import { ClientUser } from '../src/lib/models/ClientUser';
import { ClientCase } from '../src/lib/models/ClientCase';
import { CaseWorkspace } from '../src/lib/models/CaseWorkspace';
import { WorkspaceMember } from '../src/lib/models/WorkspaceMember';
import { DocumentCategory } from '../src/lib/models/DocumentCategory';
import { DocumentRequest } from '../src/lib/models/DocumentRequest';
import { CaseSmartForm } from '../src/lib/models/CaseSmartForm';
import { WorkspaceChannel } from '../src/lib/models/WorkspaceChannel';
import { WorkspaceMessage } from '../src/lib/models/WorkspaceMessage';
import { listClientActions } from '../src/lib/dashboard/client-actions';
before(startTestDb); after(stopTestDb); beforeEach(clearCollections);

test('client next actions contain only assigned requests, safe form notes and readable conversations, and revoke immediately', async () => {
  const client = await ClientUser.create({ email: 'actions@ih.test', normalizedEmail: 'actions@ih.test', status: 'active' });
  const c = await ClientCase.create({ caseNumber: 'IH-2026-ACTION', title: 'My case', caseType: 'other', primaryClient: client._id });
  const ws = await CaseWorkspace.create({ case: c._id, workspaceType: 'primary', name: 'Primary' });
  const member = await WorkspaceMember.create({ workspace: ws._id, memberType: 'client', clientUser: client._id, workspaceRole: 'client', status: 'active' });
  const category = await DocumentCategory.create({ case: c._id, workspace: ws._id, name: 'Identity', slug: 'identity', order: 1, visibility: 'client_visible', allowedUploaderTypes: 'both' });
  await DocumentRequest.create({ case: c._id, workspace: ws._id, category: category._id, title: 'Passport', requestedFrom: member._id, instructions: 'All pages', internalComment: 'SECRET REQUEST' });
  await DocumentRequest.create({ case: c._id, workspace: ws._id, category: category._id, title: 'Other participant', requestedFrom: new mongoose.Types.ObjectId() });
  await CaseSmartForm.create({ case: c._id, workspace: ws._id, template: new mongoose.Types.ObjectId(), templateKey: 'qa', templateVersion: 1, templateTitleSnapshot: 'Personal information', status: 'needs_changes', clientReviewNote: 'Check your birth date', internalReviewNote: 'SECRET FORM', answers: { staff_identity_notes: 'SECRET ANSWER' } });
  for (const [slug, visibility] of [['public', 'clients_and_team'], ['private', 'employees_only'], ['restricted', 'restricted_members']] as const) {
    const channel = await WorkspaceChannel.create({ case: c._id, workspace: ws._id, name: slug, slug, order: 1, visibility, channelType: 'standard' });
    await WorkspaceMessage.create({ case: c._id, workspace: ws._id, channel: channel._id, senderType: 'system', senderDisplayName: 'Team', body: `Message in ${slug}`, clientVisible: visibility === 'clients_and_team' });
  }
  const actions = await listClientActions(String(client._id));
  assert.equal(actions.length, 3);
  assert.ok(actions.some(action => action.label === 'Upload Passport'));
  assert.ok(actions.some(action => action.detail === 'Check your birth date'));
  assert.ok(actions.some(action => action.label === 'Read 1 new message'));
  assert.doesNotMatch(JSON.stringify(actions), /SECRET|private|restricted|Other participant/);
  await WorkspaceMember.updateOne({ _id: member._id }, { status: 'removed', removedAt: new Date() });
  assert.deepEqual(await listClientActions(String(client._id)), []);
});
