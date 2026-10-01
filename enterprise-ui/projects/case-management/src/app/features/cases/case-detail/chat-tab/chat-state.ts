import { ChatMessage } from '../../../../core/api/chat.types';

/**
 * Merges server messages into the local timeline by id. A copy only replaces
 * the known one when it is at least as new, so a slow poll response can never
 * roll an edit or delete back — and a message echoed by both the send
 * response and the next poll appears once.
 */
export function mergeMessages(known: Map<string, ChatMessage>, incoming: ChatMessage[]): Map<string, ChatMessage> {
  const next = new Map(known);
  for (const message of incoming) {
    const current = next.get(message.id);
    if (!current || current.updatedAt <= message.updatedAt) next.set(message.id, message);
  }
  return next;
}

/** Oldest-first with the id as a stable tiebreak — the same order the server pages in. */
export function sortMessages(messages: Iterable<ChatMessage>): ChatMessage[] {
  return [...messages].sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)));
}

/** Delay before the next poll: base interval, doubled per consecutive failure, capped. */
export function pollDelay(baseMs: number, failures: number, maxMs: number): number {
  return Math.min(baseMs * 2 ** failures, maxMs);
}
