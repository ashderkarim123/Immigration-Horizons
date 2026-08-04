import "server-only";

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { Readable } from "stream";
import { StorageObjectNotFoundError, InvalidStorageKeyError } from "./storage-errors";

/**
 * See docs/architecture/ADR-004-secure-document-storage.md §6-9. Mirrors
 * server/services/storage/localPrivateStorageProvider.js exactly — same
 * storage-key format, same directory layout, same method contract — since
 * both apps must resolve a given storageKey to the identical file on disk
 * (ADR-004 §3).
 *
 * Every method that touches disk takes only a `storageKey` (never a raw
 * path), validated as 48 lowercase hex characters, generated here, never
 * derived from a filename or any client-controlled input.
 */
const STORAGE_KEY_RE = /^[a-f0-9]{48}$/;

function devDefaultRoot(): string {
  return path.join(os.tmpdir(), "immigration-horizons-private-documents");
}

function assertNotPubliclyServed(root: string): void {
  const resolved = path.resolve(root);
  const publicDir = path.resolve(process.cwd(), "public");
  if (resolved === publicDir || resolved.startsWith(publicDir + path.sep)) {
    throw new Error(
      `PRIVATE_DOCUMENT_ROOT (${resolved}) resolves inside this app's public/ directory, which Next.js serves publicly. Refusing to start.`,
    );
  }
}

export function resolveRoot(): string {
  const configured = process.env.PRIVATE_DOCUMENT_ROOT;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "PRIVATE_DOCUMENT_ROOT must be set explicitly in production — no dev default is used outside development.",
      );
    }
    return devDefaultRoot();
  }
  if (!path.isAbsolute(configured)) {
    throw new Error("PRIVATE_DOCUMENT_ROOT must be an absolute path.");
  }
  assertNotPubliclyServed(configured);
  return configured;
}

function assertValidStorageKey(storageKey: string): void {
  if (typeof storageKey !== "string" || !STORAGE_KEY_RE.test(storageKey)) {
    throw new InvalidStorageKeyError(storageKey);
  }
}

export class LocalPrivateStorageProvider {
  root: string;
  tempDir: string;
  quarantineDir: string;
  activeDir: string;

  constructor(root?: string) {
    this.root = path.resolve(root || resolveRoot());
    this.tempDir = path.join(this.root, "temp");
    this.quarantineDir = path.join(this.root, "quarantine");
    this.activeDir = path.join(this.root, "active");
  }

  async ensureDirs(): Promise<void> {
    await fsp.mkdir(this.tempDir, { recursive: true });
    await fsp.mkdir(this.quarantineDir, { recursive: true });
    await fsp.mkdir(this.activeDir, { recursive: true });
  }

  generateStorageKey(): string {
    return crypto.randomBytes(24).toString("hex");
  }

  private areaPath(area: "active" | "quarantine", storageKey: string): string {
    assertValidStorageKey(storageKey);
    const areaRoot = area === "active" ? this.activeDir : this.quarantineDir;
    const resolvedAreaRoot = path.resolve(areaRoot);
    const resolved = path.resolve(
      resolvedAreaRoot,
      storageKey.slice(0, 2),
      storageKey.slice(2, 4),
      storageKey,
    );
    if (!resolved.startsWith(resolvedAreaRoot + path.sep)) {
      throw new InvalidStorageKeyError(storageKey);
    }
    return resolved;
  }

  resolveTempPath(storageKey: string): string {
    assertValidStorageKey(storageKey);
    const resolvedTempDir = path.resolve(this.tempDir);
    const resolved = path.resolve(resolvedTempDir, storageKey);
    if (!resolved.startsWith(resolvedTempDir + path.sep)) {
      throw new InvalidStorageKeyError(storageKey);
    }
    return resolved;
  }

  /**
   * Streams a Web ReadableStream (from a Route Handler's parsed
   * `File.stream()`) or a Node Readable directly to temp/<storageKey> while
   * computing its SHA-256 checksum in the same pass.
   */
  async writeTempFile(
    readable: ReadableStream<Uint8Array> | Readable,
    storageKey: string,
  ): Promise<{ tempPath: string; size: number; checksum: string }> {
    await fsp.mkdir(this.tempDir, { recursive: true });
    const tempPath = this.resolveTempPath(storageKey);
    const nodeStream: Readable =
      readable instanceof Readable ? readable : Readable.fromWeb(readable as never);
    const hash = crypto.createHash("sha256");
    let size = 0;

    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(tempPath, { mode: 0o600 });
      nodeStream.on("data", (chunk: Buffer) => {
        hash.update(chunk);
        size += chunk.length;
      });
      nodeStream.on("error", reject);
      out.on("error", reject);
      out.on("finish", resolve);
      nodeStream.pipe(out);
    });

    return { tempPath, size, checksum: hash.digest("hex") };
  }

  async put(storageKey: string): Promise<void> {
    const source = this.resolveTempPath(storageKey);
    const dest = this.areaPath("active", storageKey);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(source, dest);
  }

  async quarantine(storageKey: string): Promise<void> {
    const source = this.resolveTempPath(storageKey);
    const dest = this.areaPath("quarantine", storageKey);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.rename(source, dest);
  }

  async moveFromQuarantine(storageKey: string): Promise<void> {
    const source = this.areaPath("quarantine", storageKey);
    const dest = this.areaPath("active", storageKey);
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fsp.rename(source, dest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new StorageObjectNotFoundError(storageKey);
      }
      throw err;
    }
  }

  async getStream(storageKey: string): Promise<fs.ReadStream> {
    const target = this.areaPath("active", storageKey);
    try {
      await fsp.access(target, fs.constants.R_OK);
    } catch {
      throw new StorageObjectNotFoundError(storageKey);
    }
    return fs.createReadStream(target);
  }

  async getMetadata(storageKey: string): Promise<{ size: number; mtime: Date }> {
    const target = this.areaPath("active", storageKey);
    try {
      const stat = await fsp.stat(target);
      return { size: stat.size, mtime: stat.mtime };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new StorageObjectNotFoundError(storageKey);
      }
      throw err;
    }
  }

  async delete(storageKey: string): Promise<void> {
    const target = this.areaPath("active", storageKey);
    try {
      await fsp.unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  /** Beyond the minimum required interface — compensating cleanup for an object that landed in quarantine/, not active/. */
  async deleteQuarantined(storageKey: string): Promise<void> {
    const target = this.areaPath("quarantine", storageKey);
    try {
      await fsp.unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async deleteTemp(storageKey: string): Promise<void> {
    const target = this.resolveTempPath(storageKey);
    try {
      await fsp.unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async createSignedDownload(): Promise<never> {
    throw new Error(
      "LocalPrivateStorageProvider does not support signed downloads — all access goes through an authenticated app route.",
    );
  }
}
