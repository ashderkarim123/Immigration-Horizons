/**
 * The single outbound mail transport for the admin CMS (ADR-013). Mirror of
 * src/lib/email/transport.ts.
 *
 * Five services in this directory — clientPortalEmail, collaborationEmail,
 * documentEmail, interactionEmail, notificationDigestEmail — each carried
 * their own copy of "create a Resend client, resolve EMAIL_FROM, send, log
 * on failure, never throw". They now share this one, and differ only in the
 * copy they compose and the log tag they pass.
 *
 * **The never-throws contract is deliberate.** A failed notification must
 * never roll back the action it was notifying about — a document review, a
 * query answer, an invitation. Every send returns a boolean and logs.
 */

const REQUIRED_RESEND_PREFIX = 're_';

let transportOverride = null;

/**
 * Test seam. Replaces the provider entirely for every caller — the point of
 * routing five services through one module is that there is now one place
 * to intercept, instead of five per-service injection hooks.
 */
function _setTransportForTests(fn) {
  transportOverride = fn;
}

function _resetTransportForTests() {
  transportOverride = null;
}

function resolveFrom() {
  return process.env.EMAIL_FROM || 'Immigration Horizons <onboarding@resend.dev>';
}

/**
 * MAIL_TRANSPORT is explicit and wins. Without it the transport is inferred
 * from whichever credentials are present, so a deployment that only ever set
 * RESEND_API_KEY keeps working with no new configuration. Resend wins a tie
 * because it is what every previous cycle was written against.
 */
function activeTransport() {
  const configured = String(process.env.MAIL_TRANSPORT || '').trim().toLowerCase();

  if (configured === 'resend') return process.env.RESEND_API_KEY ? 'resend' : 'none';
  if (configured === 'smtp') return process.env.SMTP_HOST ? 'smtp' : 'none';
  if (configured && configured !== 'auto') {
    console.warn(`[mail] Unknown MAIL_TRANSPORT "${configured}" — falling back to auto-detection.`);
  }

  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SMTP_HOST) return 'smtp';
  return 'none';
}

async function sendViaResend(message) {
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const payload = {
      from: resolveFrom(),
      to: message.to,
      subject: message.subject,
      html: message.html,
    };
    if (message.replyTo) payload.replyTo = message.replyTo;

    const { error } = await resend.emails.send(payload);
    if (error) {
      console.error(`[${message.tag}] Resend send failed:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[${message.tag}] Resend send threw:`, err && err.message);
    return false;
  }
}

// One pooled transporter, reused across sends. Reconnecting and
// re-authenticating per message is what gets a sender rate-limited.
let smtpTransporter = null;
let smtpTransporterKey = '';

function smtpConfigKey() {
  return [
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_USER,
    process.env.SMTP_SECURE,
  ].join('|');
}

function getSmtpTransporter() {
  const key = smtpConfigKey();
  if (smtpTransporter && smtpTransporterKey === key) return smtpTransporter;

  const nodemailer = require('nodemailer');
  const port = Number(process.env.SMTP_PORT || 587);

  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Implicit TLS on 465, STARTTLS on 587/25. SMTP_SECURE overrides, but
    // the port default is correct for almost every provider.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' }
      : undefined,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  smtpTransporterKey = key;
  return smtpTransporter;
}

async function sendViaSmtp(message) {
  try {
    const transporter = getSmtpTransporter();
    const payload = {
      from: resolveFrom(),
      to: message.to,
      subject: message.subject,
      html: message.html,
    };
    if (message.replyTo) payload.replyTo = message.replyTo;

    await transporter.sendMail(payload);
    return true;
  } catch (err) {
    console.error(`[${message.tag}] SMTP send failed:`, err && err.message);
    // Drop the pooled transporter so a transient auth/TLS failure is not
    // retried forever over a connection that is already broken.
    smtpTransporter = null;
    smtpTransporterKey = '';
    return false;
  }
}

/** Sends one message. Never throws; returns whether it was accepted. */
async function sendMail(message) {
  if (transportOverride) return transportOverride(message);

  const transport = activeTransport();

  if (transport === 'none') {
    console.warn(
      `[${message.tag}] No mail transport configured (set RESEND_API_KEY or SMTP_HOST) — ` +
        `"${message.subject}" not sent to ${message.to}.`
    );
    return false;
  }

  return transport === 'resend' ? sendViaResend(message) : sendViaSmtp(message);
}

/**
 * Closes the pooled SMTP connection. A long-running server never needs
 * this; a one-shot script does, since an open pooled socket keeps the
 * event loop alive and the script would never exit.
 */
function closeMailTransport() {
  if (!smtpTransporter) return;
  smtpTransporter.close();
  smtpTransporter = null;
  smtpTransporterKey = '';
}

/** Proves the transport can reach its provider without sending anything. */
async function verifyTransport() {
  const transport = activeTransport();

  if (transport === 'none') {
    return {
      ok: false,
      transport,
      detail: 'No transport configured. Set MAIL_TRANSPORT plus either RESEND_API_KEY or SMTP_HOST.',
    };
  }

  if (transport === 'resend') {
    const key = process.env.RESEND_API_KEY || '';
    return key.startsWith(REQUIRED_RESEND_PREFIX)
      ? { ok: true, transport, detail: 'RESEND_API_KEY present and correctly prefixed.' }
      : { ok: false, transport, detail: 'RESEND_API_KEY does not look like a Resend key (expected a re_ prefix).' };
  }

  try {
    await getSmtpTransporter().verify();
    return {
      ok: true,
      transport,
      detail: `Connected and authenticated to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}.`,
    };
  } catch (err) {
    return { ok: false, transport, detail: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  sendMail,
  verifyTransport,
  closeMailTransport,
  activeTransport,
  resolveFrom,
  _setTransportForTests,
  _resetTransportForTests,
};
