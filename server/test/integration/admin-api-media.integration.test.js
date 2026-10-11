/**
 * Gate B (ADR-029): Media Library through /api/v1/admin/media — the unchanged upload policy answering in JSON,
 * multipart CSRF, safe DTOs (a public URL, never a filesystem path), alt text, and delete consistency.
 */
const { plantSecrets, assertSafeDto, adminAgent, fieldErrorsOf } = require('../helpers/adminApi');
plantSecrets();

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');

const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs, ADMIN_API_ORIGIN: ORIGIN } = require('../helpers/auth');
const Media = require('../../models/admin/Media');
const SecurityEvent = require('../../models/SecurityEvent');
const mediaService = require('../../services/cms/media');
const { CAPABILITIES } = require('../../utils/permissions');

const API = '/api/v1/admin/media';
const UPLOADS = mediaService.UPLOAD_DIR;
// A valid 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = (name = 'Team Photo 2026.png') => ({ filename: name, contentType: 'image/png' });

let app;
let before;
const onDisk = () => new Set(fs.readdirSync(UPLOADS).filter((name) => name !== '.gitkeep'));
const created = (since = before) => [...onDisk()].filter((name) => !since.has(name));

test.before(async () => { await startTestDb(); app = createApp(); before = onDisk(); });
test.after(async () => {
  for (const name of created()) fs.unlinkSync(path.join(UPLOADS, name)); // leave the real upload directory as it was
  await stopTestDb();
});
test.beforeEach(clearCollections);

test('upload: an allowed image is stored, recorded and returned as a safe DTO with a public URL', async () => {
  const { agent, user } = await adminAgent(app, 'editor', { name: 'Edie Editor' });
  const res = await agent.post(API).field('altText', '  The team at work ').attach('file', PNG, png());
  assert.equal(res.status, 201);
  const dto = res.body.data;
  assertSafeDto(res.body);
  assert.deepEqual(Object.keys(dto).sort(), ['actions', 'altText', 'createdAt', 'folder', 'id', 'mimeType', 'originalName', 'size', 'uploadedBy', 'url']);
  assert.match(dto.url, /^\/uploads\/team-photo-2026-\d+\.png$/, 'sanitized filename, public path only');
  assert.deepEqual([dto.originalName, dto.mimeType, dto.size, dto.altText, dto.folder, dto.uploadedBy], ['Team Photo 2026.png', 'image/png', PNG.length, 'The team at work', '/', 'Edie Editor']);
  assert.ok(fs.existsSync(path.join(UPLOADS, path.basename(dto.url))));

  const served = await request(app).get(dto.url);
  assert.equal(served.status, 200);
  assert.equal(served.headers['cross-origin-resource-policy'], 'cross-origin', 'embeddable by the public site, as before');

  const event = await SecurityEvent.findOne({ type: 'admin_content_mutated', 'meta.resourceType': 'media' });
  assert.deepEqual([String(event.actorAdmin), event.meta.action], [String(user._id), 'uploaded']);
  assert.doesNotMatch(JSON.stringify(event.meta), /Team Photo|\.png/, 'the filename is not audit metadata');
});

test('upload policy is unchanged: no SVG, no HTML, no renamed file, no oversize, no missing file', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const start = onDisk();
  const refused = [
    await agent.post(API).attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), { filename: 'x.svg', contentType: 'image/svg+xml' }),
    await agent.post(API).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.html', contentType: 'text/html' }),
    await agent.post(API).attach('file', Buffer.from('MZ'), { filename: 'x.png', contentType: 'application/octet-stream' }),
    await agent.post(API).attach('file', PNG, { filename: 'x.exe', contentType: 'image/png' }),
  ];
  for (const res of refused) {
    assert.equal(res.status, 422);
    assert.match(fieldErrorsOf(res).file, /Only image files are allowed/);
  }
  const big = await agent.post(API).attach('file', Buffer.alloc(5 * 1024 * 1024 + 1, 1), png('big.png'));
  assert.equal(big.status, 413);
  assert.equal(big.body.error.code, 'file_too_large');
  const none = await agent.post(API).field('altText', 'no file');
  assert.equal(none.status, 422);
  assert.match(fieldErrorsOf(none).file, /Choose an image/);
  const longAlt = await agent.post(API).field('altText', 'x'.repeat(301)).attach('file', PNG, png('alt.png'));
  assert.equal(longAlt.status, 422);

  assert.equal(await Media.countDocuments(), 0);
  assert.deepEqual(created(start), [], 'nothing refused is left on disk');
});

test('multipart CSRF: an upload without the session token or from another origin is refused before anything is written', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const start = onDisk();
  const noToken = await agent.bare.post(API).set('Origin', ORIGIN).attach('file', PNG, png());
  const wrongToken = await agent.bare.post(API).set('Origin', ORIGIN).set('X-CSRF-Token', 'nope').attach('file', PNG, png());
  const crossSite = await agent.bare.post(API).set('Origin', 'https://evil.example').set('X-CSRF-Token', agent.csrfToken).attach('file', PNG, png());
  // The EJS form's hidden field is not the API's channel: a body token alone does not pass.
  const bodyToken = await agent.bare.post(API).set('Origin', ORIGIN).field('_csrf', agent.csrfToken).attach('file', PNG, png());
  for (const res of [noToken, wrongToken, crossSite, bodyToken]) {
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'csrf_invalid');
  }
  assert.equal(await Media.countDocuments(), 0);
  assert.deepEqual(created(start), []);
  assert.equal((await request(app).post(API).set('Origin', ORIGIN).attach('file', PNG, png())).status, 401);
});

test('list, alt text and capability: paged, searchable, filterable; mutations need media.manage', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const a = (await agent.post(API).field('altText', 'Office exterior').attach('file', PNG, png('office.png'))).body.data;
  await agent.post(API).attach('file', PNG, { filename: 'chart.webp', contentType: 'image/webp' });

  const list = (await agent.get(API)).body.data;
  assert.deepEqual([list.total, list.limit, list.folders], [2, 30, ['/']]);
  assertSafeDto(list);
  assert.equal((await agent.get(API).query({ search: 'office' })).body.data.total, 1);
  assert.equal((await agent.get(API).query({ search: 'exterior' })).body.data.total, 1, 'alt text is searched too');
  assert.equal((await agent.get(API).query({ mimeType: 'image/webp' })).body.data.total, 1);
  assert.equal((await agent.get(API).query({ limit: 1 })).body.data.totalPages, 2);
  assert.equal((await agent.get(API).query({ limit: 9999 })).body.data.limit, 60);

  const alt = await agent.patch(`${API}/${a.id}/alt`).send({ altText: 'Our office' });
  assert.equal(alt.body.data.altText, 'Our office');
  assert.equal((await agent.patch(`${API}/${a.id}/alt`).send({ altText: 'x'.repeat(301) })).status, 422);
  assert.equal((await agent.patch(`${API}/507f1f77bcf86cd799439011/alt`).send({ altText: 'x' })).status, 404);

  const original = CAPABILITIES['media.manage'];
  CAPABILITIES['media.manage'] = ['super_admin', 'admin'];
  try {
    assert.equal((await agent.post(API).attach('file', PNG, png('denied.png'))).status, 403);
    assert.equal((await agent.patch(`${API}/${a.id}/alt`).send({ altText: 'no' })).status, 403);
    assert.equal((await agent.delete(`${API}/${a.id}`)).status, 403);
    assert.equal((await agent.get(API)).status, 200);
  } finally { CAPABILITIES['media.manage'] = original; }
  assert.equal(created().some((name) => name.startsWith('denied')), false, 'a denied upload never reaches the disk');
});

test('delete: removes file and record together; a missing file is fine; a failing filesystem keeps the record', async () => {
  const { agent } = await adminAgent(app, 'admin');
  const one = (await agent.post(API).attach('file', PNG, png('one.png'))).body.data;
  const file = path.join(UPLOADS, path.basename(one.url));
  assert.equal((await agent.delete(`${API}/${one.id}`)).status, 200);
  assert.equal(fs.existsSync(file), false);
  assert.equal(await Media.countDocuments(), 0);
  assert.equal((await agent.delete(`${API}/${one.id}`)).status, 404);

  // the file was already removed out-of-band: the record can still be cleaned up
  const two = (await agent.post(API).attach('file', PNG, png('two.png'))).body.data;
  fs.unlinkSync(path.join(UPLOADS, path.basename(two.url)));
  assert.equal((await agent.delete(`${API}/${two.id}`)).status, 200);

  // the filesystem refuses: the record stays, so the library still knows about a file that is still being served
  const three = (await agent.post(API).attach('file', PNG, png('three.png'))).body.data;
  const ctx = { req: null, actor: { actorType: 'system', actorAdminId: null, actorName: 'test' } };
  await assert.rejects(
    mediaService.remove(ctx, three.id, { unlink: async () => { throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' }); } }),
    (error) => error.status === 500 && error.code === 'media_delete_failed' && !/EPERM|uploads/.test(error.message),
  );
  assert.equal(await Media.countDocuments({ _id: three.id }), 1);

  // a stored filename can never walk out of the upload directory
  const outside = path.join(UPLOADS, '..', 'p14-must-survive.txt');
  fs.writeFileSync(outside, 'keep');
  try {
    const evil = await Media.create({ originalName: 'x.png', filename: '../p14-must-survive.txt', url: '/uploads/x.png' });
    await agent.delete(`${API}/${evil._id}`);
    assert.equal(fs.existsSync(outside), true);
  } finally { fs.unlinkSync(outside); }
});

test('legacy EJS upload still works through the same service, and the API lists what it stored', async () => {
  const creds = await seedAdminUser({ role: 'editor', name: 'Legacy Editor' });
  const ejs = await loginAs(request.agent(app), creds);
  const res = await ejs.post('/admin/media/upload').field('altText', 'From EJS').field('_csrf', ejs.csrfToken).attach('file', PNG, png('legacy.png'));
  assert.equal(res.status, 302);
  const doc = await Media.findOne({ altText: 'From EJS' });
  assert.deepEqual([doc.uploadedBy, doc.mimeType, doc.folder], ['Legacy Editor', 'image/png', '/']);

  const { agent } = await adminAgent(app, 'admin');
  assert.equal((await agent.get(API)).body.data.items[0].altText, 'From EJS');
  assert.deepEqual((await ejs.post(`/admin/media/${doc._id}/alt`).send({ altText: 'Edited in EJS' })).body, { ok: true });
  assert.equal((await ejs.post(`/admin/media/${doc._id}?_method=DELETE`)).status, 302);
  assert.equal(await Media.countDocuments(), 0);
});
