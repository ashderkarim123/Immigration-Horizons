const { Resend } = require('resend');

/**
 * Digest/overdue-reminder email adapter (Cycle 7 — ADR-006 §9). Mirrors
 * documentEmail.js/interactionEmail.js exactly: same Resend usage, same
 * "missing key/failed send logs a warning, never throws" behavior, same
 * `_setMailerForTests`/`_resetMailerForTests` injection points.
 */

let mailerOverride = null;

function _setMailerForTests(mailer) {
  mailerOverride = mailer;
}
function _resetMailerForTests() {
  mailerOverride = null;
}

function resolveMailer() {
  if (mailerOverride) return mailerOverride;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

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

async function sendDigestMail({ to, subject, html }) {
  const mailer = resolveMailer();
  if (!mailer) {
    console.warn(`[notification-digest-email] RESEND_API_KEY not set — "${subject}" not sent to ${to}.`);
    return false;
  }
  const from = process.env.EMAIL_FROM || 'Immigration Horizons <onboarding@resend.dev>';
  try {
    const { error } = await mailer.emails.send({ from, to, subject, html });
    if (error) {
      console.error('[notification-digest-email] Resend send failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[notification-digest-email] Resend send threw:', err.message);
    return false;
  }
}

/** One summary email listing every unread notification covered by this digest run. */
async function sendDigestEmail({ to, firstName, notifications, portalPath }) {
  const items = notifications
    .map((n) => `<li><strong>${escapeHtml(n.title)}</strong> — ${escapeHtml(n.message)}</li>`)
    .join('');
  const html = `
    <p>Hi ${escapeHtml(firstName || 'there')},</p>
    <p>You have ${notifications.length} unread notification${notifications.length === 1 ? '' : 's'}:</p>
    <ul>${items}</ul>
    <p><a href="${portalUrl(portalPath)}">View all notifications</a></p>
  `;
  return sendDigestMail({ to, subject: `${notifications.length} unread notification${notifications.length === 1 ? '' : 's'}`, html });
}

/** A single overdue-document-request reminder (module doc's `document_request_overdue` type, never previously wired to a real sender). */
async function sendOverdueRequestReminderEmail({ to, firstName, caseNumber, requestTitle, dueDate }) {
  const html = `
    <p>Hi ${escapeHtml(firstName || 'there')},</p>
    <p>The document request "<strong>${escapeHtml(requestTitle)}</strong>" on case ${escapeHtml(caseNumber)} was due on
      <strong>${escapeHtml(new Date(dueDate).toLocaleDateString('en-US'))}</strong> and is still outstanding.</p>
    <p><a href="${portalUrl('/portal/cases')}">Upload it from your portal</a></p>
  `;
  return sendDigestMail({ to, subject: `Overdue: ${requestTitle}`, html });
}

module.exports = {
  _setMailerForTests,
  _resetMailerForTests,
  sendDigestEmail,
  sendOverdueRequestReminderEmail,
};
