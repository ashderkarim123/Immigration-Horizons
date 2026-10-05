/**
 * Official USCIS Case Status API adapter (ADR-026). Server-only: OAuth 2.0 Client
 * Credentials against the USCIS Torch developer platform, token held in process
 * memory, every outcome mapped to a safe ProviderError code. No scraping, no
 * browser access, no secret or token ever logged or returned.
 *
 * Transport is injected (`fetchImpl`) so CI never needs the network or credentials.
 *
 * ponytail: the response field names below follow USCIS's published Case Status sample and are read
 * tolerantly (`pick`). They have NOT been verified against a live sandbox response; do that with the
 * manual checklist in PHASE_11_USCIS_TRACKING_REPORT.md before relying on history import.
 */
const crypto = require('crypto');

const { LIMITS } = require('../../utils/uscisConstants');
const { toPlainText } = require('./statusCatalog');

const MAX_HISTORY = 50;
const MAX_GATE_WAIT_MS = 3000;
const DEFAULT_MAX_TPS = 2; // far below USCIS's documented limits (sandbox 5, production 10); they can change

class ProviderError extends Error {
  /** @param {'provider_receipt_not_found'|'provider_rate_limited'|'provider_unavailable'|'provider_auth_failed'|'provider_bad_response'} code */
  constructor(code, status = null) {
    super(code);
    this.code = code;
    this.providerStatus = status;
  }
}

function readConfig(env = process.env) {
  const tps = Number(env.USCIS_CASE_STATUS_MAX_TPS);
  return {
    enabled: String(env.USCIS_CASE_STATUS_ENABLED || '').toLowerCase() === 'true',
    environment: env.USCIS_CASE_STATUS_ENV === 'production' ? 'production' : 'sandbox',
    clientId: env.USCIS_CASE_STATUS_CLIENT_ID || '',
    clientSecret: env.USCIS_CASE_STATUS_CLIENT_SECRET || '',
    oauthUrl: env.USCIS_CASE_STATUS_OAUTH_URL || '',
    baseUrl: (env.USCIS_CASE_STATUS_BASE_URL || '').replace(/\/+$/, ''),
    timeoutMs: Number(env.USCIS_CASE_STATUS_TIMEOUT_MS) > 0 ? Number(env.USCIS_CASE_STATUS_TIMEOUT_MS) : 8000,
    maxTps: tps > 0 ? tps : DEFAULT_MAX_TPS,
  };
}

const isHttps = (url) => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

const pick = (obj, ...keys) => {
  for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  return undefined;
};

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/** Raw Case Status body to the one shape the rest of the app sees. Never returns the raw payload. */
function toObservation(body, receipt) {
  const cs = body && typeof body === 'object' ? pick(body, 'case_status', 'caseStatus') : null;
  if (!cs || typeof cs !== 'object') throw new ProviderError('provider_bad_response');

  const returnedReceipt = String(pick(cs, 'receiptNumber', 'receipt_number') || '').toUpperCase().replace(/[\s-]/g, '');
  if (returnedReceipt && returnedReceipt !== receipt) throw new ProviderError('provider_bad_response');

  const title = toPlainText(pick(cs, 'current_case_status_text_en', 'currentCaseStatusTextEn', 'current_case_status_text'), LIMITS.statusTitle);
  if (!title) throw new ProviderError('provider_bad_response');
  const description = toPlainText(pick(cs, 'current_case_status_desc_en', 'currentCaseStatusDescEn', 'current_case_status_desc'), LIMITS.statusDescription);
  const providerModifiedAt = toDate(pick(cs, 'modifiedDate', 'modified_date', 'lastModifiedDate'));

  const rawHistory = pick(cs, 'hist_case_status', 'histCaseStatus', 'history');
  const history = (Array.isArray(rawHistory) ? rawHistory : [])
    .slice(0, MAX_HISTORY)
    .map((h) => ({
      occurredAt: toDate(pick(h, 'date', 'completed_date', 'completedDate')),
      title: toPlainText(pick(h, 'completed_text_en', 'text_en', 'title'), LIMITS.statusTitle),
      description: toPlainText(pick(h, 'completed_desc_en', 'desc_en', 'description'), LIMITS.statusDescription),
    }))
    .filter((h) => h.occurredAt && h.title)
    .sort((a, b) => a.occurredAt - b.occurredAt);

  return {
    receiptNumber: receipt,
    formType: toPlainText(pick(cs, 'formType', 'form_type'), LIMITS.formType),
    submittedAt: toDate(pick(cs, 'submittedDate', 'submitted_date')),
    providerModifiedAt,
    current: { title, description, occurredAt: providerModifiedAt },
    history,
    // Provenance / idempotency: a hash of the observed status, never the payload.
    providerFingerprint: sha256(JSON.stringify([title, description, providerModifiedAt ? providerModifiedAt.toISOString() : null])),
  };
}

/**
 * @param {{config?: ReturnType<typeof readConfig>, fetchImpl?: typeof fetch, now?: () => number, sleep?: (ms:number)=>Promise<void>}} deps
 */
function createTorchProvider({ config = readConfig(), fetchImpl = globalThis.fetch, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const configured = !!(config.clientId && config.clientSecret && isHttps(config.oauthUrl) && isHttps(config.baseUrl));
  let token = null;
  let tokenRequest = null;
  let nextSlot = 0;

  /** Process-wide pacing below the configured TPS; refuses (rather than queues forever) when the line is long. */
  async function gate() {
    const interval = 1000 / config.maxTps;
    const t = now();
    const wait = Math.max(0, nextSlot - t);
    if (wait > MAX_GATE_WAIT_MS) throw new ProviderError('provider_rate_limited');
    nextSlot = Math.max(t, nextSlot) + interval;
    if (wait > 0) await sleep(wait);
  }

  async function http(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      // redirect:'error' so a hostile or misconfigured redirect can never carry the token to another host.
      return await fetchImpl(url, { ...init, signal: controller.signal, redirect: 'error' });
    } catch {
      throw new ProviderError('provider_unavailable');
    } finally {
      clearTimeout(timer);
    }
  }

  async function readJson(res) {
    try {
      return await res.json();
    } catch {
      throw new ProviderError('provider_bad_response', res.status);
    }
  }

  async function getToken(force = false) {
    if (!force && token && token.expiresAt - 60_000 > now()) return token.value;
    if (tokenRequest) return tokenRequest;
    tokenRequest = (async () => {
      try {
        await gate();
        const res = await http(config.oauthUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret }).toString(),
        });
        if (res.status === 429) throw new ProviderError('provider_rate_limited', 429);
        if (res.status >= 500) throw new ProviderError('provider_unavailable', res.status);
        if (!res.ok) throw new ProviderError('provider_auth_failed', res.status);
        const json = await readJson(res);
        if (!json || typeof json.access_token !== 'string' || !json.access_token) throw new ProviderError('provider_bad_response', res.status);
        const seconds = Math.min(Math.max(parseInt(json.expires_in, 10) || 3600, 60), 86400);
        token = { value: json.access_token, expiresAt: now() + seconds * 1000 };
        return token.value;
      } finally {
        tokenRequest = null;
      }
    })();
    return tokenRequest;
  }

  async function fetchStatus(receipt, bearer) {
    await gate();
    return http(`${config.baseUrl}/${encodeURIComponent(receipt)}`, { method: 'GET', headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' } });
  }

  return {
    /** Operational facts only: never a URL, client id, secret or token. */
    status: () => ({ configured, enabled: config.enabled, environment: config.environment }),

    /** @returns {Promise<ReturnType<typeof toObservation>>} @throws {ProviderError} */
    async getStatus(receipt) {
      if (!config.enabled || !configured) throw new ProviderError('provider_unavailable');
      let res = await fetchStatus(receipt, await getToken());
      if (res.status === 401) {
        // Expired or revoked token: one fresh token and one retry, never a loop.
        token = null;
        res = await fetchStatus(receipt, await getToken(true));
      }
      if (res.status === 404) throw new ProviderError('provider_receipt_not_found', 404);
      if (res.status === 429) throw new ProviderError('provider_rate_limited', 429);
      if (res.status === 401 || res.status === 403) throw new ProviderError('provider_auth_failed', res.status);
      if (res.status >= 500) throw new ProviderError('provider_unavailable', res.status);
      if (!res.ok) throw new ProviderError('provider_bad_response', res.status);
      return toObservation(await readJson(res), receipt);
    },
  };
}

module.exports = { createTorchProvider, ProviderError, readConfig, toObservation };
