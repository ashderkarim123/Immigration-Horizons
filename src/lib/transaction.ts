import "server-only";

import mongoose, { type ClientSession } from "mongoose";

/**
 * Mirrors server/utils/transaction.js exactly — same topology-probe
 * detection (a real replica-set/mongos self-report, not a guess from the
 * connection string), same graceful non-transactional fallback. First
 * needed on this side in Cycle 5 (document upload/replacement genuinely
 * needs multi-document atomicity — CaseDocument + DocumentVersion +
 * DocumentRequest — the same shape server/'s caseConversion.js already
 * has), so this is a straight port rather than a new design.
 */

let cachedSupport: { forConnection: unknown; supportsTransactions: boolean } | null = null;

async function detectTransactionSupport(): Promise<boolean> {
  if (cachedSupport && cachedSupport.forConnection === mongoose.connection) {
    return cachedSupport.supportsTransactions;
  }

  let supportsTransactions = false;
  try {
    const result = await mongoose.connection.db!.admin().command({ hello: 1 });
    supportsTransactions = Boolean(result.setName) || result.msg === "isdbgrid";
  } catch {
    supportsTransactions = false;
  }

  cachedSupport = { forConnection: mongoose.connection, supportsTransactions };
  return supportsTransactions;
}

export async function withOptionalTransaction<T>(
  fn: (session: ClientSession | null) => Promise<T>,
): Promise<{ result: T; transactional: boolean }> {
  const supportsTransactions = await detectTransactionSupport();

  if (!supportsTransactions) {
    return { result: await fn(null), transactional: false };
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return { result, transactional: true };
  } catch (err) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }
}

/** Test-only: clears the cached topology probe. */
export function _resetTransactionSupportCache(): void {
  cachedSupport = null;
}
