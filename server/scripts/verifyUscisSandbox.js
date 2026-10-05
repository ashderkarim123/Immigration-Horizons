/**
 * Manual USCIS Case Status SANDBOX verification (ADR-026 §33). Not part of CI: it needs your own sandbox
 * credentials from the USCIS developer portal and a staging receipt number taken from USCIS's documentation.
 *
 *   cd server
 *   USCIS_CASE_STATUS_ENABLED=true USCIS_CASE_STATUS_ENV=sandbox \
 *   USCIS_CASE_STATUS_CLIENT_ID=... USCIS_CASE_STATUS_CLIENT_SECRET=... \
 *   USCIS_CASE_STATUS_OAUTH_URL=... USCIS_CASE_STATUS_BASE_URL=... \
 *   node scripts/verifyUscisSandbox.js --receipt <staging receipt from the USCIS docs>
 *
 * It checks, in order: the OAuth token exchange plus a successful case-status response (printed as a masked,
 * normalized summary), then one deliberate 4xx path (an unknown receipt) to confirm error mapping. It never
 * prints the client id, secret, token, URLs or the raw response, and it refuses to run against production.
 */
const { createTorchProvider, ProviderError, readConfig } = require('../services/uscis/torchProvider');
const { categoryForTitle } = require('../services/uscis/statusCatalog');
const C = require('../utils/uscisConstants');

const UNKNOWN_RECEIPT = 'XXX0000000000'; // well-formed but not a real receipt: should come back as "not recognized"

async function verify({ provider, receipt, log = console.log }) {
  const status = provider.status();
  if (status.environment !== 'sandbox') {
    log('Refusing to run: USCIS_CASE_STATUS_ENV is not "sandbox". This script never contacts production.');
    return { ok: false, reason: 'not_sandbox' };
  }
  if (!status.enabled || !status.configured) {
    log('Provider is not configured. Set USCIS_CASE_STATUS_ENABLED=true and all USCIS_CASE_STATUS_* values (https URLs only).');
    return { ok: false, reason: 'not_configured' };
  }
  if (!C.isProviderReceipt(receipt)) {
    log('Pass --receipt with a staging receipt in the form AAA1234567890 (take it from the USCIS developer documentation).');
    return { ok: false, reason: 'bad_receipt' };
  }

  let ok = true;
  try {
    const obs = await provider.getStatus(receipt);
    log(`[1/2] OAuth token exchange and case-status request: OK for ${C.maskReceipt(receipt)}`);
    log(`      form ${obs.formType || '(none)'} · status "${obs.current.title}" · category ${categoryForTitle(obs.current.title)} · history entries ${obs.history.length}`);
  } catch (err) {
    ok = false;
    log(`[1/2] FAILED: ${err instanceof ProviderError ? err.code : 'unexpected error'}${err instanceof ProviderError && err.providerStatus ? ` (HTTP ${err.providerStatus})` : ''}`);
  }

  try {
    await provider.getStatus(UNKNOWN_RECEIPT);
    ok = false;
    log('[2/2] UNEXPECTED: an unknown receipt returned a status.');
  } catch (err) {
    const mapped = err instanceof ProviderError && ['provider_receipt_not_found', 'provider_bad_response'].includes(err.code);
    ok = ok && mapped;
    log(`[2/2] ${mapped ? 'OK' : 'FAILED'}: intentional bad receipt was handled as ${err instanceof ProviderError ? err.code : 'an unexpected error'}`);
  }

  log(ok ? 'Sandbox verification passed. Record the date and result in the Phase 11 report.' : 'Sandbox verification did not pass. Nothing was written anywhere.');
  return { ok };
}

module.exports = { verify };

if (require.main === module) {
  const at = process.argv.indexOf('--receipt');
  const receipt = C.normalizeReceipt(at > -1 ? process.argv[at + 1] : '');
  verify({ provider: createTorchProvider({ config: readConfig() }), receipt }).then(
    ({ ok }) => process.exit(ok ? 0 : 1),
    () => process.exit(1),
  );
}
