/**
 * Idempotent historical-case default-channel backfill — see
 * docs/architecture/ADR-005-team-collaboration.md §20/§21 and module doc
 * §11. Same shape as provisionDocumentCategories.js.
 *
 * Defaults to a dry run (report only, no writes):
 *
 *   node scripts/provisionChannels.js              # dry run (default)
 *   node scripts/provisionChannels.js --apply       # actually provisions
 *
 * Never run against production during this cycle.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const ClientCase = require('../models/ClientCase');
const CaseWorkspace = require('../models/CaseWorkspace');
const CaseActivity = require('../models/CaseActivity');
const { provisionDefaultChannels, previewChannelProvisioning } = require('../services/channelService');

const apply = process.argv.includes('--apply');

function redact(uri) {
  return uri.replace(/\/\/[^@/]+@/, '//<redacted>@');
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<') || uri.includes('>')) {
    console.error('[provision-channels] MONGODB_URI is not set (or still has placeholder values). Refusing to run.');
    process.exit(1);
  }

  console.log(`[provision-channels] Target: ${redact(uri)}`);
  console.log(`[provision-channels] Mode: ${apply ? 'APPLY (will write)' : 'DRY RUN (no writes)'}`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

  const cases = await ClientCase.find({}, { _id: 1, caseNumber: 1 }).lean();
  console.log(`[provision-channels] Found ${cases.length} case(s).`);

  let fullyProvisioned = 0;
  let partiallyProvisioned = 0;
  let missingWorkspace = 0;
  let totalMissingChannels = 0;

  for (const caseDoc of cases) {
    const workspace = await CaseWorkspace.findOne({ case: caseDoc._id, workspaceType: 'primary' }, { _id: 1 }).lean();
    if (!workspace) {
      missingWorkspace += 1;
      console.warn(`[provision-channels] Case ${caseDoc.caseNumber} has no primary workspace — skipped.`);
      continue;
    }

    const { missing } = await previewChannelProvisioning(workspace._id);
    if (missing.length === 0) {
      fullyProvisioned += 1;
      continue;
    }

    partiallyProvisioned += 1;
    totalMissingChannels += missing.length;
    console.log(`[provision-channels] Case ${caseDoc.caseNumber}: missing ${missing.length} channel(s) (${missing.join(', ')}).`);

    if (apply) {
      const { created } = await provisionDefaultChannels({ caseId: caseDoc._id, workspaceId: workspace._id });
      if (created.length > 0) {
        await CaseActivity.record({
          caseId: caseDoc._id,
          workspaceId: workspace._id,
          type: 'channel_provisioned',
          message: `${created.length} default ${created.length === 1 ? 'channel' : 'channels'} provisioned (backfill script).`,
          actor: { type: 'system', id: null, name: 'System' },
        });
      }
    }
  }

  console.log('\n[provision-channels] Summary:');
  console.log(`  Already fully provisioned: ${fullyProvisioned}`);
  console.log(`  ${apply ? 'Provisioned' : 'Would provision'}: ${partiallyProvisioned} case(s), ${totalMissingChannels} channel(s) total`);
  console.log(`  Skipped (no primary workspace): ${missingWorkspace}`);
  if (!apply && partiallyProvisioned > 0) {
    console.log('\n[provision-channels] Dry run only — re-run with --apply to write these channels.');
  }

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('[provision-channels] Failed:', err);
  process.exit(1);
});
