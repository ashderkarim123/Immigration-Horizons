const { sendMail } = require('./mailer');

/**
 * Client-facing email adapter for mention notifications (module doc §27:
 * "Email direct mentions when configured by the existing infrastructure").
 * Mirrors server/services/documentEmail.js/interactionEmail.js exactly —
 * same transport, same "missing key/failed send logs a warning, never
 * throws" behavior, same test-double injection points. No routine-message
 * email — only a direct mention ever reaches this adapter.
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

async function sendCollaborationEmail({ to, subject, html }) {
  return sendMail({ to, subject, html, tag: 'collaboration-email' });
}

async function sendMentionEmail({ to, firstName, caseNumber, channelName, senderDisplayName, messageExcerpt, caseId }) {
  const html = `
    <p>Hi ${escapeHtml(firstName || 'there')},</p>
    <p>${escapeHtml(senderDisplayName)} mentioned you in "${escapeHtml(channelName)}" on case ${escapeHtml(caseNumber)}:</p>
    <p style="border-left:3px solid #ccc;padding-left:10px;color:#555">${escapeHtml(messageExcerpt)}</p>
    <p><a href="${portalUrl(`/portal/cases/${caseId}/messages`)}">View in your portal</a></p>
  `;
  return sendCollaborationEmail({ to, subject: `${senderDisplayName} mentioned you`, html });
}

module.exports = { sendCollaborationEmail, sendMentionEmail };
