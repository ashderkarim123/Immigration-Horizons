/**
 * Who a mail correspondent is in OUR records (ADR-030): a client account and/or a consultation enquiry, matched by email
 * address. Each match is returned only when the employee may already see that kind of record, so linking a name never reveals
 * anything the Clients or Leads screens would not.
 */
const ClientUser = require('../../models/ClientUser');
const Consultation = require('../../models/Consultation');
const { leadScope } = require('../leadPolicy');
const { can } = require('../../utils/permissions');

const MAX_ADDRESSES = 50;
const escape = require('../../utils/escapeRegex');
const { clientDisplayName: displayName } = require('../caseRef');

/** @returns {Promise<Map<string, { client: object|null, lead: object|null }>>} keyed by lowercased address */
async function resolve(req, addresses) {
  const wanted = [...new Set((addresses || []).map((a) => String(a || '').trim().toLowerCase()).filter(Boolean))].slice(0, MAX_ADDRESSES);
  const found = new Map(wanted.map((address) => [address, { client: null, lead: null }]));
  if (!wanted.length) return found;

  if (can(req, 'clients.view')) {
    const clients = await ClientUser.find({ normalizedEmail: { $in: wanted }, status: { $ne: 'disabled' } }).select('firstName lastName email normalizedEmail').lean();
    for (const client of clients) {
      const entry = found.get(client.normalizedEmail);
      if (entry) entry.client = { id: String(client._id), name: displayName(client) };
    }
  }

  if (can(req, 'leads.view')) {
    // Newest enquiry per address; an enquiry form accepts any capitalization, so the match is case-insensitive.
    const scope = await leadScope(req); // asynchronous: it consults case membership
    const leads = await Consultation.find({ ...scope, email: { $in: wanted.map((a) => new RegExp(`^${escape(a)}$`, 'i')) } })
      .sort({ createdAt: -1 }).select('name email status service clientUser convertedCase').lean();
    for (const lead of leads) {
      const entry = found.get(String(lead.email).trim().toLowerCase());
      if (entry && !entry.lead) {
        entry.lead = {
          id: String(lead._id), name: lead.name, status: lead.status, service: lead.service || '',
          // The same rule as the lead page: an enquiry becomes a case only once it is tied to a client account.
          canConvert: can(req, 'cases.create') && !!lead.clientUser && !lead.convertedCase,
        };
      }
    }
  }
  return found;
}

/** Adds `client` and `lead` to each item's `contact` (in place). Items without a contact are left as they are. */
async function attach(req, items) {
  const matches = await resolve(req, items.map((item) => item.contact && item.contact.address));
  for (const item of items) {
    if (!item.contact) continue;
    const match = matches.get(item.contact.address) || { client: null, lead: null };
    item.contact = { ...item.contact, client: match.client, lead: match.lead };
  }
  return items;
}

module.exports = { resolve, attach };
