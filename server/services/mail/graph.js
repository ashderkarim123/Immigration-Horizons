/**
 * Microsoft Graph client for the shared Outlook mailbox (ADR-030).
 *
 * The server signs in as an APPLICATION (client-credentials), so staff never handle a mailbox password and MFA on the
 * mailbox is irrelevant. Only one mailbox is ever addressed: the one named in MS_GRAPH_MAILBOX. No caller can name another.
 *
 * Nothing here loads .env (server.js does that), and nothing logs a token, a secret, an address or a message. Errors are
 * mapped to a small set of codes; Microsoft's response text is not passed on.
 */
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_TIMEOUT_MS = 10000;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const EXPIRY_MARGIN_MS = 60 * 1000;

class MailError extends Error {
  /** @param {'not_configured'|'not_found'|'throttled'|'refused'|'unavailable'|'too_large'} code */
  constructor(code, message) {
    super(message || code);
    this.name = 'MailError';
    this.code = code;
  }
}

function readConfig(env = process.env) {
  const tenantId = String(env.MS_GRAPH_TENANT_ID || '').trim();
  const clientId = String(env.MS_GRAPH_CLIENT_ID || '').trim();
  const clientSecret = String(env.MS_GRAPH_CLIENT_SECRET || '').trim();
  const mailbox = String(env.MS_GRAPH_MAILBOX || '').trim().toLowerCase();
  const configured = !!(tenantId && clientId && clientSecret && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox));
  return { tenantId, clientId, clientSecret, mailbox, configured };
}

let fetchImpl = (...args) => fetch(...args);
let cached = { key: '', token: '', expiresAt: 0 };

/** Test seam: replace the network. Returns nothing; call with no argument to restore. */
function _setFetchForTests(fn) {
  fetchImpl = fn || ((...args) => fetch(...args));
  cached = { key: '', token: '', expiresAt: 0 };
}

async function acquireToken(config, { force = false } = {}) {
  const key = `${config.tenantId}|${config.clientId}|${config.clientSecret}`;
  if (!force && cached.key === key && cached.token && Date.now() < cached.expiresAt - EXPIRY_MARGIN_MS) return cached.token;

  let response;
  try {
    response = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }).toString(),
      signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
    });
  } catch (error) {
    console.error('[mail] token request failed:', error && error.name);
    throw new MailError('unavailable');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    // The error CODE (e.g. invalid_client for an expired secret) is safe and useful; the description is not passed on.
    console.error('[mail] token request refused:', response.status, data.error || 'unknown');
    throw new MailError(response.status >= 500 ? 'unavailable' : 'refused');
  }
  cached = { key, token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cached.token;
}

const mailboxPath = (config) => `/users/${encodeURIComponent(config.mailbox)}`;

function mapStatus(status) {
  if (status === 404 || status === 410) return new MailError('not_found');
  if (status === 429) return new MailError('throttled');
  if (status === 401 || status === 403) return new MailError('refused');
  return new MailError('unavailable');
}

/**
 * One Graph call against the configured mailbox. `path` is relative to the mailbox (e.g. `/messages/{id}`).
 * Returns parsed JSON, or a Buffer with `raw: true`, or null for an empty 2xx.
 */
async function call(path, { method = 'GET', query, body, raw = false, env } = {}) {
  const config = readConfig(env);
  if (!config.configured) throw new MailError('not_configured');

  const url = new URL(`${GRAPH_BASE}${mailboxPath(config)}${path}`);
  for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));

  const attempt = async (force) => {
    const token = await acquireToken(config, { force });
    try {
      return await fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          // Ids that survive a move between folders (a sent draft keeps its id), so a stored link never goes stale.
          Prefer: 'IdType="ImmutableId", outlook.body-content-type="html"',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      console.error('[mail] graph request failed:', error && error.name);
      throw new MailError('unavailable');
    }
  };

  let response = await attempt(false);
  if (response.status === 401) response = await attempt(true); // the cached token was revoked or expired early
  if (!response.ok) {
    console.error('[mail] graph refused:', method, response.status);
    throw mapStatus(response.status);
  }
  if (response.status === 204 || response.status === 202) return null;
  if (raw) {
    const declared = Number(response.headers.get('content-length'));
    if (declared > MAX_DOWNLOAD_BYTES) throw new MailError('too_large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_DOWNLOAD_BYTES) throw new MailError('too_large');
    return buffer;
  }
  return response.json().catch(() => null);
}

module.exports = { call, readConfig, MailError, MAX_DOWNLOAD_BYTES, _setFetchForTests };
