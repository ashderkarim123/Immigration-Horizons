import mongoose from "mongoose";
import { MAX_MESSAGE_PAGE_SIZE } from "./collaboration-constants";

/** Mirrors server/utils/messageCursor.js exactly. */

export function encodeCursor(params: { createdAt: Date | string; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: new Date(params.createdAt).toISOString(), id: String(params.id) })).toString(
    "base64url",
  );
}

export function decodeCursor(cursor: unknown): { createdAt: Date; id: string } | null {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    const date = new Date(parsed.createdAt);
    if (Number.isNaN(date.getTime())) return null;
    if (!mongoose.Types.ObjectId.isValid(parsed.id)) return null;
    return { createdAt: date, id: parsed.id };
  } catch {
    return null;
  }
}

export function cursorFilter(cursor: { createdAt: Date; id: string } | null) {
  if (!cursor) return {};
  return {
    $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }],
  };
}

export function boundedLimit(requested: unknown): number {
  const n = parseInt(String(requested), 10);
  if (!Number.isFinite(n) || n <= 0) return MAX_MESSAGE_PAGE_SIZE;
  return Math.min(n, MAX_MESSAGE_PAGE_SIZE);
}
