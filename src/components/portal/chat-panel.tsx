"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import type { ClientChatMessage } from "@/lib/collaboration/chat-queries";

/**
 * Client chat surface (ADR-020 §26): timeline + composer for one channel, or
 * for one thread when `threadRootId` is set. Near-real-time by bounded
 * polling of `GET …/messages?since=` — visible-tab only, exponential backoff
 * on failure, merged by message id so nothing duplicates. Files go through
 * the secure upload route first, then the message references the stored
 * document; the idempotency key lives for one deliberate send, so a retry
 * after a failure can never double-post.
 */

const POLL_MS = 4000;
const MAX_BACKOFF_MS = 60_000;
const MAX_ATTACHMENTS = 10;

type Attachment = { documentId: string; displayName: string };
type ApiError = { error?: { message?: string; code?: string } };

async function api<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(path, init);
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, message: (data as ApiError)?.error?.message ?? "Something went wrong. Please try again." };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, message: "Network error. Please try again." };
  }
}

const jsonInit = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

type SyncResponse = { messages: ClientChatMessage[]; syncCursor: string | null; hasMore?: boolean };

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatPanel({
  caseId,
  channelId,
  initialMessages,
  initialNextCursor,
  initialSyncCursor,
  attachableDocuments,
  threadRootId,
  placeholder = "Write a message…",
}: {
  caseId: string;
  channelId: string;
  initialMessages: ClientChatMessage[];
  initialNextCursor: string | null;
  initialSyncCursor: string | null;
  attachableDocuments: Attachment[];
  threadRootId?: string;
  placeholder?: string;
}) {
  const [byId, setById] = useState(() => new Map(initialMessages.map((m) => [m.id, m])));
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncCursor = useRef(initialSyncCursor);
  const failures = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReadId = useRef<string | null>(null);

  // Composer
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);

  // Inline edit
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const merge = useCallback((incoming: ClientChatMessage[]) => {
    if (incoming.length === 0) return;
    setById((prev) => {
      const next = new Map(prev);
      for (const m of incoming) {
        const known = next.get(m.id);
        if (!known || known.updatedAt <= m.updatedAt) next.set(m.id, m);
      }
      return next;
    });
  }, []);

  const markRead = useCallback(
    (list: ClientChatMessage[]) => {
      const newest = list.filter((m) => !m.isOwn && m.threadRootId === null).at(-1);
      if (!newest || newest.id === lastReadId.current) return;
      lastReadId.current = newest.id;
      void api(`/api/portal/channels/${channelId}/read`, jsonInit({ lastReadMessageId: newest.id }));
    },
    [channelId],
  );

  const sync = useCallback(async () => {
    // Drain: keep pulling while the server says there is more, but never loop forever on a bad cursor.
    for (let pass = 0; pass < 5; pass += 1) {
      const query = syncCursor.current ? `?since=${encodeURIComponent(syncCursor.current)}` : "?since=";
      const result = await api<SyncResponse>(`/api/portal/channels/${channelId}/messages${query}`);
      if (!result.ok) {
        failures.current += 1;
        setSyncError(failures.current >= 3 ? result.message : null);
        return false;
      }
      failures.current = 0;
      setSyncError(null);
      syncCursor.current = result.data.syncCursor;
      merge(result.data.messages);
      markRead(result.data.messages);
      if (!result.data.hasMore) break;
    }
    return true;
  }, [channelId, merge, markRead]);

  // Polling loop: visible tab only, backs off after failures, wakes immediately when the tab returns.
  useEffect(() => {
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const delay = Math.min(POLL_MS * 2 ** failures.current, MAX_BACKOFF_MS);
      timer.current = setTimeout(async () => {
        if (document.visibilityState === "visible") await sync();
        schedule();
      }, delay);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (timer.current) clearTimeout(timer.current);
      void sync().then(schedule);
    };
    document.addEventListener("visibilitychange", onVisible);
    schedule();
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sync]);

  const retrySync = async () => {
    failures.current = 0;
    await sync();
  };

  const loadOlder = async () => {
    if (!nextCursor) return;
    const result = await api<{ messages: ClientChatMessage[]; nextCursor: string | null }>(
      `/api/portal/channels/${channelId}/messages?before=${encodeURIComponent(nextCursor)}`,
    );
    if (!result.ok) return setSyncError(result.message);
    merge(result.data.messages);
    setNextCursor(result.data.nextCursor);
  };

  const visible = useMemo(() => {
    const all = [...byId.values()];
    const shown = threadRootId
      ? all.filter((m) => m.id === threadRootId || m.threadRootId === threadRootId)
      : all.filter((m) => m.threadRootId === null);
    return shown.sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)));
  }, [byId, threadRootId]);

  const endRef = useRef<HTMLDivElement>(null);
  const newestId = visible.at(-1)?.id;
  const stickToBottom = useRef(true);
  useEffect(() => {
    if (stickToBottom.current) endRef.current?.scrollIntoView({ block: "end" });
  }, [newestId]);

  // ----- composer actions -----

  async function attachFile(file: File) {
    if (attachments.length >= MAX_ATTACHMENTS) return setComposeError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    setUploading(file.name);
    setComposeError(null);
    const form = new FormData();
    form.set("file", file);
    const result = await api<{ attachment: Attachment }>(`/api/portal/channels/${channelId}/attachments`, { method: "POST", body: form });
    setUploading(null);
    if (fileInput.current) fileInput.current.value = "";
    if (!result.ok) return setComposeError(result.message);
    const { attachment } = result.data;
    setAttachments((prev) => (prev.some((a) => a.documentId === attachment.documentId) ? prev : [...prev, attachment]));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending || uploading || (!text.trim() && attachments.length === 0)) return;
    setSending(true);
    setComposeError(null);
    const path = threadRootId ? `/api/portal/messages/${threadRootId}/replies` : `/api/portal/channels/${channelId}/messages`;
    const result = await api(path, jsonInit({ body: text, attachments: attachments.map((a) => a.documentId), idempotencyKey: idempotencyKey.current }));
    setSending(false);
    if (!result.ok) return setComposeError(result.message); // key and draft are kept: pressing Send again is a retry, not a new message
    setText("");
    setAttachments([]);
    idempotencyKey.current = crypto.randomUUID();
    stickToBottom.current = true;
    await sync();
  }

  async function saveEdit(message: ClientChatMessage) {
    if (!editing) return;
    const result = await api(`/api/portal/messages/${message.id}/edit`, jsonInit({ body: editing.body, expectedUpdatedAt: message.updatedAt }));
    if (!result.ok) {
      setRowError({ id: message.id, message: result.status === 409 ? "This message changed elsewhere — reloaded the latest version." : result.message });
      if (result.status === 409) {
        setEditing(null);
        await sync();
      }
      return;
    }
    setEditing(null);
    setRowError(null);
    await sync();
  }

  async function remove(message: ClientChatMessage) {
    if (!confirm("Delete this message?")) return;
    const result = await api(`/api/portal/messages/${message.id}/delete`, jsonInit({}));
    if (!result.ok) return setRowError({ id: message.id, message: result.message });
    await sync();
  }

  const addExisting = (documentId: string) => {
    const doc = attachableDocuments.find((d) => d.documentId === documentId);
    if (!doc || attachments.some((a) => a.documentId === documentId)) return;
    if (attachments.length >= MAX_ATTACHMENTS) return setComposeError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    setAttachments((prev) => [...prev, doc]);
  };

  return (
    <div className="flex flex-col gap-4">
      {syncError ? (
        <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <span>Connection problem — new messages may be delayed. {syncError}</span>
          <button type="button" onClick={retrySync} className="font-semibold underline">
            Retry
          </button>
        </div>
      ) : null}

      <div
        className="flex max-h-[60vh] min-h-48 flex-col gap-3 overflow-y-auto pr-1"
        role="log"
        aria-live="polite"
        aria-label={threadRootId ? "Thread messages" : "Conversation"}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {nextCursor && !threadRootId ? (
          <button type="button" onClick={loadOlder} className="text-navy-700 self-center text-xs font-medium hover:underline">
            Load earlier messages
          </button>
        ) : null}

        {visible.map((message) => {
          const mine = message.isOwn;
          const isEditing = editing?.id === message.id;
          return (
            <article
              key={message.id}
              className={`rounded-panel border p-4 shadow-subtle sm:max-w-[85%] ${mine ? "border-navy-200 bg-navy-50 self-end" : "border-ink-200 self-start bg-white"}`}
            >
              <header className="flex flex-wrap items-baseline justify-between gap-x-4">
                <p className="text-navy-800 text-sm font-semibold">
                  {mine ? "You" : message.senderDisplayName}
                  {message.senderType === "system" ? <span className="text-ink-400 ml-2 text-xs">System</span> : null}
                  {message.senderType === "employee" ? <span className="text-ink-400 ml-2 text-xs">Immigration Horizons team</span> : null}
                </p>
                <time className="text-ink-400 text-xs" dateTime={message.createdAt}>
                  {new Date(message.createdAt).toLocaleString()}
                  {message.editedAt && !message.deletedAt ? " (edited)" : null}
                </time>
              </header>

              {isEditing ? (
                <div className="mt-2 flex flex-col gap-2">
                  <textarea
                    value={editing.body}
                    onChange={(e) => setEditing({ id: message.id, body: e.target.value })}
                    maxLength={8000}
                    rows={3}
                    aria-label="Edit message"
                    className="border-ink-200 focus:border-navy-400 w-full rounded-xl border p-3 text-sm focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <Button type="button" variant="gold" size="sm" onClick={() => saveEdit(message)}>
                      Save
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={`mt-2 whitespace-pre-wrap text-sm ${message.deletedAt ? "text-ink-400 italic" : "text-ink-700"}`}>{message.body}</p>
              )}

              {message.attachments.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1">
                  {message.attachments.map((a) => (
                    <li key={a.documentId}>
                      <a href={`/portal/documents/${a.documentId}/download`} className="text-navy-700 text-xs font-medium hover:underline">
                        Download {a.displayName} ({a.extension.toUpperCase()}, {formatSize(a.size)})
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              <footer className="mt-3 flex flex-wrap items-center gap-3">
                {!threadRootId ? (
                  <Link href={`/portal/cases/${caseId}/messages/${channelId}/threads/${message.id}`} className="text-navy-700 text-xs font-medium hover:underline">
                    {message.replyCount > 0 ? `${message.replyCount} ${message.replyCount === 1 ? "reply" : "replies"}` : "Reply"}
                  </Link>
                ) : null}
                {message.canEdit && !isEditing ? (
                  <button type="button" onClick={() => setEditing({ id: message.id, body: message.body })} className="text-ink-500 hover:text-navy-700 text-xs font-medium">
                    Edit
                  </button>
                ) : null}
                {message.canDelete ? (
                  <button type="button" onClick={() => remove(message)} className="text-ink-400 text-xs font-medium hover:text-red-600">
                    Delete
                  </button>
                ) : null}
              </footer>
              {rowError?.id === message.id ? (
                <p role="alert" className="mt-2 text-xs text-red-700">
                  {rowError.message}
                </p>
              ) : null}
            </article>
          );
        })}

        {visible.length === 0 ? <p className="text-ink-500 text-sm">No messages yet. Send the first one below.</p> : null}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
        {composeError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
            {composeError}
          </p>
        ) : null}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void submit(e as unknown as FormEvent);
          }}
          maxLength={8000}
          rows={3}
          placeholder={placeholder}
          aria-label={threadRootId ? "Reply" : "Message"}
          className="border-ink-200 focus:border-navy-400 w-full rounded-xl border p-3 text-sm focus:outline-none"
        />

        {attachments.length > 0 || uploading ? (
          <ul className="flex flex-wrap gap-2" aria-label="Attachments">
            {attachments.map((a) => (
              <li key={a.documentId} className="bg-ink-100 text-ink-700 flex items-center gap-2 rounded-full px-3 py-1 text-xs">
                {a.displayName}
                <button type="button" aria-label={`Remove ${a.displayName}`} onClick={() => setAttachments((prev) => prev.filter((x) => x.documentId !== a.documentId))} className="hover:text-red-600">
                  ×
                </button>
              </li>
            ))}
            {uploading ? <li className="text-ink-500 text-xs">Uploading {uploading}…</li> : null}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="gold" size="sm" disabled={sending || !!uploading}>
            {sending ? "Sending…" : composeError && text ? "Retry send" : "Send"}
          </Button>
          <label className="text-navy-700 cursor-pointer text-xs font-medium hover:underline">
            Attach file
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.tif,.tiff"
              className="sr-only"
              disabled={!!uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void attachFile(file);
              }}
            />
          </label>
          {attachableDocuments.length > 0 ? (
            <select
              aria-label="Attach an existing document"
              value=""
              onChange={(e) => addExisting(e.target.value)}
              className="border-ink-200 text-ink-600 max-w-52 rounded-lg border px-2 py-1 text-xs"
            >
              <option value="">Attach existing document…</option>
              {attachableDocuments.map((d) => (
                <option key={d.documentId} value={d.documentId}>
                  {d.displayName}
                </option>
              ))}
            </select>
          ) : null}
          <span className="text-ink-400 text-xs">Ctrl+Enter to send</span>
        </div>
      </form>
    </div>
  );
}
