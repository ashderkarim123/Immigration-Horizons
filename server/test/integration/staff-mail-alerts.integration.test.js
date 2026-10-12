/**
 * ADR-030 (alerts and client links): the new-mail watcher, the unread count, and matching a correspondent to a client account
 * or a consultation enquiry. Against the fake Microsoft; never the network.
 */
process.env.LOGIN_RATE_LIMIT = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { staffAgent, seedCase, unique, PASSWORD } = require('../helpers/searchReportFixtures');
const fake = require('../helpers/fakeGraph');
const AdminUser = require('../../models/admin/User');
const ClientUser = require('../../models/ClientUser');
const Consultation = require('../../models/Consultation');
const Notification = require('../../models/admin/Notification');
const watcher = require('../../services/mail/mailWatcher');
const { CAPABILITIES } = require('../../utils/permissions');

const API = '/api/v1/staff/mail';
let app;
let graph;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(async () => { fake.uninstall(); fake.clearConfig(); await stopTestDb(); });
test.beforeEach(async () => { await clearCollections(); fake.useConfig(); graph = fake.install(); });

const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();
const leadEmail = (over = {}) => ({
  subject: 'New Consultation Request - EB-2 NIW - Alex Applicant',
  from: { name: 'Immigration Horizons', address: 'notifications@immigrationhorizons.com' },
  replyTo: [{ name: '', address: 'alex@example.com' }],
  body: { contentType: 'html', content: '<h2>New Free Consultation Request</h2><p>Message: secret details about my case</p>' },
  receivedDateTime: minutesAgo(3), ...over,
});
const seedClient = (email, over = {}) => ClientUser.create({ email, normalizedEmail: email.toLowerCase(), passwordHash: 'x', firstName: 'Alex', lastName: 'Applicant', status: 'active', ...over });

test('the watcher alerts every eligible employee once per new unread message, and nobody else', async () => {
  const { user: pm } = await staffAgent(app, 'pm');
  const { user: admin } = await staffAgent(app, 'admin');
  await staffAgent(app, 'petition_writer');
  await staffAgent(app, 'viewer');
  const gone = await AdminUser.create({ name: 'Gone PM', email: `${unique('gone')}@ih.test`, password: PASSWORD, role: 'pm', isActive: false });
  const consultation = await Consultation.create({ name: 'Alex Applicant', email: 'Alex@Example.com', message: 'hello', service: 'EB-2 NIW' });

  graph.add('inbox', { subject: 'Where is my receipt?', from: { name: 'Sam Client', address: 'sam@example.com' }, receivedDateTime: minutesAgo(5) });
  graph.add('inbox', leadEmail());
  graph.add('inbox', { subject: 'Already handled', isRead: true, receivedDateTime: minutesAgo(4) });
  graph.add('inbox', { subject: 'Too old', receivedDateTime: minutesAgo(600) });

  assert.deepEqual(await watcher.checkNewMail({ lookbackMinutes: 60 }), { checked: 2, notified: 4 });
  const mine = await Notification.find({ recipientAdmin: pm._id }).sort({ createdAt: 1 }).lean();
  assert.deepEqual(mine.map((n) => [n.type, n.title]).sort(), [['mail_received', 'New email from Sam Client'], ['new_lead', 'New consultation request']]);
  assert.equal(await Notification.countDocuments({ recipientAdmin: admin._id }), 2);
  assert.equal(await Notification.countDocuments(), 4, 'a writer, a viewer and a deactivated PM get nothing');
  assert.equal(await Notification.countDocuments({ recipientAdmin: gone._id }), 0);

  const lead = mine.find((n) => n.type === 'new_lead');
  assert.equal(String(lead.relatedLead), String(consultation._id), 'matched to the saved consultation, whatever the capitalization');
  assert.match(lead.actionPath, /^\/mail\?message=/);
  assert.equal(lead.message, 'alex@example.com: New Consultation Request - EB-2 NIW - Alex Applicant');
  assert.doesNotMatch(JSON.stringify(mine), /secret details|<h2>/, 'the body is never copied into a notification');

  // overlapping polls, a restart or two processes cannot alert twice
  assert.deepEqual(await watcher.checkNewMail({ lookbackMinutes: 60 }), { checked: 2, notified: 0 });
  graph.add('inbox', { subject: 'A later one', receivedDateTime: minutesAgo(1) });
  assert.deepEqual(await watcher.checkNewMail({ lookbackMinutes: 60 }), { checked: 3, notified: 2 });
});

test('a message read in Outlook before the next poll is not announced, and an empty poll costs nothing', async () => {
  await staffAgent(app, 'pm');
  const m = graph.add('inbox', { subject: 'Quick one', receivedDateTime: minutesAgo(2) });
  graph.state.messages.get(m.id).isRead = true;
  assert.deepEqual(await watcher.checkNewMail({}), { checked: 0, notified: 0 });
  assert.equal(await Notification.countDocuments(), 0);
});

test('alerts reach the employee through the notifications list, linking to the message', async () => {
  const { agent } = await staffAgent(app, 'pm');
  const m = graph.add('inbox', { subject: 'Hello there', from: { name: 'Sam Client', address: 'sam@example.com' }, receivedDateTime: minutesAgo(1) });
  await watcher.checkNewMail({});
  const list = (await agent.get('/api/v1/staff/notifications')).body.data.items;
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].title, list[0].message, list[0].read, list[0].href], ['New email from Sam Client', 'Hello there', false, `/mail?message=${encodeURIComponent(m.id)}`]);
});

test('only the website\'s own enquiry email counts as a consultation: the same subject from outside is just mail', async () => {
  await staffAgent(app, 'pm');
  graph.add('inbox', leadEmail({ from: { name: 'Scammer', address: 'x@evil.example' } }));
  await watcher.checkNewMail({});
  const [note] = await Notification.find().lean();
  assert.equal(note.type, 'mail_received');
  assert.equal(note.relatedLead, null);
});

test('the watcher: describe(), switches and the loop (backoff, no overlap, safe logging)', async () => {
  assert.deepEqual(watcher.describe({ kind: 'contact', subject: 'New Contact Message - Pat', contact: { address: 'p@x.co', name: 'Pat' } }), { type: 'new_lead', title: 'New contact message', text: 'Pat: New Contact Message - Pat' });
  assert.equal(watcher.describe({ kind: 'mail', subject: '', contact: null }).text, '(no subject)');
  assert.equal(watcher.describe({ kind: 'mail', subject: 'x'.repeat(500), contact: { address: 'a@b.co' } }).text.length, 280);

  assert.equal(watcher.isEnabled({ ...fake.ENV }), false, 'off unless asked for');
  assert.equal(watcher.isEnabled({ ...fake.ENV, MAIL_WATCH_ENABLED: 'true' }), true);
  assert.equal(watcher.isEnabled({ MAIL_WATCH_ENABLED: 'true' }), false, 'and only when the mailbox is connected');
  assert.equal(watcher.startFromEnv({}, () => {}), null);
  assert.equal(watcher.intervalFrom({ MAIL_WATCH_INTERVAL_MS: '1000' }), 60000, 'never faster than a minute');
  assert.equal(watcher.intervalFrom({}), 120000);
  assert.deepEqual([watcher.lookbackFrom({ MAIL_WATCH_LOOKBACK_MINUTES: '1' }), watcher.lookbackFrom({}), watcher.lookbackFrom({ MAIL_WATCH_LOOKBACK_MINUTES: '99999' })], [5, 60, 1440]);

  const delays = []; const logs = []; let pending; const results = [{ checked: 2, notified: 2 }, new (class extends Error { constructor() { super('Microsoft secret detail'); this.code = 'refused'; } })(), new Error('boom'), { checked: 0, notified: 0 }];
  const loop = watcher.startLoop({
    run: async () => { const next = results.shift(); if (next instanceof Error) throw next; return next; },
    intervalMs: 60000, maxBackoffMs: 200000, log: (line) => logs.push(line),
    schedule: (fn, ms) => { delays.push(ms); pending = fn; return { unref() {} }; }, cancel: () => {},
  });
  for (let i = 0; i < 4; i += 1) await pending();
  assert.deepEqual(delays, [5000, 60000, 120000, 200000, 60000], 'first check after boot, steady, doubling on failure, capped, and reset on success');
  assert.equal(loop.failures, 0);
  assert.deepEqual(logs, ['[mail-watch] 2 notification(s) for 2 new message(s)', '[mail-watch] check failed (refused); attempt 1', '[mail-watch] check failed (Error); attempt 2']);
  assert.doesNotMatch(logs.join('\n'), /secret detail|boom/);
  loop.stop();
  const count = delays.length;
  await pending();
  assert.equal(delays.length, count, 'a stopped loop schedules nothing');
});

test('unread count: the number beside Mail, for readers only', async () => {
  const { agent } = await staffAgent(app, 'pm');
  graph.add('inbox'); graph.add('inbox'); graph.add('inbox', { isRead: true });
  assert.deepEqual((await agent.get(`${API}/unread`)).body.data, { unread: 2 });
  const { agent: writer } = await staffAgent(app, 'petition_writer');
  assert.equal((await writer.get(`${API}/unread`)).status, 403);
  fake.clearConfig();
  assert.equal((await agent.get(`${API}/unread`)).status, 503);
});

test('a correspondent is matched to their client account and their consultation enquiry, however the address is capitalised', async () => {
  const { agent, user } = await staffAgent(app, 'admin');
  const client = await seedClient('alex@example.com');
  const lead = await Consultation.create({ name: 'Alex Applicant', email: 'ALEX@example.com', message: 'hello', service: 'EB-1A', clientUser: client._id });
  const inbound = graph.add('inbox', { from: { name: 'Alex Applicant', address: 'Alex@Example.com' } });
  graph.add('inbox', { from: { name: 'Stranger', address: 'nobody@example.com' }, receivedDateTime: new Date(Date.now() - 1000).toISOString() });

  const list = (await agent.get(`${API}/messages`)).body.data.items;
  const alex = list.find((i) => i.id === inbound.id);
  assert.deepEqual(alex.contact, { name: 'Alex Applicant', address: 'alex@example.com', client: { id: String(client._id), name: 'Alex Applicant' }, lead: { id: String(lead._id), name: 'Alex Applicant', status: lead.status, service: 'EB-1A', canConvert: true } });
  assert.deepEqual(list.find((i) => i.id !== inbound.id).contact, { name: 'Stranger', address: 'nobody@example.com', client: null, lead: null });
  const detail = (await agent.get(`${API}/messages/${encodeURIComponent(inbound.id)}`)).body.data;
  assert.equal(detail.contact.client.id, String(client._id));
  assert.doesNotMatch(JSON.stringify(list), /passwordHash|normalizedEmail|clientUser/);

  await Consultation.updateOne({ _id: lead._id }, { $set: { convertedCase: (await seedCase('Done', 'IH-DONE')).caseDoc._id } });
  assert.equal((await agent.get(`${API}/messages`)).body.data.items.find((i) => i.id === inbound.id).contact.lead.canConvert, false, 'an enquiry already turned into a case cannot be converted again');
  assert.ok(user);
});

test('a website enquiry is shown as the visitor, not as our own notification address', async () => {
  const { agent } = await staffAgent(app, 'admin');
  const lead = await Consultation.create({ name: 'Alex Applicant', email: 'alex@example.com', message: 'hello', service: 'EB-2 NIW' });
  const m = graph.add('inbox', leadEmail());
  const item = (await agent.get(`${API}/messages`)).body.data.items.find((i) => i.id === m.id);
  assert.equal(item.kind, 'consultation');
  assert.deepEqual([item.contact.address, item.contact.lead.id, item.contact.lead.canConvert], ['alex@example.com', String(lead._id), false], 'no client account yet, so no conversion');
  assert.equal(item.from.address, 'notifications@immigrationhorizons.com');
});

test('a sent message concerns whoever it was sent to', async () => {
  const { agent } = await staffAgent(app, 'admin');
  const client = await seedClient('alex@example.com');
  graph.add('sentitems', { subject: 'Your documents', from: { name: 'Immigration Horizons', address: fake.MAILBOX }, to: [{ name: 'Alex', address: 'alex@example.com' }] });
  const sent = (await agent.get(`${API}/messages`).query({ folder: 'sent' })).body.data.items[0];
  assert.deepEqual([sent.contact.address, sent.contact.client.id], ['alex@example.com', String(client._id)]);
});

test('matching never reveals more than the employee could already see: enquiries follow lead scope, clients follow clients.view', async () => {
  const { agent: pm } = await staffAgent(app, 'pm');
  await seedClient('alex@example.com');
  // An enquiry that became a case is visible only to people on that case.
  const otherCase = await seedCase('Another team case', 'IH-OTHER');
  await Consultation.create({ name: 'Alex Applicant', email: 'alex@example.com', message: 'hello', convertedCase: otherCase.caseDoc._id });
  const m = graph.add('inbox', { from: { name: 'Alex', address: 'alex@example.com' } });
  const first = (await pm.get(`${API}/messages`)).body.data.items.find((i) => i.id === m.id);
  assert.equal(first.contact.lead, null, 'an enquiry converted into a case this PM is not on is not shown');
  assert.ok(first.contact.client);

  const original = CAPABILITIES['clients.view'];
  CAPABILITIES['clients.view'] = ['super_admin'];
  try {
    assert.equal((await pm.get(`${API}/messages`)).body.data.items.find((i) => i.id === m.id).contact.client, null);
  } finally { CAPABILITIES['clients.view'] = original; }
});

test('a client\'s emails: everything to or from their address, newest first, for those who may see both mail and clients', async () => {
  const { agent } = await staffAgent(app, 'pm');
  const client = await seedClient('alex@example.com');
  graph.add('inbox', { subject: 'Older', from: { name: 'Alex', address: 'alex@example.com' }, receivedDateTime: minutesAgo(50) });
  graph.add('sentitems', { subject: 'Newer reply', from: { name: 'IH', address: fake.MAILBOX }, to: [{ name: 'Alex', address: 'alex@example.com' }], receivedDateTime: minutesAgo(5) });
  graph.add('inbox', { subject: 'Someone else', from: { name: 'Sam', address: 'sam@example.com' } });
  graph.add('inbox', { subject: 'A draft', folder: 'drafts' });

  const res = await agent.get(`/api/v1/staff/clients/${client._id}/mail`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.items.map((i) => i.subject), ['Newer reply', 'Older']);
  assert.equal(res.body.data.address, 'alex@example.com');
  assert.ok(res.body.data.items.every((i) => i.contact), 'each row shows the other party');
  assert.ok(graph.state.calls.some((c) => (c.search || '').includes('participants')), 'asks Microsoft for the address as a participant');

  assert.equal((await agent.get('/api/v1/staff/clients/507f1f77bcf86cd799439011/mail')).status, 404);
  assert.equal((await agent.get('/api/v1/staff/clients/not-an-id/mail')).status, 404);
  await ClientUser.updateOne({ _id: client._id }, { $set: { status: 'disabled' } });
  assert.equal((await agent.get(`/api/v1/staff/clients/${client._id}/mail`)).status, 404);
  assert.equal((await (await staffAgent(app, 'petition_writer')).agent.get(`/api/v1/staff/clients/${client._id}/mail`)).status, 403);
});

test('an address that could break out of the search expression is never sent to Microsoft', async () => {
  const { agent } = await staffAgent(app, 'pm');
  const client = await seedClient('evil"quote@example.com');
  const res = await agent.get(`/api/v1/staff/clients/${client._id}/mail`);
  assert.deepEqual([res.status, res.body.data.items], [200, []]);
  assert.equal(graph.state.calls.filter((c) => /participants/.test(c.search || '')).length, 0);
});
