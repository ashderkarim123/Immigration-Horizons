const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fsp = require('fs/promises');
const { Readable } = require('stream');

const { LocalPrivateStorageProvider } = require('../services/storage/localPrivateStorageProvider');
const { StorageObjectNotFoundError, InvalidStorageKeyError } = require('../services/storage/storageErrors');

let testRoot;
let provider;

test.beforeEach(async () => {
  testRoot = path.join(os.tmpdir(), `ih-storage-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  provider = new LocalPrivateStorageProvider(testRoot);
  await provider.ensureDirs();
});

test.afterEach(async () => {
  await fsp.rm(testRoot, { recursive: true, force: true });
});

test('put/getStream round-trips real file content', async () => {
  const key = provider.generateStorageKey();
  const { size, checksum } = await provider.writeTempFile(Readable.from([Buffer.from('hello world')]), key);
  assert.equal(size, 11);
  assert.equal(checksum, require('crypto').createHash('sha256').update('hello world').digest('hex'));

  await provider.put(key);
  const stream = await provider.getStream(key);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'hello world');
});

test('getMetadata reports the correct size', async () => {
  const key = provider.generateStorageKey();
  await provider.writeTempFile(Readable.from([Buffer.from('12345')]), key);
  await provider.put(key);
  const meta = await provider.getMetadata(key);
  assert.equal(meta.size, 5);
});

test('getStream on a missing object throws StorageObjectNotFoundError', async () => {
  const key = provider.generateStorageKey();
  await assert.rejects(() => provider.getStream(key), StorageObjectNotFoundError);
});

test('quarantine then moveFromQuarantine makes the object active-downloadable', async () => {
  const key = provider.generateStorageKey();
  await provider.writeTempFile(Readable.from([Buffer.from('x')]), key);
  await provider.quarantine(key);
  await assert.rejects(() => provider.getStream(key), StorageObjectNotFoundError);

  await provider.moveFromQuarantine(key);
  const stream = await provider.getStream(key);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), 'x');
});

test('delete removes an active object; a second delete is a safe no-op', async () => {
  const key = provider.generateStorageKey();
  await provider.writeTempFile(Readable.from([Buffer.from('x')]), key);
  await provider.put(key);
  await provider.delete(key);
  await provider.delete(key); // no throw
  await assert.rejects(() => provider.getStream(key), StorageObjectNotFoundError);
});

test('deleteTemp cleans up a rejected upload', async () => {
  const key = provider.generateStorageKey();
  const tempPath = await provider.writeTempFile(Readable.from([Buffer.from('x')]), key).then((r) => r.tempPath);
  await provider.deleteTemp(key);
  await assert.rejects(() => fsp.access(tempPath));
});

test('a storage key with path-traversal characters is rejected, not resolved', async () => {
  const traversalAttempts = ['../../etc/passwd', '..\\..\\windows\\system32', 'a/../../b', '', 'not-hex-!!', 'a'.repeat(47)];
  for (const badKey of traversalAttempts) {
    await assert.rejects(() => provider.getStream(badKey), InvalidStorageKeyError, `expected rejection for key: ${badKey}`);
  }
});

test('resolveTempPath never escapes the managed temp directory', () => {
  assert.throws(() => provider.resolveTempPath('../../../etc/passwd'), InvalidStorageKeyError);
});

test('storage objects are sharded under active/ by the first four hex characters', async () => {
  const key = provider.generateStorageKey();
  await provider.writeTempFile(Readable.from([Buffer.from('x')]), key);
  await provider.put(key);
  const expectedPath = path.join(provider.activeDir, key.slice(0, 2), key.slice(2, 4), key);
  await assert.doesNotReject(() => fsp.access(expectedPath));
});

test('a fresh provider root is fully isolated from another provider instance', async () => {
  const otherRoot = path.join(os.tmpdir(), `ih-storage-test-other-${Date.now()}`);
  const other = new LocalPrivateStorageProvider(otherRoot);
  await other.ensureDirs();
  try {
    const key = provider.generateStorageKey();
    await provider.writeTempFile(Readable.from([Buffer.from('x')]), key);
    await provider.put(key);
    await assert.rejects(() => other.getStream(key), StorageObjectNotFoundError);
  } finally {
    await fsp.rm(otherRoot, { recursive: true, force: true });
  }
});

test('dev default root never resolves inside a publicly served directory', () => {
  const { devDefaultRoot } = require('../services/storage/localPrivateStorageProvider');
  const root = devDefaultRoot();
  assert.ok(root.includes(os.tmpdir()));
  assert.ok(!root.includes(path.join('server', 'public')));
});
