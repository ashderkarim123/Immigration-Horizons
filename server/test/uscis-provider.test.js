/**
 * USCIS Case Status provider adapter (ADR-026). No network, no credentials: transport is a fake fetch.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createTorchProvider, ProviderError, readConfig } = require('../services/uscis/torchProvider');
const { categoryForTitle, toPlainText } = require('../services/uscis/statusCatalog');
const C = require('../utils/uscisConstants');

const RECEIPT = 'IOE1234567890';
const SECRET = 'super-secret-value';
const TOKEN = 'tok-abc-123';

const config = (over = {}) => ({
  enabled: true,
  environment: 'sandbox',
  clientId: 'client-id-1',
  clientSecret: SECRET,
  oauthUrl: 'https://oauth.example.test/accesstoken',
  baseUrl: 'https://api.example.test/case-status',
  timeoutMs: 40,
  maxTps: 1000,
  ...over,
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const tokenOk = (value = TOKEN, expires = 3600) => json(200, { access_token: value, expires_in: String(expires), token_type: 'Bearer' });
const caseStatus = (over = {}) =>
  json(200, {
    case_status: {
      receiptNumber: RECEIPT,
      formType: 'I-140',
      submittedDate: '2026-01-05',
      modifiedDate: '2026-02-10T12:00:00Z',
      current_case_status_text_en: 'Case Was Received',
      current_case_status_desc_en: 'On February 10, 2026, we received your <b>I-140</b>.<br/>Keep this notice.<script>alert(1)</script>',
      ...over,
    },
  });

/** Scripted transport: routes by URL, records every call. */
function transport(handlers) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const handler = String(url).startsWith('https://oauth.') ? handlers.oauth : handlers.status;
    const next = typeof handler === 'function' ? handler(calls.filter((c) => c.url === String(url)).length) : handler;
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls, oauthCalls: () => calls.filter((c) => c.url.startsWith('https://oauth.')), statusCalls: () => calls.filter((c) => c.url.includes('/case-status/')) };
}

const make = (handlers, over = {}, clock = { t: 1_000_000 }) => {
  const t = transport(handlers);
  const provider = createTorchProvider({ config: config(over), fetchImpl: t.fetchImpl, now: () => clock.t, sleep: async () => {} });
  return { provider, ...t, clock };
};

test('receipts: normalized without correcting characters; provider shape is stricter than manual', () => {
  assert.equal(C.normalizeReceipt('  ioe-123 4567 890 '), 'IOE1234567890');
  assert.equal(C.normalizeReceipt('   '), null);
  assert.equal(C.normalizeReceipt(null), null);
  assert.equal(C.normalizeReceipt('IOE123456789O'), 'IOE123456789O', 'O is never turned into 0');
  assert.ok(C.isProviderReceipt('IOE1234567890'));
  for (const bad of ['IOE123456789', 'IO1234567890', 'IOE12345678901', 'IOE123456789O', '']) assert.equal(C.isProviderReceipt(bad), false, bad);
  assert.ok(C.isManualReceipt('MSC99XX12') && !C.isManualReceipt('AB1') && !C.isManualReceipt('has space'));
  assert.equal(C.maskReceipt(RECEIPT), 'IOE••••••7890');
});

test('plain text: tags, scripts, entities and control characters never survive; length is bounded', () => {
  assert.equal(toPlainText('<p>One</p><p>Two &amp; three</p>', 100), 'One Two & three');
  assert.equal(toPlainText('a<script>alert(1)</script>b', 100), 'a b');
  assert.equal(toPlainText('&lt;img src=x onerror=alert(1)&gt;', 100), 'img src=x onerror=alert(1)', 'decoded markup loses its brackets');
  assert.equal(toPlainText('<<b>script>x', 100).includes('<'), false);
  assert.equal(toPlainText('x\u0000y\u0007z', 100), 'x y z');
  assert.equal(toPlainText('&#60;b&#62;hi', 100), 'bhi');
  const long = toPlainText('word '.repeat(1000), 50);
  assert.ok(long.length <= 50 && long.endsWith('…'));
  assert.equal(toPlainText(null, 10), '');
});

test('catalog: exact official titles map conservatively; everything else is other', () => {
  assert.equal(categoryForTitle('Case Was Received'), 'received');
  assert.equal(categoryForTitle("Response To USCIS' Request For Evidence Was Received"), 'response_received');
  assert.equal(categoryForTitle('  case was approved. '), 'approved');
  assert.equal(categoryForTitle('Case Was Approved And Probably Will Be Granted'), 'other');
  assert.equal(categoryForTitle('Some Brand New Notice'), 'other');
  assert.equal(categoryForTitle(''), 'other');
});

test('config: status() reveals only operational facts, never a url, id, secret or token', async () => {
  const { provider } = make({ oauth: tokenOk(), status: caseStatus() });
  assert.deepEqual(provider.status(), { configured: true, enabled: true, environment: 'sandbox' });
  await provider.getStatus(RECEIPT);
  const serialized = JSON.stringify(provider.status());
  for (const secret of [SECRET, TOKEN, 'client-id-1', 'example.test']) assert.ok(!serialized.includes(secret));

  assert.equal(createTorchProvider({ config: config({ enabled: false }) }).status().enabled, false);
  assert.equal(createTorchProvider({ config: config({ clientSecret: '' }) }).status().configured, false);
  assert.equal(createTorchProvider({ config: config({ baseUrl: 'http://insecure.test/x' }) }).status().configured, false, 'plain http is never configured');
  const env = readConfig({ USCIS_CASE_STATUS_ENABLED: 'true', USCIS_CASE_STATUS_ENV: 'production', USCIS_CASE_STATUS_MAX_TPS: '' });
  assert.deepEqual([env.enabled, env.environment, env.maxTps], [true, 'production', 2]);
  assert.equal(readConfig({}).enabled, false);
});

test('a disabled or unconfigured provider never sends a request', async () => {
  const t = transport({ oauth: tokenOk(), status: caseStatus() });
  const provider = createTorchProvider({ config: config({ enabled: false }), fetchImpl: t.fetchImpl });
  await assert.rejects(provider.getStatus(RECEIPT), (e) => e.code === 'provider_unavailable');
  assert.equal(t.calls.length, 0);
});

test('success: client-credentials token, bearer on the case request, normalized observation, plain-text description', async () => {
  const { provider, oauthCalls, statusCalls } = make({ oauth: tokenOk(), status: caseStatus() });
  const obs = await provider.getStatus(RECEIPT);

  const oauth = oauthCalls()[0];
  assert.equal(oauth.init.method, 'POST');
  const form = new URLSearchParams(oauth.init.body);
  assert.deepEqual([form.get('grant_type'), form.get('client_id'), form.get('client_secret')], ['client_credentials', 'client-id-1', SECRET]);

  const call = statusCalls()[0];
  assert.equal(call.url, `https://api.example.test/case-status/${RECEIPT}`);
  assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(call.init.redirect, 'error', 'a redirect can never carry the token to another host');

  assert.equal(obs.receiptNumber, RECEIPT);
  assert.equal(obs.formType, 'I-140');
  assert.equal(obs.current.title, 'Case Was Received');
  assert.equal(obs.current.description, 'On February 10, 2026, we received your I-140. Keep this notice.');
  assert.equal(obs.providerModifiedAt.toISOString(), '2026-02-10T12:00:00.000Z');
  assert.match(obs.providerFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(obs).includes('<'), false);
});

test('token: cached across calls, shared between concurrent callers, refreshed before expiry', async () => {
  const clock = { t: 1_000_000 };
  const { provider, oauthCalls } = make({ oauth: (n) => tokenOk(`tok-${n}`, 300), status: () => caseStatus() }, {}, clock);

  await Promise.all([provider.getStatus(RECEIPT), provider.getStatus(RECEIPT), provider.getStatus(RECEIPT)]);
  assert.equal(oauthCalls().length, 1, 'concurrent callers share one token request');
  await provider.getStatus(RECEIPT);
  assert.equal(oauthCalls().length, 1, 'cached');

  clock.t += 250_000; // inside the 60s early-refresh window of a 300s token
  await provider.getStatus(RECEIPT);
  assert.equal(oauthCalls().length, 2, 'refreshed shortly before expiry');
});

test('401 from the case endpoint: exactly one fresh token and one retry, never a loop', async () => {
  const recovered = make({ oauth: (n) => tokenOk(`tok-${n}`), status: (n) => (n === 1 ? json(401, {}) : caseStatus()) });
  const obs = await recovered.provider.getStatus(RECEIPT);
  assert.equal(obs.current.title, 'Case Was Received');
  assert.equal(recovered.oauthCalls().length, 2);
  assert.equal(recovered.statusCalls().length, 2);
  assert.equal(recovered.statusCalls()[1].init.headers.Authorization, 'Bearer tok-2');

  const stuck = make({ oauth: () => tokenOk(), status: () => json(401, {}) });
  await assert.rejects(stuck.provider.getStatus(RECEIPT), (e) => e.code === 'provider_auth_failed');
  assert.equal(stuck.statusCalls().length, 2, 'one retry only');
  assert.equal(stuck.oauthCalls().length, 2);
});

test('every provider failure maps to a safe code', async () => {
  const cases = [
    [{ oauth: tokenOk(), status: json(404, {}) }, 'provider_receipt_not_found'],
    [{ oauth: tokenOk(), status: json(429, {}) }, 'provider_rate_limited'],
    [{ oauth: tokenOk(), status: json(500, {}) }, 'provider_unavailable'],
    [{ oauth: tokenOk(), status: json(503, {}) }, 'provider_unavailable'],
    [{ oauth: tokenOk(), status: json(403, {}) }, 'provider_auth_failed'],
    [{ oauth: tokenOk(), status: json(400, {}) }, 'provider_bad_response'],
    [{ oauth: tokenOk(), status: new Response('<html>not json</html>', { status: 200 }) }, 'provider_bad_response'],
    [{ oauth: tokenOk(), status: json(200, { something: 'else' }) }, 'provider_bad_response'],
    [{ oauth: tokenOk(), status: json(200, { case_status: { receiptNumber: 'LIN9999999999', current_case_status_text_en: 'Case Was Received' } }) }, 'provider_bad_response'],
    [{ oauth: tokenOk(), status: json(200, { case_status: { receiptNumber: RECEIPT } }) }, 'provider_bad_response'],
    [{ oauth: tokenOk(), status: new Error('socket hang up') }, 'provider_unavailable'],
    [{ oauth: json(401, {}), status: caseStatus() }, 'provider_auth_failed'],
    [{ oauth: json(429, {}), status: caseStatus() }, 'provider_rate_limited'],
    [{ oauth: json(502, {}), status: caseStatus() }, 'provider_unavailable'],
    [{ oauth: json(200, { nope: true }), status: caseStatus() }, 'provider_bad_response'],
  ];
  for (const [handlers, code] of cases) {
    const { provider } = make(handlers);
    await assert.rejects(provider.getStatus(RECEIPT), (e) => e instanceof ProviderError && e.code === code, code);
  }
});

test('a timeout aborts the request and is reported as unavailable', async () => {
  const fetchImpl = (url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const provider = createTorchProvider({ config: config({ timeoutMs: 20 }), fetchImpl, now: () => 1, sleep: async () => {} });
  await assert.rejects(provider.getStatus(RECEIPT), (e) => e.code === 'provider_unavailable');
});

test('errors never carry the token, secret, client id or url', async () => {
  for (const handlers of [{ oauth: tokenOk(), status: json(500, { token: TOKEN }) }, { oauth: json(401, { secret: SECRET }), status: caseStatus() }]) {
    const { provider } = make(handlers);
    const err = await provider.getStatus(RECEIPT).catch((e) => e);
    const dump = `${err.message} ${err.stack} ${JSON.stringify(err)}`;
    for (const secret of [SECRET, TOKEN, 'client-id-1', 'example.test']) assert.ok(!dump.includes(secret), `leaked ${secret}`);
  }
});

test('the process-wide gate refuses rather than queueing forever when the line is too long', async () => {
  // frozen clock + 1 TPS: each request claims the next 1s slot, so a burst quickly exceeds the 3s wait cap
  const { provider } = make({ oauth: tokenOk(), status: () => caseStatus() }, { maxTps: 1 });
  const results = [];
  for (let i = 0; i < 6; i += 1) results.push(await provider.getStatus(RECEIPT).then(() => 'ok', (e) => e.code));
  assert.ok(results.includes('provider_rate_limited'), JSON.stringify(results));
  assert.equal(results[0], 'ok');
});

test('history: bounded, plain-text, undated entries dropped, oldest first', async () => {
  const history = [
    { date: '2026-03-01', completed_text_en: 'Case Was Approved' },
    { date: '2026-01-05', completed_text_en: 'Case Was Received', completed_desc_en: '<i>Filed</i>' },
    { date: 'not a date', completed_text_en: 'Broken' },
    { completed_text_en: 'No date' },
  ];
  const { provider } = make({ oauth: tokenOk(), status: caseStatus({ hist_case_status: history }) });
  const obs = await provider.getStatus(RECEIPT);
  assert.deepEqual(obs.history.map((h) => [h.occurredAt.toISOString().slice(0, 10), h.title, h.description]), [
    ['2026-01-05', 'Case Was Received', 'Filed'],
    ['2026-03-01', 'Case Was Approved', ''],
  ]);

  const many = Array.from({ length: 200 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, completed_text_en: `Step ${i}` }));
  const big = make({ oauth: tokenOk(), status: caseStatus({ hist_case_status: many }) });
  assert.ok((await big.provider.getStatus(RECEIPT)).history.length <= 50);
});

test('the same observation always has the same fingerprint; a changed one does not', async () => {
  const a = await make({ oauth: tokenOk(), status: caseStatus() }).provider.getStatus(RECEIPT);
  const b = await make({ oauth: tokenOk(), status: caseStatus() }).provider.getStatus(RECEIPT);
  const c = await make({ oauth: tokenOk(), status: caseStatus({ current_case_status_text_en: 'Case Was Approved' }) }).provider.getStatus(RECEIPT);
  assert.equal(a.providerFingerprint, b.providerFingerprint);
  assert.notEqual(a.providerFingerprint, c.providerFingerprint);
});

test('sandbox verification script: refuses production and unconfigured providers, passes a healthy sandbox, and prints no secret', async () => {
  const { verify } = require('../scripts/verifyUscisSandbox');
  const run = async (provider, receipt = RECEIPT) => {
    const lines = [];
    const result = await verify({ provider, receipt, log: (l) => lines.push(l) });
    return { result, out: lines.join('\n') };
  };

  const production = await run(createTorchProvider({ config: config({ environment: 'production' }), fetchImpl: transport({ oauth: tokenOk(), status: caseStatus() }).fetchImpl }));
  assert.deepEqual(production.result, { ok: false, reason: 'not_sandbox' });
  assert.deepEqual((await run(createTorchProvider({ config: config({ enabled: false }) }))).result, { ok: false, reason: 'not_configured' });
  const sandbox = () => {
    let k = 0;
    return make({ oauth: () => tokenOk(), status: () => (++k === 1 ? caseStatus() : json(404, {})) }).provider;
  };
  assert.deepEqual((await run(sandbox(), 'nope')).result, { ok: false, reason: 'bad_receipt' });

  const good = await run(sandbox());
  assert.equal(good.result.ok, true, good.out);
  assert.match(good.out, /\[1\/2\] OAuth token exchange and case-status request: OK for IOE••••••7890/);
  assert.match(good.out, /\[2\/2\] OK: intentional bad receipt was handled as provider_receipt_not_found/);
  for (const secret of [SECRET, TOKEN, 'client-id-1', 'example.test', RECEIPT]) assert.ok(!good.out.includes(secret), `printed ${secret}`);

  const failing = await run(make({ oauth: json(401, {}), status: caseStatus() }).provider);
  assert.equal(failing.result.ok, false);
  assert.match(failing.out, /FAILED: provider_auth_failed \(HTTP 401\)/);
});
