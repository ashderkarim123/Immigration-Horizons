/**
 * The shared Outlook mailbox as the Staff application sees it (ADR-030): list, read, send, reply, and link a message to a
 * case. Messages live in Microsoft; the only thing stored here is MailCaseLink (a display snapshot, never a body).
 *
 * Everything an employee can send is plain text, and everything received is sanitized before it reaches a browser.
 */
const sanitizeHtml = require('sanitize-html');
const graph = require('./graph');
const MailCaseLink = require('../../models/MailCaseLink');

const FOLDERS = { inbox: { path: 'inbox', sortBy: 'receivedDateTime' }, sent: { path: 'sentitems', sortBy: 'sentDateTime' } };
const LIMITS = { recipients: 20, totalRecipients: 30, subject: 255, body: 100000, pageSize: 25, preview: 200 };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID_PATTERN = /^[A-Za-z0-9_\-=+/]{8,512}$/;
const PART_ID_PATTERN = /^[A-Za-z0-9_\-=+/]{1,1024}$/; // attachment ids
const LIST_FIELDS = 'id,subject,from,replyTo,toRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,bodyPreview,importance';
// The website's own enquiry email (src/lib/leads.ts): sent from our domain, reply-to = the person who filled in the form.
const LEAD_SUBJECT = /^New (Consultation Request|Contact Message)\b/i;

class MailInputError extends Error {
  constructor(errors) {
    super('Please correct the highlighted fields.');
    this.name = 'MailInputError';
    this.errors = errors;
  }
}

const isMessageId = (id) => typeof id === 'string' && ID_PATTERN.test(id);
const isPartId = (id) => typeof id === 'string' && PART_ID_PATTERN.test(id);
const encoded = (id) => encodeURIComponent(id);

const person = (entry) => {
  const address = entry && entry.emailAddress ? entry.emailAddress : {};
  return { name: String(address.name || '').slice(0, 200), address: String(address.address || '').toLowerCase().slice(0, 254) };
};

/** Email HTML is untrusted: no scripts, styles, forms, images (remote images are tracking beacons) or inline CSS. */
function sanitizeMailHtml(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'br', 'div', 'span', 'b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowProtocolRelative: false,
    transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' } }) },
  }).trim();
}

/**
 * What kind of email this is, and who the other party is. A website enquiry (from our own domain, with the visitor in
 * reply-to) is the visitor; any other inbox message is its sender; a sent message is its first recipient.
 */
function classify(message, folder = null) {
  const own = graph.readConfig().mailbox;
  const from = person(message.from);
  const first = (list) => (list && list[0] ? person(list[0]) : null);
  // A message we sent (its folder, or when unknown, its sender) concerns whoever it was sent to.
  if (folder === 'sent' || (folder === null && from.address === own)) return { kind: 'mail', contact: first(message.toRecipients) };
  const reply = first(message.replyTo);
  const ownDomain = own.split('@')[1];
  if (LEAD_SUBJECT.test(String(message.subject || '')) && reply && reply.address && ownDomain && from.address.endsWith(`@${ownDomain}`)) {
    return { kind: /consultation/i.test(message.subject) ? 'consultation' : 'contact', contact: reply };
  }
  return { kind: 'mail', contact: from.address && from.address !== own ? from : null };
}

const listItem = (message, linkCount = 0, folder = null) => ({
  ...classify(message, folder),
  id: message.id,
  subject: String(message.subject || '').slice(0, 300),
  from: person(message.from),
  to: (message.toRecipients || []).slice(0, 5).map(person),
  receivedAt: message.receivedDateTime || null,
  sentAt: message.sentDateTime || null,
  isRead: message.isRead !== false,
  hasAttachments: !!message.hasAttachments,
  important: message.importance === 'high',
  preview: String(message.bodyPreview || '').slice(0, LIMITS.preview),
  linkCount,
});

async function linkCounts(ids) {
  if (!ids.length) return new Map();
  const rows = await MailCaseLink.aggregate([{ $match: { messageId: { $in: ids } } }, { $group: { _id: '$messageId', count: { $sum: 1 } } }]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

async function list({ folder = 'inbox', page = 1, limit = 20 } = {}) {
  const spec = FOLDERS[folder];
  if (!spec) throw new MailInputError({ folder: 'folder must be inbox or sent.' });
  const size = Math.min(Math.max(Number.isInteger(limit) ? limit : 20, 1), LIMITS.pageSize);
  const pageNumber = Math.min(Math.max(Number.isInteger(page) ? page : 1, 1), 200);
  const data = await graph.call(`/mailFolders/${spec.path}/messages`, {
    query: { $select: LIST_FIELDS, $orderby: `${spec.sortBy} desc`, $top: size + 1, $skip: (pageNumber - 1) * size },
  });
  const rows = (data && data.value) || [];
  const shown = rows.slice(0, size);
  const counts = await linkCounts(shown.map((row) => row.id));
  return { items: shown.map((row) => listItem(row, counts.get(row.id) || 0, folder)), page: pageNumber, limit: size, hasMore: rows.length > size, folder };
}

async function get(id) {
  if (!isMessageId(id)) throw new graph.MailError('not_found');
  const message = await graph.call(`/messages/${encoded(id)}`, {
    query: { $select: `${LIST_FIELDS},ccRecipients,body,conversationId,internetMessageId`, $expand: 'attachments($select=id,name,contentType,size,isInline)' },
  });
  const isHtml = message.body && String(message.body.contentType).toLowerCase() === 'html';
  return {
    ...listItem(message),
    cc: (message.ccRecipients || []).slice(0, 20).map(person),
    to: (message.toRecipients || []).slice(0, 50).map(person),
    bodyType: isHtml ? 'html' : 'text',
    body: isHtml ? sanitizeMailHtml(message.body.content) : String((message.body && message.body.content) || '').slice(0, 500000),
    conversationId: message.conversationId || null,
    attachments: ((message.attachments || []).filter((a) => !a.isInline)).map((a) => ({
      id: a.id, name: String(a.name || 'attachment').slice(0, 255), contentType: String(a.contentType || ''), size: Number(a.size) || 0,
    })),
  };
}

async function setRead(id, isRead) {
  if (!isMessageId(id)) throw new graph.MailError('not_found');
  await graph.call(`/messages/${encoded(id)}`, { method: 'PATCH', body: { isRead: !!isRead } });
}

/** A file attachment's bytes and its safe metadata. Item attachments (forwarded messages) are not downloadable here. */
async function attachment(messageId, attachmentId) {
  if (!isMessageId(messageId) || !isPartId(attachmentId)) throw new graph.MailError('not_found');
  const meta = await graph.call(`/messages/${encoded(messageId)}/attachments/${encoded(attachmentId)}`, { query: { $select: 'id,name,contentType,size' } });
  if (!meta || !String(meta['@odata.type'] || '').toLowerCase().endsWith('fileattachment')) throw new MailInputError({ attachment: 'Only file attachments can be downloaded.' });
  if (Number(meta.size) > graph.MAX_DOWNLOAD_BYTES) throw new graph.MailError('too_large');
  const bytes = await graph.call(`/messages/${encoded(messageId)}/attachments/${encoded(attachmentId)}/$value`, { raw: true });
  return { bytes, name: String(meta.name || 'attachment') };
}

function recipients(value, field, { required }) {
  const errors = {};
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : null;
  if (list === null || list.some((entry) => typeof entry !== 'string')) return { errors: { [field]: 'must be a list of email addresses.' } };
  const addresses = [...new Set(list.map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  if (required && !addresses.length) errors[field] = 'Add at least one recipient.';
  else if (addresses.length > LIMITS.recipients) errors[field] = `Use at most ${LIMITS.recipients} addresses.`;
  else if (addresses.some((address) => address.length > 254 || !EMAIL_PATTERN.test(address))) errors[field] = 'Every address must be a valid email address.';
  return { addresses, errors };
}

const cleanLine = (value) => String(value || '').replace(/[\u0000-\u001f\u007f\s]+/g, ' ').trim();

function readBody(value, errors) {
  const text = typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';
  if (!text.trim()) errors.body = 'Write a message.';
  else if (text.length > LIMITS.body) errors.body = `The message may be at most ${LIMITS.body} characters.`;
  return text;
}

/** Validates a new message or reply. `kind` 'new' needs recipients and a subject; replies take them from the original. */
function validateOutgoing(input, kind) {
  const errors = {};
  const source = input && typeof input === 'object' ? input : {};
  const body = readBody(source.body, errors);
  if (kind !== 'new') return { errors, body };
  const to = recipients(source.to, 'to', { required: true });
  const cc = recipients(source.cc, 'cc', { required: false });
  Object.assign(errors, to.errors, cc.errors);
  const subject = cleanLine(source.subject);
  if (!subject) errors.subject = 'Add a subject.';
  else if (subject.length > LIMITS.subject) errors.subject = `The subject may be at most ${LIMITS.subject} characters.`;
  if (!errors.to && !errors.cc && to.addresses.length + cc.addresses.length > LIMITS.totalRecipients) errors.to = `Use at most ${LIMITS.totalRecipients} recipients in total.`;
  return { errors, body, to: to.addresses, cc: cc.addresses, subject };
}

const toRecipient = (address) => ({ emailAddress: { address } });

/** Creates the draft, sends it, and returns { id, recipientCount }. A draft that cannot be sent is deleted. */
async function sendDraft(createDraft) {
  const draft = await createDraft();
  if (!draft || !draft.id) throw new graph.MailError('unavailable');
  try {
    await graph.call(`/messages/${encoded(draft.id)}/send`, { method: 'POST' });
  } catch (error) {
    await graph.call(`/messages/${encoded(draft.id)}`, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
  return draft;
}

async function sendNew(input) {
  const { errors, body, to, cc, subject } = validateOutgoing(input, 'new');
  if (Object.keys(errors).length) throw new MailInputError(errors);
  const draft = await sendDraft(() => graph.call('/messages', {
    method: 'POST',
    body: { subject, body: { contentType: 'Text', content: body }, toRecipients: to.map(toRecipient), ccRecipients: cc.map(toRecipient) },
  }));
  return { id: draft.id, subject, recipientCount: to.length + cc.length };
}

async function reply(id, input, { all = false } = {}) {
  if (!isMessageId(id)) throw new graph.MailError('not_found');
  const { errors, body } = validateOutgoing(input, 'reply');
  if (Object.keys(errors).length) throw new MailInputError(errors);
  const original = await graph.call(`/messages/${encoded(id)}`, { query: { $select: 'id,subject,from,toRecipients,ccRecipients' } });
  const draft = await sendDraft(() => graph.call(`/messages/${encoded(id)}/${all ? 'createReplyAll' : 'createReply'}`, { method: 'POST', body: { comment: body } }));
  const count = 1 + (all ? (original.toRecipients || []).length + (original.ccRecipients || []).length : 0);
  return { id: draft.id, subject: cleanLine(original.subject), recipientCount: count };
}

/** The message's display snapshot for a link; the Graph call also proves the id belongs to this mailbox. */
async function snapshot(id) {
  if (!isMessageId(id)) throw new graph.MailError('not_found');
  const message = await graph.call(`/messages/${encoded(id)}`, { query: { $select: 'id,subject,from,receivedDateTime,sentDateTime' } });
  const from = person(message.from);
  return {
    messageId: message.id || id,
    subject: String(message.subject || '(no subject)').slice(0, 300),
    fromName: from.name,
    fromAddress: from.address,
    messageDate: new Date(message.receivedDateTime || message.sentDateTime || Date.now()),
  };
}

const linkDto = (link) => ({
  id: String(link._id),
  messageId: link.messageId,
  caseId: String(link.case),
  subject: link.subject,
  from: { name: link.fromName, address: link.fromAddress },
  messageDate: link.messageDate,
  linkedByName: link.linkedByName,
  linkedAt: link.createdAt,
});

/** Unread messages received since `sinceIso`, newest first (for the new-mail watcher). Read messages are skipped on purpose. */
async function newUnread(sinceIso, { top = 50 } = {}) {
  const data = await graph.call('/mailFolders/inbox/messages', {
    query: { $select: LIST_FIELDS, $filter: `receivedDateTime ge ${sinceIso} and isRead eq false`, $orderby: 'receivedDateTime desc', $top: top },
  });
  return ((data && data.value) || []).map((row) => listItem(row));
}

async function unreadCount() {
  const folder = await graph.call('/mailFolders/inbox', { query: { $select: 'unreadItemCount' } });
  return Math.max(0, Number(folder && folder.unreadItemCount) || 0);
}

/** Messages to or from one address, newest first, across folders (Microsoft's participants search). */
async function withParticipant(address, { top = 20 } = {}) {
  const wanted = String(address || '').trim().toLowerCase();
  // The address is placed inside a quoted search expression, so anything that could end the quote is refused outright.
  if (!EMAIL_PATTERN.test(wanted) || wanted.includes('"') || wanted.includes('\\')) return [];
  const data = await graph.call('/messages', { query: { $search: `"participants:${wanted}"`, $select: LIST_FIELDS, $top: top } });
  const rows = ((data && data.value) || []).slice().sort((a, b) => String(b.receivedDateTime || b.sentDateTime).localeCompare(String(a.receivedDateTime || a.sentDateTime)));
  const counts = await linkCounts(rows.map((row) => row.id));
  return rows.map((row) => listItem(row, counts.get(row.id) || 0));
}

module.exports = {
  newUnread, unreadCount, withParticipant, classify,
  list, get, setRead, attachment, sendNew, reply, snapshot, linkDto, sanitizeMailHtml, validateOutgoing, isMessageId,
  MailInputError, LIMITS, FOLDERS,
};
