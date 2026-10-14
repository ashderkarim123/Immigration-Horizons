import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizationUrl, gaReportBody, googleRequest, paginate, REDIRECT_URI, SCOPES, validState } from '../scripts/seo/google.mjs';

test('OAuth requests read-only scopes, offline access, exact callback, state and PKCE without client secret', () => {
  const url = new URL(authorizationUrl('client-id', 'expected-state', 'verifier'));
  assert.equal(url.searchParams.get('redirect_uri'), REDIRECT_URI);
  assert.equal(url.searchParams.get('state'), 'expected-state');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.get('client_secret'), null);
  assert.ok(SCOPES.every((scope) => scope.endsWith('.readonly')));
  assert.ok(validState('correct', 'correct'));
  assert.ok(!validState('wrongxx', 'correct'));
  assert.ok(!validState(null, 'correct'));
  assert.ok(!validState('ééééééé', 'correct'));
});

test('report requests are authenticated and API errors never expose response bodies or tokens', async () => {
  let request;
  await googleRequest('https://analyticsdata.googleapis.com/v1beta/properties/123:runReport', 'secret-token', { metrics: [] },
    async (_url, options) => { request = options; return { ok: true, json: async () => ({ rows: [] }) }; });
  assert.equal(request.headers.Authorization, 'Bearer secret-token');
  assert.equal(request.method, 'POST');
  assert.equal(request.redirect, 'error');
  await assert.rejects(googleRequest('https://example.com/', 'secret-token'), /Unsupported/);
  await assert.rejects(googleRequest('https://www.googleapis.com/webmasters/v3/sites', 'secret-token', undefined,
    async () => ({ ok: false, status: 403, text: async () => 'secret-token' })),
  (error) => error.message.includes('403') && !error.message.includes('secret-token'));
});

test('discovery follows page tokens and detects repeated tokens', async () => {
  const urls = [];
  const rows = await paginate('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', 'accountSummaries', 'token', async (url) => {
    urls.push(url);
    return { ok: true, json: async () => urls.length === 1
      ? { accountSummaries: [1], nextPageToken: 'page-two' } : { accountSummaries: [2] } };
  });
  assert.deepEqual(rows, [1, 2]);
  assert.equal(new URL(urls[1]).searchParams.get('pageToken'), 'page-two');
  await assert.rejects(paginate('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', 'accountSummaries', 'token',
    async () => ({ ok: true, json: async () => ({ nextPageToken: 'repeated' }) })), /repeated/);
});

test('GA4 reports exclude private hosts and paths and never request query strings', () => {
  const body = gaReportBody('2026-09-01', '2026-09-28');
  const filters = body.dimensionFilter.andGroup.expressions;
  assert.equal(filters[0].filter.stringFilter.value, 'immigrationhorizons.com');
  const publicPath = new RegExp(`^(?:${filters[1].filter.stringFilter.value})$`);
  for (const path of ['/', '/services/eb2-niw', '/blog/example', '/contact']) assert.ok(publicPath.test(path));
  for (const path of ['/portal', '/staff/cases/name', '/api/portal', '/contact?email=private']) assert.ok(!publicPath.test(path));
  assert.deepEqual(body.dimensions, [{ name: 'pagePath' }]);
});
