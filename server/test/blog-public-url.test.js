const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const TEMPLATE = path.join(__dirname, '..', 'views', 'admin', 'blog', 'index.ejs');

test('the admin blog View action opens the canonical public blog URL', async () => {
  const html = await ejs.renderFile(TEMPLATE, {
    total: 1,
    posts: [{
      _id: '507f1f77bcf86cd799439016',
      title: 'A published post',
      slug: 'a-published-post',
      category: 'Immigration Tips',
      author: 'Immigration Horizons Team',
      published: true,
      createdAt: new Date('2026-09-04'),
    }],
    page: 1,
    totalPages: 1,
    search: '',
    statusFilter: 'all',
    categoryFilter: 'all',
    categories: ['Immigration Tips'],
    csrfToken: 'test-token',
    can: () => true,
    publicSiteUrl: 'https://immigrationhorizons.com/',
  });

  assert.match(html, /href="https:\/\/immigrationhorizons\.com\/blog\/a-published-post"/);
  assert.doesNotMatch(html, /href="\/blog\/a-published-post"/);
});
