const slugify = require('slugify');

const DocumentCategory = require('../models/DocumentCategory');
const CaseActivity = require('../models/CaseActivity');
const { DEFAULT_CATEGORY_TEMPLATE, CATEGORY_VISIBILITY, CATEGORY_ALLOWED_UPLOADER_TYPES } = require('../utils/documentConstants');

/**
 * Idempotent default-category provisioning — see
 * docs/architecture/ADR-004-secure-document-storage.md §18/§19. Only
 * inserts categories whose `templateKey` doesn't already exist for this
 * case, so re-running (new-case creation, the historical-backfill admin
 * action, or the dry-run script) never creates duplicates and never
 * touches a category a manager has already customized.
 *
 * Deliberately does not write CaseActivity/notifications itself — callers
 * (caseConversion.js inside its transaction; the admin backfill route
 * outside one) log/notify afterward, best-effort, matching the existing
 * "mutate inside the transaction, audit after it commits" convention
 * caseConversion.js itself already uses.
 */
async function provisionDefaultCategories({ caseId, workspaceId, session } = {}) {
  const existing = await DocumentCategory.find(
    { case: caseId },
    { templateKey: 1 },
    { session: session || undefined },
  ).lean();
  const existingKeys = new Set(existing.map((c) => c.templateKey).filter(Boolean));

  const toCreate = DEFAULT_CATEGORY_TEMPLATE.filter((t) => !existingKeys.has(t.templateKey));
  if (toCreate.length === 0) {
    return { created: [], skipped: DEFAULT_CATEGORY_TEMPLATE.map((t) => t.templateKey) };
  }

  const docs = toCreate.map((t) => ({
    case: caseId,
    workspace: workspaceId,
    templateKey: t.templateKey,
    name: t.name,
    slug: t.slug,
    description: t.description,
    order: t.order,
    visibility: t.visibility,
    allowedUploaderTypes: t.allowedUploaderTypes,
    required: t.required,
    active: true,
    createdBy: null,
  }));

  const created = await DocumentCategory.insertMany(docs, { session: session || undefined, ordered: false });
  return { created: created.map((c) => c.templateKey), skipped: [...existingKeys] };
}

/** Read-only preview for the dry-run script and the admin confirmation screen. */
async function previewProvisioning(caseId) {
  const existing = await DocumentCategory.find({ case: caseId }, { templateKey: 1 }).lean();
  const existingKeys = new Set(existing.map((c) => c.templateKey).filter(Boolean));
  const missing = DEFAULT_CATEGORY_TEMPLATE.filter((t) => !existingKeys.has(t.templateKey)).map((t) => t.templateKey);
  return { missing, alreadyProvisioned: [...existingKeys] };
}

// ---------------------------------------------------------------------------
// Manager-facing category customization (module doc §10: rename, reorder,
// add, disable, reactivate, change visibility/uploader type/required —
// never available to clients).
// ---------------------------------------------------------------------------

async function nextOrderFor(caseId) {
  const highest = await DocumentCategory.findOne({ case: caseId }).sort({ order: -1 }).select('order').lean();
  return (highest ? highest.order : 0) + 1;
}

async function createCategory({ caseId, workspaceId, name, description, visibility, allowedUploaderTypes, required, actor }) {
  if (!name || !name.trim()) {
    return { outcome: 'validation_error', errors: { name: 'Name is required.' } };
  }
  if (!CATEGORY_VISIBILITY.includes(visibility)) {
    return { outcome: 'validation_error', errors: { visibility: 'Invalid visibility.' } };
  }
  if (!CATEGORY_ALLOWED_UPLOADER_TYPES.includes(allowedUploaderTypes)) {
    return { outcome: 'validation_error', errors: { allowedUploaderTypes: 'Invalid uploader type.' } };
  }

  const slug = slugify(name, { lower: true, strict: true });
  const existing = await DocumentCategory.findOne({ case: caseId, slug });
  if (existing) {
    return { outcome: 'validation_error', errors: { name: 'A category with this name already exists on this case.' } };
  }

  const order = await nextOrderFor(caseId);
  const category = await DocumentCategory.create({
    case: caseId,
    workspace: workspaceId,
    templateKey: null,
    name: name.trim(),
    slug,
    description: (description || '').trim(),
    order,
    visibility,
    allowedUploaderTypes,
    required: !!required,
    active: true,
    createdBy: actor.id,
  });

  try {
    await CaseActivity.record({
      caseId,
      workspaceId,
      type: 'category_created',
      message: `Category "${category.name}" created by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after category creation:', err.message);
  }

  return { outcome: 'created', category };
}

async function updateCategory({ categoryId, name, description, visibility, allowedUploaderTypes, required, actor }) {
  const category = await DocumentCategory.findById(categoryId);
  if (!category) return { outcome: 'not_found' };

  if (name && name.trim() && name.trim() !== category.name) {
    const slug = slugify(name, { lower: true, strict: true });
    const conflict = await DocumentCategory.findOne({ case: category.case, slug, _id: { $ne: category._id } });
    if (conflict) {
      return { outcome: 'validation_error', errors: { name: 'A category with this name already exists on this case.' } };
    }
    category.name = name.trim();
    category.slug = slug;
  }
  if (typeof description === 'string') category.description = description.trim();
  if (visibility && CATEGORY_VISIBILITY.includes(visibility)) category.visibility = visibility;
  if (allowedUploaderTypes && CATEGORY_ALLOWED_UPLOADER_TYPES.includes(allowedUploaderTypes)) {
    category.allowedUploaderTypes = allowedUploaderTypes;
  }
  if (typeof required === 'boolean') category.required = required;

  await category.save();

  try {
    await CaseActivity.record({
      caseId: category.case,
      workspaceId: category.workspace,
      type: 'category_renamed',
      message: `Category "${category.name}" updated by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after category update:', err.message);
  }

  return { outcome: 'updated', category };
}

async function disableCategory({ categoryId, actor }) {
  const category = await DocumentCategory.findById(categoryId);
  if (!category) return { outcome: 'not_found' };
  if (!category.active) return { outcome: 'unchanged', category };

  category.active = false;
  await category.save();

  try {
    await CaseActivity.record({
      caseId: category.case,
      workspaceId: category.workspace,
      type: 'category_disabled',
      message: `Category "${category.name}" disabled by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after disabling a category:', err.message);
  }

  return { outcome: 'updated', category };
}

async function reactivateCategory({ categoryId, actor }) {
  const category = await DocumentCategory.findById(categoryId);
  if (!category) return { outcome: 'not_found' };
  if (category.active) return { outcome: 'unchanged', category };

  // Another category may have taken this order slot while this one was
  // disabled (the partial unique index only covers active:true) — reuse it
  // only if still free, otherwise append to the end rather than colliding.
  const conflict = await DocumentCategory.findOne({ case: category.case, order: category.order, active: true });
  if (conflict) {
    category.order = await nextOrderFor(category.case);
  }
  category.active = true;
  await category.save();

  try {
    await CaseActivity.record({
      caseId: category.case,
      workspaceId: category.workspace,
      type: 'category_reactivated',
      message: `Category "${category.name}" reactivated by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after reactivating a category:', err.message);
  }

  return { outcome: 'updated', category };
}

/**
 * Reorders a case's categories to match `orderedCategoryIds` exactly.
 * Rejects if any id is missing or belongs to a different case (module doc
 * §10). Uses a two-phase update (temporary negative orders, then final
 * positive ones) so the unique-partial `(case, order)` index never sees a
 * transient collision mid-reorder — a direct in-place swap would.
 */
async function reorderCategories({ caseId, orderedCategoryIds, actor }) {
  if (!Array.isArray(orderedCategoryIds) || orderedCategoryIds.length === 0) {
    return { outcome: 'validation_error', errors: { order: 'No categories provided.' } };
  }

  const categories = await DocumentCategory.find({ case: caseId, active: true });
  const categoryIds = new Set(categories.map((c) => String(c._id)));
  const requestedIds = orderedCategoryIds.map(String);

  if (requestedIds.some((id) => !categoryIds.has(id))) {
    return { outcome: 'validation_error', errors: { order: 'One or more categories do not belong to this case.' } };
  }
  if (new Set(requestedIds).size !== categoryIds.size || requestedIds.length !== categoryIds.size) {
    return { outcome: 'validation_error', errors: { order: 'The full set of active categories must be provided.' } };
  }

  const alreadyInOrder = requestedIds.every((id, index) => {
    const category = categories.find((c) => String(c._id) === id);
    return category.order === index + 1;
  });
  if (alreadyInOrder) return { outcome: 'unchanged' };

  await Promise.all(
    requestedIds.map((id, index) =>
      DocumentCategory.updateOne({ _id: id }, { $set: { order: -1 * (index + 1) } }),
    ),
  );
  await Promise.all(
    requestedIds.map((id, index) => DocumentCategory.updateOne({ _id: id }, { $set: { order: index + 1 } })),
  );

  try {
    await CaseActivity.record({
      caseId,
      workspaceId: categories[0].workspace,
      type: 'category_reordered',
      message: `Document categories reordered by ${actor.name}.`,
      actor,
    });
  } catch (err) {
    console.error('[documents] audit failed after reordering categories:', err.message);
  }

  return { outcome: 'updated' };
}

module.exports = {
  provisionDefaultCategories,
  previewProvisioning,
  createCategory,
  updateCategory,
  disableCategory,
  reactivateCategory,
  reorderCategories,
};
