/**
 * Orphan-storage reconciliation — see
 * docs/architecture/ADR-004-secure-document-storage.md and module doc
 * `05_DOCUMENT_MANAGEMENT.md` §31.
 *
 * Report-only. Never deletes anything — deletion is explicitly future work
 * once this report has been reviewed by a human. Compares every storage key
 * on disk (active/ and quarantine/) against every storageKey referenced by
 * CaseDocument/DocumentVersion in MongoDB, and separately flags temp/ files
 * older than the allowed lifetime (an abandoned/failed upload that was
 * never cleaned up).
 *
 *   node scripts/reconcileDocumentStorage.js
 *
 * Never run against production during this cycle.
 */
require('dotenv').config();
const fsp = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');

const CaseDocument = require('../models/CaseDocument');
const DocumentVersion = require('../models/DocumentVersion');
const { LocalPrivateStorageProvider } = require('../services/storage/localPrivateStorageProvider');

const TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

function redact(uri) {
  return uri.replace(/\/\/[^@/]+@/, '//<redacted>@');
}

/** Walks a sharded active/quarantine tree and returns the set of storage keys found. */
async function collectShardedKeys(areaDir) {
  const keys = new Set();
  let shard1;
  try {
    shard1 = await fsp.readdir(areaDir);
  } catch (err) {
    if (err.code === 'ENOENT') return keys;
    throw err;
  }
  for (const s1 of shard1) {
    const shard1Path = path.join(areaDir, s1);
    let shard2;
    try {
      shard2 = await fsp.readdir(shard1Path);
    } catch {
      continue;
    }
    for (const s2 of shard2) {
      const shard2Path = path.join(shard1Path, s2);
      let files;
      try {
        files = await fsp.readdir(shard2Path);
      } catch {
        continue;
      }
      for (const file of files) keys.add(file);
    }
  }
  return keys;
}

async function collectStaleTempFiles(tempDir) {
  const stale = [];
  let files;
  try {
    files = await fsp.readdir(tempDir);
  } catch (err) {
    if (err.code === 'ENOENT') return stale;
    throw err;
  }
  const now = Date.now();
  for (const file of files) {
    const filePath = path.join(tempDir, file);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (stat && now - stat.mtimeMs > TEMP_FILE_MAX_AGE_MS) {
      stale.push({ file, ageHours: Math.round((now - stat.mtimeMs) / (60 * 60 * 1000)) });
    }
  }
  return stale;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<') || uri.includes('>')) {
    console.error('[reconcile-storage] MONGODB_URI is not set (or still has placeholder values). Refusing to run.');
    process.exit(1);
  }

  const provider = new LocalPrivateStorageProvider();
  console.log(`[reconcile-storage] Target database: ${redact(uri)}`);
  console.log(`[reconcile-storage] Storage root: ${provider.root}`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });

  const [documentKeys, versionKeys, activeKeysOnDisk, quarantineKeysOnDisk, staleTempFiles] = await Promise.all([
    CaseDocument.distinct('storageKey'),
    DocumentVersion.distinct('storageKey'),
    collectShardedKeys(provider.activeDir),
    collectShardedKeys(provider.quarantineDir),
    collectStaleTempFiles(provider.tempDir),
  ]);

  const referencedKeys = new Set([...documentKeys, ...versionKeys]);
  const onDiskKeys = new Set([...activeKeysOnDisk, ...quarantineKeysOnDisk]);

  const orphanOnDisk = [...onDiskKeys].filter((k) => !referencedKeys.has(k));
  const missingFromDisk = [...referencedKeys].filter((k) => !onDiskKeys.has(k));

  console.log(`\n[reconcile-storage] Referenced storage keys (DB): ${referencedKeys.size}`);
  console.log(`[reconcile-storage] Storage objects on disk (active + quarantine): ${onDiskKeys.size}`);

  console.log(`\n[reconcile-storage] Orphan storage objects (on disk, not referenced by any document/version): ${orphanOnDisk.length}`);
  orphanOnDisk.slice(0, 50).forEach((k) => console.log(`  - ${k}`));
  if (orphanOnDisk.length > 50) console.log(`  ... and ${orphanOnDisk.length - 50} more`);

  console.log(`\n[reconcile-storage] Missing storage objects (referenced by DB, not found on disk): ${missingFromDisk.length}`);
  missingFromDisk.slice(0, 50).forEach((k) => console.log(`  - ${k}`));
  if (missingFromDisk.length > 50) console.log(`  ... and ${missingFromDisk.length - 50} more`);

  console.log(`\n[reconcile-storage] Stale temp files (older than 24h — likely an abandoned/failed upload): ${staleTempFiles.length}`);
  staleTempFiles.slice(0, 50).forEach((f) => console.log(`  - ${f.file} (${f.ageHours}h old)`));

  console.log('\n[reconcile-storage] Report only — nothing was deleted. Review before taking any destructive action.');

  await mongoose.connection.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('[reconcile-storage] Failed:', err);
  process.exit(1);
});
