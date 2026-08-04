/**
 * Controlled error types the storage provider throws, so callers (upload
 * pipeline, download routes) can distinguish "object missing" from "bad
 * key" from a generic I/O failure without string-matching messages.
 */

class StorageObjectNotFoundError extends Error {
  constructor(storageKey) {
    super(`Storage object not found: ${storageKey}`);
    this.name = 'StorageObjectNotFoundError';
    this.storageKey = storageKey;
  }
}

class InvalidStorageKeyError extends Error {
  constructor(storageKey) {
    super(`Invalid storage key: ${String(storageKey)}`);
    this.name = 'InvalidStorageKeyError';
  }
}

module.exports = { StorageObjectNotFoundError, InvalidStorageKeyError };
