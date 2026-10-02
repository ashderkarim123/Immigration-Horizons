import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../../../core/api/api.service';
import {
  DependencyCandidate,
  DependencyType,
  DocumentRole,
  PetitionApiError,
  PetitionDetail,
  PetitionKind,
  PetitionList,
  PetitionSection,
  PetitionSummary,
  PetitionVersionDetail,
} from '../../../../core/api/petition.types';
import { ToastService } from '../../../../shared/toast.service';
import { StatusBadgeComponent } from '../../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { ConfirmDialogComponent } from '../../../../shared/confirm-dialog.component';
import { DEPENDENCY_LABELS, DEPENDENCY_TYPES, DOCUMENT_ROLES, PETITION_STATUS_LABELS, PETITION_STATUS_VARIANTS, SECTION_STATUS_LABELS, SECTION_STATUS_VARIANTS, humanizeKind } from './petition-state';

type SaveState = 'saved' | 'saving' | 'unsaved' | 'conflict' | 'error';
type Action = 'submit' | 'return' | 'approve' | 'finalize';

const AUTOSAVE_DELAY_MS = 1200;

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
  conflict: 'Conflict — reload to continue',
  error: 'Couldn’t save — retry',
};

/** From GET /staff/cases/:id/member-options, which returns `id` (never Mongo's `_id`). */
interface EmployeeOption {
  id: string;
  name: string;
}

/**
 * Case "Petition" tab (ADR-022 §27): petition list, section drafting with
 * debounced autosave and optimistic concurrency, assignment, section and
 * petition review, same-case dependencies with readiness, finalization and
 * immutable version history. Every permission comes from the server's
 * `actions` objects; the tab never infers authority from a role name, and
 * petition text is held only in component memory - never localStorage.
 */
@Component({
  selector: 'ih-petition-tab',
  standalone: true,
  imports: [DatePipe, FormsModule, StatusBadgeComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, ConfirmDialogComponent],
  templateUrl: './petition-tab.component.html',
  styleUrl: './petition-tab.component.scss',
})
export class PetitionTabComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  caseId = input.required<string>();

  readonly petitionLabels = PETITION_STATUS_LABELS;
  readonly petitionVariants = PETITION_STATUS_VARIANTS;
  readonly sectionLabels = SECTION_STATUS_LABELS;
  readonly sectionVariants = SECTION_STATUS_VARIANTS;
  readonly saveLabels = SAVE_LABELS;
  readonly dependencyTypes = DEPENDENCY_TYPES;
  readonly dependencyLabels = DEPENDENCY_LABELS;
  readonly documentRoles = DOCUMENT_ROLES;
  readonly kindLabel = humanizeKind;

  list = signal<PetitionList | null>(null);
  isLoading = signal(true);
  loadError = signal<'forbidden' | 'error' | null>(null);
  isProvisioning = signal(false);

  petition = signal<PetitionDetail | null>(null);
  sectionKey = signal<string | null>(null);
  body = signal('');
  saveState = signal<SaveState>('saved');
  errors = signal<Record<string, string>>({});
  banner = signal<string | null>(null);
  busy = signal(false);

  employees = signal<EmployeeOption[]>([]);
  assigneeChoice = signal('');
  reviewNote = signal('');
  petitionNote = signal('');
  returningPetition = signal(false);
  showFinalizeConfirm = signal(false);

  pickerType = signal<DependencyType>('evidence_requirement');
  candidates = signal<DependencyCandidate[]>([]);
  pickerRef = signal('');
  pickerRole = signal<DocumentRole>('supporting_document');
  pickerRequired = signal(true);
  version = signal<PetitionVersionDetail | null>(null);

  section = computed<PetitionSection | null>(() => this.petition()?.sections.find((s) => s.key === this.sectionKey()) ?? null);
  editable = computed(() => !!this.section()?.actions.canEdit && this.saveState() !== 'conflict' && !this.busy());
  frozen = computed(() => ['finalized', 'archived'].includes(this.petition()?.status ?? ''));
  groupedDependencies = computed(() =>
    DEPENDENCY_TYPES.map((type) => ({ type, items: (this.petition()?.dependencies ?? []).filter((d) => d.type === type) })).filter((group) => group.items.length > 0),
  );
  unreadyRequired = computed(() => (this.petition()?.dependencies ?? []).filter((d) => d.requiredForFinalization && !d.ready).length);

  private revision = 0;
  private dirty = false;
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
      const res = await firstValueFrom(this.api.get<PetitionList>(`/staff/cases/${this.caseId()}/petitions`));
      this.list.set(res.data);
      // A single petition is the common case: open it straight away.
      if (res.data.petitions.length === 1 && !this.petition()) await this.open(res.data.petitions[0]);
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
      const res = await firstValueFrom(this.api.post<PetitionDetail>(`/staff/cases/${this.caseId()}/petitions/provision`, {}));
      this.toast.success('Petition ready.');
      await this.loadList(); // a single petition opens itself
      if (!this.petition()) this.applyServer(res.data);
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to create the petition.'));
    } finally {
      this.isProvisioning.set(false);
    }
  }

  async createAdditional(kind: PetitionKind): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.post<PetitionDetail>(`/staff/cases/${this.caseId()}/petitions`, { kind }));
      this.toast.success('Petition created.');
      await this.loadList();
      this.applyServer(res.data);
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to create the petition.'));
    }
  }

  // ---------------------------------------------------------------- editor

  async open(item: PetitionSummary): Promise<void> {
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.get<PetitionDetail>(`/staff/petitions/${item.id}`));
      this.halted = false;
      this.banner.set(null);
      this.errors.set({});
      this.saveState.set('saved');
      this.version.set(null);
      this.applyServer(res.data);
      void this.loadEmployees();
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to open the petition.'));
    } finally {
      this.busy.set(false);
    }
  }

  async back(): Promise<void> {
    if (this.dirty && !this.halted) await this.flush();
    this.petition.set(null);
    this.sectionKey.set(null);
    await this.loadList();
  }

  /** Replaces server-owned state. The open section's text is kept when the user has unsaved edits to it. */
  private applyServer(detail: PetitionDetail): void {
    this.petition.set(detail);
    this.revision = detail.revision;
    const key = this.sectionKey() && detail.sections.some((s) => s.key === this.sectionKey()) ? this.sectionKey() : (detail.sections[0]?.key ?? null);
    this.sectionKey.set(key);
    if (!this.dirty) this.body.set(detail.sections.find((s) => s.key === key)?.body ?? '');
    this.candidates.set([]);
    this.pickerRef.set('');
  }

  async selectSection(key: string): Promise<void> {
    if (key === this.sectionKey()) return;
    if (this.timer) clearTimeout(this.timer);
    if (this.dirty && !this.halted && !(await this.flush())) return; // never abandon unsaved text
    this.sectionKey.set(key);
    this.body.set(this.petition()?.sections.find((s) => s.key === key)?.body ?? '');
    this.reviewNote.set('');
    this.assigneeChoice.set(this.section()?.assignee?.id ?? '');
  }

  onBodyEvent(event: Event): void {
    this.onBodyInput((event.target as HTMLTextAreaElement).value);
  }

  onRequiredChange(event: Event): void {
    this.pickerRequired.set((event.target as HTMLInputElement).checked);
  }

  onBodyInput(value: string): void {
    this.body.set(value);
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.saveState.set('unsaved');
    this.timer = setTimeout(() => void this.flush(), AUTOSAVE_DELAY_MS);
  }

  retrySave(): void {
    void this.flush();
  }

  /** One in-flight save at a time. True when the server has the text (or there was nothing to save). */
  async flush(): Promise<boolean> {
    if (this.inFlight) await this.inFlight;
    const current = this.petition();
    const key = this.sectionKey();
    if (!current || !key || this.halted) return !this.halted;
    if (!this.dirty) return true;

    const text = this.body();
    this.dirty = false;
    this.saveState.set('saving');
    const run = (async (): Promise<boolean> => {
      try {
        const res = await firstValueFrom(this.api.patch<PetitionDetail>(`/staff/petitions/${current.id}/sections/${key}`, { revision: this.revision, body: text }));
        this.revision = res.data.revision;
        // Take server metadata (revision, status, review state) but never overwrite text the user typed meanwhile.
        this.petition.set(res.data);
        if (!this.dirty) this.body.set(res.data.sections.find((s) => s.key === key)?.body ?? text);
        this.saveState.set(this.dirty ? 'unsaved' : 'saved');
        return true;
      } catch (err) {
        this.dirty = true; // the text is still only in memory: keep it for retry
        this.handleError(err);
        return false;
      }
    })();
    this.inFlight = run;
    const ok = await run;
    this.inFlight = null;
    return ok;
  }

  async reload(): Promise<void> {
    const current = this.petition();
    if (!current) return;
    this.dirty = false;
    await this.open(current);
  }

  private handleError(err: unknown): void {
    const body = err instanceof HttpErrorResponse ? (err.error as PetitionApiError | null)?.error : undefined;
    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.halted = true;
      this.saveState.set('conflict');
      this.banner.set(body?.message ?? 'This petition was changed by someone else. Reload to see the latest version.');
    } else if (err instanceof HttpErrorResponse && err.status === 400) {
      this.errors.set(this.stringErrors(body?.fieldErrors));
      this.banner.set(body?.message ?? 'Please correct the highlighted fields.');
      this.saveState.set('error');
    } else if (err instanceof HttpErrorResponse && err.status === 403) {
      this.banner.set(body?.message ?? 'You do not have permission to do that.');
      this.saveState.set('error');
    } else {
      this.saveState.set('error');
    }
  }

  private stringErrors(fieldErrors: Record<string, string | number> | null | undefined): Record<string, string> {
    return Object.fromEntries(Object.entries(fieldErrors ?? {}).map(([key, value]) => [key, String(value)]));
  }

  private messageOf(err: unknown, fallback: string): string {
    return (err instanceof HttpErrorResponse && (err.error as PetitionApiError | null)?.error?.message) || fallback;
  }

  /** Runs a mutation after flushing pending text, then adopts the server's refreshed petition. */
  private async mutate(call: (revision: number) => Promise<{ data: PetitionDetail }>, success?: string): Promise<boolean> {
    if (this.busy()) return false;
    if (this.timer) clearTimeout(this.timer);
    this.busy.set(true);
    this.banner.set(null);
    this.errors.set({});
    try {
      if (!(await this.flush())) return false;
      const res = await call(this.revision);
      this.dirty = false;
      this.saveState.set('saved');
      this.applyServer(res.data);
      this.body.set(res.data.sections.find((s) => s.key === this.sectionKey())?.body ?? '');
      if (success) this.toast.success(success);
      return true;
    } catch (err) {
      this.handleError(err);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  // ------------------------------------------------------------- sections

  private sectionUrl(action: string): string {
    return `/staff/petitions/${this.petition()?.id}/sections/${this.sectionKey()}/${action}`;
  }

  async loadEmployees(): Promise<void> {
    if (this.employees().length) return;
    try {
      const res = await firstValueFrom(this.api.get<{ employees: EmployeeOption[] }>(`/staff/cases/${this.caseId()}/member-options`));
      this.employees.set(res.data.employees ?? []);
    } catch {
      this.employees.set([]); // assignment simply isn't offered
    }
  }

  async assign(): Promise<void> {
    const ok = await this.mutate((revision) => firstValueFrom(this.api.post<PetitionDetail>(this.sectionUrl('assign'), { revision, assigneeId: this.assigneeChoice() || null })), 'Assignment updated.');
    if (ok) this.assigneeChoice.set(this.section()?.assignee?.id ?? '');
  }

  async markReady(): Promise<void> {
    await this.mutate((revision) => firstValueFrom(this.api.post<PetitionDetail>(this.sectionUrl('review'), { revision })), 'Section marked ready for review.');
  }

  async approveSection(): Promise<void> {
    await this.mutate((revision) => firstValueFrom(this.api.post<PetitionDetail>(this.sectionUrl('approve'), { revision })), 'Section approved.');
  }

  async returnSection(): Promise<void> {
    if (!this.reviewNote().trim()) {
      this.errors.update((e) => ({ ...e, reviewNote: 'Tell the writer what to change.' }));
      return;
    }
    const ok = await this.mutate((revision) => firstValueFrom(this.api.post<PetitionDetail>(this.sectionUrl('return'), { revision, reviewNote: this.reviewNote() })), 'Section returned.');
    if (ok) this.reviewNote.set('');
  }

  // ---------------------------------------------------------- dependencies

  async loadCandidates(): Promise<void> {
    const current = this.petition();
    if (!current) return;
    this.pickerRef.set('');
    try {
      const res = await firstValueFrom(this.api.get<{ candidates: DependencyCandidate[] }>(`/staff/petitions/${current.id}/dependency-candidates`, { type: this.pickerType() }));
      this.candidates.set(res.data.candidates);
    } catch (err) {
      this.candidates.set([]);
      this.toast.error(this.messageOf(err, 'Failed to load items.'));
    }
  }

  setPickerType(type: DependencyType): void {
    this.pickerType.set(type);
    void this.loadCandidates();
  }

  async addDependency(): Promise<void> {
    const current = this.petition();
    if (!current || !this.pickerRef()) return;
    const body: Record<string, unknown> = { type: this.pickerType(), refId: this.pickerRef(), requiredForFinalization: this.pickerRequired() };
    if (this.pickerType() === 'case_document') body['role'] = this.pickerRole();
    const ok = await this.mutate((revision) => firstValueFrom(this.api.post<PetitionDetail>(`/staff/petitions/${current.id}/dependencies`, { revision, ...body })), 'Linked.');
    if (ok) void this.loadCandidates();
  }

  async removeDependency(id: string): Promise<void> {
    const current = this.petition();
    if (!current) return;
    await this.mutate((revision) => firstValueFrom(this.api.delete<PetitionDetail>(`/staff/petitions/${current.id}/dependencies/${id}?revision=${revision}`)), 'Link removed.');
  }

  // ------------------------------------------------------------ lifecycle

  async run(action: Action): Promise<void> {
    const current = this.petition();
    if (!current) return;
    if (action === 'return') {
      if (!this.petitionNote().trim()) {
        this.errors.update((e) => ({ ...e, internalReviewNote: 'Tell the team what to change.' }));
        return;
      }
    }
    const extra = action === 'return' ? { internalReviewNote: this.petitionNote() } : {};
    const labels: Record<Action, string> = { submit: 'Submitted for internal review.', return: 'Returned for changes.', approve: 'Petition approved.', finalize: 'Petition finalized.' };
    const ok = await this.mutate((revision) => firstValueFrom(this.api.post<PetitionDetail>(`/staff/petitions/${current.id}/${action}`, { revision, ...extra })), labels[action]);
    if (ok) {
      this.returningPetition.set(false);
      this.petitionNote.set('');
      this.showFinalizeConfirm.set(false);
    }
  }

  // -------------------------------------------------------------- versions

  async openVersion(id: string): Promise<void> {
    const current = this.petition();
    if (!current) return;
    if (this.version()?.id === id) {
      this.version.set(null);
      return;
    }
    try {
      const res = await firstValueFrom(this.api.get<PetitionVersionDetail>(`/staff/petitions/${current.id}/versions/${id}`));
      this.version.set(res.data);
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to load the version.'));
    }
  }

  errorFor(key: string): string | undefined {
    return this.errors()[key];
  }

  sectionErrors = computed(() => Object.entries(this.errors()).filter(([key]) => !['reviewNote', 'internalReviewNote'].includes(key)));
}
