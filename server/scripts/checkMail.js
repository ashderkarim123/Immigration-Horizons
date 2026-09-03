require('dotenv').config();

/**
 * Mail configuration check for the admin CMS (ADR-013). Mirror of the root
 * app's scripts/checkMail.ts — the two apps read the same mail variables but
 * from different .env files, so both need checking before go-live.
 *
 *   npm run mail:check
 *   npm run mail:check -- --send you@example.com
 */

const {
  activeTransport,
  closeMailTransport,
  resolveFrom,
  sendMail,
  verifyTransport,
} = require('../services/mailer');

const sendIndex = process.argv.indexOf('--send');
const sendTo = sendIndex !== -1 ? process.argv[sendIndex + 1] : null;

function line(label, value) {
  console.log(`  ${label.padEnd(18)} ${value}`);
}

function mask(value, keep = 4) {
  if (!value) return '(not set)';
  return value.length <= keep ? '*'.repeat(value.length) : `${value.slice(0, keep)}${'*'.repeat(8)}`;
}

async function run() {
  const transport = activeTransport();

  console.log('\n[mail:check] Configuration (server/.env)');
  line('MAIL_TRANSPORT', process.env.MAIL_TRANSPORT || '(unset — auto-detecting)');
  line('Resolved to', transport);
  line('EMAIL_FROM', resolveFrom());
  line('SITE_URL', process.env.SITE_URL || '(unset)');

  if (transport === 'resend') {
    line('RESEND_API_KEY', mask(process.env.RESEND_API_KEY, 6));
  } else if (transport === 'smtp') {
    line('SMTP_HOST', process.env.SMTP_HOST || '(not set)');
    line('SMTP_PORT', process.env.SMTP_PORT || '587 (default)');
    line('SMTP_USER', process.env.SMTP_USER || '(not set — sending unauthenticated)');
    line('SMTP_PASSWORD', mask(process.env.SMTP_PASSWORD, 0));
    line('SMTP_SECURE', process.env.SMTP_SECURE || '(inferred from port)');
  }

  console.log('\n[mail:check] Connectivity');
  const result = await verifyTransport();
  console.log(`  ${result.ok ? 'OK' : 'FAILED'} — ${result.detail}`);

  if (!result.ok) {
    console.error(
      '\n[mail:check] Mail is NOT working. Admin-initiated invitations, document ' +
        'notifications and digests will silently fail to send.'
    );
    process.exit(1);
  }

  if (!sendTo) {
    console.log(
      '\n[mail:check] Connectivity only. Re-run with `-- --send you@example.com` to ' +
        'prove a message is actually accepted.'
    );
    return;
  }

  console.log(`\n[mail:check] Sending a test message to ${sendTo} ...`);
  const sent = await sendMail({
    to: sendTo,
    subject: 'Immigration Horizons Admin — mail configuration test',
    tag: 'mail-check',
    html: `
      <h2>Admin CMS mail is configured correctly</h2>
      <p>Sent by <code>server/scripts/checkMail.js</code>.</p>
      <p>Transport: <strong>${transport}</strong><br>
         From: <strong>${resolveFrom()}</strong><br>
         Sent: ${new Date().toISOString()}</p>
    `,
  });

  if (!sent) {
    console.error('[mail:check] The provider accepted the connection but rejected the message.');
    process.exitCode = 1;
    return;
  }

  console.log('[mail:check] Sent. Confirm it arrived, and check whether it landed in spam.');
}

run()
  .catch((err) => {
    console.error('[mail:check] Failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  })
  // Without this the pooled SMTP socket keeps the event loop alive and the
  // script prints its result then hangs.
  .finally(closeMailTransport);
