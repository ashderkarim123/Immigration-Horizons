/**
 * Mail configuration check (ADR-013).
 *
 * Deployment blocker 4 has stood since Cycle 2: every mail adapter across
 * nine cycles was tested with doubles only, so nothing had ever confirmed a
 * real provider would accept a message. This is the command that closes it.
 *
 *   npm run mail:check                     # config + connectivity, sends nothing
 *   npm run mail:check -- --send you@x.com # also sends one real test email
 *
 * Run it on the server, with the production .env loaded, before go-live.
 */

import {
  activeTransport,
  closeMailTransport,
  resolveFrom,
  sendMail,
  verifyTransport,
} from "../src/lib/email/transport";

const sendIndex = process.argv.indexOf("--send");
const sendTo = sendIndex !== -1 ? process.argv[sendIndex + 1] : null;

function line(label: string, value: string) {
  console.log(`  ${label.padEnd(18)} ${value}`);
}

function mask(value: string | undefined, keep = 4): string {
  if (!value) return "(not set)";
  return value.length <= keep ? "*".repeat(value.length) : `${value.slice(0, keep)}${"*".repeat(8)}`;
}

async function run() {
  const transport = activeTransport();

  console.log("\n[mail:check] Configuration");
  line("MAIL_TRANSPORT", process.env.MAIL_TRANSPORT || "(unset — auto-detecting)");
  line("Resolved to", transport);
  line("EMAIL_FROM", resolveFrom());
  line("SITE_URL", process.env.SITE_URL || "(unset — activation links will point at localhost)");

  if (transport === "resend") {
    line("RESEND_API_KEY", mask(process.env.RESEND_API_KEY, 6));
  } else if (transport === "smtp") {
    line("SMTP_HOST", process.env.SMTP_HOST || "(not set)");
    line("SMTP_PORT", process.env.SMTP_PORT || "587 (default)");
    line("SMTP_USER", process.env.SMTP_USER || "(not set — sending unauthenticated)");
    line("SMTP_PASSWORD", mask(process.env.SMTP_PASSWORD, 0));
    line("SMTP_SECURE", process.env.SMTP_SECURE || `(inferred from port)`);
  }

  console.log("\n[mail:check] Connectivity");
  const result = await verifyTransport();
  console.log(`  ${result.ok ? "OK" : "FAILED"} — ${result.detail}`);

  if (!result.ok) {
    console.error(
      "\n[mail:check] Mail is NOT working. Invitations, activation links and password " +
        "resets will silently fail to send (they log a warning and never throw, by design).",
    );
    process.exitCode = 1;
    return;
  }

  if (!sendTo) {
    console.log(
      "\n[mail:check] Connectivity only. Re-run with `-- --send you@example.com` to " +
        "prove a message is actually accepted and delivered.",
    );
    if (!process.env.SITE_URL) {
      console.warn(
        "[mail:check] WARNING: SITE_URL is unset. Mail will send, but every activation " +
          "and reset link in it will point at localhost and be useless to the recipient.",
      );
    }
    return;
  }

  console.log(`\n[mail:check] Sending a test message to ${sendTo} ...`);
  const sent = await sendMail({
    to: sendTo,
    subject: "Immigration Horizons — mail configuration test",
    tag: "mail-check",
    html: `
      <h2>Mail is configured correctly</h2>
      <p>This message was sent by <code>npm run mail:check</code>.</p>
      <p>Transport: <strong>${transport}</strong><br>
         From: <strong>${resolveFrom()}</strong><br>
         Sent: ${new Date().toISOString()}</p>
      <p>If you received this, activation and password-reset email will send too.
         Check that it landed in the inbox rather than spam — that is a
         separate question from whether it sent, and it depends on SPF, DKIM
         and DMARC being right for the sending domain.</p>
    `,
  });

  if (!sent) {
    console.error("[mail:check] The provider accepted the connection but rejected the message.");
    process.exitCode = 1;
    return;
  }

  console.log("[mail:check] Sent. Confirm it arrived, and check whether it landed in spam.");
}

run()
  .catch((err) => {
    console.error("[mail:check] Failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  // Without this the pooled SMTP socket keeps the event loop alive and the
  // script prints its result then hangs.
  .finally(closeMailTransport);
