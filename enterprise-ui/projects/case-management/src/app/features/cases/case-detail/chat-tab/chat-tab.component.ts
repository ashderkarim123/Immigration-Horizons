import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../../core/api/api.service';
import {
  ChatAttachmentRef,
  ChatAudience,
  ChatChanges,
  ChatChannel,
  ChatChannelList,
  ChatMessage,
  ChatPage,
  ChatThread,
} from '../../../../core/api/chat.types';
import { ToastService } from '../../../../shared/toast.service';
import { SkeletonComponent } from '../../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { mergeMessages, pollDelay, sortMessages } from './chat-state';

const POLL_MS = 4000;
const MAX_BACKOFF_MS = 60_000;
const CHANNEL_REFRESH_MS = 20_000;
const MAX_ATTACHMENTS = 10;

/** Text label per audience — the badge never relies on colour alone (ADR-020 §19). */
export const AUDIENCE_LABELS: Record<ChatAudience, string> = {
  client_and_team: 'CLIENT + TEAM',
  staff_only: 'STAFF ONLY',
  restricted: 'RESTRICTED',
};

/**
 * Employee side of the unified case chat. The same WorkspaceChannel /
 * WorkspaceMessage rows the client portal reads and writes, through the
 * canonical /api/v1/staff endpoints. Near-real-time via bounded polling of
 * `messages/newer` (visible tab only, exponential backoff), merged by id.
 */
@Component({
  selector: 'ih-chat-tab',
  standalone: true,
  imports: [DatePipe, FormsModule, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  templateUrl: './chat-tab.component.html',
  styleUrls: ['./chat-tab.component.scss'],
})
export class ChatTabComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  caseId = input.required<string>();
  /** Channel to open first (deep link from the Messages inbox); falls back to the default pick. */
  initialChannelId = input<string | null>(null);

  readonly audienceLabels = AUDIENCE_LABELS;

  channels = signal<ChatChannel[]>([]);
  selectedChannelId = signal<string | null>(null);
  isLoading = signal(true);
  isError = signal(false);

  private messageMap = signal(new Map<string, ChatMessage>());
  nextCursor = signal<string | null>(null);
  syncError = signal('');
  threadRootId = signal<string | null>(null);

  private syncCursor: string | null = null;
  private failures = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private channelTimer: ReturnType<typeof setInterval> | null = null;
  private lastReadId: string | null = null;
  private destroyed = false;

  // Composer (one per surface: channel timeline, thread panel)
  text = signal('');
  replyText = signal('');
  attachments = signal<ChatAttachmentRef[]>([]);
  attachableDocuments = signal<ChatAttachmentRef[]>([]);
  uploading = signal('');
  sending = signal(false);
  composeError = signal('');
  private idempotencyKey = crypto.randomUUID();
  private replyKey = crypto.randomUUID();

  editing = signal<{ id: string; body: string } | null>(null);

  selectedChannel = computed(() => this.channels().find((c) => c.id === this.selectedChannelId()) ?? null);
  rootMessages = computed(() => sortMessages([...this.messageMap().values()].filter((m) => m.threadRootId === null)));
  threadRoot = computed(() => {
    const id = this.threadRootId();
    return id ? this.messageMap().get(id) ?? null : null;
  });
  threadReplies = computed(() => {
    const id = this.threadRootId();
    return id ? sortMessages([...this.messageMap().values()].filter((m) => m.threadRootId === id)) : [];
  });
  totalUnread = computed(() => this.channels().reduce((sum, c) => sum + c.unreadCount, 0));

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      this.stopPolling();
      if (this.channelTimer) clearInterval(this.channelTimer);
      document.removeEventListener('visibilitychange', this.onVisibility);
    });
  }

  ngOnInit(): void {
    this.loadChannels(true);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.channelTimer = setInterval(() => {
      if (document.visibilityState === 'visible') this.loadChannels(false);
    }, CHANNEL_REFRESH_MS);
  }

  // ---- channels ----

  loadChannels(selectFirst: boolean): void {
    if (selectFirst) {
      this.isLoading.set(true);
      this.isError.set(false);
    }
    this.api.get<ChatChannelList>(`/staff/cases/${this.caseId()}/channels`).subscribe({
      next: (res) => {
        this.channels.set(res.data.channels);
        this.isLoading.set(false);
        if (selectFirst && res.data.channels.length) {
          const preferred =
            res.data.channels.find((c) => c.id === this.initialChannelId()) ??
            res.data.channels.find((c) => c.audience === 'client_and_team') ??
            res.data.channels[0];
          this.selectChannel(preferred.id);
        }
      },
      error: () => {
        if (selectFirst) this.isError.set(true);
        this.isLoading.set(false);
      },
    });
  }

  initializeChannels(): void {
    this.api.post(`/staff/cases/${this.caseId()}/channels/initialize`, {}).subscribe({
      next: () => this.loadChannels(true),
      error: (e) => this.toast.error(e.error?.error?.message || 'Could not set up chat channels.'),
    });
  }

  selectChannel(channelId: string): void {
    if (this.selectedChannelId() === channelId) return;
    this.stopPolling();
    this.selectedChannelId.set(channelId);
    this.messageMap.set(new Map());
    this.nextCursor.set(null);
    this.syncCursor = null;
    this.failures = 0;
    this.lastReadId = null;
    this.syncError.set('');
    this.threadRootId.set(null);
    this.attachments.set([]);
    this.attachableDocuments.set([]);
    this.text.set('');
    this.composeError.set('');
    this.idempotencyKey = crypto.randomUUID();

    this.api.get<ChatPage>(`/staff/channels/${channelId}/messages`).subscribe({
      next: (res) => {
        if (this.selectedChannelId() !== channelId) return;
        this.messageMap.set(mergeMessages(new Map(), res.data.messages));
        this.nextCursor.set(res.data.nextCursor);
        this.syncCursor = res.data.syncCursor;
        this.markRead(res.data.messages);
        this.schedulePoll();
      },
      error: (e) => this.syncError.set(e.error?.error?.message || 'Could not load this conversation.'),
    });
    this.api.get<{ documents: ChatAttachmentRef[] }>(`/staff/channels/${channelId}/attachable-documents`).subscribe({
      next: (res) => this.attachableDocuments.set(res.data.documents),
      error: () => this.attachableDocuments.set([]), // no documents.view capability: the picker simply stays hidden
    });
  }

  loadOlder(): void {
    const channelId = this.selectedChannelId();
    const before = this.nextCursor();
    if (!channelId || !before) return;
    this.api.get<ChatPage>(`/staff/channels/${channelId}/messages`, { before }).subscribe({
      next: (res) => {
        this.messageMap.update((m) => mergeMessages(m, res.data.messages));
        this.nextCursor.set(res.data.nextCursor);
      },
      error: (e) => this.toast.error(e.error?.error?.message || 'Could not load earlier messages.'),
    });
  }

  // ---- near-real-time sync ----

  private onVisibility = (): void => {
    if (document.visibilityState === 'visible' && this.selectedChannelId()) {
      this.stopPolling();
      this.sync(() => this.schedulePoll());
    }
  };

  private stopPolling(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
  }

  private schedulePoll(): void {
    if (this.destroyed) return;
    this.stopPolling();
    this.pollTimer = setTimeout(() => {
      if (document.visibilityState !== 'visible') return this.schedulePoll();
      this.sync(() => this.schedulePoll());
    }, pollDelay(POLL_MS, this.failures, MAX_BACKOFF_MS));
  }

  /** One incremental pull; drains `hasMore` (bounded) so a long absence catches up. */
  sync(done?: () => void, pass = 0): void {
    const channelId = this.selectedChannelId();
    if (!channelId) return done?.();
    this.api.get<ChatChanges>(`/staff/channels/${channelId}/messages/newer`, { since: this.syncCursor ?? '' }).subscribe({
      next: (res) => {
        if (this.selectedChannelId() !== channelId) return;
        this.failures = 0;
        this.syncError.set('');
        this.syncCursor = res.data.syncCursor;
        this.messageMap.update((m) => mergeMessages(m, res.data.messages));
        this.markRead(res.data.messages);
        if (res.data.hasMore && pass < 4) return this.sync(done, pass + 1);
        done?.();
      },
      error: (e) => {
        this.failures += 1;
        if (this.failures >= 3) this.syncError.set(e.error?.error?.message || 'Connection problem — new messages may be delayed.');
        done?.();
      },
    });
  }

  retrySync(): void {
    this.failures = 0;
    this.stopPolling();
    this.sync(() => this.schedulePoll());
  }

  private markRead(incoming: ChatMessage[]): void {
    const channelId = this.selectedChannelId();
    const newest = incoming.filter((m) => !m.isOwn && m.threadRootId === null).at(-1);
    if (!channelId || !newest || newest.id === this.lastReadId) return;
    this.lastReadId = newest.id;
    this.api.post<{ unreadCount: number }>(`/staff/channels/${channelId}/read`, { lastReadMessageId: newest.id }).subscribe({
      next: (res) => this.channels.update((list) => list.map((c) => (c.id === channelId ? { ...c, unreadCount: res.data.unreadCount } : c))),
      error: () => undefined,
    });
  }

  // ---- composing ----

  attachFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    const channelId = this.selectedChannelId();
    if (!file || !channelId) return;
    if (this.attachments().length >= MAX_ATTACHMENTS) {
      this.composeError.set(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const form = new FormData();
    form.append('file', file);
    this.uploading.set(file.name);
    this.composeError.set('');
    this.api.postForm<{ attachment: ChatAttachmentRef }>(`/staff/channels/${channelId}/attachments`, form).subscribe({
      next: (res) => {
        this.uploading.set('');
        input.value = '';
        this.addAttachment(res.data.attachment);
      },
      error: (e) => {
        this.uploading.set('');
        input.value = '';
        this.composeError.set(e.error?.error?.message || 'The file could not be attached.');
      },
    });
  }

  pickExisting(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.addExisting(select.value);
    select.value = '';
  }

  addExisting(documentId: string): void {
    const doc = this.attachableDocuments().find((d) => d.documentId === documentId);
    if (doc) this.addAttachment(doc);
  }

  private addAttachment(attachment: ChatAttachmentRef): void {
    this.attachments.update((list) => (list.some((a) => a.documentId === attachment.documentId) ? list : [...list, attachment]));
  }

  removeAttachment(documentId: string): void {
    this.attachments.update((list) => list.filter((a) => a.documentId !== documentId));
  }

  /** Send to the channel, or as a reply when `inThread` — the idempotency key survives a failure so Retry cannot double-post. */
  send(inThread = false): void {
    const channelId = this.selectedChannelId();
    const root = this.threadRootId();
    const body = (inThread ? this.replyText() : this.text()).trim();
    const attachments = inThread ? [] : this.attachments();
    if (!channelId || this.sending() || this.uploading() || (!body && attachments.length === 0)) return;

    const path = inThread && root ? `/staff/messages/${root}/replies` : `/staff/channels/${channelId}/messages`;
    const idempotencyKey = inThread ? this.replyKey : this.idempotencyKey;
    this.sending.set(true);
    this.composeError.set('');
    this.api.post<ChatMessage>(path, { body, attachments: attachments.map((a) => a.documentId), idempotencyKey }).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.messageMap.update((m) => mergeMessages(m, [res.data]));
        if (inThread) {
          this.replyText.set('');
          this.replyKey = crypto.randomUUID();
        } else {
          this.text.set('');
          this.attachments.set([]);
          this.idempotencyKey = crypto.randomUUID();
        }
        this.sync();
      },
      error: (e) => {
        this.sending.set(false);
        this.composeError.set(e.error?.error?.message || 'Message could not be sent. Press Send to retry.');
      },
    });
  }

  // ---- threads, edit, delete, restore ----

  openThread(message: ChatMessage): void {
    const channelId = this.selectedChannelId();
    if (!channelId) return;
    this.threadRootId.set(message.id);
    this.replyText.set('');
    this.replyKey = crypto.randomUUID();
    this.api.get<ChatThread>(`/staff/channels/${channelId}/threads/${message.id}`).subscribe({
      next: (res) => this.messageMap.update((m) => mergeMessages(m, [res.data.root, ...res.data.replies])),
      error: (e) => this.toast.error(e.error?.error?.message || 'Could not load the thread.'),
    });
  }

  closeThread(): void {
    this.threadRootId.set(null);
  }

  startEdit(message: ChatMessage): void {
    this.editing.set({ id: message.id, body: message.body });
  }

  saveEdit(message: ChatMessage): void {
    const edit = this.editing();
    if (!edit) return;
    this.api.patch<ChatMessage>(`/staff/messages/${message.id}`, { body: edit.body, expectedUpdatedAt: message.updatedAt }).subscribe({
      next: (res) => {
        this.editing.set(null);
        this.messageMap.update((m) => mergeMessages(m, [res.data]));
      },
      error: (e) => {
        if (e.status === 409) {
          this.editing.set(null);
          this.toast.error('This message changed elsewhere. The latest version has been loaded.');
          this.sync();
        } else {
          this.toast.error(e.error?.error?.message || 'Could not save the edit.');
        }
      },
    });
  }

  remove(message: ChatMessage): void {
    this.mutate(`/staff/messages/${message.id}/delete`, 'Message deleted.', 'Could not delete the message.');
  }

  restore(message: ChatMessage): void {
    this.mutate(`/staff/messages/${message.id}/restore`, 'Message restored.', 'Could not restore the message.');
  }

  private mutate(path: string, success: string, failure: string): void {
    this.api.post<ChatMessage>(path, {}).subscribe({
      next: (res) => {
        this.messageMap.update((m) => mergeMessages(m, [res.data]));
        this.toast.success(success);
      },
      error: (e) => this.toast.error(e.error?.error?.message || failure),
    });
  }

  downloadAttachment(attachment: ChatAttachmentRef): void {
    this.api.download(`/staff/documents/${attachment.documentId}/download`).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = attachment.displayName;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.toast.error(e.error?.error?.message || 'Download failed.'),
    });
  }

  fileSize(size?: number | null): string {
    if (!size) return '';
    return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
}
