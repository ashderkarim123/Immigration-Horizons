/**
 * ADR-030: the shared Outlook mailbox through /api/v1/staff/mail, against a fake Microsoft. Capability gates, a mailbox that
 * cannot be redirected, sanitized bodies, safe downloads, validated sends, case links that respect case access, audit
 * without content, and Microsoft errors that never leak.
 */
process.env.LOGIN_RATE_LIMIT = '1000';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { ORIGIN, staffAgent, seedCase } = require('../helpers/searchReportFixtures');
const fake = require('../helpers/fakeGraph');
const MailCaseLink = require('../../models/MailCaseLink');
const SecurityEvent = require('../../models/SecurityEvent');
const { CAPABILITIES } = require('../../utils/permissions');
const { safeMeta } = require('../../services/securityEventViewer');
const integrationStatus = require('../../services/integrationStatus');

const API = '/api/v1/staff/mail';
let app;
let graph;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(async () => { fake.uninstall(); fake.clearConfig(); await stopTestDb(); });
test.beforeEach(async () => { await clearCollections(); fake.useConfig(); graph = fake.install(); });

const post = (agent, url, data) => agent.post(url).set('Origin', ORIGIN).send(data || {});
const del = (agent, url) => agent.delete(url).set('Origin', ORIGIN);
const errorOf = (res) => res.body.error;

test('not connected: status says so and every mailbox call is a clear 503, with nothing sent to Microsoft', async () => {
  fake.clearConfig();
  const { agent } = await staffAgent(app, 'pm');
  assert.deepEqual((await agent.get(`${API}/status`)).body.data, { configured: false, mailbox: null, canSend: true });
  const res = await agent.get(`${API}/messages`);
  assert.deepEqual([res.status, errorOf(res).code], [503, 'mail_not_configured']);
  assert.equal((await post(agent, `${API}/messages`, { to: ['a@b.co'], subject: 's', body: 'b' })).status, 503);
  assert.deepEqual(graph.state.calls, []);
});

test('capabilities: read and send are separate rights, and roles without them are refused on every route', async () => {
  const m = graph.add('inbox');
  for (const role of ['petition_writer', 'reviewer', 'viewer', 'editor', 'evidence_collector']) {
    const { agent } = await staffAgent(app, role);
    for (const res of [await agent.get(`${API}/status`), await agent.get(`${API}/messages`), await agent.get(`${API}/messages/${m.id}`), await post(agent, `${API}/messages`, {}), await post(agent, `${API}/messages/${m.id}/reply`, {}), await post(agent, `${API}/messages/${m.id}/read`, { isRead: true })]) {
      assert.deepEqual([res.status, errorOf(res).code], [403, 'forbidden'], role);
    }
  }
  assert.deepEqual(graph.state.calls, [], 'a refused employee never reaches Microsoft');
  for (const role of ['pm', 'operations_admin', 'admin', 'super_admin']) assert.equal((await (await staffAgent(app, role)).agent.get(`${API}/messages`)).status, 200, role);

  // read-only: take send away and keep view
  const original = CAPABILITIES['mail.send'];
  CAPABILITIES['mail.send'] = ['super_admin'];
  try {
    const { agent } = await staffAgent(app, 'pm');
    assert.deepEqual((await agent.get(`${API}/status`)).body.data.canSend, false);
    assert.equal((await agent.get(`${API}/messages/${m.id}`)).status, 200);
    assert.equal((await post(agent, `${API}/messages`, { to: ['a@b.co'], subject: 's', body: 'b' })).status, 403);
    assert.equal((await post(agent, `${API}/messages/${m.id}/reply`, { body: 'b' })).status, 403);
  } finally { CAPABILITIES['mail.send'] = original; }
});

test('mutations need a trusted origin; a session alone is not enough', async () => {
  const { agent } = await staffAgent(app, 'pm');
  const m = graph.add('inbox');
  for (const res of [await agent.post(`${API}/messages`).send({}), await agent.post(`${API}/messages/${m.id}/reply`).send({}), await agent.post(`${API}/messages/${m.id}/read`).send({ isRead: true }), await agent.post(`${API}/messages/${m.id}/links`).send({})]) assert.equal(res.status, 403);
  assert.equal((await request(app).get(`${API}/messages`)).status, 401);
});

test('list: newest first, paged by hasMore, one token for many calls, and only the configured mailbox is ever addressed', async () => {
  const { agent } = await staffAgent(app, 'pm');
  for (let i = 1; i <= 5; i += 1) graph.add('inbox', { subject: `Message ${i}`, receivedDateTime: new Date(Date.UTC(2026, 9, i)).toISOString() });
  graph.add('sentitems', { subject: 'Sent one' });

  const first = (await agent.get(`${API}/messages`).query({ limit: 2 })).body.data;
  assert.deepEqual(first.items.map((i) => i.subject), ['Message 5', 'Message 4']);
  assert.deepEqual([first.page, first.limit, first.hasMore, first.folder], [1, 2, true, 'inbox']);
  assert.deepEqual(Object.keys(first.items[0]).sort(), ['from', 'hasAttachments', 'id', 'important', 'isRead', 'linkCount', 'preview', 'receivedAt', 'sentAt', 'subject', 'to']);
  const last = (await agent.get(`${API}/messages`).query({ limit: 2, page: 3 })).body.data;
  assert.deepEqual([last.items.map((i) => i.subject), last.hasMore], [['Message 1'], false]);
  assert.deepEqual((await agent.get(`${API}/messages`).query({ folder: 'sent' })).body.data.items.map((i) => i.subject), ['Sent one']);
  assert.equal((await agent.get(`${API}/messages`).query({ folder: 'trash' })).status, 422);
  assert.equal((await agent.get(`${API}/messages`).query({ limit: 100000 })).body.data.limit, 25);

  assert.equal(graph.state.tokens, 1, 'the access token is reused');
  const calls = graph.state.calls.filter((c) => c.path !== 'TOKEN');
  assert.ok(calls.every((c) => c.auth === 'Bearer token-1'));
  assert.ok(calls.every((c) => /ImmutableId/.test(c.prefer)), 'ids that survive a folder move');
  assert.doesNotMatch(JSON.stringify(first), /sentinel/);
});

test('read: bodies are sanitized — no script, style, form, image, handler or javascript link — and links open safely', async () => {
  const { agent } = await staffAgent(app, 'pm');
  const hostile = graph.add('inbox', {
    subject: 'Please read',
    body: { contentType: 'html', content: '<p onclick="steal()">Hello <b>there</b></p><script>window.pwn=1</script><style>p{background:url(//evil)}</style><img src="https://evil.example/pixel.gif"><iframe src="https://evil.example"></iframe><form action="/x"><input name="q"></form><a href="javascript:alert(1)">bad</a> <a href="https://www.uscis.gov/x">good</a><table><tr><td colspan="2">cell</td></tr></table>' },
    attachments: [{ id: 'att-1=', name: 'passport.pdf', contentType: 'application/pdf', bytes: Buffer.from('%PDF') }, { id: 'att-2=', name: 'logo.png', contentType: 'image/png', bytes: Buffer.from('x'), isInline: true }],
    hasAttachments: true,
  });
  const res = await agent.get(`${API}/messages/${encodeURIComponent(hostile.id)}`);
  assert.equal(res.status, 200);
  const dto = res.body.data;
  assert.equal(dto.bodyType, 'html');
  assert.doesNotMatch(dto.body, /<script|<style|<img|<iframe|<form|<input|onclick|javascript:|window\.pwn|evil\.example\/pixel/i);
  assert.match(dto.body, /<b>there<\/b>/);
  assert.match(dto.body, /<a href="https:\/\/www\.uscis\.gov\/x" target="_blank" rel="noopener noreferrer nofollow">good<\/a>/);
  assert.match(dto.body, /<td colspan="2">cell<\/td>/);
  assert.deepEqual(dto.attachments, [{ id: 'att-1=', name: 'passport.pdf', contentType: 'application/pdf', size: 4 }], 'inline images are not listed');
  assert.deepEqual([dto.links, dto.linkCount, dto.hiddenLinkCount], [[], 0, 0]);

  const plain = graph.add('inbox', { body: { contentType: 'text', content: '<b>not html</b>' } });
  assert.deepEqual([(await agent.get(`${API}/messages/${encodeURIComponent(plain.id)}`)).body.data.bodyType, (await agent.get(`${API}/messages/${encodeURIComponent(plain.id)}`)).body.data.body], ['text', '<b>not html</b>']);
});

test('read: unknown, malformed and foreign ids are one 404; marking read/unread works', async () => {
  const { agent } = await staffAgent(app, 'pm');
  const m = graph.add('inbox');
  for (const id of ['nope-not-here=', '../../etc', 'x', 'a b c d e f g h']) assert.equal((await agent.get(`${API}/messages/${encodeURIComponent(id)}`)).status, 404, id);
  assert.equal(graph.state.calls.filter((c) => /etc/.test(c.path)).length, 0, 'a malformed id never reaches Microsoft');

  const read = await post(agent, `${API}/messages/${encodeURIComponent(m.id)}/read`, { isRead: true });
  assert.deepEqual([read.status, read.body.data], [200, { isRead: true }]);
  assert.equal(graph.state.messages.get(m.id).isRead, true);
  assert.equal((await post(agent, `${API}/messages/${encodeURIComponent(m.id)}/read`, { isRead: 'yes' })).status, 422);
});

test('attachments download as an opaque, never-rendered file with a safe name; only real files', async () => {
  const { agent } = await staffAgent(app, 'pm');
  const bytes = Buffer.from('<html><script>alert(1)</script></html>');
  const m = graph.add('inbox', { hasAttachments: true, attachments: [
    { id: 'att-1=', name: 'evil"\r\nname.html', contentType: 'text/html', bytes },
    { id: 'att-2=', name: 'forwarded.eml', contentType: 'message/rfc822', bytes: Buffer.from('x'), item: true },
  ] });
  const res = await agent.get(`${API}/messages/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent('att-1=')}`).buffer(true).parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/octet-stream');
  assert.match(res.headers['content-disposition'], /^attachment; filename="evil___name\.html"; filename\*=UTF-8''/);
  assert.doesNotMatch(res.headers['content-disposition'], /[\r\n]/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.deepEqual(res.body, bytes);
  assert.equal((await agent.get(`${API}/messages/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent('att-2=')}`)).status, 422);
  assert.equal((await agent.get(`${API}/messages/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent('att-9=')}`)).status, 404);
});

test('send: validated per field before anything reaches Microsoft; sent as plain text; audited without addresses or content', async () => {
  const { agent, user } = await staffAgent(app, 'pm');
  const bad = await post(agent, `${API}/messages`, { to: [], subject: ' ', body: '   ' });
  assert.equal(bad.status, 422);
  assert.deepEqual(bad.body.error.fieldErrors.map((e) => e.field).sort(), ['body', 'subject', 'to']);
  for (const payload of [{ to: ['not-an-email'] }, { to: 'a@b.co' }, { to: ['a@b.co'], cc: [5] }, { to: Array.from({ length: 21 }, (_, i) => `u${i}@b.co`) }]) {
    assert.equal((await post(agent, `${API}/messages`, { subject: 's', body: 'b', ...payload })).status, 422);
  }
  assert.equal((await post(agent, `${API}/messages`, { to: ['a@b.co'], subject: 'x'.repeat(256), body: 'b' })).status, 422);
  assert.equal((await post(agent, `${API}/messages`, { to: ['a@b.co'], subject: 's', body: 'x'.repeat(100001) })).status, 422);
  assert.equal(graph.state.calls.filter((c) => c.method === 'POST').length, 0);

  const ok = await post(agent, `${API}/messages`, { to: [' Client@Example.com ', 'client@example.com'], cc: ['boss@example.com'], subject: 'Your \r\nCase', body: '<script>not html</script>\nSecond line' });
  assert.equal(ok.status, 201);
  assert.equal(graph.sent().length, 1);
  const create = graph.state.calls.find((c) => c.method === 'POST' && c.path === '/messages');
  assert.deepEqual(create.body.toRecipients, [{ emailAddress: { address: 'client@example.com' } }], 'trimmed, lowercased, de-duplicated');
  assert.deepEqual(create.body.ccRecipients, [{ emailAddress: { address: 'boss@example.com' } }]);
  assert.equal(create.body.subject, 'Your Case', 'control characters become a space');
  assert.deepEqual(create.body.body, { contentType: 'Text', content: '<script>not html</script>\nSecond line' });

  const event = await SecurityEvent.findOne({ type: 'mail_sent' });
  assert.deepEqual([String(event.actorAdmin), event.surface, event.meta], [String(user._id), 'staff', { kind: 'new', recipientCount: 2, linked: false }]);
  assert.doesNotMatch(JSON.stringify(event), /client@example|boss@example|Your|Second line/);
});

test('send: a message that cannot be sent leaves no draft behind and a generic error', async () => {
  const { agent } = await staffAgent(app, 'pm');
  graph.state.failSend = true;
  const res = await post(agent, `${API}/messages`, { to: ['a@b.co'], subject: 's', body: 'b' });
  assert.deepEqual([res.status, errorOf(res).code], [502, 'mail_unavailable']);
  assert.deepEqual([graph.drafts().length, graph.sent().length], [0, 0]);
  assert.equal(await SecurityEvent.countDocuments({ type: 'mail_sent' }), 0, 'a send that failed is not audited as sent');
});

test('reply and reply-all: the comment goes through Microsoft, validated, and counted in the audit', async () => {
  const { agent } = await staffAgent(app, 'pm');
  const m = graph.add('inbox', { subject: 'Question', to: [{ name: '', address: MAILBOX_ADDRESS }, { name: '', address: 'second@example.com' }], cc: [{ name: '', address: 'third@example.com' }] });
  assert.equal((await post(agent, `${API}/messages/${encodeURIComponent(m.id)}/reply`, { body: '  ' })).status, 422);
  assert.equal(graph.drafts().length, 0);

  assert.equal((await post(agent, `${API}/messages/${encodeURIComponent(m.id)}/reply`, { body: 'Thanks, we will check.' })).status, 201);
  assert.equal((await post(agent, `${API}/messages/${encodeURIComponent(m.id)}/reply`, { body: 'Thanks all.', all: true })).status, 201);
  assert.ok(graph.state.calls.some((c) => /createReply$/.test(c.path) && c.body.comment === 'Thanks, we will check.'));
  assert.ok(graph.state.calls.some((c) => /createReplyAll$/.test(c.path)));
  assert.deepEqual((await SecurityEvent.find({ type: 'mail_sent' }).sort({ createdAt: 1 })).map((e) => [e.meta.kind, e.meta.recipientCount]), [['reply', 1], ['reply_all', 4]]);
  assert.equal((await post(agent, `${API}/messages/${encodeURIComponent('missing-id-1234=')}/reply`, { body: 'x' })).status, 404);
});
const MAILBOX_ADDRESS = fake.MAILBOX;

test('case links: need the employee\'s own access to the case, are idempotent, and are listed only where visible', async () => {
  const a = await seedCase('Case A', 'IH-A');
  const b = await seedCase('Case B', 'IH-B');
  const { agent: pm, user: pmUser } = await staffAgent(app, 'pm', [a.workspace]);
  const { agent: other } = await staffAgent(app, 'pm', [b.workspace]);
  const { agent: admin } = await staffAgent(app, 'admin');
  const m = graph.add('inbox', { subject: 'About the petition' });
  const id = encodeURIComponent(m.id);

  assert.equal((await post(pm, `${API}/messages/${id}/links`, { caseId: String(b.caseDoc._id) })).status, 404, 'a case the employee is not on looks like it does not exist');
  assert.equal((await post(pm, `${API}/messages/${id}/links`, { caseId: 'not-an-id' })).status, 404);
  assert.equal(await MailCaseLink.countDocuments(), 0);
  assert.equal((await post(pm, `${API}/messages/${encodeURIComponent('foreign-id-12345=')}/links`, { caseId: String(a.caseDoc._id) })).status, 404, 'an id that is not in this mailbox cannot be linked');

  const linked = await post(pm, `${API}/messages/${id}/links`, { caseId: String(a.caseDoc._id) });
  assert.equal(linked.status, 201);
  assert.deepEqual([linked.body.data.subject, linked.body.data.from.address, linked.body.data.linkedByName, linked.body.data.caseId], ['About the petition', 'alex@example.com', 'Staff pm', String(a.caseDoc._id)]);
  const again = await post(pm, `${API}/messages/${id}/links`, { caseId: String(a.caseDoc._id) });
  assert.deepEqual([again.status, again.body.data.id], [201, linked.body.data.id]);
  assert.equal(await MailCaseLink.countDocuments(), 1);
  assert.equal(String((await MailCaseLink.findOne()).linkedBy), String(pmUser._id));
  const stored = JSON.stringify(await MailCaseLink.findOne().lean());
  assert.doesNotMatch(stored, /<p>Hi|body/i, 'only a display snapshot is stored');

  assert.equal((await post(admin, `${API}/messages/${id}/links`, { caseId: String(b.caseDoc._id) })).status, 201, 'an org-wide role may link to any case');
  const detailOther = (await other.get(`${API}/messages/${id}`)).body.data;
  assert.deepEqual([detailOther.linkCount, detailOther.links.map((l) => l.caseId), detailOther.hiddenLinkCount], [2, [String(b.caseDoc._id)], 1], 'the case they are not on is counted, not named');
  assert.equal((await pm.get(`${API}/messages`)).body.data.items[0].linkCount, 2);

  assert.deepEqual((await pm.get(`/api/v1/staff/cases/${a.caseDoc._id}/mail`)).body.data.items.map((l) => l.subject), ['About the petition']);
  assert.equal((await pm.get(`/api/v1/staff/cases/${b.caseDoc._id}/mail`)).status, 404);
  assert.equal((await (await staffAgent(app, 'petition_writer', [a.workspace])).agent.get(`/api/v1/staff/cases/${a.caseDoc._id}/mail`)).status, 403);

  assert.equal((await del(other, `${API}/links/${linked.body.data.id}`)).status, 404, 'cannot remove a link on a case you cannot see');
  assert.equal((await del(pm, `${API}/links/${linked.body.data.id}`)).status, 200);
  assert.equal((await del(pm, `${API}/links/${linked.body.data.id}`)).status, 404);
  assert.deepEqual((await SecurityEvent.find({ type: 'mail_case_linked' }).sort({ createdAt: 1 })).map((e) => [e.meta.action, e.meta.caseId]), [['linked', String(a.caseDoc._id)], ['linked', String(b.caseDoc._id)], ['unlinked', String(a.caseDoc._id)]]);
});

test('send with a case: an inaccessible case stops the send; an accessible one links the sent message', async () => {
  const a = await seedCase('Case A', 'IH-A');
  const b = await seedCase('Case B', 'IH-B');
  const { agent } = await staffAgent(app, 'pm', [a.workspace]);
  const payload = { to: ['client@example.com'], subject: 'Update', body: 'Hello' };

  assert.equal((await post(agent, `${API}/messages`, { ...payload, caseId: String(b.caseDoc._id) })).status, 404);
  assert.deepEqual([graph.sent().length, graph.drafts().length, await MailCaseLink.countDocuments()], [0, 0, 0], 'nothing was sent');

  const res = await post(agent, `${API}/messages`, { ...payload, caseId: String(a.caseDoc._id) });
  assert.equal(res.status, 201);
  assert.deepEqual([res.body.data.link.subject, res.body.data.link.caseId], ['Update', String(a.caseDoc._id)]);
  assert.equal((await SecurityEvent.findOne({ type: 'mail_sent' })).meta.linked, true);

  const m = graph.add('inbox', { subject: 'Question' });
  const reply = await post(agent, `${API}/messages/${encodeURIComponent(m.id)}/reply`, { body: 'Answer', caseId: String(a.caseDoc._id) });
  assert.equal(reply.status, 201);
  assert.equal(await MailCaseLink.countDocuments({ case: a.caseDoc._id }), 2);
});

test('Microsoft errors become generic messages: nothing from Microsoft, no secret, no token reaches the browser or the logs', async () => {
  const { agent } = await staffAgent(app, 'pm');
  graph.add('inbox');
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map(String).join(' '));
  try {
    const cases = [[403, 502, 'mail_refused'], [429, 503, 'mail_busy'], [500, 502, 'mail_unavailable'], [404, 404, 'not_found']];
    for (const [microsoft, expectedStatus, code] of cases) {
      graph.state.failNext = microsoft;
      const res = await agent.get(`${API}/messages`);
      assert.deepEqual([res.status, errorOf(res).code], [expectedStatus, code], String(microsoft));
      assert.doesNotMatch(JSON.stringify(res.body), /Microsoft secret detail|AADSTS|sentinel|token-/);
    }
    graph.state.failToken = true;
    fake.useConfig();
    graph.state.tokens = 0;
    require('../../services/mail/graph')._setFetchForTests(undefined); // restore a clean cache, then reinstall
    graph = fake.install();
    graph.state.failToken = true;
    const refused = await agent.get(`${API}/messages`);
    assert.deepEqual([refused.status, errorOf(refused).code], [502, 'mail_refused']);
    assert.doesNotMatch(JSON.stringify(refused.body), /AADSTS|invalid_client|sentinel/);
  } finally { console.error = original; }
  assert.ok(logged.some((line) => /invalid_client/.test(line)), 'the error CODE is logged so an expired secret is diagnosable');
  assert.doesNotMatch(logged.join('\n'), new RegExp(`${fake.SECRET}|AADSTS|Microsoft secret detail|token-\\d|info@immigrationhorizons`));
});

test('a revoked token is replaced once and the call retried', async () => {
  const { agent } = await staffAgent(app, 'pm');
  graph.add('inbox');
  assert.equal((await agent.get(`${API}/messages`)).status, 200);
  graph.state.failNext = 401;
  const res = await agent.get(`${API}/messages`);
  assert.equal(res.status, 200);
  assert.equal(graph.state.tokens, 2);
  assert.ok(graph.state.calls.filter((c) => c.auth === 'Bearer token-2').length >= 1);
});

test('the Admin Console integration status reports whether the mailbox is configured, and nothing else about it', () => {
  assert.deepEqual(integrationStatus.status({}).outlookMail, { configured: false });
  assert.deepEqual(integrationStatus.status({ MS_GRAPH_TENANT_ID: 't', MS_GRAPH_CLIENT_ID: 'c', MS_GRAPH_CLIENT_SECRET: 's' }).outlookMail, { configured: false }, 'all four settings are needed');
  assert.deepEqual(integrationStatus.status({ ...fake.ENV, MS_GRAPH_MAILBOX: 'not-an-address' }).outlookMail, { configured: false });
  const status = integrationStatus.status(fake.ENV);
  assert.deepEqual(status.outlookMail, { configured: true });
  assert.doesNotMatch(JSON.stringify(status), /sentinel|tenant-0000|client-0000|immigrationhorizons\.com/);
});

test('the audit viewer shows only counts and ids for mail events', () => {
  assert.deepEqual(safeMeta('mail_sent', { kind: 'reply', recipientCount: 3, linked: true, subject: 'secret', to: ['a@b.co'] }), { kind: 'reply', recipientCount: 3, linked: true });
  assert.deepEqual(safeMeta('mail_case_linked', { action: 'linked', caseId: 'abc', subject: 'secret' }), { action: 'linked', caseId: 'abc' });
});
