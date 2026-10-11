/**
 * Gate B (ADR-029): Blog through /api/v1/admin/blog — capability, validation, slug rules, publish state, the stored-XSS
 * allowlist, paging/literal search, audit, and agreement with both the legacy EJS route and the public read filter.
 */
const { plantSecrets, assertSafeDto, adminAgent, fieldErrorsOf } = require('../helpers/adminApi');
plantSecrets();

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../../app');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const { seedAdminUser, loginAs } = require('../helpers/auth');
const BlogPost = require('../../models/BlogPost');
const SecurityEvent = require('../../models/SecurityEvent');
const { CAPABILITIES } = require('../../utils/permissions');
const blogContract = require('../../../docs/architecture/blog-schema-contract.json');
const { BLOG_HTML_ALLOWED_TAGS, BLOG_HTML_ALLOWED_ATTRIBUTES, BLOG_HTML_ALLOWED_SCHEMES } = require('../../utils/blogHtml');

const API = '/api/v1/admin/blog';
let app;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(stopTestDb);
test.beforeEach(clearCollections);

const post = (over = {}) => ({ title: 'How the NIW prongs fit together', excerpt: 'A short, factual summary.', content: '<p>Body text.</p>', ...over });
/** The exact filter the public site reads with (src/lib/blogs.ts). */
const publiclyVisible = (now = new Date()) => ({ published: true, $or: [{ publishDate: null }, { publishDate: { $lte: now } }] });

test('reads need a session; writes need blog.manage, checked on the server for every mutation', async () => {
  assert.equal((await request(app).get(API)).status, 401);
  const { agent } = await adminAgent(app, 'editor');
  const created = await agent.post(API).send(post());
  assert.equal(created.status, 201);
  const id = created.body.data.id;

  // Take the capability away from the role while the session stays valid: the route itself must refuse.
  const original = CAPABILITIES['blog.manage'];
  CAPABILITIES['blog.manage'] = ['super_admin', 'admin'];
  try {
    for (const res of [
      await agent.post(API).send(post({ title: 'Second' })),
      await agent.patch(`${API}/${id}`).send({ title: 'Changed' }),
      await agent.post(`${API}/${id}/publish`).send({ published: true }),
      await agent.delete(`${API}/${id}`),
    ]) {
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'forbidden');
    }
    const read = await agent.get(`${API}/${id}`);
    assert.equal(read.status, 200, 'reading stays available');
    assert.deepEqual(read.body.data.actions, { edit: false, publish: false, delete: false });
  } finally { CAPABILITIES['blog.manage'] = original; }
  assert.equal((await BlogPost.findById(id)).title, post().title);
});

test('create: a draft by default, slug generated from the title, safe DTO, audited without the content', async () => {
  const { agent, user } = await adminAgent(app, 'admin');
  const res = await agent.post(API).send(post({ tags: [' niw ', 'niw', 'eb-2'], readingTime: 4 }));
  assert.equal(res.status, 201);
  const dto = res.body.data;
  assertSafeDto(res.body);
  assert.equal(dto.slug, 'how-the-niw-prongs-fit-together');
  assert.deepEqual([dto.published, dto.publishDate, dto.previewUrl], [false, null, null], 'omitting `published` never publishes');
  assert.deepEqual(dto.tags, ['niw', 'eb-2']);
  assert.deepEqual([dto.category, dto.author], ['Immigration Tips', 'Immigration Horizons Team']);
  assert.deepEqual(dto.actions, { edit: true, publish: true, delete: true });

  const event = await SecurityEvent.findOne({ type: 'admin_content_mutated' });
  assert.equal(String(event.actorAdmin), String(user._id));
  assert.deepEqual(event.meta, { resourceType: 'blog_post', resourceId: dto.id, action: 'created' });
  assert.doesNotMatch(JSON.stringify(event), /Body text|NIW prongs/);
});

test('create/update: validation is per field, on the server', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const bad = await agent.post(API).send({ title: ' ', excerpt: 'x'.repeat(301), content: '<p></p>', category: 'Gossip', coverImage: 'javascript:alert(1)', tags: 'niw', readingTime: 1.5, published: 'yes', publishDate: 'tomorrow', slug: 'Not A Slug' });
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, 'validation_error');
  assert.deepEqual(Object.keys(fieldErrorsOf(bad)).sort(), ['category', 'content', 'coverImage', 'excerpt', 'publishDate', 'published', 'readingTime', 'slug', 'tags', 'title']);
  assert.equal(await BlogPost.countDocuments(), 0);

  const id = (await agent.post(API).send(post())).body.data.id;
  const patch = await agent.patch(`${API}/${id}`).send({ excerpt: '' });
  assert.equal(patch.status, 422);
  assert.match(fieldErrorsOf(patch).excerpt, /required/);
  assert.equal((await agent.patch(`${API}/not-an-id`).send({ title: 'x' })).status, 404);
  assert.equal((await agent.get(`${API}/507f1f77bcf86cd799439011`)).body.error.code, 'not_found');
});

test('slug: must be URL-safe, a duplicate is a controlled conflict, and a legacy slug can still be re-saved', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const first = await agent.post(API).send(post({ slug: 'niw-prongs' }));
  assert.equal(first.body.data.slug, 'niw-prongs');

  for (const res of [await agent.post(API).send(post({ slug: 'niw-prongs' })), await agent.post(API).send(post({ title: 'NIW prongs!' }))]) {
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'conflict');
    assert.match(fieldErrorsOf(res).slug, /already uses that slug/);
  }
  assert.equal(fieldErrorsOf(await agent.post(API).send(post({ title: '???' }))).slug.startsWith('Enter a slug'), true);

  const other = (await agent.post(API).send(post({ title: 'Another' }))).body.data;
  assert.equal((await agent.patch(`${API}/${other.id}`).send({ slug: 'niw-prongs' })).status, 409);
  assert.equal((await agent.patch(`${API}/${other.id}`).send({ slug: '' })).body.data.slug, 'another', 'a blank slug keeps the current one');

  const legacy = await BlogPost.create({ ...post({ title: 'Legacy' }), slug: 'Legacy_Slug 2019', published: false });
  const resaved = await agent.patch(`${API}/${legacy._id}`).send({ slug: 'Legacy_Slug 2019', title: 'Legacy, retitled' });
  assert.equal(resaved.status, 200);
  assert.equal(resaved.body.data.slug, 'Legacy_Slug 2019');
});

test('publish state: publishing stamps a date and yields a public link; drafts and scheduled posts have none', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const id = (await agent.post(API).send(post())).body.data.id;
  assert.equal(await BlogPost.countDocuments(publiclyVisible()), 0, 'a draft is not public');

  const published = await agent.post(`${API}/${id}/publish`).send({ published: true });
  assert.equal(published.body.data.published, true);
  assert.ok(new Date(published.body.data.publishDate) <= new Date());
  assert.equal(published.body.data.previewUrl, 'https://immigrationhorizons.com/blog/how-the-niw-prongs-fit-together');
  assert.equal(await BlogPost.countDocuments(publiclyVisible()), 1, 'the public filter now finds it');

  const scheduled = await agent.patch(`${API}/${id}`).send({ publishDate: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(scheduled.body.data.previewUrl, null);
  assert.equal(await BlogPost.countDocuments(publiclyVisible()), 0);

  const draft = await agent.post(`${API}/${id}/publish`).send({ published: false });
  assert.deepEqual([draft.body.data.published, draft.body.data.previewUrl], [false, null]);
  assert.equal((await agent.post(`${API}/${id}/publish`).send({})).status, 422);

  const direct = await agent.post(API).send(post({ title: 'Published at once', published: true }));
  assert.ok(direct.body.data.publishDate, 'created as published gets a date');
  for (const field of blogContract.requiredFields) assert.ok((await BlogPost.findById(direct.body.data.id))[field], `public contract field ${field}`);
});

test('stored XSS: scripts, handlers, dangerous URLs, iframes, styles and forms never reach the database', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const hostile = [
    '<h2 onclick="steal()">Heading</h2>',
    '<p style="position:fixed">Para <strong>bold</strong> <em>em</em></p>',
    '<script>alert(1)</script><iframe src="https://evil.example"></iframe><style>body{}</style>',
    '<a href="javascript:alert(1)">bad link</a> <a href="https://www.uscis.gov" target="_blank">good link</a>',
    '<img src="x" onerror="alert(1)"><img src="data:image/svg+xml;base64,AAAA"><img src="/uploads/ok.png" alt="ok">',
    '<form action="/x"><input name="q"><button>go</button></form><object data="x"></object><svg onload="alert(1)"></svg>',
    '<ul><li>one</li></ul><blockquote>quote</blockquote>',
  ].join('');
  const res = await agent.post(API).send(post({ content: hostile }));
  assert.equal(res.status, 201);
  const stored = (await BlogPost.findById(res.body.data.id)).content;
  assert.equal(stored, res.body.data.content, 'what is returned is what was stored');
  assert.doesNotMatch(stored, /<script|<iframe|<style|<form|<input|<button|<object|<svg|onclick|onerror|onload|style=|javascript:|data:/i);
  assert.match(stored, /<h2>Heading<\/h2>/);
  assert.match(stored, /<strong>bold<\/strong>/);
  assert.match(stored, /<a href="https:\/\/www\.uscis\.gov" target="_blank" rel="noopener noreferrer">good link<\/a>/);
  assert.match(stored, /<img src="\/uploads\/ok\.png" alt="ok" \/>/);
  assert.match(stored, /<ul><li>one<\/li><\/ul><blockquote>quote<\/blockquote>/);

  assert.equal((await agent.post(API).send(post({ title: 'Only script', content: '<script>alert(1)</script>' }))).status, 422, 'nothing left after sanitizing is "no content"');
  assert.equal((await agent.patch(`${API}/${res.body.data.id}`).send({ content: '<p onmouseover="x()">edited</p>' })).body.data.content, '<p>edited</p>');
});

test('existing posts are not rewritten: an unrelated edit leaves legacy HTML exactly as stored', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const legacyHtml = '<div class="old"><p>Legacy</p><table><tr><td>cell</td></tr></table></div>';
  const legacy = await BlogPost.create({ ...post({ content: legacyHtml }), slug: 'legacy-html', published: true });
  assert.equal((await agent.patch(`${API}/${legacy._id}`).send({ title: 'Retitled' })).status, 200);
  assert.equal((await BlogPost.findById(legacy._id)).content, legacyHtml);
});

test('the write allowlist is the contract the public renderer also asserts', () => {
  assert.deepEqual(BLOG_HTML_ALLOWED_TAGS, blogContract.allowedHtml.tags);
  assert.deepEqual(BLOG_HTML_ALLOWED_ATTRIBUTES, blogContract.allowedHtml.attributes);
  assert.deepEqual(BLOG_HTML_ALLOWED_SCHEMES, blogContract.allowedHtml.schemes);
});

test('list: server-paged, newest first, filtered by status/category, literal search, and no bodies', async () => {
  const { agent } = await adminAgent(app, 'editor');
  for (let i = 1; i <= 5; i += 1) {
    await BlogPost.create({ ...post({ title: `Post ${i} (a.b)`, excerpt: `Excerpt ${i}` }), slug: `post-${i}`, published: i % 2 === 0, category: i === 5 ? 'EB-1A' : 'EB-2 NIW', createdAt: new Date(2026, 0, i) });
  }
  const page1 = (await agent.get(API).query({ limit: 2 })).body.data;
  assert.deepEqual([page1.total, page1.totalPages, page1.page, page1.limit], [5, 3, 1, 2]);
  assert.deepEqual(page1.items.map((p) => p.slug), ['post-5', 'post-4']);
  assert.ok(page1.items.every((p) => !('content' in p)));
  assert.deepEqual((await agent.get(API).query({ limit: 2, page: 3 })).body.data.items.map((p) => p.slug), ['post-1']);
  assert.equal((await agent.get(API).query({ limit: 100000 })).body.data.limit, 100, 'the page size is capped');

  assert.equal((await agent.get(API).query({ status: 'published' })).body.data.total, 2);
  assert.equal((await agent.get(API).query({ status: 'draft' })).body.data.total, 3);
  assert.equal((await agent.get(API).query({ category: 'EB-1A' })).body.data.total, 1);
  assert.equal((await agent.get(API).query({ search: 'excerpt 3' })).body.data.total, 1);
  assert.equal((await agent.get(API).query({ search: '(a.b)' })).body.data.total, 5, 'punctuation is matched literally');
  assert.equal((await agent.get(API).query({ search: '.*' })).body.data.total, 0, 'a regex is not a regex here');
  assertSafeDto(page1);
});

test('delete removes the post and is audited; deleting again is a 404', async () => {
  const { agent } = await adminAgent(app, 'admin');
  const id = (await agent.post(API).send(post())).body.data.id;
  assert.deepEqual((await agent.delete(`${API}/${id}`)).body.data, { deleted: true });
  assert.equal(await BlogPost.countDocuments(), 0);
  assert.equal((await agent.delete(`${API}/${id}`)).status, 404);
  assert.deepEqual((await SecurityEvent.find({ type: 'admin_content_mutated' }).sort({ createdAt: 1 })).map((e) => e.meta.action), ['created', 'deleted']);
});

test('legacy EJS uses the same rules: sanitized on save, the same conflict, and toggle-publish stamps a date', async () => {
  const creds = await seedAdminUser({ role: 'editor' });
  const ejs = await loginAs(request.agent(app), creds);
  const created = await ejs.post('/admin/blog').field('title', 'EJS post').field('excerpt', 'From the legacy form').field('content', '<p>ok</p><script>alert(1)</script>').field('tags', 'a, b').field('category', 'EB-1A');
  assert.equal(created.status, 302);
  const doc = await BlogPost.findOne({ slug: 'ejs-post' });
  assert.deepEqual([doc.content, doc.published, doc.publishDate, doc.category], ['<p>ok</p>', false, null, 'EB-1A']);
  assert.deepEqual([...doc.tags], ['a', 'b']);

  const dup = await ejs.post('/admin/blog').field('title', 'EJS post').field('excerpt', 'x').field('content', '<p>y</p>');
  assert.equal(dup.status, 200);
  assert.match(dup.text, /already uses that slug/);

  assert.equal((await ejs.post(`/admin/blog/${doc._id}/toggle-publish`)).status, 302);
  const live = await BlogPost.findById(doc._id);
  assert.ok(live.published && live.publishDate);
  assert.equal((await ejs.post(`/admin/blog/${doc._id}?_method=PUT`).field('title', 'EJS post edited').field('excerpt', 'e').field('content', '<p>z</p>').field('category', 'EB-1A').field('published', 'on')).status, 302);
  const edited = await BlogPost.findById(doc._id);
  assert.deepEqual([edited.title, edited.slug, edited.published], ['EJS post edited', 'ejs-post', true]);

  // …and the Admin API sees the post the EJS console wrote: one collection.
  const { agent } = await adminAgent(app, 'admin');
  assert.equal((await agent.get(`${API}/${doc._id}`)).body.data.title, 'EJS post edited');
  assert.equal((await ejs.post(`/admin/blog/${doc._id}?_method=DELETE`)).status, 302);
  assert.equal(await BlogPost.countDocuments(), 0);
});
