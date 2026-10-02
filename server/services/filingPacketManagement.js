const crypto = require('crypto');
const mongoose = require('mongoose');

const FilingPacket = require('../models/FilingPacket');
const FilingPacketVersion = require('../models/FilingPacketVersion');
const PetitionVersion = require('../models/PetitionVersion');
const CaseDocument = require('../models/CaseDocument');
const DocumentVersion = require('../models/DocumentVersion');
const DocumentCategory = require('../models/DocumentCategory');
const CaseSmartForm = require('../models/CaseSmartForm');
const CaseActivity = require('../models/CaseActivity');
const C = require('../utils/filingPacketConstants');

/**
 * Filing Packet application service (ADR-023). Capability and case membership
 * are the route's job (filingPacketPolicy); this file owns what a change MEANS:
 * exact-version pinning, same-case source integrity, readiness, ordering, the
 * lifecycle and the immutable finalization snapshot. Every mutation takes the
 * expected packet `revision` and writes with `updateOne({ _id, revision,
 * status: { $in } }, { …, $inc: { revision: 1 } })` — never document.save() —
 * so a stale write is a conflict instead of an overwrite.
 *
 * A packet is a MANIFEST: no files are generated, merged, zipped or copied.
 * Downloads stay on the Phase 06 secure document routes.
 *
 * Outcomes: 'saved' | 'unchanged' | 'validation_error' | 'conflict' |
 * 'invalid_state' | 'not_found'.
 */

const id = (value) => (value ? String(value._id || value) : null);
const isId = (value) => mongoose.Types.ObjectId.isValid(value);
const iso = (value) => (value ? new Date(value).toISOString() : null);
const trimText = (value) => String(value ?? '').replace(/\r\n/g, '\n').trim();
const stamp = (actor) => ({ lastEditedBy: actor.id, lastEditedByName: actor.name });

// A document in one of these states can never be a filing source.
const UNUSABLE_DOCUMENT_STATUSES = ['archived', 'rejected', 'quarantined', 'superseded'];
const READY_FORM_STATUSES = ['approved', 'locked'];

async function recordActivity(packet, type, message, actor) {
  // Fail-open: an activity write must never undo the packet change it describes.
  try {
    await CaseActivity.record({ caseId: packet.case, workspaceId: packet.workspace, type, message, actor: { type: 'admin_user', id: actor.id, name: actor.name } });
  } catch (err) {
    console.error('[filing-packets] activity write failed', err.message);
  }
}

// ---------------------------------------------------------------------------
// Loading and the one atomic write
// ---------------------------------------------------------------------------

async function loadPacket(packetId) {
  if (!isId(packetId)) return null;
  return FilingPacket.findById(packetId).lean();
}

const listCasePackets = (caseId) => FilingPacket.find({ case: caseId }).sort({ sequence: 1 }).lean();
const fresh = (packet) => FilingPacket.findById(packet._id).lean();

function precondition(packet, expectedRevision, allowedStatuses) {
  if (!Number.isInteger(expectedRevision)) return { outcome: 'validation_error', errors: { revision: 'The current revision is required.' } };
  const current = { revision: packet.revision, status: packet.status };
  if (packet.revision !== expectedRevision) return { outcome: 'conflict', current };
  if (!allowedStatuses.includes(packet.status)) return { outcome: 'invalid_state', current };
  return null;
}

async function mutate(packet, expectedRevision, allowedStatuses, update, extraFilter = {}, options = {}) {
  const result = await FilingPacket.updateOne(
    { _id: packet._id, revision: expectedRevision, status: { $in: allowedStatuses }, ...extraFilter },
    { ...update, $inc: { revision: 1 } },
    options,
  );
  return result.matchedCount === 1;
}

async function conflict(packet) {
  const current = await FilingPacket.findById(packet._id).select('revision status').lean();
  return { outcome: 'conflict', current: current ? { revision: current.revision, status: current.status } : null };
}

// ---------------------------------------------------------------------------
// Create / provision / metadata
// ---------------------------------------------------------------------------

async function createPacket({ caseDoc, workspace, kind = 'initial_filing', title, description = '', actor, sequence = null }) {
  if (!C.PACKET_KINDS.includes(kind)) return { outcome: 'validation_error', errors: { kind: 'Choose a valid packet kind.' } };
  const name = trimText(title) || `${kind === 'initial_filing' ? 'Initial filing' : kind.replace(/_/g, ' ')} packet`;
  if (name.length > C.MAX_TITLE_LENGTH) return { outcome: 'validation_error', errors: { title: `Use at most ${C.MAX_TITLE_LENGTH} characters.` } };
  const text = trimText(description);
  if (text.length > C.MAX_DESCRIPTION_LENGTH) return { outcome: 'validation_error', errors: { description: `Use at most ${C.MAX_DESCRIPTION_LENGTH} characters.` } };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const next = sequence || ((await FilingPacket.findOne({ case: caseDoc._id }).sort({ sequence: -1 }).select('sequence').lean())?.sequence || 0) + 1;
    try {
      const created = await FilingPacket.create({
        case: caseDoc._id,
        workspace: workspace._id,
        sequence: next,
        kind,
        title: name,
        description: text,
        createdBy: actor.id,
        createdByName: actor.name,
        lastEditedBy: actor.id,
        lastEditedByName: actor.name,
      });
      await recordActivity(created, 'filing_packet_created', `Filing packet "${name}" was created by ${actor.name}.`, actor);
      return { outcome: 'saved', packet: created.toObject() };
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
      if (sequence) break; // a fixed sequence that already exists is the caller's idempotency case
    }
  }
  return { outcome: 'conflict', current: null };
}

/** Idempotent initial packet: kind=initial_filing, sequence=1. Never runs on read; there is no backfill. */
async function provisionInitialPacket({ caseDoc, workspace, actor }) {
  const existing = await FilingPacket.findOne({ case: caseDoc._id, kind: 'initial_filing', sequence: 1 }).lean();
  if (existing) return { outcome: 'unchanged', packet: existing };
  const created = await createPacket({ caseDoc, workspace, kind: 'initial_filing', actor, sequence: 1 });
  if (created.outcome === 'conflict') {
    const winner = await FilingPacket.findOne({ case: caseDoc._id, kind: 'initial_filing', sequence: 1 }).lean();
    if (winner) return { outcome: 'unchanged', packet: winner };
  }
  return created;
}

async function updateMetadata({ packet, revision, title, description, actor }) {
  const stop = precondition(packet, revision, C.EDITABLE_STATUSES);
  if (stop) return stop;
  const $set = { ...stamp(actor) };
  if (title !== undefined) {
    const name = trimText(title);
    if (!name || name.length > C.MAX_TITLE_LENGTH) return { outcome: 'validation_error', errors: { title: `Enter a title of up to ${C.MAX_TITLE_LENGTH} characters.` } };
    $set.title = name;
  }
  if (description !== undefined) {
    const text = trimText(description);
    if (text.length > C.MAX_DESCRIPTION_LENGTH) return { outcome: 'validation_error', errors: { description: `Use at most ${C.MAX_DESCRIPTION_LENGTH} characters.` } };
    $set.description = text;
  }
  if (!(await mutate(packet, revision, C.EDITABLE_STATUSES, { $set }))) return conflict(packet);
  return { outcome: 'saved', packet: await fresh(packet) };
}

// ---------------------------------------------------------------------------
// Sources: petition version and items
// ---------------------------------------------------------------------------

/** Pins the exact finalized PetitionVersion (or clears it). Cross-case ids are indistinguishable from missing. */
async function setPetitionVersion({ packet, revision, petitionVersionId, actor }) {
  const stop = precondition(packet, revision, C.EDITABLE_STATUSES);
  if (stop) return stop;

  let $set = { petitionVersion: null, petitionVersionNumberSnapshot: null, petitionTitleSnapshot: '', ...stamp(actor) };
  if (petitionVersionId) {
    if (!isId(petitionVersionId)) return { outcome: 'not_found' };
    const version = await PetitionVersion.findOne({ _id: petitionVersionId, case: packet.case, workspace: packet.workspace }).select('versionNumber reason titleSnapshot').lean();
    if (!version) return { outcome: 'not_found' };
    if (version.reason !== 'finalization') return { outcome: 'validation_error', errors: { petitionVersionId: 'Choose the finalized version of the petition, not an approval snapshot.' } };
    $set = { petitionVersion: version._id, petitionVersionNumberSnapshot: version.versionNumber, petitionTitleSnapshot: version.titleSnapshot, ...stamp(actor) };
  }
  if (!(await mutate(packet, revision, C.EDITABLE_STATUSES, { $set }))) return conflict(packet);
  return { outcome: 'saved', packet: await fresh(packet) };
}

function cleanItemMeta({ role, required, notes }, defaults = {}) {
  const errors = {};
  const out = {};
  if (role !== undefined) {
    if (!C.ITEM_ROLES.includes(role)) errors.role = 'Choose a valid role.';
    else out.role = role;
  } else if (defaults.role) out.role = defaults.role;
  if (required !== undefined) {
    if (typeof required !== 'boolean') errors.required = 'Required must be true or false.';
    else out.required = required;
  } else if (defaults.required !== undefined) out.required = defaults.required;
  if (notes !== undefined) {
    const text = trimText(notes);
    if (text.length > C.MAX_ITEM_NOTES_LENGTH) errors.notes = `Use at most ${C.MAX_ITEM_NOTES_LENGTH} characters.`;
    else out.notes = text;
  }
  return { out, errors };
}

const nextOrder = (packet) => packet.items.reduce((max, item) => Math.max(max, item.order), 0) + 1;
const renumber = (items) => items.map((item, index) => ({ ...item, order: index + 1 }));

async function pushItem(packet, revision, item, actor) {
  if (packet.items.length >= C.MAX_ITEMS) return { outcome: 'validation_error', errors: { items: `A packet can hold at most ${C.MAX_ITEMS} items.` } };
  if (!(await mutate(packet, revision, C.EDITABLE_STATUSES, { $push: { items: { ...item, order: nextOrder(packet) } }, $set: stamp(actor) }))) return conflict(packet);
  return { outcome: 'saved', packet: await fresh(packet) };
}

/** Pins the exact DocumentVersion; the packet never follows `currentVersion` afterwards. */
async function addDocumentItem({ packet, revision, documentId, versionId, role, required, notes, actor }) {
  const stop = precondition(packet, revision, C.EDITABLE_STATUSES);
  if (stop) return stop;
  if (!isId(documentId) || !isId(versionId)) return { outcome: 'not_found' };
  const meta = cleanItemMeta({ role, required, notes }, { role: 'supporting_evidence', required: true });
  if (Object.keys(meta.errors).length) return { outcome: 'validation_error', errors: meta.errors };

  const document = await CaseDocument.findOne({ _id: documentId, case: packet.case, workspace: packet.workspace }).select('status scanStatus').lean();
  if (!document) return { outcome: 'not_found' };
  const version = await DocumentVersion.findOne({ _id: versionId, document: document._id }).select('displayName scanStatus').lean();
  if (!version) return { outcome: 'not_found' }; // a version of some OTHER document is the same answer
  if (UNUSABLE_DOCUMENT_STATUSES.includes(document.status)) return { outcome: 'validation_error', errors: { documentId: `This document is ${document.status} and cannot be filed.` } };
  if (document.scanStatus === 'infected' || version.scanStatus === 'infected') return { outcome: 'validation_error', errors: { documentId: 'This file failed the security scan and cannot be filed.' } };
  if (packet.items.some((item) => item.type === 'document_version' && String(item.documentVersion) === String(version._id))) return { outcome: 'unchanged', packet };

  return pushItem(packet, revision, { type: 'document_version', document: document._id, documentVersion: version._id, labelSnapshot: version.displayName, ...meta.out }, actor);
}

/** Smart Forms are provenance references, never downloadable filing PDFs. The reviewed revision is pinned. */
async function addSmartFormReference({ packet, revision, smartFormId, role, required, notes, actor }) {
  const stop = precondition(packet, revision, C.EDITABLE_STATUSES);
  if (stop) return stop;
  if (!isId(smartFormId)) return { outcome: 'not_found' };
  const meta = cleanItemMeta({ role, required, notes }, { role: 'uscis_form', required: false });
  if (Object.keys(meta.errors).length) return { outcome: 'validation_error', errors: meta.errors };

  const form = await CaseSmartForm.findOne({ _id: smartFormId, case: packet.case, workspace: packet.workspace }).select('templateTitleSnapshot revision lockedRevision').lean();
  if (!form) return { outcome: 'not_found' };
  if (packet.items.some((item) => item.type === 'smart_form_reference' && String(item.smartForm) === String(form._id))) return { outcome: 'unchanged', packet };

  return pushItem(packet, revision, { type: 'smart_form_reference', smartForm: form._id, smartFormRevision: form.revision, smartFormLockedRevision: form.lockedRevision ?? null, labelSnapshot: form.templateTitleSnapshot, ...meta.out }, actor);
}

/** Role / required / notes only. Source ids are never editable: replace a source with remove + add. */
async function updateItem({ packet, revision, itemId, role, required, notes, actor }) {
  const stop = precondition(packet, revision, C.EDITABLE_STATUSES);
  if (stop) return stop;
  if (!isId(itemId) || !packet.items.some((item) => id(item) === String(itemId))) return { outcome: 'not_found' };
  const meta = cleanItemMeta({ role, required, notes });
  if (Object.keys(meta.errors).length) return { outcome: 'validation_error', errors: meta.errors };
  if (!Object.keys(meta.out).length) return { outcome: 'unchanged', packet };

  const $set = { ...stamp(actor), ...Object.fromEntries(Object.entries(meta.out).map(([key, value]) => [`items.$[i].${key}`, value])) };
  if (!(await mutate(packet, revision, C.EDITABLE_STATUSES, { $set }, {}, { arrayFilters: [{ 'i._id': new mongoose.Types.ObjectId(String(itemId)) }] }))) return conflict(packet);
  return { outcome: 'saved', packet: await fresh(packet) };
}

async function removeItem({ packet, revision, itemId, actor }) {
  const stop = precondition(packet, revision, C.EDITABLE_STATUSES);
  if (stop) return stop;
  if (!isId(itemId) || !packet.items.some((item) => id(item) === String(itemId))) return { outcome: 'not_found' };
  const items = renumber(packet.items.slice().sort((a, b) => a.order - b.order).filter((item) => id(item) !== String(itemId)));
  if (!(await mutate(packet, revision, C.EDITABLE_STATUSES, { $set: { items, ...stamp(actor) } }))) return conflict(packet);
  return { outcome: 'saved', packet: await fresh(packet) };
}

/** The browser's array order is never authority: the server accepts only the exact set of item ids and renumbers 1..N. */
async function reorderItems({ packet, revision, orderedItemIds, actor }) {
  const stop = precondition(packet, revision, C.EDITABLE_STATUSES);
  if (stop) return stop;
  const ids = Array.isArray(orderedItemIds) ? orderedItemIds.map(String) : null;
  if (!ids) return { outcome: 'validation_error', errors: { orderedItemIds: 'Send the ordered list of item ids.' } };
  const known = new Map(packet.items.map((item) => [id(item), item]));
  if (new Set(ids).size !== ids.length) return { outcome: 'validation_error', errors: { orderedItemIds: 'Each item may appear only once.' } };
  if (ids.length !== known.size || ids.some((itemId) => !known.has(itemId))) {
    return { outcome: 'validation_error', errors: { orderedItemIds: 'The list must contain exactly the items in this packet.' } };
  }
  const items = renumber(ids.map((itemId) => known.get(itemId)));
  if (!(await mutate(packet, revision, C.EDITABLE_STATUSES, { $set: { items, ...stamp(actor) } }))) return conflict(packet);
  return { outcome: 'saved', packet: await fresh(packet) };
}

// ---------------------------------------------------------------------------
// Readiness: one resolver
// ---------------------------------------------------------------------------

/**
 * Per-source readiness, deterministic and type-specific (ADR-023 §12). Returns
 * `{ petition, items }` where each entry carries `{ ready, status, reason, … }`
 * plus the live facts a snapshot needs. No scoring: ready is a fact per source,
 * never a statement about legal sufficiency.
 */
async function resolveReadiness(packet) {
  const docItems = packet.items.filter((item) => item.type === 'document_version');
  const formItems = packet.items.filter((item) => item.type === 'smart_form_reference');

  const [petitionVersion, documents, versions, forms] = await Promise.all([
    packet.petitionVersion ? PetitionVersion.findOne({ _id: packet.petitionVersion, case: packet.case, workspace: packet.workspace }).select('petition versionNumber reason titleSnapshot kind sourceRevision createdAt').lean() : null,
    CaseDocument.find({ _id: { $in: docItems.map((i) => i.document) }, case: packet.case, workspace: packet.workspace }).select('displayName status scanStatus category currentVersion').lean(),
    DocumentVersion.find({ _id: { $in: docItems.map((i) => i.documentVersion) } }).select('document versionNumber displayName detectedMimeType mimeType size scanStatus').lean(),
    CaseSmartForm.find({ _id: { $in: formItems.map((i) => i.smartForm) }, case: packet.case, workspace: packet.workspace }).select('templateKey templateVersion templateTitleSnapshot status revision lockedRevision').lean(),
  ]);
  const categories = documents.length ? await DocumentCategory.find({ _id: { $in: documents.map((d) => d.category) } }).select('name').lean() : [];
  const currentIds = documents.map((d) => d.currentVersion).filter(Boolean);
  const currents = currentIds.length ? await DocumentVersion.find({ _id: { $in: currentIds } }).select('versionNumber').lean() : [];

  const byId = (rows) => new Map(rows.map((row) => [String(row._id), row]));
  const documentById = byId(documents);
  const versionById = byId(versions);
  const formById = byId(forms);
  const categoryById = byId(categories);
  const currentById = byId(currents);

  // Petition source
  const required = C.PETITION_REQUIRED_KINDS.includes(packet.kind);
  let petition;
  if (!packet.petitionVersion) {
    petition = { required, present: false, ready: !required, status: 'none', reason: required ? 'Choose the finalized petition version for this packet.' : '' };
  } else if (!petitionVersion) {
    petition = { required, present: true, ready: false, status: 'missing', reason: 'The petition version is no longer available.' };
  } else if (petitionVersion.reason !== 'finalization') {
    petition = { required, present: true, ready: false, status: petitionVersion.reason, reason: 'Only a finalized petition version can be filed.', version: petitionVersion };
  } else {
    petition = { required, present: true, ready: true, status: 'finalized', reason: '', version: petitionVersion };
  }

  const items = packet.items.map((item) => {
    if (item.type === 'smart_form_reference') {
      const form = formById.get(String(item.smartForm));
      if (!form) return { itemId: id(item), ready: false, status: 'missing', reason: 'This form is no longer available.', label: item.labelSnapshot, source: null };
      let reason = '';
      if (!READY_FORM_STATUSES.includes(form.status)) reason = 'The form is not yet approved.';
      else if (form.revision !== item.smartFormRevision) reason = 'The form changed after it was added. Remove it and add the reviewed version.';
      return {
        itemId: id(item),
        ready: reason === '',
        status: form.status,
        reason,
        label: form.templateTitleSnapshot,
        source: { caseSmartFormId: id(form), templateKey: form.templateKey, templateVersion: form.templateVersion, revision: item.smartFormRevision, lockedRevision: item.smartFormLockedRevision, liveRevision: form.revision },
      };
    }

    const document = documentById.get(String(item.document));
    const version = versionById.get(String(item.documentVersion));
    if (!document || !version || String(version.document) !== String(document._id)) {
      return { itemId: id(item), ready: false, status: 'missing', reason: 'This document version is no longer available.', label: item.labelSnapshot, source: null };
    }
    let reason = '';
    if (UNUSABLE_DOCUMENT_STATUSES.includes(document.status)) reason = `The document is ${document.status}.`;
    else if (document.scanStatus === 'infected' || version.scanStatus === 'infected') reason = 'The file failed the security scan.';
    else if (document.status !== 'accepted') reason = 'The document has not been accepted yet.';
    const current = document.currentVersion ? currentById.get(String(document.currentVersion)) : null;
    return {
      itemId: id(item),
      ready: reason === '',
      status: document.status,
      reason,
      label: version.displayName,
      source: {
        documentId: id(document),
        documentVersionId: id(version),
        versionNumber: version.versionNumber,
        mimeType: version.detectedMimeType || version.mimeType,
        size: version.size,
        categoryName: (categoryById.get(String(document.category)) || {}).name || '',
        currentVersionNumber: current ? current.versionNumber : null,
      },
    };
  });

  const requiredItems = packet.items.map((item, i) => ({ item, state: items[i] })).filter(({ item }) => item.required);
  const summary = {
    petitionReady: petition.ready,
    requiredReady: requiredItems.filter(({ state }) => state.ready).length,
    requiredTotal: requiredItems.length,
    itemCount: packet.items.length,
  };
  summary.ready = petition.ready && summary.requiredReady === summary.requiredTotal && summary.itemCount > 0;
  return { petition, items, summary };
}

// ---------------------------------------------------------------------------
// Manifest hash and the immutable snapshot
// ---------------------------------------------------------------------------

/**
 * sha256 over a canonical, fixed-key-order JSON of the manifest's identity.
 * An audit fingerprint to detect accidental snapshot drift — NOT a signature,
 * e-signature or legal attestation.
 */
function computeManifestHash({ packetId, versionNumber, sourceRevision, petitionVersionId, items }) {
  const canonical = {
    packet: String(packetId),
    version: versionNumber,
    sourceRevision,
    petitionVersion: petitionVersionId ? String(petitionVersionId) : null,
    items: items
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => ({
        order: item.order,
        type: item.type,
        role: item.role,
        required: !!item.required,
        document: item.documentId ? String(item.documentId) : null,
        documentVersion: item.documentVersionId ? String(item.documentVersionId) : null,
        smartForm: item.caseSmartFormId ? String(item.caseSmartFormId) : null,
        smartFormRevision: item.revision ?? null,
        smartFormLockedRevision: item.lockedRevision ?? null,
      })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function snapshotItems(packet, readiness) {
  return packet.items
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => {
      const state = readiness.items[packet.items.findIndex((i) => id(i) === id(item))];
      const base = { order: item.order, type: item.type, role: item.role, required: item.required, label: state.label, notes: item.notes };
      if (item.type === 'smart_form_reference') {
        return { ...base, caseSmartFormId: item.smartForm, templateKey: state.source.templateKey, templateVersion: state.source.templateVersion, revision: item.smartFormRevision, lockedRevision: item.smartFormLockedRevision ?? undefined, status: state.status };
      }
      return { ...base, documentId: item.document, documentVersionId: item.documentVersion, displayName: state.label, versionNumber: state.source.versionNumber, mimeType: state.source.mimeType, size: state.source.size, categoryName: state.source.categoryName, documentStatus: state.status };
    });
}

/** `packet` is the post-transition document. Retries a lost version-number race. */
async function createPacketVersion({ packet, readiness, actor }) {
  const items = snapshotItems(packet, readiness);
  const version = readiness.petition.version;
  const petitionSource = version
    ? { petitionVersionId: version._id, petitionId: version.petition, versionNumber: version.versionNumber, sourceRevision: version.sourceRevision, petitionKind: version.kind, petitionTitle: version.titleSnapshot, createdAt: version.createdAt }
    : null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await FilingPacketVersion.findOne({ packet: packet._id }).sort({ versionNumber: -1 }).select('versionNumber').lean();
    const versionNumber = (last ? last.versionNumber : 0) + 1;
    try {
      return await FilingPacketVersion.create({
        packet: packet._id,
        case: packet.case,
        workspace: packet.workspace,
        versionNumber,
        reason: 'finalization',
        sourceRevision: packet.revision,
        kind: packet.kind,
        titleSnapshot: packet.title,
        descriptionSnapshot: packet.description,
        petitionSource,
        items,
        manifestHash: computeManifestHash({ packetId: packet._id, versionNumber, sourceRevision: packet.revision, petitionVersionId: version ? version._id : null, items }),
        createdBy: actor.id,
        createdByName: actor.name,
      });
    } catch (err) {
      if (!(err && err.code === 11000)) throw err;
    }
  }
  throw new Error('Could not allocate a packet version number.');
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

const requiresPetition = (packet) => C.PETITION_REQUIRED_KINDS.includes(packet.kind);

async function submitPacket({ packet, revision, actor }) {
  const stop = precondition(packet, revision, C.EDITABLE_STATUSES);
  if (stop) return stop;
  const errors = {};
  if (requiresPetition(packet) && !packet.petitionVersion) errors.petitionVersion = 'Choose the finalized petition version first.';
  if (!packet.items.length) errors.items = 'Add at least one filing item.';
  if (Object.keys(errors).length) return { outcome: 'validation_error', errors };

  // Submitting needs a coherent manifest, not a ready one: readiness gates finalization.
  const $set = { status: 'review', readyAt: new Date(), ...stamp(actor) };
  if (!(await mutate(packet, revision, C.EDITABLE_STATUSES, { $set }))) return conflict(packet);
  await recordActivity(packet, 'filing_packet_submitted', `Filing packet "${packet.title}" was submitted for review by ${actor.name}.`, actor);
  return { outcome: 'saved', packet: await fresh(packet) };
}

async function returnPacket({ packet, revision, note, actor }) {
  const stop = precondition(packet, revision, ['review', 'approved']);
  if (stop) return stop;
  const reason = trimText(note);
  if (!reason) return { outcome: 'validation_error', errors: { internalReviewNote: 'Tell the team what to change.' } };
  if (reason.length > C.MAX_NOTE_LENGTH) return { outcome: 'validation_error', errors: { internalReviewNote: `Use at most ${C.MAX_NOTE_LENGTH} characters.` } };

  const $set = { status: 'needs_changes', internalReviewNote: reason, approvedAt: null, approvedBy: null, approvedByName: '', ...stamp(actor) };
  if (!(await mutate(packet, revision, ['review', 'approved'], { $set }))) return conflict(packet);
  await recordActivity(packet, 'filing_packet_returned', `Filing packet "${packet.title}" was returned for changes by ${actor.name}.`, actor);
  return { outcome: 'saved', packet: await fresh(packet) };
}

async function approvePacket({ packet, revision, actor }) {
  const stop = precondition(packet, revision, ['review']);
  if (stop) return stop;
  const errors = {};
  if (requiresPetition(packet) && !packet.petitionVersion) errors.petitionVersion = 'A finalized petition version is required.';
  if (!packet.items.length) errors.items = 'The packet has no items.';
  const readiness = await resolveReadiness(packet);
  packet.items.forEach((item, i) => {
    if (readiness.items[i].status === 'missing') errors[`item:${id(item)}`] = `${readiness.items[i].label}: ${readiness.items[i].reason}`;
  });
  if (readiness.petition.status === 'missing') errors.petitionVersion = readiness.petition.reason;
  if (Object.keys(errors).length) return { outcome: 'validation_error', errors };

  const $set = { status: 'approved', approvedAt: new Date(), approvedBy: actor.id, approvedByName: actor.name, internalReviewNote: '', ...stamp(actor) };
  if (!(await mutate(packet, revision, ['review'], { $set }))) return conflict(packet);
  await recordActivity(packet, 'filing_packet_approved', `Filing packet "${packet.title}" was approved by ${actor.name}.`, actor);
  return { outcome: 'saved', packet: await fresh(packet) };
}

/**
 * Status flips first (atomic, revision-guarded), then the immutable version is
 * written; if the version cannot be written the status is put back, the
 * response is a conflict, and no finalization activity is recorded — a packet is
 * never reported finalized without its snapshot. (No multi-document
 * transaction: a standalone Mongo has none.)
 */
async function finalizePacket({ packet, revision, actor }) {
  const stop = precondition(packet, revision, ['approved']);
  if (stop) return stop;
  const readiness = await resolveReadiness(packet);
  const errors = {};
  if (requiresPetition(packet) && !readiness.petition.ready) errors.petitionVersion = readiness.petition.reason || 'The petition source is not ready.';
  else if (packet.petitionVersion && !readiness.petition.ready) errors.petitionVersion = readiness.petition.reason;
  if (!packet.items.length) errors.items = 'The packet has no items.';
  packet.items.forEach((item, i) => {
    const state = readiness.items[i];
    if (state.status === 'missing' || (item.required && !state.ready)) errors[`item:${id(item)}`] = `${state.label}: ${state.reason}`;
  });
  if (Object.keys(errors).length) return { outcome: 'validation_error', errors };

  const $set = { status: 'finalized', finalizedAt: new Date(), finalizedBy: actor.id, finalizedByName: actor.name, ...stamp(actor) };
  if (!(await mutate(packet, revision, ['approved'], { $set }))) return conflict(packet);
  const next = await fresh(packet);
  try {
    await createPacketVersion({ packet: next, readiness, actor });
  } catch (err) {
    console.error('[filing-packets] version snapshot failed; reverting status', err.message);
    await FilingPacket.updateOne({ _id: packet._id, revision: next.revision }, { $set: { status: 'approved', finalizedAt: null, finalizedBy: null, finalizedByName: '' }, $inc: { revision: 1 } });
    return { outcome: 'conflict', current: null, message: 'The snapshot could not be saved; nothing was changed. Please try again.' };
  }
  await recordActivity(next, 'filing_packet_finalized', `Filing packet "${next.title}" was finalized by ${actor.name}.`, actor);
  return { outcome: 'saved', packet: next };
}

// ---------------------------------------------------------------------------
// Candidates (bounded, same case only, safe metadata only)
// ---------------------------------------------------------------------------

async function listCandidates(packet, type) {
  const scope = { case: packet.case, workspace: packet.workspace };
  if (type === 'petition_version') {
    const rows = await PetitionVersion.find({ ...scope, reason: 'finalization' }).sort({ createdAt: -1 }).limit(100).select('petition versionNumber titleSnapshot kind createdAt').lean();
    return rows.map((r) => ({ petitionVersionId: id(r), petitionId: id(r.petition), versionNumber: r.versionNumber, title: r.titleSnapshot, kind: r.kind, createdAt: iso(r.createdAt), linked: String(packet.petitionVersion) === String(r._id) }));
  }
  if (type === 'document_version') {
    const docs = await CaseDocument.find({ ...scope, status: 'accepted', currentVersion: { $ne: null } }).sort({ createdAt: -1 }).limit(100).select('category currentVersion').lean();
    const [versions, categories] = await Promise.all([
      DocumentVersion.find({ _id: { $in: docs.map((d) => d.currentVersion) } }).select('document versionNumber displayName detectedMimeType mimeType size').lean(),
      DocumentCategory.find({ _id: { $in: docs.map((d) => d.category) } }).select('name').lean(),
    ]);
    const versionById = new Map(versions.map((v) => [String(v._id), v]));
    const categoryById = new Map(categories.map((c) => [String(c._id), c.name]));
    const linked = new Set(packet.items.filter((i) => i.type === 'document_version').map((i) => String(i.documentVersion)));
    return docs
      .map((d) => ({ doc: d, version: versionById.get(String(d.currentVersion)) }))
      .filter(({ version }) => version)
      .map(({ doc, version }) => ({ documentId: id(doc), versionId: id(version), displayName: version.displayName, versionNumber: version.versionNumber, categoryName: categoryById.get(String(doc.category)) || '', status: 'accepted', mimeType: version.detectedMimeType || version.mimeType, size: version.size, linked: linked.has(String(version._id)) }));
  }
  if (type === 'smart_form') {
    const forms = await CaseSmartForm.find({ ...scope, status: { $in: READY_FORM_STATUSES } }).sort({ templateKey: 1 }).limit(100).select('templateTitleSnapshot status revision').lean();
    const linked = new Set(packet.items.filter((i) => i.type === 'smart_form_reference').map((i) => String(i.smartForm)));
    return forms.map((f) => ({ smartFormId: id(f), title: f.templateTitleSnapshot, status: f.status, revision: f.revision, linked: linked.has(String(f._id)) }));
  }
  return null;
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

const listVersions = (packetId) => FilingPacketVersion.find({ packet: packetId }).sort({ versionNumber: -1 }).limit(100).lean();

async function getVersion(packetId, versionId) {
  if (!isId(versionId)) return null;
  return FilingPacketVersion.findOne({ _id: versionId, packet: packetId }).lean();
}

// ---------------------------------------------------------------------------
// DTOs. Never hand a Mongoose document, a user record or a storage field to a route.
// ---------------------------------------------------------------------------

function packetActions(packet, caps) {
  const editable = C.EDITABLE_STATUSES.includes(packet.status);
  return {
    canManage: caps.manage && editable,
    canSubmit: caps.manage && editable,
    canReturn: caps.review && ['review', 'approved'].includes(packet.status),
    canApprove: caps.review && packet.status === 'review',
    canFinalize: caps.finalize && packet.status === 'approved',
  };
}

const readinessDto = (readiness) => ({
  ready: readiness.summary.ready,
  petitionReady: readiness.summary.petitionReady,
  requiredReady: readiness.summary.requiredReady,
  requiredTotal: readiness.summary.requiredTotal,
});

function toSummary(packet, readiness, caps) {
  return {
    id: id(packet),
    caseId: id(packet.case),
    sequence: packet.sequence,
    kind: packet.kind,
    title: packet.title,
    status: packet.status,
    revision: packet.revision,
    itemCount: packet.items.length,
    readiness: readinessDto(readiness),
    updatedAt: iso(packet.updatedAt),
    actions: packetActions(packet, caps),
  };
}

function toItemDto(item, state, caps) {
  const isDocument = item.type === 'document_version';
  return {
    id: id(item),
    type: item.type,
    role: item.role,
    label: state.label,
    order: item.order,
    required: item.required,
    notes: item.notes,
    ready: state.ready,
    status: state.status,
    reason: state.reason,
    source: state.source
      ? isDocument
        ? { documentId: state.source.documentId, documentVersionId: state.source.documentVersionId, versionNumber: state.source.versionNumber, mimeType: state.source.mimeType, size: state.source.size, categoryName: state.source.categoryName, currentVersionNumber: state.source.currentVersionNumber }
        : { caseSmartFormId: state.source.caseSmartFormId, templateKey: state.source.templateKey, templateVersion: state.source.templateVersion, revision: state.source.revision, lockedRevision: state.source.lockedRevision }
      : null,
    // Identifiers for the existing Phase 06 secure route; the packet serves no bytes itself.
    downloadAction: isDocument && state.source && caps.downloadVersions ? { documentId: state.source.documentId, versionId: state.source.documentVersionId } : null,
  };
}

const petitionDto = (packet, petition) => ({
  required: petition.required,
  present: petition.present,
  ready: petition.ready,
  status: petition.status,
  reason: petition.reason,
  petitionVersionId: id(packet.petitionVersion),
  versionNumber: packet.petitionVersionNumberSnapshot,
  title: packet.petitionTitleSnapshot,
});

function toDetail(packet, readiness, caps, versions = []) {
  return {
    ...toSummary(packet, readiness, caps),
    description: packet.description,
    petitionSource: petitionDto(packet, readiness.petition),
    items: packet.items.slice().sort((a, b) => a.order - b.order).map((item) => toItemDto(item, readiness.items[packet.items.findIndex((i) => id(i) === id(item))], caps)),
    internalReviewNote: packet.internalReviewNote,
    approvedAt: iso(packet.approvedAt),
    approvedByName: packet.approvedByName,
    finalizedAt: iso(packet.finalizedAt),
    finalizedByName: packet.finalizedByName,
    versions: versions.map(toVersionSummary),
  };
}

const toVersionSummary = (version) => ({
  id: id(version),
  versionNumber: version.versionNumber,
  manifestHash: version.manifestHash,
  createdByName: version.createdByName,
  createdAt: iso(version.createdAt),
});

function toVersionDetail(version, caps) {
  const source = version.petitionSource;
  return {
    ...toVersionSummary(version),
    packetId: id(version.packet),
    kind: version.kind,
    title: version.titleSnapshot,
    description: version.descriptionSnapshot,
    sourceRevision: version.sourceRevision,
    petitionSource: source ? { petitionVersionId: id(source.petitionVersionId), petitionId: id(source.petitionId), versionNumber: source.versionNumber, sourceRevision: source.sourceRevision, petitionKind: source.petitionKind, petitionTitle: source.petitionTitle, createdAt: iso(source.createdAt) } : null,
    items: version.items.map((item) => ({
      order: item.order,
      type: item.type,
      role: item.role,
      required: item.required,
      label: item.label,
      notes: item.notes,
      status: item.type === 'document_version' ? item.documentStatus : item.status,
      source:
        item.type === 'document_version'
          ? { documentId: id(item.documentId), documentVersionId: id(item.documentVersionId), versionNumber: item.versionNumber, mimeType: item.mimeType, size: item.size, categoryName: item.categoryName }
          : { caseSmartFormId: id(item.caseSmartFormId), templateKey: item.templateKey, templateVersion: item.templateVersion, revision: item.revision, lockedRevision: item.lockedRevision ?? null },
      downloadAction: item.type === 'document_version' && caps.downloadVersions ? { documentId: id(item.documentId), versionId: id(item.documentVersionId) } : null,
    })),
  };
}

module.exports = {
  loadPacket,
  listCasePackets,
  createPacket,
  provisionInitialPacket,
  updateMetadata,
  setPetitionVersion,
  addDocumentItem,
  addSmartFormReference,
  updateItem,
  removeItem,
  reorderItems,
  resolveReadiness,
  listCandidates,
  submitPacket,
  returnPacket,
  approvePacket,
  finalizePacket,
  listVersions,
  getVersion,
  computeManifestHash,
  toSummary,
  toDetail,
  toVersionSummary,
  toVersionDetail,
};
