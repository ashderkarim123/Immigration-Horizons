const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { StorageObjectNotFoundError, InvalidStorageKeyError } = require('./storageErrors');

/**
 * See docs/architecture/ADR-004-secure-document-storage.md §6-9.
 *
 * Every method that touches disk takes only a `storageKey` (never a raw
 * path) so the only way to reach the filesystem is through this class's own
 * validated key -> path resolution. Keys are always 48 lowercase hex
 * characters, generated here, never derived from a filename or any
 * client-controlled input.
 */
const STORAGE_KEY_RE = /^[a-f0-9]{48}$/;

function devDefaultRoot() {
  return path.join(os.tmpdir(), 'immigration-horizons-private-documents');
}

/** Refuses a root that resolves inside this app's own publicly served directory. */
function assertNotPubliclyServed(root) {
  const resolved = path.resolve(root);
  const publicDir = path.resolve(__dirname, '..', '..', 'public');
  if (resolved === publicDir || resolved.startsWith(publicDir + path.sep)) {
    throw new Error(
      `PRIVATE_DOCUMENT_ROOT (${resolved}) resolves inside server/public, which is served publicly (server/app.js's express.static). Refusing to start.`,
    );
  }
}

function resolveRoot() {
  const configured = process.env.PRIVATE_DOCUMENT_ROOT;
  if (!configured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('PRIVATE_DOCUMENT_ROOT must be set explicitly in production — no dev default is used outside development.');
    }
    return devDefaultRoot();
  }
  if (!path.isAbsolute(configured)) {
    throw new Error('PRIVATE_DOCUMENT_ROOT must be an absolute path.');
  }
  assertNotPubliclyServed(configured);
  return configured;
}

function assertValidStorageKey(storageKey) {
  if (typeof storageKey !== 'string' || !STORAGE_KEY_RE.test(storageKey)) {
    throw new InvalidStorageKeyError(storageKey);
  }
}

class LocalPrivateStorageProvider {
  constructor(root) {
    this.root = path.resolve(root || resolveRoot());
    this.tempDir = path.join(this.root, 'temp');
    this.quarantineDir = path.join(this.root, 'quarantine');
    this.activeDir = path.join(this.root, 'active');
  }

  async ensureDirs() {
    await fsp.mkdir(this.tempDir, { recursive: true });
    await fsp.mkdir(this.quarantineDir, { recursive: true });
    await fsp.mkdir(this.activeDir, { recursive: true });
  }

  generateStorageKey() {
    return crypto.randomBytes(24).toString('hex');
  }

  /** Validated, sharded path inside active/ or quarantine/ for a given key. */
  _areaPath(area, storageKey) {
    assertValidStorageKey(storageKey);
    const areaRoot = area === 'active' ? this.activeDir : this.quarantineDir;
    const resolvedAreaRoot = path.resolve(areaRoot);
    const resolved = path.resolve(resolvedAreaRoot, storageKey.slice(0, 2), storageKey.slice(2, 4), storageKey);
    if (!resolved.startsWith(resolvedAreaRoot + path.sep)) {
      throw new InvalidStorageKeyError(storageKey);
    }
    return resolved;
  }

  /** Validated, flat path inside temp/ for a given key — safe to hand to multer's diskStorage destination. */
  resolveTempPath(storageKey) {
    assertValidStorageKey(storageKey);
    const resolvedTempDir = path.resolve(this.tempDir);
    const resolved = path.resolve(resolvedTempDir, storageKey);
    if (!resolved.startsWith(resolvedTempDir + path.sep)) {
      throw new InvalidStorageKeyError(storageKey);
    }
    return resolved;
  }

  /**
   * Streams an incoming readable directly to temp/<storageKey> while
   * computing its SHA-256 checksum in the same pass, without buffering the
   * whole file in memory.
   */
  async writeTempFile(readableStream, storageKey) {
    await fsp.mkdir(this.tempDir, { recursive: true });
    const tempPath = this.resolveTempPath(storageKey);
    const hash = crypto.createHash('sha256');
    let size = 0;

    await new Promise((resolve, reject) => {
      const out = fs.createWriteStream(tempPath, { mode: 0o600 });
      readableStream.on('data', (chunk) => {
        hash.update(chunk);
        size += chunk.length;
      });
      readableStream.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      readableStream.pipe(out);
    });

    return { tempPath, size, checksum: hash.digest('hex') };
  }

  /**
   * Computes checksum/size of a file already written to temp/<storageKey>
   * by something else (e.g. multer's own disk storage) — used by the
   * server-side upload pipeline, which lets multer handle multipart
   * parsing and the initial disk write, then hashes the result here rather
   * than re-implementing multipart streaming by hand.
   */
  async checksumTempFile(storageKey) {
    const tempPath = this.resolveTempPath(storageKey);
    const hash = crypto.createHash('sha256');
    let size = 0;
    await new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(tempPath);
      readStream.on('data', (chunk) => {
        hash.update(chunk);
        size += chunk.length;
      });
      readStream.on('end', resolve);
      readStream.on('error', reject);
    });
    return { tempPath, size, checksum: hash.digest('hex') };
  }

  async put(storageKey) {
    const source = this.resolveTempPath(storageKey);
    const dest = this._areaPath('active', storageKey);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(source, dest);
  }

  async quarantine(storageKey) {
    const source = this.resolveTempPath(storageKey);
    const dest = this._areaPath('quarantine', storageKey);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(source, dest);
  }

  /** Moves a previously-quarantined object into active storage (future manual-clear flow; unused this cycle). */
  async moveFromQuarantine(storageKey) {
    const source = this._areaPath('quarantine', storageKey);
    const dest = this._areaPath('active', storageKey);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fsp.rename(source, dest);
    } catch (err) {
      if (err.code === 'ENOENT') throw new StorageObjectNotFoundError(storageKey);
      throw err;
    }
  }

  async getStream(storageKey) {
    const target = this._areaPath('active', storageKey);
    try {
      await fsp.access(target, fs.constants.R_OK);
    } catch {
      throw new StorageObjectNotFoundError(storageKey);
    }
    return fs.createReadStream(target);
  }

  async getMetadata(storageKey) {
    const target = this._areaPath('active', storageKey);
    try {
      const stat = await fsp.stat(target);
      return { size: stat.size, mtime: stat.mtime };
    } catch (err) {
      if (err.code === 'ENOENT') throw new StorageObjectNotFoundError(storageKey);
      throw err;
    }
  }

  async delete(storageKey) {
    const target = this._areaPath('active', storageKey);
    try {
      await fsp.unlink(target);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  /** Beyond the minimum required interface — compensating cleanup for an object that landed in quarantine/, not active/. */
  async deleteQuarantined(storageKey) {
    const target = this._areaPath('quarantine', storageKey);
    try {
      await fsp.unlink(target);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async deleteTemp(storageKey) {
    const target = this.resolveTempPath(storageKey);
    try {
      await fsp.unlink(target);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  async createSignedDownload() {
    throw new Error(
      'LocalPrivateStorageProvider does not support signed downloads — all access goes through an authenticated app route.',
    );
  }
}

module.exports = { LocalPrivateStorageProvider, resolveRoot, devDefaultRoot, STORAGE_KEY_RE };
