import { DatePipe } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { MailApi } from '../../core/api/mail-api.service';
import { MailUnreadService } from '../../core/api/mail-unread.service';
import { MailAttachment, MailFolder, MailListItem, MailMessage, MailStatus } from '../../core/api/mail.types';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { CasePickerComponent } from './case-picker.component';
import { MailComposeComponent } from './mail-compose.component';

const FOLDERS: { key: MailFolder; label: string }[] = [{ key: 'inbox', label: 'Inbox' }, { key: 'sent', label: 'Sent' }];

/**
 * The shared Outlook mailbox (ADR-030). Messages are read from Microsoft as you open them and answered from the same address,
 * so staff stay in the portal. The only thing this application stores is which cases a message is linked to. Nothing here is
 * a mail client for individual mailboxes, and there is no search or folder management yet.
 */
@Component({
  selector: 'ih-mail',
  standalone: true,
  imports: [DatePipe, RouterLink, EmptyStateComponent, ErrorStateComponent, SkeletonComponent, MailComposeComponent, CasePickerComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>Mail</h1>
        <p class="page-subtitle">{{ status()?.mailbox ? 'Shared mailbox: ' + status()!.mailbox : 'The shared Outlook mailbox' }}. Only what you are allowed to read is shown.</p>
      </div>
      @if (status()?.configured && status()?.canSend) { <button type="button" class="btn btn-primary" (click)="startCompose(null, false)">New message</button> }
    </div>

    @if (notice(); as n) {
      <p class="notice" [class.error]="n.error" [attr.role]="n.error ? 'alert' : 'status'">{{ n.text }} <button type="button" class="link-btn" (click)="notice.set(null)">Dismiss</button></p>
    }

    @if (statusError()) {
      <ih-error-state title="Mail could not be loaded" [message]="statusError()" (retry)="init()"></ih-error-state>
    } @else if (!status()) {
      <ih-skeleton [rows]="5" rowHeight="3rem"></ih-skeleton>
    } @else if (!status()!.configured) {
      <ih-empty-state title="The shared mailbox is not connected yet" description="An administrator needs to add the Microsoft connection settings on the server. Until then nothing is read or sent from here."></ih-empty-state>
    } @else {
      <div class="mail-layout" [class.detail-open]="!!selectedId()">
        <section class="list-pane" aria-label="Messages">
          <div class="folders" role="tablist" aria-label="Folders">
            @for (f of folders; track f.key) {
              <button type="button" role="tab" class="tab-btn" [class.active]="folder() === f.key" [attr.aria-selected]="folder() === f.key" (click)="openFolder(f.key)">{{ f.label }}</button>
            }
          </div>
          @if (listError()) {
            <ih-error-state title="Messages could not be loaded" [message]="listError()" (retry)="loadList(page())"></ih-error-state>
          } @else if (loadingList() && !items().length) {
            <ih-skeleton [rows]="6" rowHeight="3.5rem"></ih-skeleton>
          } @else if (!items().length) {
            <ih-empty-state [title]="folder() === 'inbox' ? 'The inbox is empty' : 'Nothing sent yet'" description="New messages appear here when you open the page again."></ih-empty-state>
          } @else {
            <ul class="messages" role="list" [attr.aria-busy]="loadingList()">
              @for (m of items(); track m.id) {
                <li>
                  <button type="button" class="row" [class.unread]="!m.isRead" [class.active]="selectedId() === m.id" [attr.aria-current]="selectedId() === m.id ? 'true' : null" (click)="select(m.id)">
                    <span class="line"><span class="who">{{ folder() === 'sent' ? (m.to[0]?.name || m.to[0]?.address || '—') : (m.from.name || m.from.address || '—') }}</span><time class="when">{{ (m.receivedAt || m.sentAt) | date: 'MMM d, h:mm a' }}</time></span>
                    <span class="subject">{{ m.subject || '(no subject)' }}@if (!m.isRead) { <span class="sr-only"> (unread)</span> }</span>
                    <span class="preview">{{ m.preview }}</span>
                    <span class="flags">
                      @if (m.kind === 'consultation') { <span class="flag lead">Consultation request</span> } @else if (m.kind === 'contact') { <span class="flag lead">Contact message</span> }
                      @if (m.contact?.client) { <span class="flag client">Client</span> }
                      @if (m.hasAttachments) { <span class="flag">Attachment</span> }
                      @if (m.linkCount) { <span class="flag linked">Linked to {{ m.linkCount }} {{ m.linkCount === 1 ? 'case' : 'cases' }}</span> }
                    </span>
                  </button>
                </li>
              }
            </ul>
            <nav class="pager" aria-label="Message pages">
              <button type="button" class="btn btn-sm" [disabled]="page() <= 1 || loadingList()" (click)="loadList(page() - 1)">Newer</button>
              <span>Page {{ page() }}</span>
              <button type="button" class="btn btn-sm" [disabled]="!hasMore() || loadingList()" (click)="loadList(page() + 1)">Older</button>
            </nav>
          }
        </section>

        <section class="detail-pane" aria-label="Message">
          @if (!selectedId()) {
            <p class="muted placeholder">Choose a message to read it.</p>
          } @else if (detailError()) {
            <button type="button" class="btn btn-sm back" (click)="select(null)">Back to the list</button>
            <ih-error-state title="This message could not be opened" [message]="detailError()" (retry)="open(selectedId()!)"></ih-error-state>
          } @else if (!message()) {
            <ih-skeleton [rows]="5" rowHeight="2rem"></ih-skeleton>
          } @else {
            @let m = message()!;
            <button type="button" class="btn btn-sm back" (click)="select(null)">Back to the list</button>
            <article>
              <header class="head">
                <h2>{{ m.subject || '(no subject)' }}</h2>
                <dl class="meta">
                  <div><dt>From</dt><dd>{{ m.from.name }} &lt;{{ m.from.address }}&gt;</dd></div>
                  <div><dt>To</dt><dd>{{ names(m.to) }}</dd></div>
                  @if (m.cc.length) { <div><dt>Cc</dt><dd>{{ names(m.cc) }}</dd></div> }
                  <div><dt>Date</dt><dd>{{ (m.receivedAt || m.sentAt) | date: 'medium' }}</dd></div>
                </dl>
                <div class="actions">
                  @if (status()!.canSend) {
                    <button type="button" class="btn btn-primary btn-sm" (click)="startCompose(m, false)">Reply</button>
                    <button type="button" class="btn btn-sm" (click)="startCompose(m, true)">Reply all</button>
                  }
                  <button type="button" class="btn btn-sm" (click)="toggleRead(m)">{{ m.isRead ? 'Mark as unread' : 'Mark as read' }}</button>
                  <button type="button" class="btn btn-sm" (click)="linking.set(!linking())" [attr.aria-expanded]="linking()">Link to a case</button>
                </div>
              </header>

              @if (m.contact; as c) {
                <section class="contact card" aria-label="About this correspondent">
                  <div>
                    <strong>{{ c.client?.name || c.lead?.name || c.name || c.address }}</strong>
                    <span class="muted"> &lt;{{ c.address }}&gt;</span>
                    @if (m.kind !== 'mail') { <span class="flag lead">{{ m.kind === 'consultation' ? 'Website consultation request' : 'Website contact message' }}</span> }
                    @if (c.client) { <span class="flag client">Client</span> }
                    @if (c.lead) { <span class="flag lead">Enquiry: {{ c.lead.service || 'consultation' }}</span> }
                  </div>
                  <div class="actions">
                    @if (c.client) { <a class="btn btn-sm" [routerLink]="['/clients', c.client.id]">Open client</a> }
                    @if (c.lead) { <a class="btn btn-sm" [routerLink]="['/intake', c.lead.id]">Open consultation</a> }
                    @if (c.lead?.canConvert) { <a class="btn btn-sm btn-primary" routerLink="/cases/new" [queryParams]="{ consultationId: c.lead!.id }">Create case from inquiry</a> }
                    @if (status()!.canSend) { <button type="button" class="btn btn-sm" (click)="startCompose(null, false, c.address)">New message to {{ c.client?.name || c.name || c.address }}</button> }
                    @if (!c.client && !c.lead) { <span class="muted">Not in your clients or consultations.</span> }
                  </div>
                </section>
              }

              @if (linking()) {
                <div class="link-box card">
                  <ih-case-picker label="Case" (picked)="linkTarget.set($event?.id ?? '')" />
                  <button type="button" class="btn btn-primary btn-sm" [disabled]="!linkTarget() || busy()" (click)="link(m)">Link message</button>
                </div>
              }
              @if (m.links.length || m.hiddenLinkCount) {
                <section class="links" aria-label="Linked cases">
                  <h3>Linked cases</h3>
                  <ul role="list">
                    @for (l of m.links; track l.id) {
                      <li><a [routerLink]="['/cases', l.caseId]" [queryParams]="{ tab: 'mail' }">Open case</a> <span class="muted">linked by {{ l.linkedByName || 'a colleague' }}</span> <button type="button" class="link-btn" (click)="unlink(m, l.id)">Remove link</button></li>
                    }
                  </ul>
                  @if (m.hiddenLinkCount) { <p class="muted">Also linked to {{ m.hiddenLinkCount }} {{ m.hiddenLinkCount === 1 ? 'case' : 'cases' }} you are not on.</p> }
                </section>
              }

              @if (m.attachments.length) {
                <section class="attachments" aria-label="Attachments">
                  <h3>Attachments</h3>
                  <ul role="list">
                    @for (a of m.attachments; track a.id) {
                      <li><button type="button" class="link-btn" [disabled]="downloading() === a.id" (click)="download(m, a)">{{ a.name }}</button> <span class="muted">{{ size(a.size) }}</span></li>
                    }
                  </ul>
                  <p class="muted">Attachments download as files and are not opened in the browser. Scan anything unexpected before opening it.</p>
                </section>
              }

              @if (m.bodyType === 'html') {
                <div class="body" [innerHTML]="m.body"></div>
                <p class="muted note">Images in emails are not loaded, to protect against tracking and unsafe content.</p>
              } @else {
                <pre class="body plain">{{ m.body }}</pre>
              }
            </article>
          }
        </section>
      </div>
    }

    <ih-mail-compose [open]="composing()" [replyTo]="replyTo()" [startAll]="replyAll()" [prefillTo]="composeTo()" (sent)="onSent($event)" (closed)="composing.set(false)" />
  `,
  styles: `
    .page-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1.25rem; }
    .page-header h1 { margin: 0; }
    .page-subtitle { margin: .25rem 0 0; color: var(--ih-text-secondary); font-size: var(--ih-font-size-sm); }
    .notice { padding: .6rem .9rem; margin: 0 0 1rem; border: 1px solid #bbf7d0; background: #f0fdf4; color: #14532d; border-radius: var(--ih-radius-md); }
    .notice.error { border-color: #fecaca; background: #fef2f2; color: #7f1d1d; }
    .tab-btn { background: none; border: none; padding: .5rem .85rem; font-size: .875rem; font-weight: 600; color: #6b7280; border-bottom: 2px solid transparent; cursor: pointer; }
    .tab-btn:hover { color: #111827; }
    .tab-btn.active { color: var(--ih-brand-900); border-bottom-color: var(--ih-accent-500); }
    .attachments li { display: flex; flex-wrap: wrap; gap: .5rem; align-items: baseline; }
    .mail-layout { display: grid; grid-template-columns: minmax(18rem, 26rem) 1fr; gap: 1rem; align-items: start; }
    .list-pane, .detail-pane { background: #fff; border: 1px solid var(--ih-border-light); border-radius: var(--ih-radius-lg); min-width: 0; }
    .list-pane { overflow: hidden; }
    .detail-pane { padding: 1.25rem; min-height: 20rem; }
    .folders { display: flex; gap: .25rem; padding: .5rem; border-bottom: 1px solid var(--ih-border-light); }
    .messages { list-style: none; margin: 0; padding: 0; max-height: 70vh; overflow-y: auto; }
    .row { display: flex; flex-direction: column; gap: .15rem; width: 100%; padding: .7rem .9rem; text-align: left; border: 0; border-bottom: 1px solid var(--ih-border-light); background: #fff; }
    .row:hover { background: var(--ih-gray-50); }
    .row.active { background: var(--ih-brand-50); box-shadow: inset 3px 0 0 var(--ih-accent-500); }
    .row.unread .who, .row.unread .subject { font-weight: 700; }
    .line { display: flex; justify-content: space-between; gap: .5rem; }
    .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .when { font-size: var(--ih-font-size-xs); color: var(--ih-text-secondary); white-space: nowrap; }
    .subject { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preview { font-size: var(--ih-font-size-xs); color: var(--ih-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .flags { display: flex; gap: .4rem; flex-wrap: wrap; }
    .flag { font-size: .6875rem; padding: .05rem .45rem; border-radius: 999px; background: var(--ih-gray-100); color: var(--ih-gray-700); }
    .flag.lead { background: #e0f2fe; color: #075985; }
    .flag.client { background: #dcfce7; color: #166534; }
    .contact { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .6rem; padding: .7rem .9rem; margin-bottom: 1rem; }
    .contact .actions { margin: 0; }
    .flag.linked { background: var(--ih-accent-100); color: var(--ih-accent-700); }
    .pager { display: flex; align-items: center; justify-content: center; gap: .75rem; padding: .6rem; }
    .head h2 { font-size: var(--ih-font-size-xl); margin: 0 0 .5rem; overflow-wrap: anywhere; }
    .meta { display: grid; gap: .15rem; margin: 0 0 .75rem; font-size: var(--ih-font-size-sm); }
    .meta div { display: flex; gap: .5rem; } .meta dt { min-width: 3rem; color: var(--ih-text-secondary); font-weight: 600; } .meta dd { margin: 0; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
    .link-box { display: flex; flex-direction: column; gap: .6rem; padding: .9rem; margin-bottom: 1rem; }
    .links, .attachments { margin-bottom: 1rem; padding: .75rem .9rem; border: 1px solid var(--ih-border-light); border-radius: var(--ih-radius-md); }
    .links h3, .attachments h3 { font-size: var(--ih-font-size-sm); margin: 0 0 .35rem; }
    .links ul, .attachments ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .3rem; }
    .body { border-top: 1px solid var(--ih-border-light); padding-top: 1rem; overflow-wrap: anywhere; line-height: 1.6; }
    .body.plain { white-space: pre-wrap; font-family: inherit; margin: 0; }
    .body :is(blockquote) { margin: .5rem 0; padding-left: .75rem; border-left: 3px solid var(--ih-border-medium); color: var(--ih-text-secondary); }
    .body :is(table) { border-collapse: collapse; max-width: 100%; display: block; overflow-x: auto; }
    .body :is(td, th) { border: 1px solid var(--ih-border-light); padding: .25rem .5rem; }
    .muted { color: var(--ih-text-secondary); font-size: var(--ih-font-size-sm); }
    .note { margin-top: 1rem; font-size: var(--ih-font-size-xs); }
    .placeholder { padding: 2rem 1rem; text-align: center; }
    .back { display: none; margin-bottom: .75rem; }
    @media (max-width: 900px) {
      .mail-layout { grid-template-columns: 1fr; }
      .mail-layout.detail-open .list-pane { display: none; }
      .mail-layout:not(.detail-open) .detail-pane { display: none; }
      .back { display: inline-flex; }
    }
  `,
})
export class MailComponent implements OnInit {
  private readonly api = inject(MailApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly folders = FOLDERS;
  protected readonly status = signal<MailStatus | null>(null);
  protected readonly statusError = signal('');
  protected readonly folder = signal<MailFolder>('inbox');
  protected readonly items = signal<MailListItem[]>([]);
  protected readonly page = signal(1);
  protected readonly hasMore = signal(false);
  protected readonly loadingList = signal(false);
  protected readonly listError = signal('');

  protected readonly selectedId = signal<string | null>(null);
  protected readonly message = signal<MailMessage | null>(null);
  protected readonly detailError = signal('');

  /** Inline feedback (the Staff shell has no toast display). Announced to screen readers. */
  protected readonly notice = signal<{ text: string; error: boolean } | null>(null);
  protected readonly composing = signal(false);
  protected readonly replyTo = signal<MailMessage | null>(null);
  protected readonly replyAll = signal(false);
  protected readonly composeTo = signal('');
  private readonly unread = inject(MailUnreadService);
  protected readonly linking = signal(false);
  protected readonly linkTarget = signal('');
  protected readonly busy = signal(false);
  protected readonly downloading = signal('');

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((query) => {
      const folder = query.get('folder') === 'sent' ? 'sent' : 'inbox';
      const id = query.get('message');
      if (folder !== this.folder()) { this.folder.set(folder); if (this.status()?.configured) this.loadList(1); }
      if (id !== this.selectedId()) this.open(id);
    });
    this.init();
  }

  private say(text: string): void { this.notice.set({ text, error: false }); }
  private sayError(text: string): void { this.notice.set({ text, error: true }); }

  protected init(): void {
    this.statusError.set('');
    this.api.status().subscribe({
      next: (status) => { this.status.set(status); if (status.configured) this.loadList(1); },
      error: (err) => this.statusError.set(apiErrorMessage(err, 'Please try again.')),
    });
  }

  protected loadList(page: number): void {
    this.loadingList.set(true);
    this.listError.set('');
    this.api.list(this.folder(), page).subscribe({
      next: (result) => { this.items.set(result.items); this.page.set(result.page); this.hasMore.set(result.hasMore); this.loadingList.set(false); },
      error: (err) => { this.listError.set(apiErrorMessage(err, 'Please try again.')); this.loadingList.set(false); },
    });
  }

  /** The URL carries the folder and the open message, so a link to a message (from a case) opens it directly. */
  protected openFolder(folder: MailFolder): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { folder: folder === 'inbox' ? null : folder, message: null }, queryParamsHandling: 'merge' });
  }
  protected select(id: string | null): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { message: id }, queryParamsHandling: 'merge' });
  }

  protected open(id: string | null): void {
    this.selectedId.set(id);
    this.message.set(null);
    this.detailError.set('');
    this.linking.set(false);
    this.linkTarget.set('');
    if (!id) return;
    this.api.get(id).subscribe({
      next: (message) => {
        if (this.selectedId() !== id) return; // the user moved on while this was loading
        this.message.set(message);
        if (!message.isRead) this.markRead(message, true);
      },
      error: (err) => { if (this.selectedId() === id) this.detailError.set(apiErrorMessage(err, 'Please try again.')); },
    });
  }

  private markRead(message: MailMessage, isRead: boolean): void {
    this.api.setRead(message.id, isRead).subscribe({
      next: () => {
        this.message.update((current) => (current && current.id === message.id ? { ...current, isRead } : current));
        this.items.update((list) => list.map((item) => (item.id === message.id ? { ...item, isRead } : item)));
        this.unread.refresh(); // keep the number beside Mail in step
      },
      error: () => undefined, // reading must not fail because the unread marker could not be changed
    });
  }
  protected toggleRead(message: MailMessage): void { this.markRead(message, !message.isRead); }

  protected startCompose(reply: MailMessage | null, all: boolean, to = ''): void {
    this.replyTo.set(reply);
    this.composeTo.set(to);
    this.replyAll.set(all);
    this.composing.set(true);
  }

  protected onSent(result: { link: unknown }): void {
    this.composing.set(false);
    this.say(result.link ? 'Message sent and linked to the case.' : 'Message sent.');
    if (this.folder() === 'sent') this.loadList(1);
    const open = this.selectedId();
    if (open && result.link) this.open(open); // show the new link
  }

  protected link(message: MailMessage): void {
    const caseId = this.linkTarget();
    if (!caseId || this.busy()) return;
    this.busy.set(true);
    this.api.link(message.id, caseId).subscribe({
      next: () => { this.busy.set(false); this.linking.set(false); this.say('Message linked to the case.'); this.open(message.id); this.loadList(this.page()); },
      error: (err) => { this.busy.set(false); this.sayError(apiErrorMessage(err, 'The message could not be linked.')); },
    });
  }

  protected unlink(message: MailMessage, linkId: string): void {
    this.api.unlink(linkId).subscribe({
      next: () => { this.say('Link removed.'); this.open(message.id); this.loadList(this.page()); },
      error: (err) => this.sayError(apiErrorMessage(err, 'The link could not be removed.')),
    });
  }

  protected download(message: MailMessage, attachment: MailAttachment): void {
    this.downloading.set(attachment.id);
    this.api.attachment(message.id, attachment.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const anchor = Object.assign(document.createElement('a'), { href: url, download: attachment.name });
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        this.downloading.set('');
      },
      error: (err) => { this.downloading.set(''); this.sayError(apiErrorMessage(err, 'The attachment could not be downloaded.')); },
    });
  }

  protected names(people: { name: string; address: string }[]): string {
    return people.map((p) => (p.name ? `${p.name} <${p.address}>` : p.address)).join(', ') || '—';
  }
  protected size(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
  }
}
