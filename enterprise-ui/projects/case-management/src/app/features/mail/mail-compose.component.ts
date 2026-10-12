import { Component, HostListener, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { apiErrorMessage, apiFieldErrors } from '../../core/api/api-error';
import { MailApi } from '../../core/api/mail-api.service';
import { MailMessage, MailRequest, MailSendResult } from '../../core/api/mail.types';
import { CasePickerComponent } from './case-picker.component';

/** "a@b.co, c@d.co; e@f.co" to ["a@b.co", "c@d.co", "e@f.co"]. The server validates each address again. */
export const parseAddresses = (text: string): string[] => text.split(/[\s,;]+/).map((part) => part.trim()).filter(Boolean);

/**
 * Write a new message (`replyTo` null) or answer one. Messages go out as plain text from the shared mailbox; the server checks
 * every field again, and refuses a case the employee cannot open before anything is sent.
 */
@Component({
  selector: 'ih-mail-compose',
  standalone: true,
  imports: [FormsModule, CasePickerComponent],
  template: `
    @if (open()) {
      <div class="modal-backdrop" (click)="closed.emit()">
        <div class="modal-card" role="dialog" aria-modal="true" [attr.aria-labelledby]="'compose-title'" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 id="compose-title">{{ replyTo() ? (all() ? 'Reply to all' : 'Reply') : 'New message' }}</h3>
            <button type="button" class="btn-close" aria-label="Close" (click)="closed.emit()">×</button>
          </div>
          <form class="modal-body stack" (ngSubmit)="send()" novalidate>
            @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
            @if (replyTo(); as original) {
              <p class="muted">Replying to <strong>{{ original.subject || '(no subject)' }}</strong> from {{ original.from.name || original.from.address }}. The original message is quoted below your reply.</p>
              <label class="check"><input type="checkbox" name="all" [ngModel]="all()" (ngModelChange)="all.set($event)" /> Reply to everyone on the message</label>
            } @else {
              <div class="field">
                <label for="mail-to">To</label>
                <input id="mail-to" name="to" class="form-control" autocomplete="off" required placeholder="name@example.com, another@example.com" [ngModel]="to()" (ngModelChange)="to.set($event)" [attr.aria-invalid]="!!errors()['to']" />
                @if (errors()['to']) { <span class="field-error">{{ errors()['to'] }}</span> }
              </div>
              <div class="field">
                <label for="mail-cc">Cc <span class="muted">(optional)</span></label>
                <input id="mail-cc" name="cc" class="form-control" autocomplete="off" [ngModel]="cc()" (ngModelChange)="cc.set($event)" [attr.aria-invalid]="!!errors()['cc']" />
                @if (errors()['cc']) { <span class="field-error">{{ errors()['cc'] }}</span> }
              </div>
              <div class="field">
                <label for="mail-subject">Subject</label>
                <input id="mail-subject" name="subject" class="form-control" maxlength="255" required [ngModel]="subject()" (ngModelChange)="subject.set($event)" [attr.aria-invalid]="!!errors()['subject']" />
                @if (errors()['subject']) { <span class="field-error">{{ errors()['subject'] }}</span> }
              </div>
            }
            <div class="field">
              <label for="mail-body">Message</label>
              <textarea id="mail-body" name="body" class="form-control" rows="9" required [ngModel]="body()" (ngModelChange)="body.set($event)" [attr.aria-invalid]="!!errors()['body']"></textarea>
              <span class="hint">Plain text. It is sent from the shared mailbox and appears in its Sent Items.</span>
              @if (errors()['body']) { <span class="field-error">{{ errors()['body'] }}</span> }
            </div>
            <ih-case-picker label="Link this message to a case (optional)" (picked)="caseId.set($event?.id ?? '')" />
            @if (errors()['caseId']) { <span class="field-error">{{ errors()['caseId'] }}</span> }
            <div class="modal-footer">
              <button type="button" class="btn" (click)="closed.emit()">Cancel</button>
              <button type="submit" class="btn btn-primary" [disabled]="sending()">{{ sending() ? 'Sending…' : 'Send' }}</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: `
    .stack { display: flex; flex-direction: column; gap: .9rem; }
    .field { display: flex; flex-direction: column; gap: .3rem; }
    .field > label { font-weight: 600; }
    .hint, .muted { font-size: var(--ih-font-size-xs); color: var(--ih-text-secondary); margin: 0; }
    .check { display: flex; gap: .5rem; align-items: center; }
    .modal-footer { padding: 0; border: 0; }
  `,
})
export class MailComposeComponent {
  private readonly api = inject(MailApi);

  readonly open = input(false);
  readonly replyTo = input<MailMessage | null>(null);
  /** Start a reply with "reply to everyone" ticked. */
  readonly startAll = input(false);
  /** Address to start a new message with (for example the client being viewed). */
  readonly prefillTo = input('');
  readonly sent = output<MailSendResult>();
  readonly closed = output<void>();

  protected readonly to = signal('');
  protected readonly cc = signal('');
  protected readonly subject = signal('');
  protected readonly body = signal('');
  protected readonly all = signal(false);
  protected readonly caseId = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal('');
  protected readonly errors = signal<Record<string, string>>({});

  constructor() {
    // A fresh form every time the dialog opens: never carry a previous message's text into the next one.
    effect(() => {
      if (!this.open()) return;
      this.to.set(this.prefillTo()); this.cc.set(''); this.subject.set(''); this.body.set(''); this.all.set(this.startAll()); this.caseId.set('');
      this.error.set(''); this.errors.set({}); this.sending.set(false);
    });
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.open() && !this.sending()) this.closed.emit();
  }

  protected send(): void {
    if (this.sending()) return;
    const original = this.replyTo();
    const caseId = this.caseId() || undefined;
    const request: MailRequest = original
      ? { body: this.body(), all: this.all(), caseId }
      : { to: parseAddresses(this.to()), cc: parseAddresses(this.cc()), subject: this.subject(), body: this.body(), caseId };
    this.sending.set(true);
    this.error.set('');
    this.errors.set({});
    (original ? this.api.reply(original.id, request) : this.api.send(request)).subscribe({
      next: (result) => { this.sending.set(false); this.sent.emit(result); },
      error: (err) => {
        this.sending.set(false);
        const fields = apiFieldErrors(err);
        this.errors.set(fields);
        // A field problem is shown beside its field; the banner is for everything else (a case you cannot open, Microsoft down).
        this.error.set(Object.keys(fields).length ? '' : apiErrorMessage(err, 'The message could not be sent.'));
      },
    });
  }
}
