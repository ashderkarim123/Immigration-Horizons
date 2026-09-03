import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

process.env.SITE_URL = "http://localhost:3000";

import { startFakeSmtp, type FakeSmtpServer } from "./helpers/fakeSmtp";

/**
 * Mail transport tests (ADR-013).
 *
 * The SMTP cases run against a real (tiny, local) SMTP server rather than a
 * stub, so they exercise nodemailer's actual session: EHLO, AUTH, envelope,
 * DATA. Deployment blocker 4 exists precisely because every mail adapter
 * before this had only ever been tested against doubles of our own making.
 *
 * The module caches a pooled transporter keyed on the SMTP settings, so
 * each test imports it fresh to avoid one test's port leaking into the next.
 */

const MAIL_ENV_KEYS = [
  "MAIL_TRANSPORT",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_SECURE",
] as const;

let saved: Record<string, string | undefined> = {};
let smtp: FakeSmtpServer | null = null;

beforeEach(() => {
  saved = {};
  for (const key of MAIL_ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(async () => {
  for (const key of MAIL_ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  if (smtp) {
    await smtp.close();
    smtp = null;
  }
});

/** Fresh module instance, so the pooled SMTP transporter never leaks between tests. */
async function loadTransport() {
  return import(`../src/lib/email/transport?cachebust=${Math.random()}`);
}

// ---------------------------------------------------------------------------
// Transport selection
// ---------------------------------------------------------------------------

test("with nothing configured the transport is none, and sending warns instead of throwing", async () => {
  const { activeTransport, sendMail } = await loadTransport();

  assert.equal(activeTransport(), "none");

  // The never-throws contract: an unconfigured mailer must not be able to
  // roll back the consultation or reset request that triggered it.
  const sent = await sendMail({ to: "a@b.test", subject: "s", html: "<p>h</p>", tag: "test" });
  assert.equal(sent, false);
});

test("the transport is auto-detected from whichever credentials exist", async () => {
  const { activeTransport } = await loadTransport();

  process.env.RESEND_API_KEY = "re_test_key";
  assert.equal(activeTransport(), "resend");

  delete process.env.RESEND_API_KEY;
  process.env.SMTP_HOST = "smtp.example.test";
  assert.equal(activeTransport(), "smtp");
});

test("Resend wins a tie, because it is what every earlier cycle was written against", async () => {
  const { activeTransport } = await loadTransport();
  process.env.RESEND_API_KEY = "re_test_key";
  process.env.SMTP_HOST = "smtp.example.test";
  assert.equal(activeTransport(), "resend");
});

test("an explicit MAIL_TRANSPORT overrides auto-detection in both directions", async () => {
  const { activeTransport } = await loadTransport();

  process.env.RESEND_API_KEY = "re_test_key";
  process.env.SMTP_HOST = "smtp.example.test";

  process.env.MAIL_TRANSPORT = "smtp";
  assert.equal(activeTransport(), "smtp", "explicit smtp must beat a present Resend key");

  process.env.MAIL_TRANSPORT = "resend";
  assert.equal(activeTransport(), "resend");
});

test("an explicit transport with no credentials resolves to none, never to the other one", async () => {
  // Silently falling back to a different provider than the operator asked
  // for is worse than not sending: it would send from the wrong domain.
  const { activeTransport } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.RESEND_API_KEY = "re_test_key";
  assert.equal(activeTransport(), "none");

  process.env.MAIL_TRANSPORT = "resend";
  delete process.env.RESEND_API_KEY;
  process.env.SMTP_HOST = "smtp.example.test";
  assert.equal(activeTransport(), "none");
});

// ---------------------------------------------------------------------------
// SMTP, against a real server
// ---------------------------------------------------------------------------

test("an SMTP message reaches the server with the right envelope and body", async () => {
  smtp = await startFakeSmtp();
  const { sendMail } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_SECURE = "false";
  process.env.EMAIL_FROM = "Immigration Horizons <notifications@immigrationhorizons.test>";

  const sent = await sendMail({
    to: "client@example.test",
    subject: "Activate your portal account",
    html: "<p>Welcome aboard</p>",
    tag: "portal-email",
  });

  assert.equal(sent, true);
  assert.equal(smtp.messages.length, 1);

  const message = smtp.messages[0];
  assert.match(message.from, /notifications@immigrationhorizons\.test/);
  assert.deepEqual(message.recipients, ["<client@example.test>"]);
  assert.match(message.data, /Subject: Activate your portal account/);
  assert.match(message.data, /Welcome aboard/);
});

test("replyTo is carried through, which is what makes a lead notification answerable", async () => {
  smtp = await startFakeSmtp();
  const { sendMail } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_SECURE = "false";

  await sendMail({
    to: "office@immigrationhorizons.test",
    replyTo: "lead@example.test",
    subject: "New Consultation Request",
    html: "<p>Details</p>",
    tag: "leads",
  });

  assert.match(smtp.messages[0].data, /Reply-To: lead@example\.test/i);
});

test("SMTP authentication is attempted when a user is configured", async () => {
  smtp = await startFakeSmtp();
  const { sendMail } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "postmaster@immigrationhorizons.test";
  process.env.SMTP_PASSWORD = "a-real-looking-password";

  assert.equal(
    await sendMail({ to: "a@b.test", subject: "s", html: "<p>h</p>", tag: "test" }),
    true,
  );
});

test("a rejected SMTP login returns false rather than throwing", async () => {
  smtp = await startFakeSmtp({ failOn: "auth" });
  const { sendMail } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_SECURE = "false";
  process.env.SMTP_USER = "wrong";
  process.env.SMTP_PASSWORD = "wrong";

  const sent = await sendMail({ to: "a@b.test", subject: "s", html: "<p>h</p>", tag: "test" });
  assert.equal(sent, false);
  assert.equal(smtp.messages.length, 0);
});

test("a message the server rejects returns false rather than throwing", async () => {
  smtp = await startFakeSmtp({ failOn: "data" });
  const { sendMail } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_SECURE = "false";

  assert.equal(
    await sendMail({ to: "a@b.test", subject: "s", html: "<p>h</p>", tag: "test" }),
    false,
  );
});

test("an unreachable SMTP host returns false rather than throwing", async () => {
  const { sendMail } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1"; // nothing listens here
  process.env.SMTP_SECURE = "false";

  assert.equal(
    await sendMail({ to: "a@b.test", subject: "s", html: "<p>h</p>", tag: "test" }),
    false,
  );
});

// ---------------------------------------------------------------------------
// verifyTransport — what `npm run mail:check` reports
// ---------------------------------------------------------------------------

test("verifyTransport proves an SMTP connection without sending anything", async () => {
  smtp = await startFakeSmtp();
  const { verifyTransport } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(smtp.port);
  process.env.SMTP_SECURE = "false";

  const result = await verifyTransport();
  assert.equal(result.ok, true);
  assert.equal(result.transport, "smtp");
  assert.equal(smtp.messages.length, 0, "verification must not send a message");
});

test("verifyTransport reports failure for an unreachable host and a malformed Resend key", async () => {
  const { verifyTransport } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1";
  assert.equal((await verifyTransport()).ok, false);

  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  process.env.MAIL_TRANSPORT = "resend";
  process.env.RESEND_API_KEY = "not-a-resend-key";
  const bad = await verifyTransport();
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /re_ prefix/);

  process.env.RESEND_API_KEY = "re_looks_right";
  assert.equal((await verifyTransport()).ok, true);
});

test("verifyTransport reports none when nothing is configured", async () => {
  const { verifyTransport } = await loadTransport();
  const result = await verifyTransport();
  assert.equal(result.ok, false);
  assert.equal(result.transport, "none");
});

// ---------------------------------------------------------------------------
// The test seam
// ---------------------------------------------------------------------------

test("the test seam intercepts every send, whatever the configured transport", async () => {
  const { sendMail, _setTransportForTests, _resetTransportForTests } = await loadTransport();

  process.env.MAIL_TRANSPORT = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1"; // would fail if the seam were not honoured

  const captured: unknown[] = [];
  _setTransportForTests(async (message: unknown) => {
    captured.push(message);
    return true;
  });

  assert.equal(
    await sendMail({ to: "a@b.test", subject: "Intercepted", html: "<p>h</p>", tag: "test" }),
    true,
  );
  assert.equal(captured.length, 1);

  _resetTransportForTests();
  assert.equal(
    await sendMail({ to: "a@b.test", subject: "s", html: "<p>h</p>", tag: "test" }),
    false,
    "resetting the seam must restore the real (here, broken) transport",
  );
});
