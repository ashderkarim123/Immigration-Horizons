import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../../../core/api/api.service';
import {
  FormAnswers,
  FormApiError,
  SmartFormAuditEvent,
  SmartFormDetail,
  SmartFormList,
  SmartFormListItem,
} from '../../../../core/api/form.types';
import { ToastService } from '../../../../shared/toast.service';
import { StatusBadgeComponent } from '../../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { ConfirmDialogComponent } from '../../../../shared/confirm-dialog.component';
import { FormFieldComponent } from './form-field.component';
import { STATUS_LABELS, STATUS_VARIANTS, isFieldVisible, withoutErrorsFor } from './forms-state';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error';
type ReviewAction = 'return' | 'approve';

const AUTOSAVE_DELAY_MS = 1200;

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  conflict: 'Conflict — reload to continue',
  error: 'Couldn’t save — retry',
};

const AUDIT_LABELS: Record<string, string> = {
  form_provisioned: 'Form added to the case',
  answers_saved: 'Answers saved',
  submitted: 'Submitted for review',
  returned_for_changes: 'Returned for changes',
  approved: 'Approved',
  locked: 'Locked',
};

/**
 * Case "Forms" tab (ADR-021 §25): list of the case's Smart Forms and a
 * structured editor with debounced autosave, optimistic concurrency and the
 * capability-gated review controls. Every permission comes from the server's
 * `actions` object — the tab never infers authority from a role name — and the
 * server owns validation and state transitions.
 */
@Component({
  selector: 'ih-forms-tab',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    StatusBadgeComponent,
    SkeletonComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
    FormFieldComponent,
  ],
  templateUrl: './forms-tab.component.html',
  styleUrl: './forms-tab.component.scss',
})
export class FormsTabComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  caseId = input.required<string>();

  readonly statusLabels = STATUS_LABELS;
  readonly statusVariants = STATUS_VARIANTS;
  readonly saveLabels = SAVE_LABELS;

  list = signal<SmartFormList | null>(null);
  isLoading = signal(true);
  loadError = signal<'forbidden' | 'error' | null>(null);
  isProvisioning = signal(false);

  form = signal<SmartFormDetail | null>(null);
  answers = signal<FormAnswers>({});
  saveState = signal<SaveState>('saved');
  errors = signal<Record<string, string>>({});
  banner = signal<string | null>(null);
  busy = signal(false);

  reviewAction = signal<ReviewAction | null>(null);
  clientNote = signal('');
  internalNote = signal('');
  showLockConfirm = signal(false);
  audit = signal<SmartFormAuditEvent[] | null>(null);

  editable = computed(() => !!this.form()?.actions.canEdit && this.saveState() !== 'conflict' && !this.busy());
  visibleSections = computed(() => {
    const answers = this.answers();
    return (this.form()?.sections ?? [])
      .map((section) => ({ ...section, fields: section.fields.filter((field) => isFieldVisible(field, answers)) }))
      .filter((section) => section.fields.length > 0);
  });

  private revision = 0;
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<boolean> | null = null;
  private halted = false;

  ngOnInit(): void {
    void this.loadList();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  // ------------------------------------------------------------------ list

  async loadList(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const res = await firstValueFrom(this.api.get<SmartFormList>(`/staff/cases/${this.caseId()}/forms`));
      this.list.set(res.data);
    } catch (err) {
      this.loadError.set(err instanceof HttpErrorResponse && (err.status === 403 || err.status === 404) ? 'forbidden' : 'error');
    } finally {
      this.isLoading.set(false);
    }
  }

  async provision(): Promise<void> {
    if (this.isProvisioning()) return;
    this.isProvisioning.set(true);
    try {
      const res = await firstValueFrom(this.api.post<SmartFormList & { created: string[] }>(`/staff/cases/${this.caseId()}/forms/provision`, {}));
      this.list.set({ forms: res.data.forms, canProvision: this.list()?.canProvision ?? true });
      this.toast.success(res.data.created.length ? 'Forms added to the case.' : 'This case already has all of its forms.');
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to add forms.'));
    } finally {
      this.isProvisioning.set(false);
    }
  }

  // ---------------------------------------------------------------- editor

  async open(item: SmartFormListItem): Promise<void> {
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.get<SmartFormDetail>(`/staff/forms/${item.id}`));
      this.applyServerForm(res.data);
      this.errors.set({});
      this.banner.set(null);
      this.saveState.set('saved');
      this.halted = false;
      this.reviewAction.set(null);
      this.audit.set(null);
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to open the form.'));
    } finally {
      this.busy.set(false);
    }
  }

  async back(): Promise<void> {
    if (this.dirty.size > 0 && !this.halted) await this.flush();
    this.form.set(null);
    await this.loadList();
  }

  private applyServerForm(detail: SmartFormDetail): void {
    this.form.set(detail);
    this.answers.set(detail.answers);
    this.revision = detail.revision;
    this.dirty = new Set();
  }

  setAnswer(key: string, value: unknown): void {
    this.answers.update((current) => ({ ...current, [key]: value }));
    this.dirty.add(key);
    if (this.timer) clearTimeout(this.timer);
    this.saveState.set('unsaved');
    this.timer = setTimeout(() => void this.flush(), AUTOSAVE_DELAY_MS);
  }

  retrySave(): void {
    void this.flush();
  }

  /** Sends the dirty keys once. True when the server has them (or there was nothing to send). */
  async flush(): Promise<boolean> {
    if (this.inFlight) await this.inFlight;
    const current = this.form();
    if (!current || this.halted) return !this.halted;
    if (this.dirty.size === 0) return true;

    const keys = [...this.dirty];
    const patch = Object.fromEntries(keys.map((key) => [key, this.answers()[key] ?? null]));
    this.dirty = new Set();
    this.saveState.set('saving');

    const run = (async (): Promise<boolean> => {
      try {
        const res = await firstValueFrom(this.api.patch<SmartFormDetail>(`/staff/forms/${current.id}/answers`, { revision: this.revision, answers: patch }));
        this.revision = res.data.revision;
        this.form.update((f) => (f ? { ...f, revision: res.data.revision, progress: res.data.progress, lastSavedAt: res.data.lastSavedAt, lastSavedByName: res.data.lastSavedByName } : f));
        this.errors.update((e) => withoutErrorsFor(e, keys));
        this.saveState.set(this.dirty.size ? 'unsaved' : 'saved');
        return true;
      } catch (err) {
        keys.forEach((k) => this.dirty.add(k));
        this.handleWriteError(err);
        return false;
      }
    })();
    this.inFlight = run;
    const ok = await run;
    this.inFlight = null;
    return ok;
  }

  private handleWriteError(err: unknown): void {
    const body = err instanceof HttpErrorResponse ? (err.error as FormApiError | null)?.error : undefined;
    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.halted = true;
      this.saveState.set('conflict');
      this.banner.set(body?.message ?? 'This form was changed by someone else. Reload to see the latest version.');
    } else if (err instanceof HttpErrorResponse && err.status === 400) {
      this.errors.set(this.stringErrors(body?.fieldErrors));
      this.saveState.set('error');
    } else {
      this.saveState.set('error');
    }
  }

  private stringErrors(fieldErrors: Record<string, string | number> | null | undefined): Record<string, string> {
    return Object.fromEntries(Object.entries(fieldErrors ?? {}).map(([key, value]) => [key, String(value)]));
  }

  async reload(): Promise<void> {
    const current = this.form();
    if (!current) return;
    await this.open(current);
  }

  // ---------------------------------------------------------- transitions

  async submit(): Promise<void> {
    await this.transition('submit', {}, 'Form submitted for review.');
  }

  startReview(action: ReviewAction): void {
    this.reviewAction.set(action);
    this.clientNote.set('');
    this.internalNote.set(this.form()?.internalReviewNote ?? '');
  }

  async confirmReview(): Promise<void> {
    const action = this.reviewAction();
    if (!action) return;
    if (action === 'return' && !this.clientNote().trim()) {
      this.errors.update((e) => ({ ...e, clientReviewNote: 'Tell the client what to change.' }));
      return;
    }
    const body: Record<string, string> = { internalReviewNote: this.internalNote() };
    if (action === 'return') body['clientReviewNote'] = this.clientNote();
    await this.transition(action, body, action === 'return' ? 'Form returned to the client.' : 'Form approved.');
  }

  async lock(): Promise<void> {
    this.showLockConfirm.set(false);
    await this.transition('lock', {}, 'Form locked.');
  }

  private async transition(action: 'submit' | 'return' | 'approve' | 'lock', extra: Record<string, string>, success: string): Promise<void> {
    const current = this.form();
    if (!current || this.busy()) return;
    if (this.timer) clearTimeout(this.timer);
    this.busy.set(true);
    this.banner.set(null);
    try {
      if (!(await this.flush())) return;
      const res = await firstValueFrom(this.api.post<SmartFormDetail>(`/staff/forms/${current.id}/${action}`, { revision: this.revision, ...extra }));
      this.applyServerForm(res.data);
      this.errors.set({});
      this.saveState.set('saved');
      this.reviewAction.set(null);
      this.audit.set(null);
      this.toast.success(success);
    } catch (err) {
      const body = err instanceof HttpErrorResponse ? (err.error as FormApiError | null)?.error : undefined;
      if (err instanceof HttpErrorResponse && err.status === 400) {
        this.errors.set(this.stringErrors(body?.fieldErrors));
        this.banner.set(action === 'submit' || action === 'approve' ? 'Some answers need attention first. They are marked below.' : (body?.message ?? 'Please correct the highlighted fields.'));
      } else this.handleWriteError(err);
    } finally {
      this.busy.set(false);
    }
  }

  // ----------------------------------------------------------------- audit

  async toggleAudit(): Promise<void> {
    if (this.audit()) {
      this.audit.set(null);
      return;
    }
    const current = this.form();
    if (!current) return;
    try {
      const res = await firstValueFrom(this.api.get<{ events: SmartFormAuditEvent[] }>(`/staff/forms/${current.id}/audit`));
      this.audit.set(res.data.events);
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to load history.'));
    }
  }

  auditLabel(event: SmartFormAuditEvent): string {
    return AUDIT_LABELS[event.eventType] ?? event.eventType;
  }

  scrollTo(sectionKey: string): void {
    document.getElementById(`form-section-${sectionKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  errorFor(key: string): string | undefined {
    return this.errors()[key];
  }

  private messageOf(err: unknown, fallback: string): string {
    return (err instanceof HttpErrorResponse && (err.error as FormApiError | null)?.error?.message) || fallback;
  }
}
