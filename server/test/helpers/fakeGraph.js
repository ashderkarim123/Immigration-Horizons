/**
 * A fake Microsoft (token endpoint + the slice of Graph the mailbox uses), in memory. Installed through the Graph client's
 * test seam, so no test ever touches the network. It also enforces what the real service would: a bearer token on every call,
 * and only the configured mailbox.
 */
const graph = require('../../services/mail/graph');

const MAILBOX = 'info@immigrationhorizons.com';
const SECRET = 'sentinel-graph-client-secret-7c1';
const ENV = { MS_GRAPH_TENANT_ID: 'tenant-0000', MS_GRAPH_CLIENT_ID: 'client-0000', MS_GRAPH_CLIENT_SECRET: SECRET, MS_GRAPH_MAILBOX: MAILBOX };

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

function install() {
  const state = { tokens: 0, calls: [], messages: new Map(), failToken: false, failNext: null, nextId: 1 };

  const add = (folder, over = {}) => {
    const id = over.id || `AAMk-msg-${state.nextId++}=`;
    const message = {
      id, folder, subject: 'Hello', from: { name: 'Alex Applicant', address: 'alex@example.com' }, to: [{ name: '', address: MAILBOX }], cc: [],
      receivedDateTime: new Date(Date.UTC(2026, 9, 1, 12, 0, state.nextId)).toISOString(), isRead: false, hasAttachments: false,
      body: { contentType: 'html', content: '<p>Hi</p>' }, attachments: [], importance: 'normal', ...over,
    };
    state.messages.set(id, message);
    return message;
  };
  const wire = (m) => ({
    id: m.id, subject: m.subject, from: { emailAddress: { name: m.from.name, address: m.from.address } },
    toRecipients: m.to.map((p) => ({ emailAddress: p })), ccRecipients: m.cc.map((p) => ({ emailAddress: p })),
    receivedDateTime: m.receivedDateTime, sentDateTime: m.receivedDateTime, isRead: m.isRead, hasAttachments: m.hasAttachments,
    bodyPreview: m.body.content.replace(/<[^>]+>/g, ' ').trim().slice(0, 255), importance: m.importance, body: m.body, conversationId: 'conv-1',
    attachments: m.attachments.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.bytes.length, isInline: !!a.isInline })),
  });

  graph._setFetchForTests(async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method || 'GET').toUpperCase();
    if (url.hostname === 'login.microsoftonline.com') {
      state.calls.push({ method, path: 'TOKEN' });
      if (state.failToken) return json({ error: 'invalid_client', error_description: 'AADSTS7000215: secret leaked detail' }, 401);
      state.tokens += 1;
      return json({ access_token: `token-${state.tokens}`, expires_in: 3600 });
    }
    const auth = init.headers && init.headers.Authorization;
    const prefix = `/v1.0/users/${encodeURIComponent(MAILBOX)}`;
    const rest = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(prefix) + prefix.length));
    state.calls.push({ method, path: rest, auth, search: url.search, body: init.body ? JSON.parse(init.body) : undefined, prefer: init.headers && init.headers.Prefer });
    if (!url.pathname.startsWith(prefix)) return json({ error: { code: 'ErrorAccessDenied' } }, 403);
    if (!auth || !/^Bearer token-\d+$/.test(auth)) return json({ error: { code: 'InvalidAuthenticationToken' } }, 401);
    if (state.failNext) { const status = state.failNext; state.failNext = null; return json({ error: { code: 'x', message: 'Microsoft secret detail' } }, status); }

    let m;
    if ((m = rest.match(/^\/mailFolders\/(inbox|sentitems)\/messages$/)) && method === 'GET') {
      const top = Number(url.searchParams.get('$top')); const skip = Number(url.searchParams.get('$skip') || 0);
      const rows = [...state.messages.values()].filter((x) => x.folder === m[1]).sort((a, b) => b.receivedDateTime.localeCompare(a.receivedDateTime));
      return json({ value: rows.slice(skip, skip + top).map(wire) });
    }
    if ((m = rest.match(/^\/messages$/)) && method === 'POST') {
      const draft = add('drafts', { subject: init.body && JSON.parse(init.body).subject, body: { contentType: 'text', content: JSON.parse(init.body).body.content }, to: JSON.parse(init.body).toRecipients.map((r) => r.emailAddress) });
      return json({ id: draft.id }, 201);
    }
    if ((m = rest.match(/^\/messages\/([^/]+)\/(createReply|createReplyAll)$/)) && method === 'POST') {
      const original = state.messages.get(m[1]);
      if (!original) return json({}, 404);
      const draft = add('drafts', { subject: `RE: ${original.subject}`, body: { contentType: 'html', content: JSON.parse(init.body).comment }, replyTo: original.id, all: m[2] === 'createReplyAll' });
      return json({ id: draft.id }, 201);
    }
    if ((m = rest.match(/^\/messages\/([^/]+)\/send$/)) && method === 'POST') {
      const draft = state.messages.get(m[1]);
      if (!draft) return json({}, 404);
      if (state.failSend) { state.failSend = false; return json({}, 500); }
      draft.folder = 'sentitems';
      return new Response(null, { status: 202 });
    }
    if ((m = rest.match(/^\/messages\/([^/]+)\/attachments\/([^/]+)(\/\$value)?$/)) && method === 'GET') {
      const message = state.messages.get(m[1]);
      const attachment = message && message.attachments.find((a) => a.id === m[2]);
      if (!attachment) return json({}, 404);
      if (m[3]) return new Response(attachment.bytes, { status: 200, headers: { 'content-type': attachment.contentType } });
      return json({ '@odata.type': attachment.item ? '#microsoft.graph.itemAttachment' : '#microsoft.graph.fileAttachment', id: attachment.id, name: attachment.name, contentType: attachment.contentType, size: attachment.bytes.length });
    }
    if ((m = rest.match(/^\/messages\/([^/]+)$/))) {
      const message = state.messages.get(m[1]);
      if (!message) return json({ error: { code: 'ErrorItemNotFound' } }, 404);
      if (method === 'GET') return json(wire(message));
      if (method === 'PATCH') { message.isRead = JSON.parse(init.body).isRead; return json(wire(message)); }
      if (method === 'DELETE') { state.messages.delete(m[1]); return new Response(null, { status: 204 }); }
    }
    return json({ error: { code: 'NotImplementedInFake' } }, 400);
  });
  return { state, add, sent: () => [...state.messages.values()].filter((x) => x.folder === 'sentitems'), drafts: () => [...state.messages.values()].filter((x) => x.folder === 'drafts') };
}

const useConfig = () => Object.assign(process.env, ENV);
const clearConfig = () => { for (const key of Object.keys(ENV)) delete process.env[key]; };
const uninstall = () => graph._setFetchForTests();

module.exports = { install, uninstall, useConfig, clearConfig, MAILBOX, SECRET, ENV };
