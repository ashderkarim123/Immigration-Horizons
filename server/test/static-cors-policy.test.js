const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../app');

/**
 * Regression test for the blog-cover-image bug: helmet's site-wide default
 * `Cross-Origin-Resource-Policy: same-origin` was silently blocking every
 * `<img>` on immigrationhorizons.com that pointed at an uploaded image on
 * admin.immigrationhorizons.com — a different origin. `curl`/supertest see
 * a clean 200 either way, since CORP is enforced by the browser reading the
 * response header, not by the server refusing the request — which is
 * exactly why this needs an assertion on the header itself, not just on
 * status code.
 *
 * No database needed: both routes under test respond without one.
 */

const app = createApp();

test('a static asset (server/public) is served with a cross-origin CORP, so it can be <img>-embedded from immigrationhorizons.com', async () => {
  const res = await request(app).get('/css/admin.css');
  assert.equal(res.status, 200);
  assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin');
});

test('an admin UI page keeps helmet\'s stricter same-origin default — the fix is scoped, not global', async () => {
  const res = await request(app).get('/admin/login');
  assert.equal(res.status, 200);
  assert.equal(res.headers['cross-origin-resource-policy'], 'same-origin');
});
