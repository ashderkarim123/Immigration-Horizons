/** Operator-only Google OAuth and read-only SEO reports. Never imported by the website. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import 'dotenv/config';

export const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/tagmanager.readonly',
];
export const REDIRECT_URI = 'http://127.0.0.1:8765/oauth/callback';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function authorizationUrl(clientId, state, verifier) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: REDIRECT_URI,
    response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent',
    state, code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256' }).toString();
  return url.toString();
}

export function validState(actual, expected) {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual), expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

export async function googleRequest(url, accessToken, body, fetcher = fetch) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['www.googleapis.com', 'analyticsadmin.googleapis.com',
    'analyticsdata.googleapis.com', 'tagmanager.googleapis.com'].includes(parsed.hostname)) {
    throw new Error('Unsupported Google API host');
  }
  const response = await fetcher(url, { method: body ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
  // Deliberately exclude response bodies and request headers from errors.
  if (!response.ok) throw new Error(`Google API ${response.status} (${parsed.hostname}${parsed.pathname}). Check API enablement and account permissions.`);
  return response.json();
}

export async function paginate(url, key, accessToken, fetcher = fetch) {
  const entries = [];
  const seen = new Set();
  for (;;) {
    const data = await googleRequest(url, accessToken, undefined, fetcher);
    entries.push(...(data[key] ?? []));
    if (!data.nextPageToken) return entries;
    if (seen.has(data.nextPageToken)) throw new Error('Google API repeated a page token');
    seen.add(data.nextPageToken);
    const next = new URL(url);
    next.searchParams.set('pageToken', data.nextPageToken);
    url = next.toString();
  }
}

async function privateJson(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await chmod(path, 0o600);
}

async function credentials() {
  if (!process.env.GOOGLE_OAUTH_CLIENT_FILE) throw new Error('Set GOOGLE_OAUTH_CLIENT_FILE to the private OAuth JSON file outside the repository.');
  const json = JSON.parse(await readFile(process.env.GOOGLE_OAUTH_CLIENT_FILE, 'utf8'));
  const client = json.web;
  if (!client?.client_id || !client.client_secret) throw new Error('A web OAuth client JSON is required.');
  return client;
}

async function tokenRequest(fields) {
  const response = await fetch(TOKEN_URL, { method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Google OAuth ${response.status}. Check the registered redirect URI, consent screen, approved account and token expiry.`);
  return response.json();
}

function tokenPath() {
  if (!process.env.GOOGLE_OAUTH_TOKEN_FILE) throw new Error('Set GOOGLE_OAUTH_TOKEN_FILE to a private path outside the repository.');
  return process.env.GOOGLE_OAUTH_TOKEN_FILE;
}

async function authorize() {
  const client = await credentials();
  const output = tokenPath();
  const state = randomBytes(32).toString('hex');
  const verifier = randomBytes(48).toString('base64url');
  await new Promise((complete, reject) => {
    let claimed = false;
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, REDIRECT_URI);
      if (url.pathname !== '/oauth/callback') { response.writeHead(404).end(); return; }
      if (!validState(url.searchParams.get('state'), state) || claimed) {
        response.writeHead(400).end('Invalid authorization state.'); return;
      }
      claimed = true;
      try {
        const code = url.searchParams.get('code');
        if (!code || url.searchParams.has('error')) throw new Error('Google authorization was not completed.');
        const token = await tokenRequest({ client_id: client.client_id, client_secret: client.client_secret,
          redirect_uri: REDIRECT_URI, grant_type: 'authorization_code', code, code_verifier: verifier });
        if (!token.refresh_token) throw new Error('Google returned no refresh token. Revoke this app grant and authorize again.');
        await privateJson(output, { refresh_token: token.refresh_token, scope: token.scope });
        response.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Google reporting access connected. You may close this tab.');
        clearTimeout(timer); server.close(); complete();
      } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Authorization failed. Check the terminal.');
        clearTimeout(timer); server.close(); reject(error);
      }
    });
    const timer = setTimeout(() => { server.close(); reject(new Error('Authorization timed out after five minutes.')); }, 300000);
    server.on('error', (error) => { clearTimeout(timer); reject(new Error(`Local OAuth listener failed (${error.code}).`)); });
    server.listen(8765, '127.0.0.1', () => {
      console.log('Open this URL in a browser on THIS computer, then choose the Google account owning the website properties:');
      console.log(authorizationUrl(client.client_id, state, verifier));
    });
  });
  console.log('Authorization saved privately. Run npm run seo:google -- discover next.');
}

async function accessToken() {
  const client = await credentials();
  const saved = JSON.parse(await readFile(tokenPath(), 'utf8'));
  if (!saved.refresh_token) throw new Error('Run authorize first.');
  const token = await tokenRequest({ client_id: client.client_id, client_secret: client.client_secret,
    refresh_token: saved.refresh_token, grant_type: 'refresh_token' });
  if (!token.access_token) throw new Error('Google returned no access token.');
  return token.access_token;
}

async function discover(token) {
  const result = {};
  // Independent products remain useful if one API has not been enabled.
  for (const [name, read] of [
    ['searchConsole', () => googleRequest('https://www.googleapis.com/webmasters/v3/sites', token)],
    ['analytics', async () => {
      const accounts = await paginate('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', 'accountSummaries', token);
      for (const account of accounts) {
        for (const property of account.propertySummaries ?? []) {
          try {
            property.dataStreams = await paginate(`https://analyticsadmin.googleapis.com/v1beta/${property.property}/dataStreams`, 'dataStreams', token);
          } catch (error) { property.dataStreams = { error: error.message }; }
        }
      }
      return accounts;
    }],
    ['tagManager', async () => {
      const accounts = await paginate('https://tagmanager.googleapis.com/tagmanager/v2/accounts', 'account', token);
      const rows = [];
      for (const account of accounts) {
        const containers = await paginate(`https://tagmanager.googleapis.com/tagmanager/v2/${account.path}/containers`, 'container', token);
        for (const container of containers.filter((c) => c.publicId === 'GTM-M9KC3GDW')) {
          try {
            const live = await googleRequest(`https://tagmanager.googleapis.com/tagmanager/v2/${container.path}/versions:live`, token);
            container.live = { version: live.containerVersionId,
              tags: (live.tag ?? []).map(({ name, type, firingTriggerId }) => ({ name, type, firingTriggerId })),
              triggers: (live.trigger ?? []).map(({ name, type, triggerId }) => ({ name, type, triggerId })) };
          } catch (error) { container.live = { error: error.message }; }
        }
        rows.push({ account: account.name, containers });
      }
      return rows;
    }],
  ]) {
    try { result[name] = await read(); } catch (error) { result[name] = { error: error.message }; }
  }
  await privateJson('validation/google-properties.json', result);
  console.log('Property discovery saved: validation/google-properties.json. Select the existing properties; do not create duplicates.');
}

export function gaReportBody(startDate, endDate) {
  return { dateRanges: [{ startDate, endDate }], dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'engagedSessions' }],
    dimensionFilter: { andGroup: { expressions: [
      { filter: { fieldName: 'hostName', stringFilter: { matchType: 'EXACT', value: 'immigrationhorizons.com' } } },
      { filter: { fieldName: 'pagePath', stringFilter: { matchType: 'FULL_REGEXP',
        value: '/|/(services|blog)(/[^/?]+)?/?|/(about|contact|consultation|reviews|faqs|resources|privacy|terms)/?' } } },
    ] } }, limit: '10000' };
}

async function report(token) {
  const end = new Date(Date.now() - 3 * 86400000);
  const start = new Date(end.getTime() - 27 * 86400000);
  const endDate = end.toISOString().slice(0, 10), startDate = start.toISOString().slice(0, 10);
  const site = process.env.GOOGLE_SEARCH_CONSOLE_SITE;
  const property = process.env.GOOGLE_GA4_PROPERTY_ID;
  if (!['sc-domain:immigrationhorizons.com', 'https://immigrationhorizons.com/'].includes(site)) {
    throw new Error('Set GOOGLE_SEARCH_CONSOLE_SITE to the exact verified Immigration Horizons property from discovery.');
  }
  if (!/^\d+$/.test(property ?? '')) throw new Error('Set GOOGLE_GA4_PROPERTY_ID to the numeric GA4 property ID, not the G- measurement ID.');
  const result = { generatedAt: new Date().toISOString(), startDate, endDate, searchConsoleSite: site, ga4PropertyId: property };
  for (const [name, read] of [
    ['searchConsole', async () => {
      const rows = [];
      for (let startRow = 0; startRow < 100000; startRow += 25000) {
        const data = await googleRequest(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, token,
          { startDate, endDate, dimensions: ['query', 'page'], type: 'web', dataState: 'final', rowLimit: 25000, startRow,
            dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'includingRegex', expression: '^https://immigrationhorizons\\.com(?:/|$)' }] }] });
        rows.push(...(data.rows ?? []));
        if ((data.rows?.length ?? 0) < 25000) return { rows, rowCap: 100000, capped: false };
      }
      return { rows, rowCap: 100000, capped: true };
    }],
    ['ga4', () => googleRequest(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, token, gaReportBody(startDate, endDate))],
    ['ga4Channels', () => googleRequest(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, token,
      { ...gaReportBody(startDate, endDate), dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSourceMedium' }] })],
    ['ga4Events', () => googleRequest(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, token,
      { ...gaReportBody(startDate, endDate), dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }] })],
  ]) {
    try { result[name] = await read(); } catch (error) { result[name] = { error: error.message }; }
  }
  await privateJson('validation/google-seo-report.json', result);
  console.log('28-day report saved: validation/google-seo-report.json (ending three days ago). API failures are recorded explicitly. Search Console returns top rows and may omit anonymized queries; GA4 is public-host-only.');
}

async function main() {
  const command = process.argv[2];
  if (command === 'authorize') return authorize();
  if (!['discover', 'report'].includes(command)) {
    console.log('Usage: npm run seo:google -- authorize|discover|report'); return;
  }
  const token = await accessToken();
  if (command === 'discover') return discover(token);
  return report(token);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
