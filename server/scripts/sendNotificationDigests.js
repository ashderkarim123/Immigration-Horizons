/**
 * Two independent, idempotent, dry-run-by-default batch jobs — see
 * docs/architecture/ADR-006-notifications-and-preferences.md §9. Same
 * shape as provisionChannels.js: no OS-level scheduler is installed or
 * assumed; wiring this to cron/PM2 is a deployment decision (see
 * IMPLEMENTATION_STATUS.md's open items).
 *
 *   node scripts/sendNotificationDigests.js              # dry run (default)
 *   node scripts/sendNotificationDigests.js --apply       # actually sends + writes
 *   node scripts/sendNotificationDigests.js --apply --digest-only
 *   node scripts/sendNotificationDigests.js --apply --overdue-only
 *
 * Never run against production during this cycle.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Notification = require('../models/admin/Notification');
const NotificationPreference = require('../models/admin/NotificationPreference');
const AdminUser = require('../models/admin/User');
const ClientUser = require('../models/ClientUser');
const DocumentRequest = require('../models/DocumentRequest');
const WorkspaceMember = require('../models/WorkspaceMember');
const ClientCase = require('../models/ClientCase');
const { sendDigestEmail, sendOverdueRequestReminderEmail } = require('../services/notificationDigestEmail');

const apply = process.argv.includes('--apply');
const digestOnly = process.argv.includes('--digest-only');
const overdueOnly = process.argv.includes('--overdue-only');
const runDigest = !overdueOnly;
const runOverdue = !digestOnly;

const ONE_HOUR_MS = 60 * 60 * 1000;

function redact(uri) {
  return uri.replace(/\/\/[^@/]+@/, '//<redacted>@');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Read-only — never creates a preference row, unlike notificationService.getOrCreatePreferences (a dry run must never write). */
async function digestEnabledFor(filter) {
  const pref = await NotificationPreference.findOne(filter).lean();
  if (!pref) return { enabled: true, frequency: 'daily' }; // schema default
  return { enabled: pref.digestEmails !== false, frequency: pref.digestFrequency || 'daily' };
}

async function runDigestPass() {
  console.log('\n[notification-digest] --- Digest pass ---');
  const cutoff = new Date(Date.now() - ONE_HOUR_MS);
  const eligible = { read: false, emailState: 'not_applicable', createdAt: { $lt: cutoff } };

  const employeeIds = await Notification.distinct('recipientAdmin', { ...eligible, recipientType: 'employee', recipientAdmin: { $ne: null } });
  const clientIds = await Notification.distinct('recipientClient', { ...eligible, recipientType: 'client', recipientClient: { $ne: null } });

  let sent = 0;
  let skippedByPreference = 0;

  for (const adminId of employeeIds) {
    const { enabled, frequency } = await digestEnabledFor({ recipientAdmin: adminId });
    if (!enabled || frequency === 'off') {
      skippedByPreference += 1;
      continue;
    }
    const notifications = await Notification.find({ ...eligible, recipientType: 'employee', recipientAdmin: adminId }).lean();
    if (!notifications.length) continue;
    const admin = await AdminUser.findById(adminId).select('name email').lean();
    if (!admin) continue;
    console.log(`[notification-digest] Employee ${admin.name}: ${notifications.length} unread notification(s) to digest.`);
    if (apply) {
      const okToSend = await sendDigestEmail({ to: admin.email, firstName: admin.name, notifications, portalPath: '/admin/notifications' });
      if (okToSend) {
        await Notification.updateMany({ _id: { $in: notifications.map((n) => n._id) } }, { $set: { emailState: 'sent' } });
        sent += 1;
      }
    }
  }

  for (const clientId of clientIds) {
    const { enabled, frequency } = await digestEnabledFor({ recipientClient: clientId });
    if (!enabled || frequency === 'off') {
      skippedByPreference += 1;
      continue;
    }
    const notifications = await Notification.find({ ...eligible, recipientType: 'client', recipientClient: clientId }).lean();
    if (!notifications.length) continue;
    const client = await ClientUser.findById(clientId).select('firstName email').lean();
    if (!client) continue;
    console.log(`[notification-digest] Client ${client.email}: ${notifications.length} unread notification(s) to digest.`);
    if (apply) {
      const okToSend = await sendDigestEmail({ to: client.email, firstName: client.firstName, notifications, portalPath: '/portal/notifications' });
      if (okToSend) {
        await Notification.updateMany({ _id: { $in: notifications.map((n) => n._id) } }, { $set: { emailState: 'sent' } });
        sent += 1;
      }
    }
  }

  console.log(`[notification-digest] Digest recipients: ${employeeIds.length + clientIds.length}, skipped by preference: ${skippedByPreference}, ${apply ? 'sent' : 'would send'}: ${apply ? sent : employeeIds.length + clientIds.length - skippedByPreference}.`);
}

async function runOverduePass() {
  console.log('\n[notification-digest] --- Overdue-reminder pass ---');
  const now = new Date();
  const overdueRequests = await DocumentRequest.find({ status: 'open', dueDate: { $ne: null, $lt: now } }).lean();
  console.log(`[notification-digest] Found ${overdueRequests.length} overdue open document request(s).`);

  let created = 0;
  let alreadyNotifiedToday = 0;

  for (const request of overdueRequests) {
    const dedupeKey = `overdue:${request._id}:${todayKey()}`;
    const existing = await Notification.findOne({ dedupeKey }).lean();
    if (existing) {
      alreadyNotifiedToday += 1;
      continue;
    }

    const member = await WorkspaceMember.findById(request.requestedFrom).select('clientUser workspace').lean();
    if (!member || !member.clientUser) continue;
    const isActive = await WorkspaceMember.exists({ _id: member._id, status: 'active' });
    if (!isActive) continue;

    if (apply) {
      const client = await ClientUser.findById(member.clientUser).select('firstName email').lean();
      const caseDoc = await ClientCase.findById(request.case).select('caseNumber').lean();
      await Notification.create({
        recipientType: 'client',
        recipientClient: member.clientUser,
        title: 'Document request overdue',
        message: `"${request.title}" was due and is still outstanding.`,
        type: 'document_request_overdue',
        relatedCase: request.case,
        relatedDocumentRequest: request._id,
        dedupeKey,
        emailState: client ? 'pending' : 'not_applicable',
      });
      if (client && caseDoc) {
        await sendOverdueRequestReminderEmail({
          to: client.email,
          firstName: client.firstName,
          caseNumber: caseDoc.caseNumber,
          requestTitle: request.title,
          dueDate: request.dueDate,
        });
        await Notification.updateOne({ dedupeKey }, { $set: { emailState: 'sent' } });
      }
    }
    created += 1;
  }

  console.log(`[notification-digest] Overdue reminders: ${apply ? 'created' : 'would create'} ${created}, already sent today: ${alreadyNotifiedToday}.`);
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<') || uri.includes('>')) {
    console.error('[notification-digest] MONGODB_URI is not set (or still has placeholder values). Refusing to run.');
    process.exit(1);
  }

  console.log(`[notification-digest] Target: ${redact(uri)}`);
  console.log(`[notification-digest] Mode: ${apply ? 'APPLY (will send + write)' : 'DRY RUN (no writes, no sends)'}`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

  if (runDigest) await runDigestPass();
  if (runOverdue) await runOverduePass();

  if (!apply) {
    console.log('\n[notification-digest] Dry run only — re-run with --apply to actually send and write.');
  }

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('[notification-digest] Failed:', err);
  process.exit(1);
});
