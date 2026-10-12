/**
 * Staff API: the shared Outlook mailbox (ADR-030).
 *
 * Reading needs `mail.view`; sending and replying need `mail.send`. Linking a message to a case additionally needs the
 * actor's own row access to that case, so a link can never be used to peek at a case the employee is not on. A missing,
 * malformed or inaccessible case is one identical 404. Microsoft's own errors are never passed through: the mailbox being
 * unreachable, refused or unconfigured each map to one generic, safe message.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');

const mailbox = require('../../../../services/mail/mailbox');
const contacts = require('../../../../services/mail/contacts');
const ClientUser = require('../../../../models/ClientUser');
const { readConfig, MailError } = require('../../../../services/mail/graph');
const caseManagement = require('../../../../services/caseManagement');
const MailCaseLink = require('../../../../models/MailCaseLink');
const { canAccessCase } = require('../../../../services/petitionPolicy');
const { can } = require('../../../../utils/permissions');
const { recordSecurityEvent } = require('../../../../utils/securityEvents');
const { createApiError } = require('../../../../middleware/api/apiError');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const mongoose = require('mongoose');

const router = express.Router();

const perEmployee = (limitEnv, fallback, message) => rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env[limitEnv]) || fallback,
  keyGenerator: (req) => String(req.staff._id),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(createApiError(429, 'rate_limited', message)),
});
const readLimiter = perEmployee('MAIL_READ_RATE_LIMIT', 120, 'Too many mail requests. Try again in a minute.');
const sendLimiter = perEmployee('MAIL_SEND_RATE_LIMIT', 20, 'Too many messages sent. Try again in a minute.');

const respond = (res, req, data, status = 200) => res.status(status).json({ data, meta: { requestId: req.id } });
const body = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

/** Maps service failures onto the API envelope; anything unexpected is rethrown as-is (a 500 with no detail). */
function mapError(error) {
  if (error instanceof mailbox.MailInputError) {
    return createApiError(422, 'validation_error', error.message, Object.entries(error.errors).map(([field, message]) => ({ field, message })));
  }
  if (!(error instanceof MailError)) return error;
  switch (error.code) {
    case 'not_configured': return createApiError(503, 'mail_not_configured', 'The shared mailbox is not connected yet.');
    case 'not_found': return createApiError(404, 'not_found', 'Message not found.');
    case 'too_large': return createApiError(413, 'too_large', 'That attachment is too large to download here.');
    case 'throttled': return createApiError(503, 'mail_busy', 'The mailbox is busy. Try again in a moment.');
    case 'refused': return createApiError(502, 'mail_refused', 'Microsoft refused the request. An administrator should check the mailbox connection.');
    default: return createApiError(502, 'mail_unavailable', 'The mailbox could not be reached. Try again shortly.');
  }
}

const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(mapError(error));
  }
};

const audit = (req, type, meta) => recordSecurityEvent({
  type, result: 'success', surface: 'staff', actorType: 'admin_user', actorAdminId: req.staff._id, actorName: req.staff.name, req, meta,
});

/** The case the actor may see, or the one 404. */
async function accessibleCase(req, caseId) {
  const loaded = await caseManagement.loadCaseAndWorkspace(caseId);
  if (!loaded || !(await canAccessCase(req, loaded.workspace._id))) throw createApiError(404, 'not_found', 'Case not found.');
  return loaded;
}

const messageId = (req) => {
  if (!mailbox.isMessageId(req.params.id)) throw createApiError(404, 'not_found', 'Message not found.');
  return req.params.id;
};

// GET /api/v1/staff/mail/status
router.get('/mail/status', requireApiCapability('mail.view'), route(async (req, res) => {
  const config = readConfig();
  respond(res, req, { configured: config.configured, mailbox: config.configured ? config.mailbox : null, canSend: can(req, 'mail.send') });
}));

// GET /api/v1/staff/mail/unread  (the count shown beside Mail in the menu)
router.get('/mail/unread', requireApiCapability('mail.view'), readLimiter, route(async (req, res) => {
  respond(res, req, { unread: await mailbox.unreadCount() });
}));

// GET /api/v1/staff/mail/messages?folder=inbox|sent&page=&limit=
router.get('/mail/messages', requireApiCapability('mail.view'), readLimiter, route(async (req, res) => {
  const page = await mailbox.list({ folder: req.query.folder || 'inbox', page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 20 });
  await contacts.attach(req, page.items);
  respond(res, req, page);
}));

// GET /api/v1/staff/mail/messages/:id
router.get('/mail/messages/:id', requireApiCapability('mail.view'), readLimiter, route(async (req, res) => {
  const id = messageId(req);
  const message = await mailbox.get(id);
  await contacts.attach(req, [message]);
  // Links are shown only for cases this employee may open; the rest are counted, never named.
  const links = await MailCaseLink.find({ messageId: id }).sort({ createdAt: -1 }).lean();
  const visible = [];
  for (const link of links) if (await canAccessCase(req, link.workspace)) visible.push(mailbox.linkDto(link));
  respond(res, req, { ...message, linkCount: links.length, links: visible, hiddenLinkCount: links.length - visible.length });
}));

// POST /api/v1/staff/mail/messages/:id/read   { isRead }
router.post('/mail/messages/:id/read', trustedOriginMiddleware, requireApiCapability('mail.view'), readLimiter, route(async (req, res) => {
  const { isRead } = body(req);
  if (typeof isRead !== 'boolean') throw new mailbox.MailInputError({ isRead: 'Choose read or unread.' });
  await mailbox.setRead(messageId(req), isRead);
  respond(res, req, { isRead });
}));

// GET /api/v1/staff/mail/messages/:id/attachments/:attachmentId
router.get('/mail/messages/:id/attachments/:attachmentId', requireApiCapability('mail.view'), readLimiter, route(async (req, res) => {
  const { bytes, name } = await mailbox.attachment(messageId(req), req.params.attachmentId);
  const safeName = name.replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'attachment';
  res.set({
    // Always a download, never rendered: an attachment named .html must not run on our origin.
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(name).slice(0, 300)}`,
    'Content-Length': String(bytes.length),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(bytes);
}));

// POST /api/v1/staff/mail/messages   { to[], cc[], subject, body, caseId? }
router.post('/mail/messages', trustedOriginMiddleware, requireApiCapability('mail.send'), sendLimiter, route(async (req, res) => {
  const input = body(req);
  // Check the case BEFORE sending, so a refused link never follows a message that already went out.
  const loaded = input.caseId ? await accessibleCase(req, input.caseId) : null;
  const sent = await mailbox.sendNew(input);
  await audit(req, 'mail_sent', { kind: 'new', recipientCount: sent.recipientCount, linked: !!loaded });
  const link = loaded ? await createLink(req, loaded, sent.id) : null;
  respond(res, req, { id: sent.id, link }, 201);
}));

// POST /api/v1/staff/mail/messages/:id/reply   { body, all?, caseId? }
router.post('/mail/messages/:id/reply', trustedOriginMiddleware, requireApiCapability('mail.send'), sendLimiter, route(async (req, res) => {
  const input = body(req);
  const id = messageId(req);
  const loaded = input.caseId ? await accessibleCase(req, input.caseId) : null;
  const sent = await mailbox.reply(id, input, { all: input.all === true });
  await audit(req, 'mail_sent', { kind: input.all === true ? 'reply_all' : 'reply', recipientCount: sent.recipientCount, linked: !!loaded });
  const link = loaded ? await createLink(req, loaded, sent.id) : null;
  respond(res, req, { id: sent.id, link }, 201);
}));

/**
 * Idempotent: linking twice returns the existing link. After a send (default) a failure here is swallowed, because the
 * message is already out and must not be reported as failed; `strict` is for an explicit "link this" request.
 */
async function createLink(req, loaded, id, { strict = false } = {}) {
  try {
    const shot = await mailbox.snapshot(id);
    const existing = await MailCaseLink.findOne({ messageId: shot.messageId, case: loaded.caseDoc._id });
    if (existing) return mailbox.linkDto(existing);
    const link = await MailCaseLink.create({ ...shot, case: loaded.caseDoc._id, workspace: loaded.workspace._id, linkedBy: req.staff._id, linkedByName: req.staff.name || '' });
    await audit(req, 'mail_case_linked', { action: 'linked', caseId: String(loaded.caseDoc._id) });
    return mailbox.linkDto(link);
  } catch (error) {
    if (!strict && (error instanceof MailError || error instanceof mailbox.MailInputError)) return null;
    throw error;
  }
}

// POST /api/v1/staff/mail/messages/:id/links   { caseId }
router.post('/mail/messages/:id/links', trustedOriginMiddleware, requireApiCapability('mail.view'), requireApiCapability('cases.view'), readLimiter, route(async (req, res) => {
  const id = messageId(req);
  const loaded = await accessibleCase(req, body(req).caseId);
  respond(res, req, await createLink(req, loaded, id, { strict: true }), 201);
}));

// DELETE /api/v1/staff/mail/links/:linkId
router.delete('/mail/links/:linkId', trustedOriginMiddleware, requireApiCapability('mail.view'), requireApiCapability('cases.view'), route(async (req, res) => {
  const link = mongoose.Types.ObjectId.isValid(req.params.linkId) ? await MailCaseLink.findById(req.params.linkId) : null;
  if (!link || !(await canAccessCase(req, link.workspace))) throw createApiError(404, 'not_found', 'Link not found.');
  await MailCaseLink.deleteOne({ _id: link._id });
  await audit(req, 'mail_case_linked', { action: 'unlinked', caseId: String(link.case) });
  respond(res, req, { deleted: true });
}));

// GET /api/v1/staff/clients/:id/mail  — messages to or from this client's address (mail.view + clients.view)
router.get('/clients/:id/mail', requireApiCapability('mail.view'), requireApiCapability('clients.view'), readLimiter, route(async (req, res) => {
  const client = mongoose.Types.ObjectId.isValid(req.params.id) ? await ClientUser.findById(req.params.id).select('email status').lean() : null;
  if (!client || client.status === 'disabled') throw createApiError(404, 'not_found', 'Client not found.');
  const items = await mailbox.withParticipant(client.email);
  await contacts.attach(req, items);
  respond(res, req, { items, address: client.email });
}));

// GET /api/v1/staff/cases/:caseId/mail
router.get('/cases/:caseId/mail', requireApiCapability('mail.view'), requireApiCapability('cases.view'), route(async (req, res) => {
  const loaded = await accessibleCase(req, req.params.caseId);
  const links = await MailCaseLink.find({ case: loaded.caseDoc._id }).sort({ messageDate: -1 }).limit(200).lean();
  respond(res, req, { items: links.map(mailbox.linkDto) });
}));

module.exports = router;
