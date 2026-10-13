/**
 * Client-first case references.
 *
 * Staff recognise a matter by the client's name, not by its case number, so every Staff DTO that points at a case carries
 * `clientName` and `caseType` beside `caseNumber`/`title`. This is the one place that looks them up.
 *
 * Callers pass only cases the actor is already allowed to see: a case's primary client is shown on the case itself to
 * everyone who can open it, so the name adds nothing that case access does not already grant.
 */
const ClientCase = require('../models/ClientCase');

const clientDisplayName = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '' : '');

/** `{ id, caseNumber, title, clientName, caseType }` for a set of case ids, in one query, keyed by id. */
async function caseRefs(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const cases = await ClientCase.find({ _id: { $in: unique } }).select('caseNumber title caseType primaryClient').populate('primaryClient', 'firstName lastName email').lean();
  return new Map(cases.map((c) => [String(c._id), { id: String(c._id), caseNumber: c.caseNumber, title: c.title, clientName: clientDisplayName(c.primaryClient), caseType: c.caseType }]));
}

/** Fills `clientName` and `caseType` on existing case references (`{ id, ... }`, nulls allowed). Mutates and returns them. */
async function addClientNames(refs) {
  const list = refs.filter((r) => r && r.id);
  const byId = await caseRefs(list.map((r) => r.id));
  for (const ref of list) {
    const c = byId.get(String(ref.id));
    ref.clientName = c ? c.clientName : '';
    ref.caseType = c ? c.caseType : null;
  }
  return refs;
}

module.exports = { caseRefs, addClientNames, clientDisplayName };
