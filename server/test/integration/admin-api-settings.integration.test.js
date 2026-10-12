/**
 * Gate C (ADR-029): Settings and Integration Status through /api/v1/admin — a server-owned allowlist of keys, and a
 * status endpoint that reports configuration as booleans and labels, never as values.
 */
const { plantSecrets, assertSafeDto, adminAgent, fieldErrorsOf, SECRETS } = require('../helpers/adminApi');
plantSecrets();
process.env.USCIS_CASE_STATUS_ENABLED = 'true';
process.env.USCIS_CASE_STATUS_OAUTH_URL = 'https://uscis.example.invalid/oauth';
process.env.USCIS_CASE_STATUS_BASE_URL = 'https://uscis.example.invalid/api';
process.env.PRACTICE_TIME_ZONE = 'America/New_York';
process.env.CALENDAR_REMINDERS_ENABLED = 'false';
process.env.MAIL_TRANSPORT = 'resend';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs } = require('../helpers/auth');
const Setting = require('../../models/admin/Setting');
const SecurityEvent = require('../../models/SecurityEvent');
const integrationStatus = require('../../services/integrationStatus');

const API = '/api/v1/admin';
let app;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(stopTestDb);
test.beforeEach(clearCollections);

test('settings and integration status need settings.manage: an editor is refused by the server', async () => {
  const { agent } = await adminAgent(app, 'editor');
  for (const res of [
    await agent.get(`${API}/settings`),
    await agent.put(`${API}/settings/general`).send({ values: { companyName: 'x' } }),
    await agent.get(`${API}/integration-status`),
  ]) {
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'forbidden');
  }
  assert.equal(await Setting.countDocuments(), 0);
});

test('settings: only registered groups and keys are returned, even when the collection holds others', async () => {
  await Setting.create([
    { group: 'general', key: 'companyName', value: 'Immigration Horizons' },
    { group: 'general', key: '_csrf', value: 'a-token-an-old-form-stored' },
    { group: 'general', key: 'smtpPassword', value: SECRETS.SMTP_PASS },
    { group: 'email', key: 'apiKey', value: SECRETS.RESEND_API_KEY },
    { group: 'general', key: 'phone', value: { nested: 'object' } },
  ]);
  const { agent } = await adminAgent(app, 'admin');
  const res = await agent.get(`${API}/settings`);
  assert.equal(res.status, 200);
  assertSafeDto(res.body);
  const { groups } = res.body.data;
  assert.deepEqual(groups.map((g) => g.group), ['general', 'social', 'analytics', 'seo_defaults', 'contact_form'], 'the unsupported `email` group is not exposed');
  const general = Object.fromEntries(groups[0].fields.map((f) => [f.key, f.value]));
  assert.deepEqual(Object.keys(general), ['companyName', 'phone', 'email', 'whatsapp1', 'whatsapp2', 'address']);
  assert.equal(general.companyName, 'Immigration Horizons');
  assert.equal(general.phone, '', 'a non-string stored value is not passed through');
  assert.doesNotMatch(JSON.stringify(res.body), /_csrf|smtpPassword|apiKey|a-token-an-old-form-stored/);
  assert.deepEqual(Object.keys(groups[0].fields[0]).sort(), ['key', 'label', 'maxLength', 'type', 'value']);
});

test('settings: a save is validated per key and type; unknown keys and groups are refused, never stored', async () => {
  const { agent, user } = await adminAgent(app, 'admin');
  const put = (group, values) => agent.put(`${API}/settings/${group}`).send({ values });

  const unknownKey = await put('general', { companyName: 'IH', adminPassword: 'x', __proto__: 'y' });
  assert.equal(unknownKey.status, 422);
  assert.match(fieldErrorsOf(unknownKey).adminPassword, /not a setting in this group/);
  assert.equal(await Setting.countDocuments(), 0, 'one bad key refuses the whole save');
  assert.equal((await put('email', { apiKey: 'x' })).status, 404);
  assert.equal((await put('nope', {})).status, 404);

  const bad = await put('social', { facebook: 'javascript:alert(1)', instagram: 'not a url', linkedin: 'x'.repeat(400) });
  assert.deepEqual(Object.keys(fieldErrorsOf(bad)).sort(), ['facebook', 'instagram', 'linkedin']);
  assert.match(fieldErrorsOf(await put('general', { email: 'nope' })).email, /valid email/);
  assert.match(fieldErrorsOf(await put('analytics', { ga4Id: 'G-123"><script>alert(1)</script>' })).ga4Id, /only letters, numbers/);
  assert.match(fieldErrorsOf(await put('general', { companyName: { $gt: '' } })).companyName, /must be text/);
  assert.equal(await Setting.countDocuments(), 0);

  const saved = await put('general', { companyName: '  Immigration Horizons ', email: 'Info@ImmigrationHorizons.com' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.group, 'general');
  assert.deepEqual(Object.fromEntries(saved.body.data.fields.map((f) => [f.key, f.value])), { companyName: 'Immigration Horizons', phone: '', email: 'info@immigrationhorizons.com', whatsapp1: '', whatsapp2: '', address: '' });
  assert.equal(await Setting.countDocuments(), 2, 'only the supplied keys are written');
  assert.equal((await put('analytics', { ga4Id: 'G-ABC123XYZ', gtmId: '' })).status, 200);
  assert.equal((await put('seo_defaults', { ogImage: '/uploads/og.png', organizationLogo: 'https://immigrationhorizons.com/logo.png' })).status, 200);

  const event = await SecurityEvent.findOne({ type: 'admin_settings_updated', 'meta.group': 'general' });
  assert.equal(String(event.actorAdmin), String(user._id));
  assert.deepEqual(event.meta, { group: 'general', keys: ['companyName', 'email'] });
  assert.doesNotMatch(JSON.stringify(event), /Immigration Horizons|info@/, 'keys are audited, values are not');
});

test('legacy EJS settings form saves through the same allowlist and no longer stores its own CSRF token', async () => {
  const ejs = await loginAs(request.agent(app), await seedAdminUser({ role: 'admin' }));
  const res = await ejs.post('/admin/settings').type('form').send({ group: 'general', companyName: 'From EJS', phone: '+1 555 0100', _csrf: ejs.csrfToken });
  assert.equal(res.status, 302);
  assert.deepEqual((await Setting.find().sort({ key: 1 }).lean()).map((s) => [s.key, s.value]), [['companyName', 'From EJS'], ['phone', '+1 555 0100']]);

  const { agent } = await adminAgent(app, 'super_admin');
  const general = (await agent.get(`${API}/settings`)).body.data.groups[0];
  assert.equal(general.fields.find((f) => f.key === 'companyName').value, 'From EJS');
});

test('integration status: booleans and labels only — no key, secret, address, URI or path', async () => {
  const { agent } = await adminAgent(app, 'admin');
  const res = await agent.get(`${API}/integration-status`);
  assert.equal(res.status, 200);
  assertSafeDto(res.body);
  const { checkedAt, ...status } = res.body.data;
  assert.ok(!Number.isNaN(Date.parse(checkedAt)));
  assert.deepEqual(status, {
    mongo: { status: 'connected' },
    email: { configured: true, transport: 'resend' },
    googleSheets: { configured: true },
    outlookMail: { configured: false },
    uscisCaseStatus: { configured: true, enabled: true },
    calendar: { practiceTimeZoneConfigured: true, practiceTimeZoneInvalid: false },
    reminders: { enabled: false },
  });
  const flat = JSON.stringify(res.body);
  for (const fragment of ['sentinel', 'gserviceaccount', 'uscis.example.invalid', 'America/New_York', 'mongodb://', 'BEGIN PRIVATE KEY']) assert.ok(!flat.includes(fragment), `must not contain ${fragment}`);
});

test('integration status reflects what is and is not configured', () => {
  const none = integrationStatus.status({});
  assert.deepEqual([none.googleSheets.configured, none.uscisCaseStatus, none.calendar, none.reminders], [false, { configured: false, enabled: false }, { practiceTimeZoneConfigured: false, practiceTimeZoneInvalid: false }, { enabled: false }]);
  const partial = integrationStatus.status({ GOOGLE_SHEET_ID: 'x', USCIS_CASE_STATUS_CLIENT_ID: 'id', USCIS_CASE_STATUS_ENABLED: 'TRUE', PRACTICE_TIME_ZONE: 'Mars/Olympus', CALENDAR_REMINDERS_ENABLED: 'true' });
  assert.equal(partial.googleSheets.configured, false, 'all three Google values are needed');
  assert.deepEqual(partial.uscisCaseStatus, { configured: false, enabled: true });
  assert.deepEqual(partial.calendar, { practiceTimeZoneConfigured: false, practiceTimeZoneInvalid: true });
  assert.deepEqual(partial.reminders, { enabled: true });
});
