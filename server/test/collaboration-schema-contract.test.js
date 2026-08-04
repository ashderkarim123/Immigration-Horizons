const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contract = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../docs/architecture/collaboration-schema-contract.json'), 'utf8'),
);

const WorkspaceChannel = require('../models/WorkspaceChannel');
const ChannelMember = require('../models/ChannelMember');
const WorkspaceMessage = require('../models/WorkspaceMessage');
const MessageRevision = require('../models/MessageRevision');
const ChannelReadState = require('../models/ChannelReadState');
const {
  CHANNEL_TYPES,
  CHANNEL_VISIBILITY,
  CLIENT_ACCESSIBLE_VISIBILITY,
  CHANNEL_MEMBER_STATUSES,
  SENDER_TYPES,
  MESSAGE_TYPES,
  CLIENT_CREATABLE_MESSAGE_TYPES,
  MENTION_MEMBER_TYPES,
  DELETE_ACTOR_TYPES,
  MESSAGE_REVISION_ACTIONS,
  MAX_MESSAGE_BODY_LENGTH,
  MAX_MENTIONS_PER_MESSAGE,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_PAGE_SIZE,
  DEFAULT_CHANNEL_TEMPLATE,
} = require('../utils/collaborationConstants');

test('collection names match the contract', () => {
  assert.equal(WorkspaceChannel.collection.collectionName, contract.collections.WorkspaceChannel);
  assert.equal(ChannelMember.collection.collectionName, contract.collections.ChannelMember);
  assert.equal(WorkspaceMessage.collection.collectionName, contract.collections.WorkspaceMessage);
  assert.equal(MessageRevision.collection.collectionName, contract.collections.MessageRevision);
  assert.equal(ChannelReadState.collection.collectionName, contract.collections.ChannelReadState);
});

test('channel/sender/message enums match the contract', () => {
  assert.deepEqual(CHANNEL_TYPES, contract.channelTypeValues);
  assert.deepEqual(CHANNEL_VISIBILITY, contract.channelVisibilityValues);
  assert.deepEqual(CLIENT_ACCESSIBLE_VISIBILITY, contract.clientAccessibleVisibilityValues);
  assert.deepEqual(CHANNEL_MEMBER_STATUSES, contract.channelMemberStatusValues);
  assert.deepEqual(SENDER_TYPES, contract.senderTypeValues);
  assert.deepEqual(MESSAGE_TYPES, contract.messageTypeValues);
  assert.deepEqual(CLIENT_CREATABLE_MESSAGE_TYPES, contract.clientCreatableMessageTypeValues);
  assert.deepEqual(MENTION_MEMBER_TYPES, contract.mentionMemberTypeValues);
  assert.deepEqual(DELETE_ACTOR_TYPES, contract.deleteActorTypeValues);
  assert.deepEqual(MESSAGE_REVISION_ACTIONS, contract.messageRevisionActionValues);

  assert.deepEqual(WorkspaceChannel.schema.path('channelType').enumValues, contract.channelTypeValues);
  assert.deepEqual(WorkspaceChannel.schema.path('visibility').enumValues, contract.channelVisibilityValues);
  assert.deepEqual(WorkspaceMessage.schema.path('senderType').enumValues, contract.senderTypeValues);
  assert.deepEqual(WorkspaceMessage.schema.path('messageType').enumValues, contract.messageTypeValues);
});

test('message limits match the contract', () => {
  assert.equal(MAX_MESSAGE_BODY_LENGTH, contract.maxMessageBodyLength);
  assert.equal(MAX_MENTIONS_PER_MESSAGE, contract.maxMentionsPerMessage);
  assert.equal(MAX_ATTACHMENTS_PER_MESSAGE, contract.maxAttachmentsPerMessage);
  assert.equal(MAX_MESSAGE_PAGE_SIZE, contract.maxMessagePageSize);
});

test('default channel template keys and order match the contract', () => {
  const keysInOrder = [...DEFAULT_CHANNEL_TEMPLATE].sort((a, b) => a.order - b.order).map((t) => t.templateKey);
  assert.deepEqual(keysInOrder, contract.defaultChannelTemplateKeys);
});

test('required-field sets both apps rely on are present', () => {
  const requiredOnChannel = ['workspace', 'case', 'name', 'slug', 'channelType', 'visibility', 'order'];
  for (const field of requiredOnChannel) {
    assert.ok(WorkspaceChannel.schema.path(field), `WorkspaceChannel.${field} must exist`);
  }
  const requiredOnMember = ['channel', 'workspaceMember'];
  for (const field of requiredOnMember) {
    assert.ok(ChannelMember.schema.path(field), `ChannelMember.${field} must exist`);
  }
  const requiredOnMessage = ['workspace', 'case', 'channel', 'senderType', 'senderDisplayName', 'body'];
  for (const field of requiredOnMessage) {
    assert.ok(WorkspaceMessage.schema.path(field), `WorkspaceMessage.${field} must exist`);
  }
  const requiredOnRevision = ['message', 'revisionNumber', 'action'];
  for (const field of requiredOnRevision) {
    assert.ok(MessageRevision.schema.path(field), `MessageRevision.${field} must exist`);
  }
  const requiredOnReadState = ['workspace', 'channel', 'workspaceMember'];
  for (const field of requiredOnReadState) {
    assert.ok(ChannelReadState.schema.path(field), `ChannelReadState.${field} must exist`);
  }
});
