/**
 * Client-first case references.
 *
 * Staff recognise a matter by the client's name, not by its case number, so every Staff DTO that points at a case carries
 * `clientName` and `caseType` beside `caseNumber`/`title`. This is the one place that looks them up.
 *
 * Callers pass only references to cases the actor is already allowed to see: a case's primary client is shown on the case
 * itself to everyone who can open it, so the name adds nothing that case access does not already grant.
 */
const ClientCase = require('../models/ClientCase');

const clientDisplayName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '' : '');

/** Fills `clientName` and `caseType` on case references (`{ id, ... }`, nulls allowed) in one query. Mutates and returns them. */
async function addClientNames(refs) {
  const list = refs.filter((r) => r && r.id);
  const ids = [...new Set(list.map((r) => String(r.id)))];
  if (!ids.length) return refs;
  const cases = await ClientCase.find({ _id: { $in: ids } }).select('caseType primaryClient').populate('primaryClient', 'firstName lastName email').lean();
  const byId = new Map(cases.map((c) => [String(c._id), c]));
  for (const ref of list) {
    const c = byId.get(String(ref.id));
    ref.clientName = c ? clientDisplayName(c.primaryClient) : '';
    ref.caseType = c ? c.caseType : null;
  }
  return refs;
}

module.exports = { addClientNames, clientDisplayName };
