const { Resend } = require('resend');

/**
 * Narrow client-facing email adapter for interaction lifecycle events
 * (scheduled/rescheduled/clarification/answered/cancelled — module doc
 * §23). This is the first real email-sending capability in this app
 * (previously only the Next.js app sent email) — justified because the
 * module explicitly requires these five notifications and no existing
 * infrastructure here could send them.
 *
 * Mirrors src/lib/auth/email.ts's Resend usage and "missing key/failed
 * send logs a warning, never throws" behavior exactly — a failure here
 * must never roll back the interaction mutation that triggered it.
 *
 * `_setMailerForTests`/`_resetMailerForTests` exist so failure-mode tests
 * don't depend on a real Resend account (module doc: "Add test doubles or
 * dependency injection so failure behavior is testable").
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

async function sendInteractionEmail({ to, subject, html }) {
  const mailer = resolveMailer();
  if (!mailer) {
    console.warn(`[interaction-email] RESEND_API_KEY not set — "${subject}" not sent to ${to}.`);
    return false;
  }

  const from = process.env.EMAIL_FROM || 'Immigration Horizons <onboarding@resend.dev>';
  try {
    const { error } = await mailer.emails.send({ from, to, subject, html });
    if (error) {
      console.error('[interaction-email] Resend send failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[interaction-email] Resend send threw:', err.message);
    return false;
  }
}

function baseTemplate(firstName, bodyHtml, interactionNumber) {
  return `
    <p>Hi ${escapeHtml(firstName || 'there')},</p>
    ${bodyHtml}
    <p><a href="${portalUrl(`/portal/queries`)}">View your request (${escapeHtml(interactionNumber)}) in your portal</a></p>
  `;
}

async function sendScheduledEmail({ to, firstName, interactionNumber, subject, scheduledFor, timezone, rescheduled }) {
  const when = new Date(scheduledFor).toLocaleString('en-US', { timeZone: timezone, dateStyle: 'full', timeStyle: 'short' });
  const html = baseTemplate(
    firstName,
    `<p>Your consultation "${escapeHtml(subject)}" has been ${rescheduled ? 're' : ''}scheduled for <strong>${escapeHtml(when)} (${escapeHtml(timezone)})</strong>.</p>`,
    interactionNumber,
  );
  return sendInteractionEmail({
    to,
    subject: `${rescheduled ? 'Rescheduled' : 'Scheduled'}: ${interactionNumber}`,
    html,
  });
}

async function sendClarificationEmail({ to, firstName, interactionNumber, subject }) {
  const html = baseTemplate(
    firstName,
    `<p>We need a bit more information regarding "${escapeHtml(subject)}". Please check your portal for details and reply there.</p>`,
    interactionNumber,
  );
  return sendInteractionEmail({ to, subject: `More information needed: ${interactionNumber}`, html });
}

async function sendAnsweredEmail({ to, firstName, interactionNumber, subject }) {
  const html = baseTemplate(
    firstName,
    `<p>We've responded to "${escapeHtml(subject)}". Please check your portal to view the answer.</p>`,
    interactionNumber,
  );
  return sendInteractionEmail({ to, subject: `Answered: ${interactionNumber}`, html });
}

async function sendCancelledEmail({ to, firstName, interactionNumber, subject }) {
  const html = baseTemplate(
    firstName,
    `<p>Your request "${escapeHtml(subject)}" has been cancelled. Contact us if you believe this is unexpected.</p>`,
    interactionNumber,
  );
  return sendInteractionEmail({ to, subject: `Cancelled: ${interactionNumber}`, html });
}

module.exports = {
  sendInteractionEmail,
  sendScheduledEmail,
  sendClarificationEmail,
  sendAnsweredEmail,
  sendCancelledEmail,
  _setMailerForTests,
  _resetMailerForTests,
};
