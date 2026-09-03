const { sendMail } = require('./mailer');

/**
 * Client-facing portal-account email adapter for admin-initiated actions
 * (ADR-007 §2). Mirrors src/lib/auth/email.ts's activation email — same
 * subject, same `/portal/activate?token=` link shape — and follows the
 * same "missing key/failed send logs a warning, never throws" contract as
 * every other adapter in this app (documentEmail.js, interactionEmail.js,
 * collaborationEmail.js, notificationDigestEmail.js).
 */

function portalUrl(path) {
  const base = process.env.SITE_URL || 'http://localhost:3000';
  return `${base}${path}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function sendClientPortalEmail({ to, subject, html }) {
  return sendMail({ to, subject, html, tag: 'client-portal-email' });
}

/** Same copy and link shape as src/lib/auth/email.ts's sendActivationEmail. */
async function sendActivationEmail({ to, firstName, token }) {
  const activateUrl = portalUrl(`/portal/activate?token=${encodeURIComponent(token)}`);
  const html = `
    <h2>Welcome to your Immigration Horizons client portal</h2>
    <p>Hi ${escapeHtml(firstName || 'there')},</p>
    <p>You can create a secure portal account to track your case and
    consultations using the link below.</p>
    <p><a href="${activateUrl}">Activate your portal account</a></p>
    <p>This link expires in 7 days and can only be used once.</p>
    <p>If you weren't expecting this email, you can safely ignore it.</p>
  `;
  return sendClientPortalEmail({
    to,
    subject: 'Activate your Immigration Horizons client portal account',
    html,
  });
}

module.exports = {
  sendActivationEmail,
};
