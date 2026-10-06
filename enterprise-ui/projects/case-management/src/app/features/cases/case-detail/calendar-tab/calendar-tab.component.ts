import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { apiErrorMessage } from '../../../../core/api/api-error';
import { CalendarApi } from '../../../../core/api/calendar-api.service';
import { CalendarConfig, CalendarItem } from '../../../../core/api/calendar.types';
import { CalendarAgendaComponent } from '../../../calendar/calendar-agenda.component';
import { CalendarEventDialogComponent } from '../../../calendar/calendar-event-dialog.component';
import { addDays, dayInZone, groupByDay } from '../../../calendar/calendar-model';
import { EmptyStateComponent } from '../../../../shared/empty-state.component';
import { ErrorStateComponent } from '../../../../shared/error-state.component';
import { SkeletonComponent } from '../../../../shared/skeleton.component';

const LOOK_BACK_DAYS = 14;
const LOOK_AHEAD_DAYS = 78; // together with the look-back this is the 93-day maximum the server allows

/**
 * Case Calendar (ADR-027): the dates of this one case that other modules own, plus its manual events. Nothing is edited here
 * except manual events; every other item deep-links to the tab or page that owns it. Whether "Add event" shows comes from the
 * server (calendar.manage), and the server re-checks it.
 */
@Component({
  selector: 'ih-calendar-tab',
  standalone: true,
  imports: [SkeletonComponent, EmptyStateComponent, ErrorStateComponent, CalendarAgendaComponent, CalendarEventDialogComponent],
  template: `
    <section class="section-card card" aria-labelledby="case-calendar-heading">
      <div class="head">
        <div>
          <h3 id="case-calendar-heading" class="card-title m-0">Calendar</h3>
          <p class="muted m-0">Dates for this case in {{ zone() }}. Overdue items from the last two weeks are included.</p>
        </div>
        @if (canManage()) {
          <button type="button" class="btn btn-primary" (click)="openCreate()">Add event</button>
        }
      </div>

      @if (isLoading()) {
        <ih-skeleton [rows]="4" rowHeight="2.5rem"></ih-skeleton>
      } @else if (isError()) {
        <ih-error-state title="Failed to load the calendar" [message]="errorMessage()" (retry)="load()"></ih-error-state>
      } @else if (groups().length === 0) {
        <ih-empty-state title="No upcoming dates" [description]="canManage() ? 'Nothing is due or scheduled for this case. Add an event for a date that no other part of the case already tracks.' : 'Nothing is due or scheduled for this case.'"></ih-empty-state>
      } @else {
        @if (truncated()) { <p class="notice" role="note">Some dates are not shown because there are very many. Open the Calendar page to narrow them down.</p> }
        <ih-calendar-agenda [groups]="groups()" [zone]="zone()" [today]="today()" [showCase]="false" idPrefix="case-day-" (eventSelected)="openEvent($event)"></ih-calendar-agenda>
      }
    </section>

    @if (dialog(); as d) {
      <ih-calendar-event-dialog
        [caseId]="caseId()"
        [eventId]="d.eventId"
        [defaultZone]="zone()"
        [defaultDate]="today()"
        [canManage]="canManage()"
        (saved)="onChanged()"
        (cancelled)="onChanged()"
        (closed)="dialog.set(null)"
      ></ih-calendar-event-dialog>
    }
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .m-0 { margin: 0; } .muted { color: #4b5563; font-size: .8125rem; }
    .notice { padding: .5rem .75rem; border-radius: .375rem; background: #fef3c7; color: #78350f; margin: 0 0 .75rem; font-size: .875rem; }
    .btn:focus-visible { outline: 3px solid #b8892b; outline-offset: 2px; }
  `],
})
export class CalendarTabComponent implements OnInit {
  private api = inject(CalendarApi);

  caseId = input.required<string>();
  /** Deep link: /cases/:id?tab=calendar&event=:eventId opens that event. */
  initialEventId = input<string | null>(null);

  config = signal<CalendarConfig | null>(null);
  items = signal<CalendarItem[]>([]);
  truncated = signal(false);
  isLoading = signal(true);
  isError = signal(false);
  errorMessage = signal('');
  dialog = signal<{ eventId: string | null } | null>(null);
  private deepLinkOpened = false;

  zone = computed(() => this.config()?.timeZone.resolved ?? 'UTC');
  today = computed(() => dayInZone(new Date(), this.zone()));
  canManage = computed(() => this.config()?.canManage ?? false);
  private range = computed(() => ({ from: addDays(this.today(), -LOOK_BACK_DAYS), to: addDays(this.today(), LOOK_AHEAD_DAYS) }));
  groups = computed(() => [...groupByDay(this.items(), this.zone(), this.range().from, this.range().to)]);

  ngOnInit() {
    this.api.config().subscribe({
      next: ({ data }) => {
        this.config.set(data);
        this.load();
      },
      error: (err) => this.fail(err),
    });
  }

  private fail(err: unknown) {
    this.isLoading.set(false);
    this.isError.set(true);
    this.errorMessage.set(apiErrorMessage(err, 'The calendar for this case could not be loaded.'));
  }

  load() {
    this.isLoading.set(true);
    this.isError.set(false);
    const { from, to } = this.range();
    this.api.query({ from, to, timeZone: this.zone(), scope: 'team', kinds: null, caseId: this.caseId() }).subscribe({
      next: ({ data }) => {
        this.items.set(data.items);
        this.truncated.set(data.truncated);
        this.isLoading.set(false);
        // The deep-linked event opens once; reloading after a save or cancel must not reopen it.
        const wanted = this.initialEventId();
        if (wanted && !this.deepLinkOpened) this.dialog.set({ eventId: wanted });
        this.deepLinkOpened = true;
      },
      error: (err) => this.fail(err),
    });
  }

  openCreate() {
    this.dialog.set({ eventId: null });
  }

  openEvent(item: CalendarItem) {
    this.dialog.set({ eventId: item.sourceId });
  }

  onChanged() {
    this.dialog.set(null);
    this.load();
  }
}
