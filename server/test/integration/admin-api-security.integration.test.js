/**
 * Gate C (ADR-029): the read-only security log through /api/v1/admin/security-events — capability, filters, bounded
 * paging, an allowlisted DTO that never dumps `meta`, and no way to change or remove an entry.
 */
const { plantSecrets, assertSafeDto, adminAgent, fieldErrorsOf, SECRETS } = require('../helpers/adminApi');
plantSecrets();

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const SecurityEvent = require('../../models/SecurityEvent');
const { safeMeta, maskIp, SAFE_META_KEYS } = require('../../services/securityEventViewer');
const contract = require('../../../docs/architecture/security-event-contract.json');

const API = '/api/v1/admin/security-events';
let app;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(stopTestDb);
test.beforeEach(clearCollections);

const DAY = 86400000;
/** Written through the raw collection so a test can plant the kind of metadata the recorder would have refused. */
async function plant(events) {
  const base = Date.now() - 10 * DAY;
  const docs = events.map((event, index) => ({
    result: 'success', surface: 'admin_cms', actorType: 'admin_user', actorClient: null, actorAdmin: null, actorName: '', subjectEmail: '',
    ip: '203.0.113.77', userAgent: 'TestAgent/1.0', meta: null, createdAt: new Date(base + index * 60000), ...event,
  }));
  await SecurityEvent.collection.insertMany(docs);
  return docs;
}

test('the viewer needs security_events.view: an editor is refused, an admin and a super admin are not', async () => {
  const editor = (await adminAgent(app, 'editor')).agent;
  for (const path of [API, `${API}/507f1f77bcf86cd799439011`]) {
    const res = await editor.get(path);
    assert.deepEqual([res.status, res.body.error.code], [403, 'forbidden']);
  }
  assert.equal((await (await adminAgent(app, 'admin')).agent.get(API)).status, 200);
  assert.equal((await (await adminAgent(app, 'super_admin')).agent.get(API)).status, 200);
});

test('DTO: explicit fields, a masked address, and only the metadata keys registered for that event type', async () => {
  const [planted] = await plant([{
    type: 'login_failed', result: 'failure', subjectEmail: 'target@ih.test', actorName: 'Someone', ip: '198.51.100.24',
    meta: {
      reason: 'bad_password', via: 'admin_api',
      password: 'hunter2', token: 'tok_live_123', authorization: 'Bearer abc', passwordHash: '$2a$12$abcdefghijklmnopqrstuv', requestBody: '{"password":"x"}',
      filePath: 'C:\\srv\\private\\doc.pdf', storageKey: 'private/abc', arbitrary: 'anything a future call site adds', nested: { secret: SECRETS.SESSION_SECRET },
    },
  }]);
  const { agent } = await adminAgent(app, 'admin');
  const list = await agent.get(API).query({ subjectEmail: 'target@ih.test' });
  assert.equal(list.status, 200);
  assertSafeDto(list.body);
  const [dto] = list.body.data.items;
  assert.deepEqual(Object.keys(dto).sort(), ['actorAdmin', 'actorName', 'actorType', 'createdAt', 'id', 'ipMasked', 'meta', 'result', 'subjectEmail', 'surface', 'type']);
  assert.deepEqual(dto.meta, { reason: 'bad_password', via: 'admin_api' });
  assert.equal(dto.ipMasked, '198.51.100.x');
  assert.doesNotMatch(JSON.stringify(list.body), /hunter2|tok_live|Bearer|\$2a\$|requestBody|doc\.pdf|storageKey|arbitrary|198\.51\.100\.24|TestAgent/);

  const one = await agent.get(`${API}/${planted._id}`);
  assert.deepEqual(one.body.data, dto);
  assert.equal((await agent.get(`${API}/not-an-id`)).status, 404);
  assert.equal((await agent.get(`${API}/507f1f77bcf86cd799439011`)).status, 404);
});

test('safe metadata: every contract event type is registered, values are bounded, and addresses are masked', () => {
  for (const type of contract.eventTypes) {
    const keys = SAFE_META_KEYS[type] || ['reason', 'action'];
    for (const forbidden of contract.forbiddenMetaKeys) assert.ok(!keys.map((k) => k.toLowerCase()).includes(forbidden.toLowerCase()), `${type} must not allow ${forbidden}`);
  }
  for (const type of contract.eventTypes.filter((t) => t.startsWith('admin_'))) assert.ok(SAFE_META_KEYS[type], `${type} has an explicit registry entry`);
  assert.deepEqual(safeMeta('admin_settings_updated', { group: 'general', keys: ['a', { deep: 1 }, 'b'], values: { a: 'secret' } }), { group: 'general', keys: ['a', 'b'] });
  assert.deepEqual(safeMeta('some_future_type', { reason: 'x'.repeat(500), other: 'dropped' }), { reason: 'x'.repeat(200) });
  assert.deepEqual(safeMeta('login_failed', null), {});
  assert.deepEqual([maskIp('203.0.113.77'), maskIp('::ffff:203.0.113.77'), maskIp('2001:db8:85a3::8a2e:370:7334'), maskIp(''), maskIp('garbage')], ['203.0.113.x', '203.0.113.x', '2001:db8:85a3:…', '', '']);
});

test('filters: type, result, surface, actor type, actor, subject email and date range — newest first', async () => {
  const { agent, user: admin } = await adminAgent(app, 'admin');
  const docs = await plant([
    { type: 'login_failed', result: 'failure', surface: 'staff', actorType: 'anonymous', subjectEmail: 'a@ih.test' },
    { type: 'login_succeeded', surface: 'portal', actorType: 'client', subjectEmail: 'client@ih.test' },
    { type: 'admin_user_created', actorAdmin: admin._id, actorName: 'Ada', subjectEmail: 'new@ih.test', meta: { action: 'created', role: 'pm' } },
    { type: 'csrf_rejected', result: 'denied', actorType: 'anonymous', meta: { reason: 'bad_token', method: 'POST', path: '/admin/x?token=abc' } },
  ]);
  // The agent's own sign-in is a real event in the same log; leave it out so the assertions read as the planted set.
  const types = async (query) => (await agent.get(API).query(query)).body.data.items.filter((e) => e.subjectEmail !== admin.email).map((e) => e.type);

  assert.deepEqual(await types({}), ['csrf_rejected', 'admin_user_created', 'login_succeeded', 'login_failed'], 'newest first');
  assert.deepEqual(await types({ type: 'login_failed' }), ['login_failed']);
  assert.deepEqual(await types({ result: 'denied' }), ['csrf_rejected']);
  assert.deepEqual(await types({ surface: 'portal' }), ['login_succeeded']);
  assert.deepEqual(await types({ actorType: 'anonymous' }), ['csrf_rejected', 'login_failed']);
  assert.deepEqual(await types({ actorAdminId: String(admin._id), type: 'admin_user_created' }), ['admin_user_created']);
  assert.deepEqual(await types({ subjectEmail: '  A@IH.test ' }), ['login_failed'], 'exact, normalized');
  assert.deepEqual(await types({ subjectEmail: 'a@ih' }), [], 'not a partial search');
  assert.deepEqual(await types({ from: docs[1].createdAt.toISOString(), to: docs[2].createdAt.toISOString() }), ['admin_user_created', 'login_succeeded']);

  const csrf = (await agent.get(API).query({ type: 'csrf_rejected' })).body.data.items[0];
  assert.deepEqual(csrf.meta, { reason: 'bad_token', method: 'POST' }, 'a request path (which can carry a token) is not shown');

  const bad = await agent.get(API).query({ type: 'made_up', result: 'maybe', actorAdminId: 'x', from: 'yesterday', to: 'tomorrow' });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(fieldErrorsOf(bad)).sort(), ['actorAdminId', 'from', 'result', 'to', 'type']);
  assert.match(fieldErrorsOf(await agent.get(API).query({ from: '2026-10-02', to: '2026-10-01' })).to, /before from/);
  assert.match(fieldErrorsOf(await agent.get(API).query({ from: '2024-01-01', to: '2026-10-01' })).to, /at most 400 days/);
});

test('paging is bounded: capped page size, "has more" instead of a count, and no unbounded depth', async () => {
  const { agent } = await adminAgent(app, 'admin');
  await plant(Array.from({ length: 30 }, (_, i) => ({ type: 'logout', subjectEmail: `u${i}@ih.test` })));
  const first = (await agent.get(API).query({ type: 'logout', limit: 10 })).body.data;
  assert.deepEqual([first.items.length, first.page, first.limit, first.hasMore, 'total' in first], [10, 1, 10, true, false]);
  assert.equal(first.items[0].subjectEmail, 'u29@ih.test');
  const last = (await agent.get(API).query({ type: 'logout', limit: 10, page: 3 })).body.data;
  assert.deepEqual([last.items.length, last.hasMore, last.items[9].subjectEmail], [10, false, 'u0@ih.test']);
  assert.equal((await agent.get(API).query({ limit: 100000 })).body.data.limit, 100);
  assert.equal((await agent.get(API).query({})).body.data.limit, 25);
  assert.equal((await agent.get(API).query({ page: 500, limit: 100 })).status, 422);
  assert.deepEqual(Object.keys(first.filters).sort(), ['actorType', 'result', 'surface', 'type']);
  assert.deepEqual(first.filters.type, contract.eventTypes);
});

test('append-only: no route creates, changes, deletes or clears an entry', async () => {
  const { agent } = await adminAgent(app, 'super_admin');
  const [doc] = await plant([{ type: 'logout', subjectEmail: 'keep@ih.test' }]);
  const before = await SecurityEvent.countDocuments({ subjectEmail: 'keep@ih.test' });
  for (const path of [API, `${API}/${doc._id}`, `${API}/clear`]) {
    for (const method of ['post', 'put', 'patch', 'delete']) {
      const res = await agent[method](path).send({ type: 'logout' });
      assert.equal(res.status, 404, `${method.toUpperCase()} ${path}`);
    }
  }
  assert.equal(await SecurityEvent.countDocuments({ subjectEmail: 'keep@ih.test' }), before);
  await assert.rejects(SecurityEvent.deleteMany({}), /append-only/);
});
