const mongoose = require('mongoose');
const { MAX_MESSAGE_PAGE_SIZE } = require('./collaborationConstants');

/**
 * Cursor-based pagination on `(createdAt, _id)`, descending — never
 * offset-based (ADR-005 §16 / module doc §21). A malformed cursor is
 * rejected (treated as "no cursor," i.e. first page), never silently
 * mis-parsed into a query that could skip or duplicate rows.
 */
function encodeCursor({ createdAt, id }) {
  return Buffer.from(JSON.stringify({ createdAt: new Date(createdAt).toISOString(), id: String(id) })).toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    const date = new Date(parsed.createdAt);
    if (Number.isNaN(date.getTime())) return null;
    if (!mongoose.Types.ObjectId.isValid(parsed.id)) return null;
    return { createdAt: date, id: parsed.id };
  } catch {
    return null;
  }
}

/** MongoDB filter fragment for "strictly older than this cursor," descending order. */
function cursorFilter(cursor) {
  if (!cursor) return {};
  return {
    $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor.id } }],
  };
}

function boundedLimit(requested) {
  const n = parseInt(requested, 10);
  if (!Number.isFinite(n) || n <= 0) return MAX_MESSAGE_PAGE_SIZE;
  return Math.min(n, MAX_MESSAGE_PAGE_SIZE);
}

module.exports = { encodeCursor, decodeCursor, cursorFilter, boundedLimit };
