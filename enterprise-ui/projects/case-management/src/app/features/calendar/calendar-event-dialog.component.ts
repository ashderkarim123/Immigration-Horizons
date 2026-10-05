import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage, apiFieldErrors } from '../../core/api/api-error';
import { CalendarApi } from '../../core/api/calendar-api.service';
import { CALENDAR_EVENT_TYPES, CalendarEventType, CaseCalendarEventDto, CreateCalendarEventInput } from '../../core/api/calendar.types';
import { CaseMember } from '../../core/api/case.types';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog.component';
import { ToastService } from '../../shared/toast.service';
import { supportedZones } from './calendar-model';

/**
 * Create, edit and cancel a manual case event (ADR-027). Wall-clock times are entered in the zone chosen in the dialog and sent
 * as "YYYY-MM-DDTHH:mm" plus that zone; the server converts them to the exact instant. All-day events are plain dates that never
 * shift. What the form allows comes from the server (`actions`), and the server re-checks everything.
 */
@Component({
  selector: 'ih-calendar-event-dialog',
  standalone: true,
  imports: [FormsModule, ConfirmDialogComponent],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()" (keydown.escape)="closed.emit()">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="event-dialog-title" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3 id="event-dialog-title">{{ eventId() ? 'Calendar event' : 'Add calendar event' }}</h3>
          <button type="button" class="btn-close" aria-label="Close dialog" (click)="closed.emit()">×</button>
        </div>

        <div class="modal-body">
          @if (loadError()) {
            <p class="field-error" role="alert">{{ loadError() }}</p>
          } @else if (loading()) {
            <p class="hint" role="status">Loading event…</p>
          } @else {
            @if (formError()) { <p class="field-error" role="alert">{{ formError() }}</p> }
            @if (readOnlyReason(); as why) { <p class="hint" role="note">{{ why }}</p> }

            <fieldset class="fields" [disabled]="readOnly()">
              <label class="form-label" for="ev-type">Type</label>
              <select id="ev-type" class="form-select" [ngModel]="eventType()" (ngModelChange)="eventType.set($event)">
                @for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
              </select>
              <p class="field-error" role="alert">{{ errors()['eventType'] }}</p>

              <label class="form-label" for="ev-title">Title <span class="text-danger">*</span></label>
              <input id="ev-title" class="form-control" maxlength="200" [ngModel]="title()" (ngModelChange)="title.set($event)" [attr.aria-invalid]="!!errors()['title']" />
              <p class="field-error" role="alert">{{ errors()['title'] }}</p>

              <label class="form-label" for="ev-desc">Internal notes</label>
              <textarea id="ev-desc" class="form-control" rows="2" maxlength="2000" [ngModel]="description()" (ngModelChange)="description.set($event)" aria-describedby="ev-desc-hint"></textarea>
              <p id="ev-desc-hint" class="hint">Staff only. Never shown to the client.</p>
              <p class="field-error" role="alert">{{ errors()['description'] }}</p>

              <label class="check"><input type="checkbox" [ngModel]="allDay()" (ngModelChange)="allDay.set($event)" /> All day</label>

              @if (allDay()) {
                <div class="two-col">
                  <div>
                    <label class="form-label" for="ev-start-date">Date <span class="text-danger">*</span></label>
                    <input id="ev-start-date" type="date" class="form-control" [ngModel]="startDate()" (ngModelChange)="startDate.set($event)" [attr.aria-invalid]="!!errors()['startDate']" />
                    <p class="field-error" role="alert">{{ errors()['startDate'] }}</p>
                  </div>
                  <div>
                    <label class="form-label" for="ev-end-date">Last day (optional)</label>
                    <input id="ev-end-date" type="date" class="form-control" [ngModel]="endDate()" (ngModelChange)="endDate.set($event)" [attr.aria-invalid]="!!errors()['endDate']" />
                    <p class="field-error" role="alert">{{ errors()['endDate'] }}</p>
                  </div>
                </div>
                <p class="hint">An all-day event is a calendar date. It stays on that date in every time zone.</p>
              } @else {
                <div class="two-col">
                  <div>
                    <label class="form-label" for="ev-start">Starts <span class="text-danger">*</span></label>
                    <input id="ev-start" type="datetime-local" class="form-control" [ngModel]="startLocal()" (ngModelChange)="startLocal.set($event)" [attr.aria-invalid]="!!errors()['startLocal']" />
                    <p class="field-error" role="alert">{{ errors()['startLocal'] }}</p>
                  </div>
                  <div>
                    <label class="form-label" for="ev-end">Ends (optional)</label>
                    <input id="ev-end" type="datetime-local" class="form-control" [ngModel]="endLocal()" (ngModelChange)="endLocal.set($event)" [attr.aria-invalid]="!!errors()['endLocal']" />
                    <p class="field-error" role="alert">{{ errors()['endLocal'] }}</p>
                  </div>
                </div>
                <label class="form-label" for="ev-zone">Time zone <span class="text-danger">*</span></label>
                <select id="ev-zone" class="form-select" [ngModel]="timeZone()" (ngModelChange)="timeZone.set($event)" aria-describedby="ev-zone-hint" [attr.aria-invalid]="!!errors()['timeZone']">
                  @for (z of zones; track z) { <option [value]="z">{{ z }}</option> }
                </select>
                <p id="ev-zone-hint" class="hint">The times above are read in this zone.</p>
                <p class="field-error" role="alert">{{ errors()['timeZone'] }}</p>
              }

              <label class="form-label" for="ev-location">Location</label>
              <input id="ev-location" class="form-control" maxlength="300" [ngModel]="location()" (ngModelChange)="location.set($event)" />

              <label class="form-label" for="ev-url">Meeting link</label>
              <input id="ev-url" type="url" class="form-control" maxlength="500" placeholder="https://" [ngModel]="meetingUrl()" (ngModelChange)="meetingUrl.set($event)" [attr.aria-invalid]="!!errors()['meetingUrl']" />
              <p class="field-error" role="alert">{{ errors()['meetingUrl'] }}</p>

              <fieldset class="attendees">
                <legend class="form-label">Attendees</legend>
                @if (employees().length === 0) { <p class="hint">No active team members on this case yet.</p> }
                @for (m of employees(); track m.id) {
                  <label class="check"><input type="checkbox" [checked]="attendeeIds().includes(m.id)" (change)="toggleAttendee(m.id, $any($event.target).checked)" /> {{ m.name }}</label>
                }
                <p class="field-error" role="alert">{{ errors()['attendeeIds'] }}</p>
              </fieldset>

              <label class="check"><input type="checkbox" [ngModel]="clientVisible()" (ngModelChange)="clientVisible.set($event)" /> Show this event to the client in their portal</label>
              @if (clientVisible()) {
                <label class="form-label" for="ev-client-title">Title the client will see <span class="text-danger">*</span></label>
                <input id="ev-client-title" class="form-control" maxlength="200" [ngModel]="clientTitle()" (ngModelChange)="clientTitle.set($event)" [attr.aria-invalid]="!!errors()['clientTitle']" aria-describedby="ev-client-hint" />
                <p id="ev-client-hint" class="hint">Only this title and description are shown. Internal notes, location and meeting link are not.</p>
                <p class="field-error" role="alert">{{ errors()['clientTitle'] }}</p>
                <label class="form-label" for="ev-client-desc">Description the client will see</label>
                <textarea id="ev-client-desc" class="form-control" rows="2" maxlength="1000" [ngModel]="clientDescription()" (ngModelChange)="clientDescription.set($event)"></textarea>
                <p class="field-error" role="alert">{{ errors()['clientDescription'] }}</p>
              }
            </fieldset>
          }
        </div>

        <div class="modal-footer">
          @if (canCancel()) { <button type="button" class="btn btn-outline-danger cancel-event" (click)="confirmOpen.set(true)">Cancel event</button> }
          <span class="spacer"></span>
          <button type="button" class="btn btn-secondary" (click)="closed.emit()">Close</button>
          @if (!readOnly() && !loading() && !loadError()) {
            <button type="button" class="btn btn-primary" [disabled]="saving() || !title().trim()" (click)="save()">{{ eventId() ? 'Save changes' : 'Add event' }}</button>
          }
        </div>
      </div>
    </div>

    <ih-confirm-dialog
      [isOpen]="confirmOpen()"
      title="Cancel this event"
      message="The event is removed from everyone's calendar and no more reminders are sent. A cancelled event cannot be restored; add a new one instead."
      confirmText="Cancel event"
      variant="danger"
      (confirmed)="cancelEvent()"
      (cancelled)="confirmOpen.set(false)"
    ></ih-confirm-dialog>
  `,
  styles: [`
    .fields, .attendees { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: .125rem; }
    .attendees { margin-top: .5rem; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 1rem; }
    .modal-card { background: #fff; border-radius: .5rem; width: 100%; max-width: 34rem; max-height: 92vh; overflow: auto; box-shadow: 0 20px 25px -5px rgba(0,0,0,.1); }
    .modal-card :focus-visible, .btn:focus-visible { outline: 3px solid #b8892b; outline-offset: 2px; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1rem 1.25rem; border-bottom: 1px solid #e5e7eb; }
    .modal-header h3 { margin: 0; font-size: 1.125rem; font-weight: 600; }
    .btn-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #6b7280; }
    .modal-body { padding: 1.25rem; display: grid; gap: .125rem; }
    .modal-footer { display: flex; align-items: center; gap: .5rem; padding: 1rem 1.25rem; background: #f9fafb; border-top: 1px solid #e5e7eb; }
    .spacer { flex: 1; }
    .form-label { display: block; font-size: .875rem; font-weight: 500; margin: .5rem 0 .25rem; color: #374151; }
    .hint { font-size: .75rem; color: #4b5563; margin: .125rem 0; }
    .field-error { color: #b91c1c; font-size: .8125rem; margin: .125rem 0; } .field-error:empty { display: none; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; } @media (max-width: 480px) { .two-col { grid-template-columns: 1fr; } }
    .check { display: flex; gap: .5rem; align-items: center; margin: .5rem 0 .25rem; font-size: .875rem; }
  `],
})
export class CalendarEventDialogComponent implements OnInit {
  private calendar = inject(CalendarApi);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  /** The case a new event is added to (create), or the case of the event being edited once it has loaded. */
  caseId = input.required<string>();
  /** Set to open an existing event. */
  eventId = input<string | null>(null);
  /** The zone new timed events default to: the viewer's resolved zone. */
  defaultZone = input<string>('UTC');
  /** A "YYYY-MM-DD" to pre-fill a new event with (the selected day). */
  defaultDate = input<string | null>(null);
  /** Whether the viewer may add events at all (server: calendar.manage). */
  canManage = input<boolean>(false);

  saved = output<CaseCalendarEventDto>();
  cancelled = output<CaseCalendarEventDto>();
  closed = output<void>();

  readonly types = CALENDAR_EVENT_TYPES;
  zones: string[] = [];

  loading = signal(false);
  loadError = signal('');
  saving = signal(false);
  formError = signal('');
  errors = signal<Record<string, string>>({});
  confirmOpen = signal(false);
  employees = signal<{ id: string; name: string }[]>([]);
  current = signal<CaseCalendarEventDto | null>(null);

  eventType = signal<CalendarEventType>('appointment');
  title = signal('');
  description = signal('');
  allDay = signal(false);
  startDate = signal('');
  endDate = signal('');
  startLocal = signal('');
  endLocal = signal('');
  timeZone = signal('UTC');
  location = signal('');
  meetingUrl = signal('');
  attendeeIds = signal<string[]>([]);
  clientVisible = signal(false);
  clientTitle = signal('');
  clientDescription = signal('');

  readOnly = () => (this.eventId() ? !(this.current()?.actions.canEdit ?? false) : !this.canManage());
  canCancel = () => !!this.eventId() && (this.current()?.actions.canCancel ?? false);
  readOnlyReason = () => {
    if (!this.readOnly()) return '';
    const status = this.current()?.status;
    if (status === 'cancelled') return 'This event was cancelled and can no longer be changed.';
    return 'You can view this event but not change it.';
  };

  ngOnInit() {
    this.zones = supportedZones([this.defaultZone()]);
    this.timeZone.set(this.defaultZone());
    const id = this.eventId();
    if (id) {
      this.loading.set(true);
      this.calendar.getEvent(id).subscribe({
        next: ({ data }) => {
          this.adopt(data);
          this.loading.set(false);
          this.loadMembers(data.caseId);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadError.set(err?.status === 404 ? 'This event does not exist or you no longer have access to it.' : apiErrorMessage(err, 'The event could not be loaded.'));
        },
      });
    } else {
      this.startDate.set(this.defaultDate() ?? '');
      this.startLocal.set(this.defaultDate() ? `${this.defaultDate()}T09:00` : '');
      this.loadMembers(this.caseId());
    }
  }

  private loadMembers(caseId: string) {
    this.api.get<{ members: CaseMember[] }>(`/staff/cases/${caseId}/members`).subscribe({
      next: ({ data }) =>
        this.employees.set(
          data.members.filter((m) => m.memberType === 'employee' && m.status === 'active' && m.employee).map((m) => ({ id: m.employee!.id, name: m.employee!.name })),
        ),
      // Attendees are optional; failing to list them must not block the event.
      error: () => this.employees.set([]),
    });
  }

  private adopt(e: CaseCalendarEventDto) {
    this.current.set(e);
    this.eventType.set(e.eventType);
    this.title.set(e.title);
    this.description.set(e.description);
    this.allDay.set(e.allDay);
    this.startDate.set(e.startDate ?? '');
    this.endDate.set(e.endDate ?? '');
    this.startLocal.set(e.startLocal ?? '');
    this.endLocal.set(e.endLocal ?? '');
    this.timeZone.set(e.timeZone ?? this.defaultZone());
    if (e.timeZone && !this.zones.includes(e.timeZone)) this.zones = [...this.zones, e.timeZone];
    this.location.set(e.location);
    this.meetingUrl.set(e.meetingUrl ?? '');
    this.attendeeIds.set(e.attendees.map((a) => a.id));
    this.clientVisible.set(e.clientVisible);
    this.clientTitle.set(e.clientTitle);
    this.clientDescription.set(e.clientDescription);
  }

  toggleAttendee(id: string, on: boolean) {
    this.attendeeIds.update((ids) => (on ? [...new Set([...ids, id])] : ids.filter((i) => i !== id)));
  }

  private input(): CreateCalendarEventInput {
    const allDay = this.allDay();
    return {
      eventType: this.eventType(),
      title: this.title().trim(),
      description: this.description().trim(),
      allDay,
      startDate: allDay ? this.startDate() || null : null,
      endDate: allDay ? this.endDate() || null : null,
      startLocal: allDay ? null : this.startLocal() || null,
      endLocal: allDay ? null : this.endLocal() || null,
      timeZone: allDay ? null : this.timeZone(),
      location: this.location().trim(),
      meetingUrl: this.meetingUrl().trim() || null,
      attendeeIds: this.attendeeIds(),
      clientVisible: this.clientVisible(),
      clientTitle: this.clientVisible() ? this.clientTitle().trim() : '',
      clientDescription: this.clientVisible() ? this.clientDescription().trim() : '',
    };
  }

  save() {
    if (this.saving() || this.readOnly()) return;
    this.saving.set(true);
    this.formError.set('');
    this.errors.set({});
    const id = this.eventId();
    const request = id ? this.calendar.updateEvent(id, this.input()) : this.calendar.createEvent(this.caseId(), this.input());
    request.subscribe({
      next: ({ data }) => {
        this.saving.set(false);
        this.toast.success(id ? 'Event updated.' : 'Event added.');
        this.saved.emit(data);
      },
      error: (err) => this.fail(err, id ? 'Failed to save the event.' : 'Failed to add the event.'),
    });
  }

  cancelEvent() {
    const id = this.eventId();
    this.confirmOpen.set(false);
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.calendar.cancelEvent(id).subscribe({
      next: ({ data }) => {
        this.saving.set(false);
        this.toast.success('Event cancelled.');
        this.cancelled.emit(data);
      },
      error: (err) => this.fail(err, 'Failed to cancel the event.'),
    });
  }

  private fail(err: unknown, fallback: string) {
    this.saving.set(false);
    const fields = apiFieldErrors(err);
    this.errors.set(fields);
    // A field error is shown beside its input; anything else (a conflict, a lost permission) is shown at the top.
    this.formError.set(Object.keys(fields).length ? 'Please correct the highlighted fields.' : apiErrorMessage(err, fallback));
  }
}
