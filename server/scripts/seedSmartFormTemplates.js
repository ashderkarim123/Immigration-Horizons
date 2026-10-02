/**
 * Publishes the code-owned Smart Forms catalog (ADR-021 §20). Insert-only and
 * idempotent: an existing (key, version) is left alone, and a changed
 * definition under a published version fails loudly.
 *
 *   node scripts/seedSmartFormTemplates.js            # dry run (default)
 *   node scripts/seedSmartFormTemplates.js --apply    # writes missing templates
 *
 * Never run against production without an explicit decision.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const { seedTemplates } = require('../services/smartForms/templateSeeder');

const apply = process.argv.includes('--apply');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<') || uri.includes('>')) {
    console.error('[seed-smart-forms] MONGODB_URI is not set (or still has placeholder values). Refusing to run.');
    process.exit(1);
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const { created, unchanged } = await seedTemplates({ dryRun: !apply });
  console.log(`[seed-smart-forms] ${apply ? 'Created' : 'Would create'}: ${created.length} ${created.join(', ')}`);
  console.log(`[seed-smart-forms] Already published: ${unchanged.length}`);
  if (!apply && created.length) console.log('[seed-smart-forms] Dry run only — re-run with --apply to write.');
  await mongoose.connection.close();
}

run().catch((err) => {
  console.error('[seed-smart-forms] Failed:', err.message);
  process.exit(1);
});
