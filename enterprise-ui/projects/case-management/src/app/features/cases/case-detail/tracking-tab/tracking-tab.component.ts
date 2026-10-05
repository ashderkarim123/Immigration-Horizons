import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { apiErrorCode, apiErrorMessage, apiFieldErrors } from '../../../../core/api/api-error';
import { UscisApi } from '../../../../core/api/uscis-api.service';
import {
  USCIS_STATUS_CATEGORIES,
  UscisFiling,
  UscisFilingDetail,
  UscisProviderStatus,
  UscisStatusCategory,
  uscisCategoryLabel,
} from '../../../../core/api/uscis.types';
import { ConfirmDialogComponent } from '../../../../shared/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';
import { ToastService } from '../../../../shared/toast.service';

const REFRESH_ERROR_TEXT: Record<string, string> = {
  provider_unavailable: 'The last refresh failed because USCIS could not be reached.',
  provider_rate_limited: 'The last refresh was declined because USCIS is limiting requests.',
  provider_receipt_not_found: 'USCIS did not recognize this receipt number on the last refresh.',
};

const toLocalInput = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

/**
 * Case Tracking (ADR-026): the filings on a case, each with its immutable status timeline. Works fully
 * by hand; "Refresh from USCIS" appears only when the server says the provider is available AND this
 * filing can use it. Every control comes from the server's per-filing actions, never from a role.
 */
@Component({
  selector: 'ih-tracking-tab',
  standalone: true,
  imports: [DatePipe, FormsModule, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, ConfirmDialogComponent],
  template: `
    <section class="tracking section-card card" aria-labelledby="tracking-heading">
      <div class="tracking-head">
        <h3 id="tracking-heading" class="card-title m-0">Case Tracking</h3>
        @if (canCreate()) {
          <button type="button" class="btn btn-primary" (click)="openAdd()">Add filing</button>
        }
      </div>

      @if (isLoading()) {
        <ih-skeleton [rows]="3" rowHeight="3rem"></ih-skeleton>
      } @else if (isError()) {
        <ih-error-state title="Failed to load tracking" message="The tracked filings for this case could not be loaded." (retry)="load()"></ih-error-state>
      } @else if (filings().length === 0) {
        <ih-empty-state
          title="No USCIS filings tracked yet"
          [description]="canCreate() ? 'Add a filing and its receipt number to start recording USCIS status for this case.' : 'No USCIS filing has been added to this case.'"
        ></ih-empty-state>
      } @else {
        <div class="tracking-grid">
          <ul class="filing-list" aria-label="Tracked filings">
            @for (f of filings(); track f.id) {
              <li>
                <button type="button" class="filing-card" [class.selected]="f.id === selectedId()" [attr.aria-current]="f.id === selectedId() ? 'true' : null" (click)="select(f.id)">
                  <span class="filing-form">{{ f.formType }}<span class="filing-title"> · {{ f.title }}</span></span>
                  @if (f.receiptNumber) { <span class="receipt">{{ f.receiptNumber }}</span> }
                  <span class="filing-status">{{ f.currentStatus ? f.currentStatus.title : 'No status recorded yet' }}</span>
                  <span class="filing-flags">
                    @if (f.currentStatus?.actionRequired) { <span class="flag flag-action">Action required</span> }
                    @if (f.currentStatus; as s) { <span class="flag">{{ s.source === 'uscis_api' ? 'USCIS' : 'Manual' }}</span> }
                    <span class="flag">{{ f.clientVisible ? 'Shared with client' : 'Internal only' }}</span>
                  </span>
                </button>
              </li>
            }
          </ul>

          <div class="filing-detail" aria-live="polite">
            @if (detailState() === 'loading') {
              <ih-skeleton [rows]="4" rowHeight="2rem"></ih-skeleton>
            } @else if (detailState() === 'missing') {
              <ih-error-state title="Filing not available" message="This filing does not exist or you no longer have access to it." [retryable]="false"></ih-error-state>
            } @else if (detailState() === 'error') {
              <ih-error-state title="Failed to load filing" message="The filing could not be loaded." (retry)="select(selectedId()!)"></ih-error-state>
            } @else if (detail(); as d) {
              <div class="detail-head">
                <div>
                  <h4 class="m-0">{{ d.filing.formType }}@if (d.filing.formSubType) { <span class="muted"> ({{ d.filing.formSubType }})</span> }</h4>
                  <p class="muted m-0">{{ d.filing.title }}</p>
                  @if (d.filing.receiptNumber) { <p class="receipt m-0">{{ d.filing.receiptNumber }}</p> }
                </div>
                <div class="detail-actions">
                  @if (d.filing.actions.canAddStatus) { <button type="button" class="btn btn-primary btn-sm" (click)="openStatus()">Add status update</button> }
                  @if (d.filing.actions.canSync) {
                    <button type="button" class="btn btn-secondary btn-sm" [disabled]="syncing()" (click)="sync()">{{ syncing() ? 'Refreshing…' : 'Refresh from USCIS' }}</button>
                  }
                  @if (d.filing.actions.canEdit) { <button type="button" class="btn btn-secondary btn-sm" (click)="openEdit()">Edit details</button> }
                  @if (d.filing.actions.canArchive) { <button type="button" class="btn btn-outline-danger btn-sm" (click)="archiveOpen.set(true)">Archive</button> }
                </div>
              </div>

              @if (notice(); as n) {
                <p class="notice" [class.notice-error]="n.kind === 'error'" [attr.role]="n.kind === 'error' ? 'alert' : 'status'">{{ n.text }}</p>
              }

              <div class="current-status">
                <p class="muted m-0"><strong>Current status</strong></p>
                @if (d.filing.currentStatus; as s) {
                  <p class="current-title">{{ s.title }}</p>
                  <p class="muted m-0">{{ categoryLabel(s.category) }} · {{ s.source === 'uscis_api' ? 'From USCIS' : 'Entered by staff' }} · {{ s.occurredAt | date:'medium' }}</p>
                  @if (s.description) { <p class="desc">{{ s.description }}</p> }
                  @if (s.actionRequired) {
                    <p class="action-line">Action required@if (s.responseDueAt) { — response due {{ s.responseDueAt | date:'mediumDate':'UTC' }}@if (isOverdue(s.responseDueAt)) { (overdue) }}</p>
                  }
                } @else {
                  <p class="muted m-0">No status has been recorded for this filing yet.</p>
                }
              </div>

              <dl class="meta">
                <div><dt>Filed</dt><dd>{{ d.filing.filedAt ? (d.filing.filedAt | date:'mediumDate':'UTC') : 'Not recorded' }}</dd></div>
                <div><dt>Receipt date</dt><dd>{{ d.filing.receiptDate ? (d.filing.receiptDate | date:'mediumDate':'UTC') : 'Not recorded' }}</dd></div>
                <div><dt>Service center</dt><dd>{{ d.filing.serviceCenter || 'Not recorded' }}</dd></div>
                <div><dt>Client visibility</dt><dd>{{ d.filing.clientVisible ? 'Shared with client' : 'Internal only' }}</dd></div>
              </dl>

              @if (providerNote(d.filing); as note) { <p class="provider-note" [class.provider-error]="note.error">{{ note.text }}</p> }

              <h4 class="m-0" style="margin:1rem 0 .5rem">Status history <span class="muted">(newest first · {{ d.eventTotal }} {{ d.eventTotal === 1 ? 'update' : 'updates' }})</span></h4>
              @if (d.events.length === 0) {
                <p class="muted">No status updates yet.</p>
              } @else {
                <ol class="timeline" aria-label="Status history, newest first">
                  @for (e of d.events; track e.id) {
                    <li class="timeline-item">
                      <div class="timeline-top">
                        <strong>{{ e.statusTitle }}</strong>
                        <time [attr.datetime]="e.occurredAt">{{ e.occurredAt | date:'medium' }}</time>
                      </div>
                      <p class="muted m-0">
                        {{ categoryLabel(e.statusCategory) }} · {{ e.source === 'uscis_api' ? 'USCIS' : 'Manual' }}@if (e.createdByName && e.source === 'manual') { · {{ e.createdByName }}} · {{ e.clientVisible ? 'Shared with client' : 'Internal only' }}
                      </p>
                      @if (e.statusDescription) { <p class="desc">{{ e.statusDescription }}</p> }
                      @if (e.actionRequired) {
                        <p class="action-line">Action required@if (e.responseDueAt) { — response due {{ e.responseDueAt | date:'mediumDate':'UTC' }} }</p>
                      }
                    </li>
                  }
                </ol>
                @if (d.eventTotal > d.events.length) { <p class="muted">Showing the newest {{ d.events.length }} of {{ d.eventTotal }} updates.</p> }
              }
            }
          </div>
        </div>
      }
    </section>

    @if (filingDialog(); as mode) {
      <div class="modal-backdrop" (click)="closeFilingDialog()" (keydown.escape)="closeFilingDialog()">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="filing-dialog-title" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 id="filing-dialog-title">{{ mode === 'add' ? 'Add filing' : 'Edit filing details' }}</h3>
            <button type="button" class="btn-close" aria-label="Close" (click)="closeFilingDialog()">×</button>
          </div>
          <div class="modal-body">
            @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }

            <label class="form-label" for="f-formType">Form type <span class="text-danger">*</span></label>
            <input id="f-formType" class="form-control" maxlength="40" placeholder="I-140" autofocus [ngModel]="fFormType()" (ngModelChange)="fFormType.set($event)" [attr.aria-invalid]="!!formErrors()['formType']" aria-describedby="f-formType-err" />
            <p id="f-formType-err" class="field-error" role="alert">{{ formErrors()['formType'] }}</p>

            <label class="form-label" for="f-title">Title <span class="text-danger">*</span></label>
            <input id="f-title" class="form-control" maxlength="150" placeholder="I-140 petition" [ngModel]="fTitle()" (ngModelChange)="fTitle.set($event)" [attr.aria-invalid]="!!formErrors()['title']" aria-describedby="f-title-err" />
            <p id="f-title-err" class="field-error" role="alert">{{ formErrors()['title'] }}</p>

            <label class="form-label" for="f-receipt">Receipt number</label>
            <input id="f-receipt" class="form-control receipt-input" maxlength="30" autocomplete="off" spellcheck="false" placeholder="IOE1234567890" [ngModel]="fReceipt()" (ngModelChange)="fReceipt.set(($event || '').toUpperCase())" [attr.aria-invalid]="!!formErrors()['receiptNumber']" aria-describedby="f-receipt-hint f-receipt-err" />
            <p id="f-receipt-hint" class="hint">Usually three letters followed by ten digits. Needed for automatic USCIS refresh; optional for a draft. A receipt number identifies the filing and says nothing about its outcome.</p>
            <p id="f-receipt-err" class="field-error" role="alert">{{ formErrors()['receiptNumber'] }}</p>

            <label class="form-label" for="f-subtype">Form sub-type</label>
            <input id="f-subtype" class="form-control" maxlength="80" [ngModel]="fFormSubType()" (ngModelChange)="fFormSubType.set($event)" />

            <label class="form-label" for="f-center">Service center</label>
            <input id="f-center" class="form-control" maxlength="120" [ngModel]="fServiceCenter()" (ngModelChange)="fServiceCenter.set($event)" />

            <div class="two-col">
              <div>
                <label class="form-label" for="f-filed">Filed date</label>
                <input id="f-filed" type="date" class="form-control" [ngModel]="fFiledAt()" (ngModelChange)="fFiledAt.set($event)" [attr.aria-invalid]="!!formErrors()['filedAt']" />
                <p class="field-error" role="alert">{{ formErrors()['filedAt'] }}</p>
              </div>
              <div>
                <label class="form-label" for="f-receiptDate">Receipt date</label>
                <input id="f-receiptDate" type="date" class="form-control" [ngModel]="fReceiptDate()" (ngModelChange)="fReceiptDate.set($event)" [attr.aria-invalid]="!!formErrors()['receiptDate']" />
                <p class="field-error" role="alert">{{ formErrors()['receiptDate'] }}</p>
              </div>
            </div>

            <label class="check"><input type="checkbox" [ngModel]="fClientVisible()" (ngModelChange)="fClientVisible.set($event)" /> Show this filing to the client in their portal</label>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeFilingDialog()">Cancel</button>
            <button type="button" class="btn btn-primary" [disabled]="!fFormType().trim() || !fTitle().trim() || saving()" (click)="submitFiling()">{{ mode === 'add' ? 'Add filing' : 'Save changes' }}</button>
          </div>
        </div>
      </div>
    }

    @if (statusOpen()) {
      <div class="modal-backdrop" (click)="statusOpen.set(false)" (keydown.escape)="statusOpen.set(false)">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="status-dialog-title" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 id="status-dialog-title">Add status update</h3>
            <button type="button" class="btn-close" aria-label="Close" (click)="statusOpen.set(false)">×</button>
          </div>
          <div class="modal-body">
            @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
            <p class="hint">Status updates are permanent. To correct one, add a new update.</p>
            @if (detail()?.filing?.currentStatus?.actionRequired) {
              <p class="hint" role="note">The current status needs action. A newer update replaces it, so action required and the due date are carried over below. Clear them only if the action has been completed.</p>
            }

            <label class="form-label" for="s-category">Category <span class="text-danger">*</span></label>
            <select id="s-category" class="form-select" [ngModel]="sCategory()" (ngModelChange)="sCategory.set($event)">
              @for (c of categories; track c.value) { <option [value]="c.value">{{ c.label }}</option> }
            </select>
            <p class="field-error" role="alert">{{ formErrors()['statusCategory'] }}</p>

            <label class="form-label" for="s-title">Status as shown by USCIS or on the notice <span class="text-danger">*</span></label>
            <input id="s-title" class="form-control" maxlength="200" autofocus [ngModel]="sTitle()" (ngModelChange)="sTitle.set($event)" [attr.aria-invalid]="!!formErrors()['statusTitle']" />
            <p class="field-error" role="alert">{{ formErrors()['statusTitle'] }}</p>

            <label class="form-label" for="s-desc">Details</label>
            <textarea id="s-desc" class="form-control" rows="3" maxlength="2000" [ngModel]="sDescription()" (ngModelChange)="sDescription.set($event)"></textarea>
            <p class="field-error" role="alert">{{ formErrors()['statusDescription'] }}</p>

            <label class="form-label" for="s-when">Date and time it occurred <span class="text-danger">*</span></label>
            <input id="s-when" type="datetime-local" class="form-control" [ngModel]="sOccurredAt()" (ngModelChange)="sOccurredAt.set($event)" [attr.aria-invalid]="!!formErrors()['occurredAt']" />
            <p class="field-error" role="alert">{{ formErrors()['occurredAt'] }}</p>

            <label class="check"><input type="checkbox" [ngModel]="sActionRequired()" (ngModelChange)="sActionRequired.set($event)" /> A response or other action is required</label>
            @if (sActionRequired()) {
              <label class="form-label" for="s-due">Response due date</label>
              <input id="s-due" type="date" class="form-control" [ngModel]="sDue()" (ngModelChange)="sDue.set($event)" aria-describedby="s-due-hint" />
              <p id="s-due-hint" class="hint">Enter the date printed on the notice. It is never calculated from the status text.</p>
              <p class="field-error" role="alert">{{ formErrors()['responseDueAt'] }}</p>
            }

            <label class="check"><input type="checkbox" [ngModel]="sClientVisible()" (ngModelChange)="sClientVisible.set($event)" /> Show this update to the client</label>
            @if (sClientVisible() && !(detail()?.filing?.clientVisible)) {
              <p class="hint">This filing is internal only, so the client will not see this update until the filing is shared.</p>
            }
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="statusOpen.set(false)">Cancel</button>
            <button type="button" class="btn btn-primary" [disabled]="!sTitle().trim() || !sOccurredAt() || saving()" (click)="submitStatus()">Add update</button>
          </div>
        </div>
      </div>
    }

    <ih-confirm-dialog
      [isOpen]="archiveOpen()"
      title="Archive this filing"
      message="Archiving hides the filing from the active list. Its status history is kept and cannot be deleted."
      confirmText="Archive filing"
      variant="danger"
      (confirmed)="archive()"
      (cancelled)="archiveOpen.set(false)"
    ></ih-confirm-dialog>
  `,
  styles: [`
    .tracking-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .tracking-grid { display: grid; grid-template-columns: minmax(15rem, 20rem) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
    @media (max-width: 860px) { .tracking-grid { grid-template-columns: 1fr; } }
    .filing-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
    .filing-card { display: grid; gap: .25rem; width: 100%; text-align: left; padding: .75rem .875rem; background: #fff; border: 1px solid #d1d5db; border-radius: .5rem; cursor: pointer; }
    .filing-card:focus-visible, .btn:focus-visible, .modal-card :focus-visible { outline: 3px solid #b8892b; outline-offset: 2px; }
    .filing-card:hover, .filing-card.selected { border-color: #1e3a5f; box-shadow: inset 3px 0 0 #1e3a5f; background: #f8fafc; }
    .filing-form { font-weight: 600; color: #1e3a5f; }
    .filing-title { font-weight: 400; color: #4b5563; }
    .filing-status { font-size: .875rem; color: #111827; }
    .filing-flags { display: flex; flex-wrap: wrap; gap: .375rem; }
    .flag { font-size: .6875rem; font-weight: 600; padding: .0625rem .5rem; border-radius: 9999px; background: #eef2f7; color: #1e3a5f; }
    .flag-action { background: #fef3c7; color: #92400e; }
    .receipt { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; letter-spacing: .04em; font-size: .8125rem; color: #374151; }
    .receipt-input { text-transform: uppercase; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .detail-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .75rem; margin-bottom: 1rem; }
    .detail-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: flex-start; }
    .current-status { background: #f3f6fa; border-radius: .5rem; padding: .875rem 1rem; margin-bottom: 1rem; }
    .current-title { margin: .25rem 0; font-size: 1.0625rem; font-weight: 600; color: #1e3a5f; }
    .desc { margin: .375rem 0 0; font-size: .875rem; white-space: pre-line; }
    .action-line { margin: .5rem 0 0; font-weight: 600; color: #92400e; font-size: .875rem; }
    .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .75rem; margin: 0 0 1rem; }
    .meta dt { font-size: .75rem; color: #6b7280; } .meta dd { margin: 0; font-size: .875rem; }
    .muted { color: #4b5563; font-size: .8125rem; } .m-0 { margin: 0; }
    .notice { padding: .625rem .875rem; border-radius: .375rem; background: #ecfdf5; color: #065f46; margin: 0 0 1rem; }
    .notice-error { background: #fef2f2; color: #991b1b; }
    .provider-note { font-size: .8125rem; color: #4b5563; margin: 0 0 1rem; } .provider-error { color: #991b1b; }
    .timeline { list-style: none; margin: 0; padding: 0 0 0 1rem; border-left: 2px solid #d1d5db; display: grid; gap: .875rem; }
    .timeline-item { position: relative; }
    .timeline-item::before { content: ''; position: absolute; left: -1.4rem; top: .35rem; width: .6rem; height: .6rem; border-radius: 50%; background: #1e3a5f; }
    .timeline-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .5rem; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .modal-card { background: #fff; border-radius: .5rem; width: 100%; max-width: 32rem; max-height: 92vh; overflow: auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,.1); }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid #e5e7eb; }
    .modal-header h3 { margin: 0; font-size: 1.125rem; font-weight: 600; }
    .btn-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #6b7280; }
    .modal-body { padding: 1.25rem; display: grid; gap: .125rem; }
    .modal-footer { display: flex; justify-content: flex-end; gap: .5rem; padding: 1rem 1.25rem; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .form-label { display: block; font-size: .875rem; font-weight: 500; margin: .5rem 0 .25rem; color: #374151; }
    .hint { font-size: .75rem; color: #4b5563; margin: .125rem 0; }
    .field-error { color: #b91c1c; font-size: .8125rem; margin: .125rem 0; min-height: 0; } .field-error:empty { display: none; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; } @media (max-width: 480px) { .two-col { grid-template-columns: 1fr; } }
    .check { display: flex; gap: .5rem; align-items: center; margin: .625rem 0 .25rem; font-size: .875rem; }
  `]
})
export class TrackingTabComponent implements OnInit {
  private uscis = inject(UscisApi);
  private toast = inject(ToastService);

  caseId = input.required<string>();
  /** Deep link from the Tracking queue: /cases/:id?tab=tracking&filing=:filingId */
  initialFilingId = input<string | null>(null);

  readonly categories = USCIS_STATUS_CATEGORIES;
  readonly categoryLabel = uscisCategoryLabel;

  filings = signal<UscisFiling[]>([]);
  canCreate = signal(false);
  provider = signal<UscisProviderStatus | null>(null);
  isLoading = signal(true);
  isError = signal(false);

  selectedId = signal<string | null>(null);
  detail = signal<UscisFilingDetail | null>(null);
  detailState = signal<'idle' | 'loading' | 'error' | 'missing'>('idle');
  notice = signal<{ kind: 'error' | 'success'; text: string } | null>(null);
  syncing = signal(false);
  archiveOpen = signal(false);

  // dialogs
  filingDialog = signal<'add' | 'edit' | null>(null);
  statusOpen = signal(false);
  saving = signal(false);
  formError = signal('');
  formErrors = signal<Record<string, string>>({});

  fFormType = signal('');
  fTitle = signal('');
  fReceipt = signal('');
  fFormSubType = signal('');
  fServiceCenter = signal('');
  fFiledAt = signal('');
  fReceiptDate = signal('');
  fClientVisible = signal(false);

  sCategory = signal<UscisStatusCategory>('received');
  sTitle = signal('');
  sDescription = signal('');
  sOccurredAt = signal('');
  sActionRequired = signal(false);
  sDue = signal('');
  sClientVisible = signal(false);

  readonly selected = computed(() => this.filings().find((f) => f.id === this.selectedId()) ?? null);

  ngOnInit() {
    this.load();
  }

  load() {
    this.isLoading.set(true);
    this.isError.set(false);
    // Provider availability only decides whether the refresh button may appear; failing to read it is not an error.
    this.uscis.providerStatus().subscribe({ next: ({ data }) => this.provider.set(data), error: () => this.provider.set(null) });
    this.uscis.listForCase(this.caseId()).subscribe({
      next: ({ data }) => {
        this.filings.set(data.filings);
        this.canCreate.set(data.actions.canCreate);
        this.isLoading.set(false);
        const wanted = this.initialFilingId();
        const first = data.filings.find((f) => f.id === wanted) ?? data.filings[0];
        if (first) this.select(first.id);
      },
      error: () => {
        this.isError.set(true);
        this.isLoading.set(false);
      }
    });
  }

  select(id: string, keepNotice = false) {
    this.selectedId.set(id);
    if (!keepNotice) this.notice.set(null);
    this.detailState.set('loading');
    this.uscis.detail(id).subscribe({
      next: ({ data }) => this.adopt(data),
      error: (err) => this.detailState.set(err?.status === 404 ? 'missing' : 'error')
    });
  }

  /** Takes a refreshed detail from any mutation: shows it and updates the list row beside it. */
  private adopt(detail: UscisFilingDetail) {
    this.detail.set(detail);
    this.detailState.set('idle');
    this.filings.update((list) => list.map((f) => (f.id === detail.filing.id ? detail.filing : f)));
  }

  isOverdue(due: string | null): boolean {
    return !!due && new Date(due).getTime() < Date.now();
  }

  providerNote(filing: UscisFiling): { text: string; error: boolean } | null {
    if (filing.provider.lastErrorAt && filing.provider.lastErrorCode) {
      return { text: REFRESH_ERROR_TEXT[filing.provider.lastErrorCode] ?? 'The last refresh from USCIS failed. The last known status is unchanged.', error: true };
    }
    if (filing.provider.lastSuccessfulSyncAt) return { text: `Last refreshed from USCIS ${new Date(filing.provider.lastSuccessfulSyncAt).toLocaleString()}.`, error: false };
    const p = this.provider();
    if (filing.providerEligible && filing.actions.canEdit && p && !(p.enabled && p.configured)) {
      return { text: 'Automatic USCIS refresh is not enabled in this environment. Record status updates by hand.', error: false };
    }
    return null;
  }

  // ---- filing dialog ----

  private resetForm() {
    this.formError.set('');
    this.formErrors.set({});
    this.saving.set(false);
  }

  openAdd() {
    this.resetForm();
    for (const s of [this.fFormType, this.fTitle, this.fReceipt, this.fFormSubType, this.fServiceCenter, this.fFiledAt, this.fReceiptDate]) s.set('');
    this.fClientVisible.set(false);
    this.filingDialog.set('add');
  }

  openEdit() {
    const f = this.detail()?.filing;
    if (!f) return;
    this.resetForm();
    this.fFormType.set(f.formType);
    this.fTitle.set(f.title);
    this.fReceipt.set(f.receiptNumber ?? '');
    this.fFormSubType.set(f.formSubType ?? '');
    this.fServiceCenter.set(f.serviceCenter ?? '');
    this.fFiledAt.set(f.filedAt ? f.filedAt.slice(0, 10) : '');
    this.fReceiptDate.set(f.receiptDate ? f.receiptDate.slice(0, 10) : '');
    this.fClientVisible.set(f.clientVisible);
    this.filingDialog.set('edit');
  }

  closeFilingDialog() {
    this.filingDialog.set(null);
  }

  submitFiling() {
    const mode = this.filingDialog();
    if (!mode || this.saving() || !this.fFormType().trim() || !this.fTitle().trim()) return;
    this.saving.set(true);
    this.formError.set('');
    this.formErrors.set({});
    const fields = {
      title: this.fTitle().trim(),
      formType: this.fFormType().trim(),
      formSubType: this.fFormSubType().trim() || null,
      receiptNumber: this.fReceipt().trim() || null,
      serviceCenter: this.fServiceCenter().trim() || null,
      filedAt: this.fFiledAt() || null,
      receiptDate: this.fReceiptDate() || null,
      clientVisible: this.fClientVisible(),
    };
    const request = mode === 'add' ? this.uscis.create(this.caseId(), fields) : this.uscis.update(this.selectedId()!, fields);
    request.subscribe({
      next: ({ data }) => {
        this.saving.set(false);
        this.filingDialog.set(null);
        if (mode === 'add') {
          this.filings.update((list) => [data.filing, ...list]);
          this.canCreate.set(true);
          this.selectedId.set(data.filing.id);
        }
        this.adopt(data);
        this.toast.success(mode === 'add' ? 'Filing added.' : 'Filing updated.');
      },
      error: (err) => this.fail(err, mode === 'add' ? 'Failed to add the filing.' : 'Failed to save the filing.')
    });
  }

  // ---- status dialog ----

  openStatus() {
    const f = this.detail()?.filing;
    if (!f) return;
    this.resetForm();
    this.sCategory.set('received');
    this.sTitle.set('');
    this.sDescription.set('');
    this.sOccurredAt.set(toLocalInput());
    // A newer update replaces the current status, including its action flag and due date. Carry an outstanding
    // action forward so it cannot be dropped by accident; staff clear it deliberately once it is done.
    const outstanding = f.currentStatus?.actionRequired ? f.currentStatus : null;
    this.sActionRequired.set(!!outstanding);
    this.sDue.set(outstanding?.responseDueAt ? outstanding.responseDueAt.slice(0, 10) : '');
    this.sClientVisible.set(f.clientVisible);
    this.statusOpen.set(true);
  }

  submitStatus() {
    if (this.saving() || !this.sTitle().trim() || !this.sOccurredAt()) return;
    this.saving.set(true);
    this.formError.set('');
    this.formErrors.set({});
    const action = this.sActionRequired();
    this.uscis.addStatus(this.selectedId()!, {
      statusCategory: this.sCategory(),
      statusTitle: this.sTitle().trim(),
      statusDescription: this.sDescription().trim(),
      occurredAt: new Date(this.sOccurredAt()).toISOString(),
      actionRequired: action,
      responseDueAt: action && this.sDue() ? this.sDue() : null,
      clientVisible: this.sClientVisible(),
    }).subscribe({
      next: ({ data }) => {
        this.saving.set(false);
        this.statusOpen.set(false);
        this.adopt(data);
        this.toast.success('Status update added.');
      },
      error: (err) => this.fail(err, 'Failed to add the status update.')
    });
  }

  /** Field errors land beside the input they name; anything else (archived, no longer accessible) shows as one message. */
  private fail(err: unknown, fallback: string) {
    this.saving.set(false);
    const fields = apiFieldErrors(err);
    this.formErrors.set(fields);
    this.formError.set(Object.keys(fields).length ? '' : apiErrorMessage(err, fallback));
  }

  // ---- provider refresh and archive ----

  sync() {
    const id = this.selectedId();
    const before = this.detail()?.eventTotal ?? 0;
    if (!id || this.syncing()) return;
    this.syncing.set(true);
    this.notice.set(null);
    this.uscis.sync(id).subscribe({
      next: ({ data }) => {
        this.syncing.set(false);
        this.adopt(data);
        this.notice.set({ kind: 'success', text: data.eventTotal > before ? 'Status updated from USCIS.' : 'Checked with USCIS. There is no change.' });
      },
      error: (err) => {
        this.syncing.set(false);
        this.notice.set({ kind: 'error', text: apiErrorMessage(err, 'USCIS status could not be refreshed.') });
        // the server recorded a safe error code and left the known status alone; show that state
        if (apiErrorCode(err) !== 'rate_limited') this.select(id, true);
      }
    });
  }

  archive() {
    const id = this.selectedId();
    this.archiveOpen.set(false);
    if (!id) return;
    this.uscis.archive(id).subscribe({
      next: () => {
        const remaining = this.filings().filter((f) => f.id !== id);
        this.filings.set(remaining);
        this.detail.set(null);
        this.selectedId.set(null);
        this.toast.success('Filing archived. Its history is kept.');
        if (remaining[0]) this.select(remaining[0].id);
        else this.detailState.set('idle');
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'Failed to archive the filing.'))
    });
  }
}
