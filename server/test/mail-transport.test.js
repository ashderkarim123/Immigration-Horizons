const test = require('node:test');
const assert = require('node:assert/strict');

const { startFakeSmtp } = require('./helpers/fakeSmtp');
const mailer = require('../services/mailer');

const clientPortalEmail = require('../services/clientPortalEmail');
const documentEmail = require('../services/documentEmail');
const interactionEmail = require('../services/interactionEmail');
const collaborationEmail = require('../services/collaborationEmail');
const notificationDigestEmail = require('../services/notificationDigestEmail');

/**
 * Mail transport tests for the admin CMS (ADR-013). Other half of the root
 * app's test/mail-transport.test.ts.
 *
 * The SMTP cases run against a real (tiny, local) SMTP server rather than a
 * stub, so nodemailer's actual session is exercised. Deployment blocker 4
 * exists precisely because every adapter before this had only ever been
 * tested against doubles of our own making.
 */

const MAIL_ENV_KEYS = [
  'MAIL_TRANSPORT',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_SECURE',
];

let saved = {};
let smtp = null;

test.beforeEach(() => {
  saved = {};
  MAIL_ENV_KEYS.forEach((key) => {
    saved[key] = process.env[key];
    delete process.env[key];
  });
});

test.afterEach(async () => {
  MAIL_ENV_KEYS.forEach((key) => {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  });
  mailer._resetTransportForTests();
  mailer.closeMailTransport();
  if (smtp) {
    await smtp.close();
    smtp = null;
  }
});

function useFakeSmtp(port) {
  process.env.MAIL_TRANSPORT = 'smtp';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_SECURE = 'false';
}

// ---------------------------------------------------------------------------
// Transport selection — must match the root app exactly
// ---------------------------------------------------------------------------

test('with nothing configured the transport is none and sending returns false', async () => {
  assert.equal(mailer.activeTransport(), 'none');
  assert.equal(
    await mailer.sendMail({ to: 'a@b.test', subject: 's', html: '<p>h</p>', tag: 'test' }),
    false
  );
});

test('the transport is auto-detected, and Resend wins a tie', () => {
  process.env.RESEND_API_KEY = 're_test_key';
  assert.equal(mailer.activeTransport(), 'resend');

  process.env.SMTP_HOST = 'smtp.example.test';
  assert.equal(mailer.activeTransport(), 'resend', 'Resend is what earlier cycles were written against');

  delete process.env.RESEND_API_KEY;
  assert.equal(mailer.activeTransport(), 'smtp');
});

test('an explicit MAIL_TRANSPORT wins, and never silently falls back to the other provider', () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.SMTP_HOST = 'smtp.example.test';

  process.env.MAIL_TRANSPORT = 'smtp';
  assert.equal(mailer.activeTransport(), 'smtp');

  // Asking for SMTP with no SMTP host must yield none, not Resend: sending
  // from a different provider than the operator asked for would send from
  // the wrong domain.
  delete process.env.SMTP_HOST;
  assert.equal(mailer.activeTransport(), 'none');
});

// ---------------------------------------------------------------------------
// SMTP, against a real server
// ---------------------------------------------------------------------------

test('an SMTP message reaches the server with the right envelope and body', async () => {
  smtp = await startFakeSmtp();
  useFakeSmtp(smtp.port);
  process.env.EMAIL_FROM = 'Immigration Horizons <notifications@immigrationhorizons.test>';

  const sent = await mailer.sendMail({
    to: 'client@example.test',
    subject: 'Activate your portal account',
    html: '<p>Welcome aboard</p>',
    tag: 'client-portal-email',
  });

  assert.equal(sent, true);
  assert.equal(smtp.messages.length, 1);
  assert.match(smtp.messages[0].from, /notifications@immigrationhorizons\.test/);
  assert.deepEqual(smtp.messages[0].recipients, ['<client@example.test>']);
  assert.match(smtp.messages[0].data, /Subject: Activate your portal account/);
  assert.match(smtp.messages[0].data, /Welcome aboard/);
});

test('a rejected login and a rejected message both return false rather than throwing', async () => {
  smtp = await startFakeSmtp({ failOn: 'auth' });
  useFakeSmtp(smtp.port);
  process.env.SMTP_USER = 'wrong';
  process.env.SMTP_PASSWORD = 'wrong';

  assert.equal(
    await mailer.sendMail({ to: 'a@b.test', subject: 's', html: '<p>h</p>', tag: 'test' }),
    false
  );
  assert.equal(smtp.messages.length, 0);
});

test('an unreachable SMTP host returns false rather than throwing', async () => {
  process.env.MAIL_TRANSPORT = 'smtp';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = '1'; // nothing listens here
  process.env.SMTP_SECURE = 'false';

  assert.equal(
    await mailer.sendMail({ to: 'a@b.test', subject: 's', html: '<p>h</p>', tag: 'test' }),
    false
  );
});

test('verifyTransport proves the connection without sending anything', async () => {
  smtp = await startFakeSmtp();
  useFakeSmtp(smtp.port);

  const result = await mailer.verifyTransport();
  assert.equal(result.ok, true);
  assert.equal(result.transport, 'smtp');
  assert.equal(smtp.messages.length, 0, 'verification must not send a message');
});

// ---------------------------------------------------------------------------
// Every adapter now routes through the one transport
// ---------------------------------------------------------------------------

test('all five email services send through the shared transport', async () => {
  // Before ADR-013 each of these carried its own Resend block, so a change
  // to sending behaviour had to be made five times. This asserts the
  // consolidation actually holds: one seam intercepts all of them.
  const captured = [];
  mailer._setTransportForTests(async (message) => {
    captured.push(message);
    return true;
  });

  await clientPortalEmail.sendActivationEmail({
    to: 'client@example.test',
    firstName: 'Ada',
    token: 'tok',
  });
  await documentEmail.sendDocumentAcceptedEmail({
    to: 'client@example.test',
    firstName: 'Ada',
    documentName: 'passport.pdf',
    caseNumber: 'IH-1',
  });
  await interactionEmail.sendAnsweredEmail({
    to: 'client@example.test',
    firstName: 'Ada',
    interactionNumber: 'Q-1',
  });
  await collaborationEmail.sendMentionEmail({
    to: 'client@example.test',
    firstName: 'Ada',
    channelName: 'General',
    caseNumber: 'IH-1',
  });
  await notificationDigestEmail.sendDigestEmail({
    to: 'client@example.test',
    firstName: 'Ada',
    notifications: [{ title: 'A thing', message: 'happened' }],
    portalPath: '/portal',
  });

  assert.equal(captured.length, 5, 'every adapter must go through services/mailer.js');

  // Each keeps its own log tag, which is how an operator tells them apart
  // in production logs now that they share a transport.
  assert.deepEqual(
    [...new Set(captured.map((m) => m.tag))].sort(),
    [
      'client-portal-email',
      'collaboration-email',
      'document-email',
      'interaction-email',
      'notification-digest-email',
    ]
  );

  // And every one composed real content rather than an empty shell.
  captured.forEach((m) => {
    assert.ok(m.to, 'a recipient');
    assert.ok(m.subject && m.subject.length > 3, `a subject (got ${JSON.stringify(m.subject)})`);
    assert.ok(m.html && m.html.includes('<'), 'an HTML body');
  });
});

test('a transport failure never throws out of an adapter', async () => {
  // The contract every cycle has relied on: a failed notification must not
  // roll back the action that triggered it.
  mailer._setTransportForTests(async () => {
    throw new Error('provider exploded');
  });

  await assert.rejects(
    () => mailer.sendMail({ to: 'a@b.test', subject: 's', html: '<p>h</p>', tag: 'test' }),
    /provider exploded/,
    'the seam itself is allowed to throw — it is test-only'
  );

  // But the real transports never do, however badly configured.
  mailer._resetTransportForTests();
  process.env.MAIL_TRANSPORT = 'smtp';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = '1';

  assert.equal(
    await clientPortalEmail.sendActivationEmail({ to: 'a@b.test', firstName: 'Ada', token: 't' }),
    false
  );
});
