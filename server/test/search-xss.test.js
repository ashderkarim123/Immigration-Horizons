const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

/**
 * Regression test for the stored-XSS fix in views/admin/search.ejs
 * (Phase 1.5). Renders the template directly (bypassing the admin layout,
 * which isn't relevant to this vulnerability) with document-shaped fixtures
 * whose fields carry XSS payloads, then asserts the output never contains
 * an unescaped payload and always contains its HTML-escaped form.
 *
 * Uses only `ejs`, already a direct dependency — no new packages added for
 * this isolated patch (see server/package.json).
 */

const TEMPLATE = path.join(__dirname, '..', 'views', 'admin', 'search.ejs');

const PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
];

function baseFixtures() {
  return {
    query: 'test',
    blogs: [],
    leads: [],
    testimonials: [],
    faqs: [],
  };
}

for (const payload of PAYLOADS) {
  test(`lead name/email payload is escaped, not executed: ${payload}`, async () => {
    const data = baseFixtures();
    data.leads = [
      { _id: '507f1f77bcf86cd799439011', name: payload, email: `${payload}@example.com`, status: 'new' },
    ];

    const html = await ejs.renderFile(TEMPLATE, data);

    assert.ok(!html.includes(payload), 'raw payload must not appear unescaped in the rendered HTML');
    assert.ok(!/<script>alert\(1\)<\/script>/.test(html), 'script tag must not survive unescaped');
    assert.ok(!/<img src=x onerror=alert\(1\)>/.test(html), 'img onerror must not survive unescaped');
    assert.ok(!/<svg onload=alert\(1\)>/.test(html), 'svg onload must not survive unescaped');
    // EJS's default escaper HTML-entity-encodes <, >, &, ", ' — confirm the
    // escaped form is present, proving the value was actually rendered
    // (not silently dropped) just made inert.
    assert.ok(html.includes('&lt;'), 'escaped "<" entity must be present in the output');
  });
}

test('blog/testimonial/FAQ fields are also escaped', async () => {
  const payload = '<script>alert(2)</script>';
  const data = baseFixtures();
  data.blogs = [{ _id: '507f1f77bcf86cd799439012', title: payload, published: true }];
  data.testimonials = [{ _id: '507f1f77bcf86cd799439013', name: payload, status: 'published' }];
  data.faqs = [{ _id: '507f1f77bcf86cd799439014', question: payload, category: 'General' }];

  const html = await ejs.renderFile(TEMPLATE, data);

  assert.ok(!html.includes(payload), 'raw payload must not appear unescaped anywhere in the page');
  const scriptTagCount = (html.match(/&lt;script&gt;/g) || []).length;
  assert.equal(scriptTagCount, 3, 'all three occurrences (blog, testimonial, faq) must be escaped');
});

test('normal values still render correctly (no functional regression)', async () => {
  const data = baseFixtures();
  data.leads = [
    { _id: '507f1f77bcf86cd799439015', name: 'Jane Doe', email: 'jane@example.com', status: 'new' },
  ];
  data.blogs = [{ _id: '507f1f77bcf86cd799439016', title: 'How to file an EB-2 NIW petition', published: true }];

  const html = await ejs.renderFile(TEMPLATE, data);

  assert.ok(html.includes('Jane Doe'), 'normal lead name should render as-is');
  assert.ok(html.includes('jane@example.com'), 'normal lead email should render as-is');
  assert.ok(html.includes('href="/admin/leads/507f1f77bcf86cd799439015"'), 'lead detail link should still be generated');
  assert.ok(html.includes('How to file an EB-2 NIW petition'), 'normal blog title should render as-is');
  assert.ok(html.includes('href="/admin/blog/507f1f77bcf86cd799439016/edit"'), 'blog edit link should still be generated');
  assert.ok(html.includes('Published'), 'blog published/draft label should still render');
});

test('empty-state renders when a category has no matches', async () => {
  const html = await ejs.renderFile(TEMPLATE, baseFixtures());
  const emptyStateCount = (html.match(/No matches\./g) || []).length;
  assert.equal(emptyStateCount, 4, 'all four sections (blog/leads/testimonials/faqs) should show the empty state');
});
