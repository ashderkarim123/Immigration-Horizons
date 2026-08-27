/**
 * Creates the indexes declared in the Mongoose schemas (Consultation,
 * Notification — see those files for the reasoning behind each one).
 *
 * Deliberately NOT run automatically on app startup: an index build on a
 * large production collection holds resources and should be a deliberate,
 * observed action, not something that silently happens on the next deploy.
 * See server/README.md "Database indexes" for the full production procedure
 * (backup, low-traffic window, dry-run review, run, verify, monitor).
 *
 *   npm run db:indexes:dry-run   # lists what would be created, writes nothing
 *   npm run db:indexes           # creates them
 *
 * Uses `createIndexes()` only — never `syncIndexes()`, which can *drop*
 * indexes not present in the current schema and is not something a
 * production script should ever do implicitly.
 */
require('dotenv').config();
const mongoose = require('mongoose');

// Every model in the app, not just the two this pass added indexes to.
// Reasoning: production now runs with `autoIndex: false` (see
// config/db.js) precisely so index builds are this script's explicit,
// observable job — including `unique: true` indexes Mongoose used to build
// silently on connect (AdminUser.email, BlogPost.slug, ...). Those already
// exist in the real production database from previous runs (autoIndex
// never *drops* an index, so turning it off doesn't remove anything that
// already exists) — this list just makes sure any newly-provisioned
// database, or any index added to any model in the future, has a real,
// explicit creation path instead of silently relying on the old default.
const MODELS = [
  require('../models/Consultation'),
  require('../models/BlogPost'),
  require('../models/Comment'),
  require('../models/admin/ActivityLog'),
  require('../models/admin/DeliveryRecord'),
  require('../models/admin/FAQ'),
  require('../models/admin/InternalNote'),
  require('../models/admin/Media'),
  require('../models/admin/Notification'),
  require('../models/admin/SEOMeta'),
  require('../models/admin/Setting'),
  require('../models/admin/Sprint'),
  require('../models/admin/Task'),
  require('../models/admin/Testimonial'),
  require('../models/admin/User'),
  // Cycle 2 — case/workspace/membership. ClientUser is included even
  // though this app never writes it, because Express does read it (case
  // conversion) and its index (unique normalizedEmail) protects data this
  // app also depends on being correct.
  require('../models/ClientUser'),
  require('../models/ClientCase'),
  require('../models/CaseWorkspace'),
  require('../models/WorkspaceMember'),
  require('../models/CaseActivity'),
  // Cycle 3 — consultation/query tracking. Dual-writer with the Next.js
  // app (ADR-003 §1) — both apps declare and provision these indexes.
  require('../models/ConsultationInteraction'),
  require('../models/InteractionHistory'),
  require('../models/InteractionUpdate'),
  // Cycle 5 — document management. Dual-writer with the Next.js app
  // (ADR-004 §1) — both apps declare and provision these indexes.
  require('../models/DocumentCategory'),
  require('../models/CaseDocument'),
  require('../models/DocumentVersion'),
  require('../models/DocumentRequest'),
  require('../models/DocumentAccessLog'),
  // Cycle 6 — team collaboration. Dual-writer with the Next.js app
  // (ADR-005 §1) — both apps declare and provision these indexes.
  require('../models/WorkspaceChannel'),
  require('../models/ChannelMember'),
  require('../models/WorkspaceMessage'),
  require('../models/MessageRevision'),
  require('../models/ChannelReadState'),
  // Cycle 7 — notifications. Notification (above) gained new identity-
  // keyed indexes this cycle; NotificationPreference is new. Dual-writer
  // with the Next.js app (ADR-006 §1) — both apps declare and provision
  // these indexes.
  require('../models/admin/NotificationPreference'),
];

const isDryRun = process.argv.includes('--dry-run');

function redact(uri) {
  return uri.replace(/\/\/[^@/]+@/, '//<redacted>@');
}

async function run() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes('<') || uri.includes('>')) {
    console.error(
      '[db:indexes] MONGODB_URI is not set (or still has placeholder values). Refusing to run — ' +
        'this script must be pointed at a real database explicitly, never a guess.'
    );
    process.exit(1);
  }

  console.log(`[db:indexes] Target: ${redact(uri)}`);
  console.log(`[db:indexes] Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'CREATE'}`);

  for (const model of MODELS) {
    const specs = model.schema.indexes(); // [[fields, options], ...] as declared via schema.index()
    console.log(`\n[db:indexes] ${model.modelName} (collection: ${model.collection.collectionName}) — ${specs.length} declared index(es):`);
    for (const [fields, options] of specs) {
      console.log(`  - ${JSON.stringify(fields)}${options && options.unique ? ' (unique)' : ''}`);
    }
  }

  if (isDryRun) {
    console.log('\n[db:indexes] Dry run only — no connection made, nothing created.');
    return;
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log('\n[db:indexes] Connected. Creating indexes (createIndexes — additive only, never drops existing indexes)...');

  for (const model of MODELS) {
    // A collection that has never had a document written to it doesn't
    // exist yet as far as listIndexes is concerned (a real state — e.g. a
    // brand-new production deploy before the first Consultation is saved).
    // createIndexes() creates the collection implicitly either way.
    const before = await model.collection.indexes().catch(() => []);
    await model.createIndexes();
    const after = await model.collection.indexes();
    console.log(`[db:indexes] ${model.modelName}: ${before.length} index(es) before -> ${after.length} after.`);
  }

  console.log('[db:indexes] Done. Verify with `mongosh` (db.<collection>.getIndexes()) and monitor query/application logs.');
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('[db:indexes] Failed:', err.message);
  process.exit(1);
});
