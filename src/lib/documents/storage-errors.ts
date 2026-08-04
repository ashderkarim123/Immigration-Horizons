import "server-only";

/**
 * Controlled error types the storage provider throws, so callers can
 * distinguish "object missing" from "bad key" from a generic I/O failure
 * without string-matching messages. Mirrors
 * server/services/storage/storageErrors.js.
 */

export class StorageObjectNotFoundError extends Error {
  storageKey: string;
  constructor(storageKey: string) {
    super(`Storage object not found: ${storageKey}`);
    this.name = "StorageObjectNotFoundError";
    this.storageKey = storageKey;
  }
}

export class InvalidStorageKeyError extends Error {
  constructor(storageKey: unknown) {
    super(`Invalid storage key: ${String(storageKey)}`);
    this.name = "InvalidStorageKeyError";
  }
}
