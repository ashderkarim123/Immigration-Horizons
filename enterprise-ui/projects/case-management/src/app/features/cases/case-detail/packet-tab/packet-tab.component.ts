import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ApiService } from '../../../../core/api/api.service';
import {
  CandidateType,
  DownloadAction,
  PacketApiError,
  PacketCandidate,
  PacketDetail,
  PacketItem,
  PacketKind,
  PacketList,
  PacketRole,
  PacketSummary,
  PacketVersionDetail,
} from '../../../../core/api/filing-packet.types';
import { ToastService } from '../../../../shared/toast.service';
import { StatusBadgeComponent } from '../../../../shared/status-badge.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { ConfirmDialogComponent } from '../../../../shared/confirm-dialog.component';
import { PACKET_ROLES, PACKET_STATUS_LABELS, PACKET_STATUS_VARIANTS, buildManifestHtml, formatSize, kindLabel, roleLabel, ManifestInput } from './packet-state';

type Action = 'submit' | 'return' | 'approve' | 'finalize';

/**
 * Case "Filing Packet" tab (ADR-023 §27): an ordered, reviewable, immutable
 * filing MANIFEST. Pins one finalized petition version and exact document
 * versions; reorders with explicit Move up / Move down (no drag-and-drop);
 * shows readiness with reasons; downloads each exact version through the
 * existing secure route; finalizes into an immutable version with a manifest
 * hash. Every permission comes from the server's `actions` objects. It
 * generates, merges and zips nothing, and writes nothing to localStorage.
 */
@Component({
  selector: 'ih-packet-tab',
  standalone: true,
  imports: [DatePipe, FormsModule, StatusBadgeComponent, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, ConfirmDialogComponent],
  templateUrl: './packet-tab.component.html',
  styleUrl: './packet-tab.component.scss',
})
export class PacketTabComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  caseId = input.required<string>();
  /** Shown in the printed manifest header. */
  caseLabel = input('');

  readonly statusLabels = PACKET_STATUS_LABELS;
  readonly statusVariants = PACKET_STATUS_VARIANTS;
  readonly roles = PACKET_ROLES;
  readonly roleLabel = roleLabel;
  readonly kindLabel = kindLabel;
  readonly formatSize = formatSize;

  list = signal<PacketList | null>(null);
  isLoading = signal(true);
  loadError = signal<'forbidden' | 'error' | null>(null);
  isProvisioning = signal(false);

  packet = signal<PacketDetail | null>(null);
  busy = signal(false);
  conflict = signal(false);
  banner = signal<string | null>(null);
  errors = signal<Record<string, string>>({});

  pickerType = signal<CandidateType>('document_version');
  candidates = signal<PacketCandidate[]>([]);
  pickerRef = signal('');
  pickerRole = signal<PacketRole>('supporting_evidence');
  pickerRequired = signal(true);
  petitionPick = signal('');
  petitionCandidates = signal<PacketCandidate[]>([]);

  returning = signal(false);
  returnNote = signal('');
  showFinalizeConfirm = signal(false);
  version = signal<PacketVersionDetail | null>(null);

  frozen = computed(() => ['finalized', 'archived'].includes(this.packet()?.status ?? ''));
  editable = computed(() => !!this.packet()?.actions.canManage && !this.conflict() && !this.busy());
  unreadyRequired = computed(() => {
    const p = this.packet();
    return p ? p.readiness.requiredTotal - p.readiness.requiredReady : 0;
  });
  finalizeBlock = computed(() => {
    const p = this.packet();
    if (!p) return '';
    if (!p.readiness.petitionReady) return p.petitionSource.reason || 'The petition source is not ready.';
    if (this.unreadyRequired() > 0) return `${this.unreadyRequired()} required ${this.unreadyRequired() === 1 ? 'item is' : 'items are'} not ready.`;
    return '';
  });

  ngOnInit(): void {
    void this.loadList();
  }

  // ------------------------------------------------------------------ list

  async loadList(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const res = await firstValueFrom(this.api.get<PacketList>(`/staff/cases/${this.caseId()}/filing-packets`));
      this.list.set(res.data);
      // A single packet is the common case: open it straight away.
      if (res.data.packets.length === 1 && !this.packet()) await this.open(res.data.packets[0]);
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
      const res = await firstValueFrom(this.api.post<PacketDetail>(`/staff/cases/${this.caseId()}/filing-packets/provision`, {}));
      this.toast.success('Filing packet ready.');
      await this.loadList(); // a single packet opens itself
      if (!this.packet()) this.adopt(res.data);
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to create the packet.'));
    } finally {
      this.isProvisioning.set(false);
    }
  }

  async createAdditional(kind: PacketKind): Promise<void> {
    try {
      const res = await firstValueFrom(this.api.post<PacketDetail>(`/staff/cases/${this.caseId()}/filing-packets`, { kind }));
      this.toast.success('Filing packet created.');
      await this.loadList();
      this.adopt(res.data);
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to create the packet.'));
    }
  }

  // ---------------------------------------------------------------- editor

  async open(item: PacketSummary): Promise<void> {
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.get<PacketDetail>(`/staff/filing-packets/${item.id}`));
      this.conflict.set(false);
      this.banner.set(null);
      this.errors.set({});
      this.version.set(null);
      this.adopt(res.data);
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to open the packet.'));
    } finally {
      this.busy.set(false);
    }
  }

  async back(): Promise<void> {
    this.packet.set(null);
    await this.loadList();
  }

  async reload(): Promise<void> {
    const current = this.packet();
    if (current) await this.open(current);
  }

  private adopt(detail: PacketDetail): void {
    this.packet.set(detail);
    this.candidates.set([]);
    this.pickerRef.set('');
    this.petitionPick.set('');
    if (detail.actions.canManage) void this.loadPetitionCandidates();
  }

  private handleError(err: unknown): void {
    const body = err instanceof HttpErrorResponse ? (err.error as PacketApiError | null)?.error : undefined;
    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.conflict.set(true);
      this.banner.set(body?.message ?? 'This packet was changed by someone else. Reload to see the latest version.');
    } else if (err instanceof HttpErrorResponse && err.status === 400) {
      this.errors.set(Object.fromEntries(Object.entries(body?.fieldErrors ?? {}).map(([k, v]) => [k, String(v)])));
      this.banner.set(body?.message ?? 'Please correct the highlighted fields.');
    } else if (err instanceof HttpErrorResponse && err.status === 403) {
      this.banner.set(body?.message ?? 'You do not have permission to do that.');
    } else {
      this.banner.set('Something went wrong. Please try again.');
    }
  }

  private messageOf(err: unknown, fallback: string): string {
    return (err instanceof HttpErrorResponse && (err.error as PacketApiError | null)?.error?.message) || fallback;
  }

  /** One mutation at a time, always with the expected revision; adopts the server's refreshed packet. */
  private async mutate(call: (revision: number) => Promise<{ data: PacketDetail }>, success?: string): Promise<boolean> {
    const current = this.packet();
    if (!current || this.busy()) return false;
    this.busy.set(true);
    this.banner.set(null);
    this.errors.set({});
    try {
      const res = await call(current.revision);
      this.adopt(res.data);
      if (success) this.toast.success(success);
      return true;
    } catch (err) {
      this.handleError(err);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  private url(path: string): string {
    return `/staff/filing-packets/${this.packet()?.id}${path}`;
  }

  // ------------------------------------------------------- petition source

  async loadPetitionCandidates(): Promise<void> {
    const current = this.packet();
    if (!current) return;
    try {
      const res = await firstValueFrom(this.api.get<{ candidates: PacketCandidate[] }>(`/staff/filing-packets/${current.id}/candidates`, { type: 'petition_version' }));
      this.petitionCandidates.set(res.data.candidates);
    } catch {
      this.petitionCandidates.set([]);
    }
  }

  async usePetitionVersion(): Promise<void> {
    if (!this.petitionPick()) return;
    await this.mutate((revision) => firstValueFrom(this.api.post<PacketDetail>(this.url('/petition-version'), { revision, petitionVersionId: this.petitionPick() })), 'Petition version pinned.');
  }

  async clearPetitionVersion(): Promise<void> {
    await this.mutate((revision) => firstValueFrom(this.api.post<PacketDetail>(this.url('/petition-version'), { revision, petitionVersionId: null })), 'Petition version cleared.');
  }

  // ----------------------------------------------------------------- items

  async loadCandidates(): Promise<void> {
    const current = this.packet();
    if (!current) return;
    this.pickerRef.set('');
    try {
      const res = await firstValueFrom(this.api.get<{ candidates: PacketCandidate[] }>(`/staff/filing-packets/${current.id}/candidates`, { type: this.pickerType() }));
      this.candidates.set(res.data.candidates);
    } catch (err) {
      this.candidates.set([]);
      this.toast.error(this.messageOf(err, 'Failed to load items.'));
    }
  }

  setPickerType(type: CandidateType): void {
    this.pickerType.set(type);
    this.pickerRole.set(type === 'smart_form' ? 'uscis_form' : 'supporting_evidence');
    this.pickerRequired.set(type !== 'smart_form');
    void this.loadCandidates();
  }

  candidateLabel(c: PacketCandidate): string {
    const text = c.displayName ?? c.title ?? '';
    const extra = c.versionNumber ? ` (v${c.versionNumber}${c.categoryName ? `, ${c.categoryName}` : ''})` : c.revision ? ` (revision ${c.revision})` : '';
    return `${text}${extra}${c.linked ? ' — added' : ''}`;
  }

  candidateKey(c: PacketCandidate): string {
    return c.versionId ?? c.smartFormId ?? c.petitionVersionId ?? '';
  }

  async addItem(): Promise<void> {
    const picked = this.candidates().find((c) => this.candidateKey(c) === this.pickerRef());
    if (!picked) return;
    const base = { type: this.pickerType() === 'smart_form' ? 'smart_form_reference' : 'document_version', role: this.pickerRole(), required: this.pickerRequired() };
    const body = this.pickerType() === 'smart_form' ? { ...base, smartFormId: picked.smartFormId } : { ...base, documentId: picked.documentId, versionId: picked.versionId };
    const ok = await this.mutate((revision) => firstValueFrom(this.api.post<PacketDetail>(this.url('/items'), { revision, ...body })), 'Added to the packet.');
    if (ok) void this.loadCandidates();
  }

  async removeItem(item: PacketItem): Promise<void> {
    const ok = await this.mutate((revision) => firstValueFrom(this.api.delete<PacketDetail>(`${this.url(`/items/${item.id}`)}?revision=${revision}`)), 'Removed from the packet.');
    if (ok && this.candidates().length) void this.loadCandidates();
  }

  async setRole(item: PacketItem, role: PacketRole): Promise<void> {
    await this.mutate((revision) => firstValueFrom(this.api.patch<PacketDetail>(this.url(`/items/${item.id}`), { revision, role })));
  }

  onRequiredChange(item: PacketItem, event: Event): void {
    void this.setRequired(item, (event.target as HTMLInputElement).checked);
  }

  onPickerRequired(event: Event): void {
    this.pickerRequired.set((event.target as HTMLInputElement).checked);
  }

  /** The live document has a newer version than the one this packet pinned (informational: the packet never follows it). */
  hasNewerVersion(item: PacketItem): boolean {
    const s = item.source;
    return !!s && typeof s.currentVersionNumber === 'number' && typeof s.versionNumber === 'number' && s.currentVersionNumber > s.versionNumber;
  }

  async setRequired(item: PacketItem, required: boolean): Promise<void> {
    await this.mutate((revision) => firstValueFrom(this.api.patch<PacketDetail>(this.url(`/items/${item.id}`), { revision, required })));
  }

  /** Explicit Move up / Move down: the server receives the full ordered id list and decides the order. */
  async move(item: PacketItem, direction: -1 | 1): Promise<void> {
    const ids = (this.packet()?.items ?? []).map((i) => i.id);
    const from = ids.indexOf(item.id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    await this.mutate((revision) => firstValueFrom(this.api.post<PacketDetail>(this.url('/reorder'), { revision, orderedItemIds: ids })));
  }

  // ------------------------------------------------------------- download

  /** Existing Phase 06 secure route, exact version. The packet serves no bytes itself. */
  download(action: DownloadAction, filename: string): void {
    this.api.download(`/staff/documents/${action.documentId}/versions/${action.versionId}/download`).subscribe({
      next: (blob) => this.saveBlob(blob, filename),
      error: (err: HttpErrorResponse) => this.toast.error((err.error as PacketApiError | null)?.error?.message || 'Download failed.'),
    });
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // ------------------------------------------------------------ lifecycle

  async run(action: Action): Promise<void> {
    if (action === 'return' && !this.returnNote().trim()) {
      this.errors.update((e) => ({ ...e, internalReviewNote: 'Tell the team what to change.' }));
      return;
    }
    const extra = action === 'return' ? { internalReviewNote: this.returnNote() } : {};
    const labels: Record<Action, string> = { submit: 'Submitted for review.', return: 'Returned for changes.', approve: 'Packet approved.', finalize: 'Packet finalized.' };
    const ok = await this.mutate((revision) => firstValueFrom(this.api.post<PacketDetail>(this.url(`/${action}`), { revision, ...extra })), labels[action]);
    if (ok) {
      this.returning.set(false);
      this.returnNote.set('');
      this.showFinalizeConfirm.set(false);
    }
  }

  // -------------------------------------------------------------- versions

  async openVersion(id: string): Promise<void> {
    const current = this.packet();
    if (!current) return;
    if (this.version()?.id === id) {
      this.version.set(null);
      return;
    }
    try {
      const res = await firstValueFrom(this.api.get<PacketVersionDetail>(`/staff/filing-packets/${current.id}/versions/${id}`));
      this.version.set(res.data);
    } catch (err) {
      this.toast.error(this.messageOf(err, 'Failed to load the version.'));
    }
  }

  // ----------------------------------------------------------------- print

  /** Human-readable manifest for the packet as it stands now, or the open immutable version. */
  printManifest(): void {
    const p = this.packet();
    if (!p) return;
    const v = this.version();
    const sourceOf = (s: { versionNumber?: number; revision?: number; lockedRevision?: number | null; categoryName?: string; templateKey?: string } | null | undefined): string => {
      if (!s) return '';
      if (s.templateKey) return `Smart Form reference — revision ${s.revision}${s.lockedRevision ? `, locked ${s.lockedRevision}` : ''}`;
      return `Version ${s.versionNumber}${s.categoryName ? ` · ${s.categoryName}` : ''}`;
    };
    const input: ManifestInput = v
      ? {
          heading: `Filing manifest — ${this.caseLabel() || 'case'}`,
          packetTitle: v.title,
          statusLine: `Finalized version ${v.versionNumber} · ${kindLabel(v.kind)}`,
          petitionLine: v.petitionSource ? `Petition source: ${v.petitionSource.petitionTitle}, version ${v.petitionSource.versionNumber}` : 'Petition source: none for this packet kind',
          rows: v.items.map((i) => ({ order: i.order, label: i.label, role: i.role, required: i.required, source: sourceOf(i.source), status: i.status })),
          finalizedLine: v.createdAt ? `Finalized ${new Date(v.createdAt).toLocaleString()} by ${v.createdByName}` : null,
          manifestHash: v.manifestHash,
        }
      : {
          heading: `Filing manifest (working copy) — ${this.caseLabel() || 'case'}`,
          packetTitle: p.title,
          statusLine: `${PACKET_STATUS_LABELS[p.status]} · revision ${p.revision} · ${kindLabel(p.kind)}`,
          petitionLine: p.petitionSource.present ? `Petition source: ${p.petitionSource.title}, version ${p.petitionSource.versionNumber}` : 'Petition source: not chosen',
          rows: p.items.map((i) => ({ order: i.order, label: i.label, role: i.role, required: i.required, source: sourceOf(i.source), status: i.ready ? 'Ready' : i.reason || i.status })),
          finalizedLine: p.finalizedAt ? `Finalized ${new Date(p.finalizedAt).toLocaleString()} by ${p.finalizedByName}` : null,
          manifestHash: null,
        };
    const win = window.open('', '_blank');
    if (!win) {
      this.toast.error('Allow pop-ups to print the manifest.');
      return;
    }
    win.document.write(buildManifestHtml(input));
    win.document.close();
    win.focus();
    win.print();
  }

  errorFor(key: string): string | undefined {
    return this.errors()[key];
  }

  problems = computed(() => Object.entries(this.errors()).filter(([key]) => key !== 'internalReviewNote'));
  roleOf = (value: string): PacketRole => value as PacketRole;
}
