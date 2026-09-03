import "server-only";

/**
 * The single outbound mail transport for this application (ADR-013).
 *
 * Before this module, seven call sites across both applications each
 * carried their own copy of "create a Resend client, resolve EMAIL_FROM,
 * send, log on failure, never throw". They are now one implementation,
 * chosen by configuration rather than by import.
 *
 * **The never-throws contract is preserved deliberately, not inherited by
 * accident.** A failed notification must never roll back the thing it was
 * notifying about — a consultation submission, a password reset request, a
 * document review. Every function here returns a boolean and logs; none of
 * them rejects. `CLAUDE.md` records this as a documented tradeoff rather
 * than a bug, and it survives the move to a pluggable transport.
 *
 * Mirrors server/services/mailer.js, which serves the admin CMS.
 */

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Log prefix identifying the caller, e.g. "portal-email". */
  tag: string;
  replyTo?: string;
};

export type MailTransportName = "resend" | "smtp" | "none";

/**
 * Test seam. Set a function here and it receives every message instead of
 * a real provider — the whole point of routing all seven call sites
 * through one module is that there is now one place to intercept.
 */
let transportOverride: ((message: MailMessage) => Promise<boolean>) | null = null;

export function _setTransportForTests(fn: ((message: MailMessage) => Promise<boolean>) | null) {
  transportOverride = fn;
}

export function _resetTransportForTests() {
  transportOverride = null;
}

export function resolveFrom(): string {
  return (
    process.env.EMAIL_FROM ||
    "Immigration Horizons <onboarding@resend.dev>"
  );
}

/**
 * Where a reply should land.
 *
 * `EMAIL_FROM` is a sending identity, not a mailbox — with a transactional
 * provider it is usually on a subdomain nobody reads, so a client who hits
 * Reply on "your document was accepted" would be writing into a void. This
 * points those replies at a real inbox.
 *
 * A per-message `replyTo` still wins: lead notifications set it to the
 * lead's own address so staff can answer the enquiry directly.
 */
export function resolveReplyTo(): string {
  return process.env.MAIL_REPLY_TO || "";
}

/**
 * Which transport is configured.
 *
 * `MAIL_TRANSPORT` is explicit and wins. Without it the choice is inferred
 * from whichever credentials are present, so an existing deployment that
 * only ever set `RESEND_API_KEY` keeps working with no new configuration.
 * Resend is preferred when both are set, because it is what every previous
 * cycle was written and tested against.
 */
export function activeTransport(): MailTransportName {
  const configured = (process.env.MAIL_TRANSPORT || "").trim().toLowerCase();

  if (configured === "resend") return process.env.RESEND_API_KEY ? "resend" : "none";
  if (configured === "smtp") return process.env.SMTP_HOST ? "smtp" : "none";
  if (configured && configured !== "auto") {
    console.warn(`[mail] Unknown MAIL_TRANSPORT "${configured}" — falling back to auto-detection.`);
  }

  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return "none";
}

async function sendViaResend(message: MailMessage): Promise<boolean> {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const replyTo = message.replyTo || resolveReplyTo();

  try {
    const { error } = await resend.emails.send({
      from: resolveFrom(),
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.error(`[${message.tag}] Resend send failed:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[${message.tag}] Resend send threw:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * One transporter is reused across sends so the SMTP connection pool is not
 * rebuilt per email — reconnecting and re-authenticating on every message
 * is what gets a sender rate-limited by most providers.
 */
let smtpTransporter: import("nodemailer").Transporter | null = null;
let smtpTransporterKey = "";

function smtpConfigKey(): string {
  return [
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_USER,
    process.env.SMTP_SECURE,
  ].join("|");
}

async function getSmtpTransporter() {
  const key = smtpConfigKey();
  if (smtpTransporter && smtpTransporterKey === key) return smtpTransporter;

  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 587);

  smtpTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Implicit TLS on 465; STARTTLS upgrade on 587/25. Set SMTP_SECURE
    // explicitly to override, but the port default is right for almost
    // every provider.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || "" }
      : undefined,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  smtpTransporterKey = key;
  return smtpTransporter;
}

async function sendViaSmtp(message: MailMessage): Promise<boolean> {
  const replyTo = message.replyTo || resolveReplyTo();
  try {
    const transporter = await getSmtpTransporter();
    await transporter.sendMail({
      from: resolveFrom(),
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(replyTo ? { replyTo } : {}),
    });
    return true;
  } catch (err) {
    console.error(`[${message.tag}] SMTP send failed:`, err instanceof Error ? err.message : err);
    // Drop the pooled transporter so a transient auth/TLS failure is not
    // retried forever against a connection that is already broken.
    smtpTransporter = null;
    smtpTransporterKey = "";
    return false;
  }
}

/** Sends one message. Never throws; returns whether it was accepted. */
export async function sendMail(message: MailMessage): Promise<boolean> {
  if (transportOverride) return transportOverride(message);

  const transport = activeTransport();

  if (transport === "none") {
    console.warn(
      `[${message.tag}] No mail transport configured (set RESEND_API_KEY or SMTP_HOST) — ` +
        `"${message.subject}" not sent to ${message.to}.`,
    );
    return false;
  }

  return transport === "resend" ? sendViaResend(message) : sendViaSmtp(message);
}

/**
 * Closes the pooled SMTP connection.
 *
 * A long-running server never needs this — the pool is the point. A
 * one-shot script does: an open pooled socket keeps the event loop alive,
 * so `mail:check` would sit there after printing its result instead of
 * exiting.
 */
export async function closeMailTransport(): Promise<void> {
  if (!smtpTransporter) return;
  smtpTransporter.close();
  smtpTransporter = null;
  smtpTransporterKey = "";
}

/**
 * Proves the configured transport can actually reach its provider, without
 * sending anything. Used by `npm run mail:check` — see ADR-013: every mail
 * adapter across nine cycles had been tested with doubles only, so nothing
 * had ever confirmed a real provider would accept a message.
 */
export async function verifyTransport(): Promise<{ ok: boolean; transport: MailTransportName; detail: string }> {
  const transport = activeTransport();

  if (transport === "none") {
    return {
      ok: false,
      transport,
      detail: "No transport configured. Set MAIL_TRANSPORT plus either RESEND_API_KEY or SMTP_HOST.",
    };
  }

  if (transport === "resend") {
    // Resend exposes no no-op verify, so the key's shape is all that can be
    // checked without sending. `mail:check --send` covers the rest.
    const key = process.env.RESEND_API_KEY || "";
    return key.startsWith("re_")
      ? { ok: true, transport, detail: "RESEND_API_KEY present and correctly prefixed." }
      : { ok: false, transport, detail: "RESEND_API_KEY does not look like a Resend key (expected a re_ prefix)." };
  }

  try {
    const transporter = await getSmtpTransporter();
    await transporter.verify();
    return {
      ok: true,
      transport,
      detail: `Connected and authenticated to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}.`,
    };
  } catch (err) {
    return { ok: false, transport, detail: err instanceof Error ? err.message : String(err) };
  }
}
