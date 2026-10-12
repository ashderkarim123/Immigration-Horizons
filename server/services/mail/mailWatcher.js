/**
 * New-mail alerts for the shared mailbox (ADR-030). A poll asks Microsoft for UNREAD inbox messages from the last
 * `lookbackMinutes` and gives each eligible employee one in-app notification per message.
 *
 * Idempotent by construction: the notification's dedupeKey is (message, employee), so overlapping polls, a restart, two
 * server processes or a long lookback can never alert twice. A message someone has already read is not announced.
 * Nothing about the message body is stored in a notification — only the sender's name and the subject line.
 */
const AdminUser = require('../../models/admin/User');
const Consultation = require('../../models/Consultation');
const notificationService = require('../notificationService');
const { CAPABILITIES } = require('../../utils/permissions');
const mailbox = require('./mailbox');
const graph = require('./graph');

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const DEFAULT_LOOKBACK_MINUTES = 60;

const isEnabled = (env = process.env) => env.MAIL_WATCH_ENABLED === 'true' && graph.readConfig(env).configured;
const intervalFrom = (env = process.env) => Math.max(MIN_INTERVAL_MS, Number(env.MAIL_WATCH_INTERVAL_MS) || DEFAULT_INTERVAL_MS);
const lookbackFrom = (env = process.env) => Math.min(24 * 60, Math.max(5, Number(env.MAIL_WATCH_LOOKBACK_MINUTES) || DEFAULT_LOOKBACK_MINUTES));

/** Active employees whose role may read the mailbox. */
const recipients = () => AdminUser.find({ isActive: true, role: { $in: [...new Set(['super_admin', ...CAPABILITIES['mail.view']])] } }).select('name').lean();

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function describe(message) {
  const who = (message.contact && (message.contact.name || message.contact.address)) || 'someone';
  const subject = message.subject || '(no subject)';
  if (message.kind === 'consultation') return { type: 'new_lead', title: 'New consultation request', text: clip(`${who}: ${subject}`, 280) };
  if (message.kind === 'contact') return { type: 'new_lead', title: 'New contact message', text: clip(`${who}: ${subject}`, 280) };
  return { type: 'mail_received', title: `New email from ${clip(who, 80)}`, text: clip(subject, 280) };
}

/** @returns {Promise<{ checked: number, notified: number }>} */
async function checkNewMail({ now = new Date(), lookbackMinutes = DEFAULT_LOOKBACK_MINUTES } = {}) {
  const since = new Date(now.getTime() - lookbackMinutes * 60 * 1000).toISOString();
  const messages = await mailbox.newUnread(since);
  if (!messages.length) return { checked: 0, notified: 0 };
  const people = await recipients();
  let notified = 0;

  for (const message of messages) {
    const { type, title, text } = describe(message);
    // A website enquiry points at the saved consultation, so the notification can open the lead as well as the email.
    let lead = null;
    if (type === 'new_lead' && message.contact && message.contact.address) {
      lead = await Consultation.findOne({ email: new RegExp(`^${message.contact.address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).sort({ createdAt: -1 }).select('_id').lean();
    }
    for (const person of people) {
      const { created } = await notificationService.createNotificationOnce({
        recipientType: 'employee',
        recipientAdminId: person._id,
        recipientName: person.name,
        title,
        message: text,
        type,
        dedupeKey: `mail:new:${message.id}:${person._id}`,
        actionPath: `/mail?message=${encodeURIComponent(message.id)}`,
        ...(lead ? { relatedLead: lead._id } : {}),
      });
      if (created) notified += 1;
    }
  }
  return { checked: messages.length, notified };
}

/**
 * The polling loop, separated from the process so it can be tested. Passes never overlap; a failing pass backs off (doubling,
 * capped) and the first success resets it. Logs counts only — never an address, subject or message id.
 */
function startLoop({ run, intervalMs = DEFAULT_INTERVAL_MS, log = console.log, schedule = setTimeout, cancel = clearTimeout, maxBackoffMs = MAX_BACKOFF_MS }) {
  let timer = null;
  let stopped = false;
  let failures = 0;

  const tick = async () => {
    timer = null;
    try {
      const result = await run();
      failures = 0;
      if (result && result.notified) log(`[mail-watch] ${result.notified} notification(s) for ${result.checked} new message(s)`);
    } catch (error) {
      failures += 1;
      log(`[mail-watch] check failed (${error && error.code ? error.code : error && error.name ? error.name : 'error'}); attempt ${failures}`);
    }
    if (!stopped) timer = schedule(tick, Math.min(maxBackoffMs, intervalMs * 2 ** Math.min(failures, 10)));
  };

  timer = schedule(tick, 5000); // first check shortly after boot, not during it
  if (timer && typeof timer.unref === 'function') timer.unref(); // never holds the process open
  return { stop() { stopped = true; if (timer) cancel(timer); }, get failures() { return failures; } };
}

/** Starts the watcher in this process when MAIL_WATCH_ENABLED=true and the mailbox is connected; otherwise does nothing. */
function startFromEnv(env = process.env, log = console.log) {
  if (!isEnabled(env)) return null;
  log(`[mail-watch] on: every ${Math.round(intervalFrom(env) / 1000)}s, looking back ${lookbackFrom(env)} min`);
  return startLoop({ run: () => checkNewMail({ lookbackMinutes: lookbackFrom(env) }), intervalMs: intervalFrom(env), log });
}

module.exports = { checkNewMail, startLoop, startFromEnv, isEnabled, intervalFrom, lookbackFrom, describe, DEFAULT_INTERVAL_MS, MIN_INTERVAL_MS };
