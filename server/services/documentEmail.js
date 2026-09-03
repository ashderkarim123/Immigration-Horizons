const { sendMail } = require('./mailer');

/**
 * Client-facing email adapter for document-request/review lifecycle events
 * (module doc §27). Mirrors server/services/interactionEmail.js exactly —
 * same transport, same "missing key/failed send logs a warning, never
 * throws" behavior, same mailer-level test seam
 * dependency-injection points.
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

async function sendDocumentEmail({ to, subject, html }) {
  return sendMail({ to, subject, html, tag: 'document-email' });
}

function baseTemplate(firstName, bodyHtml, caseNumber) {
  return `
    <p>Hi ${escapeHtml(firstName || 'there')},</p>
    ${bodyHtml}
    <p><a href="${portalUrl('/portal/cases')}">View your case documents (${escapeHtml(caseNumber)}) in your portal</a></p>
  `;
}

async function sendDocumentRequestCreatedEmail({ to, firstName, caseNumber, requestTitle, dueDate }) {
  const dueText = dueDate ? ` by <strong>${escapeHtml(new Date(dueDate).toLocaleDateString('en-US'))}</strong>` : '';
  const html = baseTemplate(
    firstName,
    `<p>We've requested a document from you: "${escapeHtml(requestTitle)}"${dueText}.</p>`,
    caseNumber,
  );
  return sendDocumentEmail({ to, subject: `Document requested: ${requestTitle}`, html });
}

async function sendDocumentRequestDueDateChangedEmail({ to, firstName, caseNumber, requestTitle, dueDate }) {
  const dueText = dueDate ? `<strong>${escapeHtml(new Date(dueDate).toLocaleDateString('en-US'))}</strong>` : 'removed';
  const html = baseTemplate(
    firstName,
    `<p>The due date for "${escapeHtml(requestTitle)}" is now ${dueText}.</p>`,
    caseNumber,
  );
  return sendDocumentEmail({ to, subject: `Due date updated: ${requestTitle}`, html });
}

async function sendDocumentAcceptedEmail({ to, firstName, caseNumber, documentName }) {
  const html = baseTemplate(firstName, `<p>Your document "${escapeHtml(documentName)}" has been accepted.</p>`, caseNumber);
  return sendDocumentEmail({ to, subject: `Document accepted: ${documentName}`, html });
}

async function sendReplacementRequestedEmail({ to, firstName, caseNumber, documentName, reason }) {
  const html = baseTemplate(
    firstName,
    `<p>Your document "${escapeHtml(documentName)}" needs to be replaced: ${escapeHtml(reason)}</p>`,
    caseNumber,
  );
  return sendDocumentEmail({ to, subject: `Replacement needed: ${documentName}`, html });
}

async function sendDocumentRejectedEmail({ to, firstName, caseNumber, documentName, reason }) {
  const html = baseTemplate(
    firstName,
    `<p>Your document "${escapeHtml(documentName)}" was rejected: ${escapeHtml(reason)}</p>`,
    caseNumber,
  );
  return sendDocumentEmail({ to, subject: `Document rejected: ${documentName}`, html });
}

async function sendDocumentRequestCancelledEmail({ to, firstName, caseNumber, requestTitle }) {
  const html = baseTemplate(firstName, `<p>The document request "${escapeHtml(requestTitle)}" has been cancelled.</p>`, caseNumber);
  return sendDocumentEmail({ to, subject: `Cancelled: ${requestTitle}`, html });
}

module.exports = {
  sendDocumentEmail,
  sendDocumentRequestCreatedEmail,
  sendDocumentRequestDueDateChangedEmail,
  sendDocumentAcceptedEmail,
  sendReplacementRequestedEmail,
  sendDocumentRejectedEmail,
  sendDocumentRequestCancelledEmail,
};
