const crypto = require('crypto');

const SmartFormTemplate = require('../../models/SmartFormTemplate');
const { validateTemplateDefinition } = require('./engine');
const { CATALOG } = require('./catalog');

/**
 * Idempotent, INSERT-ONLY template seeding (ADR-021 §20). A (key, version)
 * that already exists is compared by content hash and left alone; if the
 * code-owned definition no longer matches what was published, this throws —
 * a published version is never rewritten, you ship a new version instead.
 */

const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};

function contentHash(definition) {
  const { title, description, caseTypes, audience, schemaVersion, sections } = definition;
  return crypto
    .createHash('sha256')
    .update(stable({ title, description: description || '', caseTypes, audience: audience || 'client_and_staff', schemaVersion: schemaVersion || 1, sections }))
    .digest('hex');
}

/** Throws with every problem across the catalog, so a bad definition fails loudly in one pass. */
function assertCatalogValid(catalog = CATALOG) {
  const problems = catalog.flatMap((definition) => validateTemplateDefinition(definition).map((p) => `${definition.key}: ${p}`));
  const identities = catalog.map((d) => `${d.key}@${d.version}`);
  if (new Set(identities).size !== identities.length) problems.push('Duplicate (key, version) in the catalog.');
  if (problems.length) throw new Error(`Smart Forms catalog is invalid:\n- ${problems.join('\n- ')}`);
}

async function seedTemplates({ dryRun = false, catalog = CATALOG } = {}) {
  assertCatalogValid(catalog);
  const created = [];
  const unchanged = [];

  for (const definition of catalog) {
    const hash = contentHash(definition);
    const label = `${definition.key}@${definition.version}`;
    const existing = await SmartFormTemplate.findOne({ key: definition.key, version: definition.version }).lean();

    if (existing) {
      if (existing.contentHash !== hash) {
        throw new Error(`Template ${label} is already published with different content. Published versions are immutable — add version ${definition.version + 1} instead.`);
      }
      unchanged.push(label);
      continue;
    }

    created.push(label);
    if (dryRun) continue;
    try {
      await SmartFormTemplate.create({
        key: definition.key,
        version: definition.version,
        title: definition.title,
        description: definition.description || '',
        caseTypes: definition.caseTypes,
        audience: definition.audience || 'client_and_staff',
        schemaVersion: definition.schemaVersion || 1,
        sections: definition.sections,
        status: 'published',
        contentHash: hash,
        publishedAt: new Date(),
      });
    } catch (err) {
      // Lost a concurrent-seed race: the winner's row must match ours or we fail loudly.
      if (!(err && err.code === 11000)) throw err;
      const winner = await SmartFormTemplate.findOne({ key: definition.key, version: definition.version }).lean();
      if (!winner || winner.contentHash !== hash) throw new Error(`Template ${label} was created concurrently with different content.`);
      created.pop();
      unchanged.push(label);
    }
  }
  return { created, unchanged, dryRun };
}

module.exports = { seedTemplates, assertCatalogValid, contentHash };
