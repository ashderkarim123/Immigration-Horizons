/**
 * Gate B (ADR-029): Dashboard, FAQs, Testimonials, Services and SEO through /api/v1/admin — real counts, capability
 * on every mutation, validation, and agreement with the legacy EJS routes on the same collections.
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
const FAQ = require('../../models/admin/FAQ');
const Testimonial = require('../../models/admin/Testimonial');
const Media = require('../../models/admin/Media');
const SEOMeta = require('../../models/admin/SEOMeta');
const SecurityEvent = require('../../models/SecurityEvent');
const { CAPABILITIES } = require('../../utils/permissions');
const servicesList = require('../../utils/services');

const API = '/api/v1/admin';
let app;
test.before(async () => { await startTestDb(); app = createApp(); });
test.after(stopTestDb);
test.beforeEach(clearCollections);

/** Runs `fn` with `capability` taken away from the editor role, proving the route checks it on the server. */
async function withoutCapability(capability, fn) {
  const original = CAPABILITIES[capability];
  CAPABILITIES[capability] = ['super_admin', 'admin'];
  try { await fn(); } finally { CAPABILITIES[capability] = original; }
}

test('dashboard: real counts; what the actor may not see is null, never a fake zero', async () => {
  await BlogPost.create([
    { title: 'A', slug: 'a', excerpt: 'e', content: '<p>c</p>', published: true },
    { title: 'B', slug: 'b', excerpt: 'e', content: '<p>c</p>', published: false },
  ]);
  await FAQ.create([{ question: 'Q1', answer: 'A1' }, { question: 'Q2', answer: 'A2', status: 'draft' }]);
  await Testimonial.create({ name: 'N', review: 'R', status: 'archived' });
  await Media.create({ originalName: 'x.png', filename: 'x.png', url: '/uploads/x.png' });
  await SEOMeta.create({ pageRef: 'home' });

  const editor = await adminAgent(app, 'editor');
  const asEditor = (await editor.agent.get(`${API}/dashboard`)).body.data;
  assert.deepEqual(asEditor.blog, { total: 2, published: 1, drafts: 1 });
  assert.deepEqual(asEditor.faqs, { total: 2, published: 1 });
  assert.deepEqual(asEditor.testimonials, { total: 1, published: 0 });
  assert.deepEqual([asEditor.media.total, asEditor.seo.configuredPages], [1, 1]);
  assert.deepEqual([asEditor.users, asEditor.recentSecurityEvents], [null, null], 'no users.manage / security_events.view');
  assert.equal(asEditor.recentPosts.length, 2);
  assert.ok(asEditor.recentPosts.every((p) => !('content' in p)));
  assert.doesNotMatch(JSON.stringify(asEditor), /case|lead|task/i, 'no case-work metrics');

  const admin = await adminAgent(app, 'admin');
  const asAdmin = (await admin.agent.get(`${API}/dashboard`)).body.data;
  assert.deepEqual(asAdmin.users, { active: 2 });
  assert.ok(asAdmin.recentSecurityEvents.length >= 1);
  assertSafeDto(asAdmin);
});

test('FAQs: full CRUD with capability, validation, service targeting, ordering and filters', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const bad = await agent.post(`${API}/faqs`).send({ question: '', answer: 'x'.repeat(5001), status: 'live', displayOrder: -1, showOnHomepage: 'yes', showOnServicePage: 'not-a-service' });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(fieldErrorsOf(bad)).sort(), ['answer', 'displayOrder', 'question', 'showOnHomepage', 'showOnServicePage', 'status']);

  const created = await agent.post(`${API}/faqs`).send({ question: 'Do you guarantee approval?', answer: 'No. Nobody can.', showOnServicePage: 'eb1a', showOnHomepage: true, displayOrder: 2 });
  assert.equal(created.status, 201);
  const faq = created.body.data;
  assert.deepEqual([faq.category, faq.status, faq.schemaEnabled, faq.showOnServicePage, faq.showOnHomepage], ['General', 'published', true, 'eb1a', true]);
  await agent.post(`${API}/faqs`).send({ question: 'First by order', answer: 'A', category: 'Process', displayOrder: 1, status: 'draft' });

  const list = (await agent.get(`${API}/faqs`)).body.data;
  assert.deepEqual(list.items.map((f) => f.question), ['First by order', 'Do you guarantee approval?']);
  assert.deepEqual(list.categories, ['General', 'Process']);
  assert.deepEqual(list.serviceSlugs, servicesList.map((s) => s.slug), 'targeting offers the real service slugs');
  assert.equal((await agent.get(`${API}/faqs`).query({ status: 'draft' })).body.data.total, 1);
  assert.equal((await agent.get(`${API}/faqs`).query({ category: 'Process' })).body.data.total, 1);
  assert.equal((await agent.get(`${API}/faqs`).query({ search: 'guarantee approval?' })).body.data.total, 1);

  const patched = await agent.patch(`${API}/faqs/${faq.id}`).send({ status: 'draft', schemaEnabled: false, showOnServicePage: '' });
  assert.deepEqual([patched.body.data.status, patched.body.data.schemaEnabled, patched.body.data.showOnServicePage, patched.body.data.question], ['draft', false, '', faq.question]);
  assert.equal((await agent.get(`${API}/faqs/${faq.id}`)).body.data.status, 'draft');

  await withoutCapability('faqs.manage', async () => {
    assert.equal((await agent.post(`${API}/faqs`).send({ question: 'Q', answer: 'A' })).status, 403);
    assert.equal((await agent.patch(`${API}/faqs/${faq.id}`).send({ question: 'Q' })).status, 403);
    assert.equal((await agent.delete(`${API}/faqs/${faq.id}`)).status, 403);
    assert.deepEqual((await agent.get(`${API}/faqs/${faq.id}`)).body.data.actions, { edit: false, delete: false });
  });

  assert.equal((await agent.delete(`${API}/faqs/${faq.id}`)).status, 200);
  assert.equal((await agent.delete(`${API}/faqs/${faq.id}`)).status, 404);
  assert.equal(await FAQ.countDocuments(), 1);
  assert.ok(await SecurityEvent.findOne({ type: 'admin_content_mutated', 'meta.resourceType': 'faq', 'meta.action': 'deleted' }));
});

test('Testimonials: full CRUD; rating and the public verification link are validated', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const bad = await agent.post(`${API}/testimonials`).send({ name: 'X', review: '', rating: 6, verificationUrl: 'javascript:alert(1)', photo: '//evil.example/x.png', status: 'live', featured: 1 });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(fieldErrorsOf(bad)).sort(), ['featured', 'photo', 'rating', 'review', 'status', 'verificationUrl']);
  assert.equal(fieldErrorsOf(await agent.post(`${API}/testimonials`).send({ name: 'X', review: 'R', verificationUrl: '/relative' })).verificationUrl.includes('full http(s) URL'), true);

  const created = await agent.post(`${API}/testimonials`).send({ name: 'Juliet M.', review: 'Organised and timely.', country: 'US', profession: 'Researcher', service: 'EB-1A', rating: 4, photo: '/uploads/j.png', verificationUrl: 'https://www.fiverr.com/x', featured: true, displayOrder: 3 });
  assert.equal(created.status, 201);
  const item = created.body.data;
  assert.deepEqual([item.status, item.rating, item.service, item.featured, item.photo], ['published', 4, 'EB-1A', true, '/uploads/j.png']);

  const archived = await agent.patch(`${API}/testimonials/${item.id}`).send({ status: 'archived', rating: 5 });
  assert.deepEqual([archived.body.data.status, archived.body.data.rating, archived.body.data.name], ['archived', 5, 'Juliet M.']);
  assert.equal((await agent.get(`${API}/testimonials`).query({ status: 'archived' })).body.data.total, 1);
  assert.equal((await agent.get(`${API}/testimonials`).query({ status: 'published' })).body.data.total, 0);
  assert.equal((await agent.get(`${API}/testimonials`).query({ search: 'juliet' })).body.data.total, 1);
  assert.deepEqual((await agent.get(`${API}/testimonials`)).body.data.statuses, ['published', 'draft', 'archived']);

  await withoutCapability('testimonials.manage', async () => {
    assert.equal((await agent.post(`${API}/testimonials`).send({ name: 'N', review: 'R' })).status, 403);
    assert.equal((await agent.delete(`${API}/testimonials/${item.id}`)).status, 403);
  });
  assert.equal((await agent.delete(`${API}/testimonials/${item.id}`)).status, 200);
  assert.equal(await Testimonial.countDocuments(), 0);
});

test('Services: the code-owned catalogue, read-only, each pointing at its SEO record', async () => {
  const { agent } = await adminAgent(app, 'editor');
  const res = await agent.get(`${API}/services`);
  assert.deepEqual(res.body.data.items.map((s) => s.slug), servicesList.map((s) => s.slug));
  const first = res.body.data.items[0];
  assert.deepEqual([first.publicUrl, first.seoPageRef, first.seo.configured], [`https://immigrationhorizons.com/services/${first.slug}`, `service-${first.slug}`, false]);
  for (const method of ['post', 'put', 'patch', 'delete']) assert.equal((await agent[method](`${API}/services`).send({})).status, 404, `${method} is not a route`);

  await agent.put(`${API}/seo/${first.seoPageRef}`).send({ seoTitle: 'EB-2 NIW petition preparation', noindex: true });
  const after = (await agent.get(`${API}/services`)).body.data.items[0].seo;
  assert.deepEqual(after, { configured: true, seoTitle: 'EB-2 NIW petition preparation', hasDescription: false, noindex: true });
  assert.equal((await SEOMeta.findOne({ pageRef: first.seoPageRef })).pageType, 'service');
});

test('SEO: only registered pages can be edited; URLs, robots, slug and schema type are allowlisted', async () => {
  const { agent, user } = await adminAgent(app, 'editor');
  const list = (await agent.get(`${API}/seo`)).body.data;
  assert.ok(list.items.length >= 14 + servicesList.length);
  const home = list.items.find((p) => p.pageRef === 'home');
  assert.deepEqual([home.label, home.configured, home.robots, home.schemaType, home.publicUrl], ['Homepage', false, 'index,follow', 'WebPage', 'https://immigrationhorizons.com/']);
  assert.equal(list.items.find((p) => p.pageRef === '404').publicUrl, null);

  const bad = await agent.put(`${API}/seo/home`).send({ canonicalUrl: 'javascript:alert(1)', ogImage: 'data:image/png;base64,AA', twitterImage: '//evil.example/a.png', robots: 'index, follow, hack', schemaType: 'EvilThing', slug: 'Has Spaces', noindex: 'on', seoTitle: 'x'.repeat(201) });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(fieldErrorsOf(bad)).sort(), ['canonicalUrl', 'noindex', 'ogImage', 'robots', 'schemaType', 'seoTitle', 'slug', 'twitterImage']);
  assert.equal(await SEOMeta.countDocuments(), 0);

  const saved = await agent.put(`${API}/seo/home`).send({ seoTitle: 'Immigration Horizons', metaDescription: 'Petition preparation.', canonicalUrl: 'https://immigrationhorizons.com/', ogImage: '/uploads/og.png', robots: ' NOINDEX , follow ', noindex: true, schemaType: 'Organization' });
  assert.equal(saved.status, 200);
  assert.deepEqual([saved.body.data.robots, saved.body.data.noindex, saved.body.data.schemaType, saved.body.data.configured, saved.body.data.pageType], ['noindex,follow', true, 'Organization', true, 'static']);
  assertSafeDto(saved.body);
  const event = await SecurityEvent.findOne({ type: 'admin_content_mutated', 'meta.resourceType': 'seo_meta' });
  assert.deepEqual([String(event.actorAdmin), event.meta.resourceId, event.meta.action], [String(user._id), 'home', 'created']);

  // an unregistered reference cannot be created, so nothing is orphaned by a typo…
  assert.equal((await agent.put(`${API}/seo/hmoe`).send({ seoTitle: 'typo' })).status, 404);
  assert.equal((await agent.get(`${API}/seo/hmoe`)).status, 404);
  assert.equal(await SEOMeta.countDocuments(), 1);
  // …but a custom record that already exists stays editable, keeping its legacy values.
  await SEOMeta.create({ pageRef: 'legacy-campaign', pageType: 'custom', robots: 'max-snippet:20', schemaType: 'LegacyType' });
  const custom = await agent.put(`${API}/seo/legacy-campaign`).send({ seoTitle: 'Campaign', robots: 'max-snippet:20', schemaType: 'LegacyType' });
  assert.deepEqual([custom.status, custom.body.data.pageType, custom.body.data.robots], [200, 'custom', 'max-snippet:20']);

  await withoutCapability('seo.manage', async () => {
    assert.equal((await agent.put(`${API}/seo/home`).send({ seoTitle: 'x' })).status, 403);
    assert.equal((await agent.get(`${API}/seo/home`)).body.data.actions.edit, false);
  });
});

test('legacy EJS FAQ, Testimonial and SEO forms use the same services and the same validation', async () => {
  const creds = await seedAdminUser({ role: 'editor' });
  const ejs = await loginAs(request.agent(app), creds);

  assert.equal((await ejs.post('/admin/faqs').type('form').send({ question: 'EJS question', answer: 'EJS answer', showOnHomepage: 'on', displayOrder: '4' })).status, 302);
  const faq = await FAQ.findOne({ question: 'EJS question' });
  assert.deepEqual([faq.showOnHomepage, faq.schemaEnabled, faq.displayOrder, faq.status], [true, false, 4, 'published']);
  const badFaq = await ejs.post('/admin/faqs').type('form').send({ question: 'Q', answer: 'A', showOnServicePage: 'nope' });
  assert.match(badFaq.text, /must be one of the listed services/);
  assert.equal((await ejs.post(`/admin/faqs/${faq._id}?_method=PUT`).type('form').send({ question: 'EJS question', answer: 'Edited', status: 'draft' })).status, 302);
  assert.deepEqual([(await FAQ.findById(faq._id)).answer, (await FAQ.findById(faq._id)).status], ['Edited', 'draft']);

  const badTestimonial = await ejs.post('/admin/testimonials').field('name', 'N').field('review', 'R').field('verificationUrl', 'javascript:alert(1)');
  assert.match(badTestimonial.text, /full http\(s\) URL/);
  assert.equal(await Testimonial.countDocuments(), 0);
  assert.equal((await ejs.post('/admin/testimonials').field('name', 'N').field('review', 'R').field('rating', '4')).status, 302);
  assert.equal((await Testimonial.findOne({ name: 'N' })).rating, 4);

  assert.equal((await ejs.post('/admin/seo/about').type('form').send({ seoTitle: 'About us', noindex: 'on' })).status, 302);
  const about = await SEOMeta.findOne({ pageRef: 'about' });
  assert.deepEqual([about.seoTitle, about.noindex, about.robots, about.schemaType], ['About us', true, 'index,follow', 'WebPage']);
  assert.match((await ejs.post('/admin/seo/about').type('form').send({ canonicalUrl: 'javascript:alert(1)' })).text, /Canonical URL must be/);
  assert.equal((await ejs.post('/admin/seo/not-a-page').type('form').send({ seoTitle: 'x' })).headers.location, '/admin/seo');
  assert.equal(await SEOMeta.countDocuments({ pageRef: 'not-a-page' }), 0);

  // The Admin API reads exactly what the EJS console wrote.
  const { agent } = await adminAgent(app, 'admin');
  assert.equal((await agent.get(`${API}/seo/about`)).body.data.seoTitle, 'About us');
  assert.equal((await agent.get(`${API}/faqs/${faq._id}`)).body.data.answer, 'Edited');
});
