const { sendMail } = require('./mailer');

/**
 * Digest/overdue-reminder email adapter (Cycle 7 — ADR-006 §9).
 *
 * Composes the copy; services/mailer.js owns the transport and the
 * never-throws contract (ADR-013). Intercept sends in tests through the
 * mailer's `_setTransportForTests`, not through this module.
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

async function sendDigestMail({ to, subject, html }) {
  return sendMail({ to, subject, html, tag: 'notification-digest-email' });
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
  sendDigestEmail,
  sendOverdueRequestReminderEmail,
};
