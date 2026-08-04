/**
 * Idempotent historical-case document-category backfill — see
 * docs/architecture/ADR-004-secure-document-storage.md §18/§19 and module
 * doc `05_DOCUMENT_MANAGEMENT.md` §34.
 *
 * Defaults to a dry run (report only, no writes) — the opposite default
 * from createIndexes.js, deliberately, since this script mutates real case
 * data rather than just declaring indexes:
 *
 *   node scripts/provisionDocumentCategories.js              # dry run (default)
 *   node scripts/provisionDocumentCategories.js --apply       # actually provisions
 *
 * Never run against production during this cycle (module doc §34: "Do not
 * auto-provision historical production cases at server startup" and "Do not
 * run production migrations").
 */
require('dotenv').config();
const mongoose = require('mongoose');

const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const CaseActivity = require('../models/CaseActivity');
const { provisionDefaultCategories, previewProvisioning } = require('../services/documentCategoryService');

const apply = process.argv.includes('--apply');

function redact(uri) {
  return uri.replace(/\/\/[^@/]+@/, '//<redacted>@');
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<') || uri.includes('>')) {
    console.error('[provision-categories] MONGODB_URI is not set (or still has placeholder values). Refusing to run.');
    process.exit(1);
  }

  console.log(`[provision-categories] Target: ${redact(uri)}`);
  console.log(`[provision-categories] Mode: ${apply ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

  const cases = await ClientCase.find({}, { _id: 1, caseNumber: 1 }).lean();
  console.log(`[provision-categories] Found ${cases.length} case(s).`);

  let fullyProvisioned = 0;
  let partiallyProvisioned = 0;
  let missingWorkspace = 0;
  let totalMissingCategories = 0;

  for (const caseDoc of cases) {
    const { missing } = await previewProvisioning(caseDoc._id);
    if (missing.length === 0) {
      fullyProvisioned += 1;
      continue;
    }

    const workspace = await CaseWorkspace.findOne({ case: caseDoc._id, workspaceType: 'primary' }, { _id: 1 }).lean();
    if (!workspace) {
      missingWorkspace += 1;
      console.warn(`[provision-categories] Case ${caseDoc.caseNumber} has no primary workspace — skipped.`);
      continue;
    }

    partiallyProvisioned += 1;
    totalMissingCategories += missing.length;
    console.log(`[provision-categories] Case ${caseDoc.caseNumber}: missing ${missing.length} categor${missing.length === 1 ? 'y' : 'ies'} (${missing.join(', ')}).`);

    if (apply) {
      const { created } = await provisionDefaultCategories({ caseId: caseDoc._id, workspaceId: workspace._id });
      if (created.length > 0) {
        await CaseActivity.record({
          caseId: caseDoc._id,
          workspaceId: workspace._id,
          type: 'category_provisioned',
          message: `${created.length} default document ${created.length === 1 ? 'category' : 'categories'} provisioned (backfill script).`,
          actor: { type: 'system', id: null, name: 'System' },
        });
      }
    }
  }

  console.log('\n[provision-categories] Summary:');
  console.log(`  Already fully provisioned: ${fullyProvisioned}`);
  console.log(`  ${apply ? 'Provisioned' : 'Would provision'}: ${partiallyProvisioned} case(s), ${totalMissingCategories} categor${totalMissingCategories === 1 ? 'y' : 'ies'} total`);
  console.log(`  Skipped (no primary workspace): ${missingWorkspace}`);
  if (!apply && partiallyProvisioned > 0) {
    console.log('\n[provision-categories] Dry run only — re-run with --apply to write these categories.');
  }

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('[provision-categories] Failed:', err);
  process.exit(1);
});
