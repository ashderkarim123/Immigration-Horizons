import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { apiErrorMessage, apiFieldErrors } from '../../core/api/api-error';
import { CalendarApi } from '../../core/api/calendar-api.service';
import { CalendarConfig, CalendarItem, CalendarKind, CalendarResponse } from '../../core/api/calendar.types';
import { AuthService } from '../../core/auth/auth.service';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { ToastService } from '../../shared/toast.service';
import { CalendarAgendaComponent } from './calendar-agenda.component';
import { CalendarEventDialogComponent } from './calendar-event-dialog.component';
import {
  CalendarState,
  CalendarView,
  browserZone,
  dayInZone,
  formatDay,
  formatMonth,
  groupByDay,
  isOverdue,
  monthGrid,
  parseState,
  shiftMonth,
  supportedZones,
  toQueryParams,
} from './calendar-model';

const SOURCE_TEXT: Record<CalendarConfig['timeZone']['source'], string> = {
  user: 'your saved time zone',
  practice: "the practice's default time zone",
  utc: 'UTC (no time zone has been set)',
};

/**
 * Staff Calendar (ADR-027): an operational index of dates that other modules own. Nothing here edits a task, document request,
 * USCIS filing or appointment; each item links to the page that does. Only manual case events open in a dialog. The server decides
 * what is visible (authorized cases and source capabilities); this page only filters what it was given.
 *
 * Month and Agenda views. The month grid is a plain table; on a narrow screen the page shows the Agenda instead, which reads
 * better on a phone than a seven-column grid.
 */
@Component({
  selector: 'ih-calendar',
  standalone: true,
  imports: [FormsModule, SkeletonComponent, EmptyStateComponent, ErrorStateComponent, CalendarAgendaComponent, CalendarEventDialogComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>Calendar</h1>
        <p class="page-subtitle">Deadlines, appointments and events across your cases. Open an item to work on it where it lives.</p>
      </div>
      <div class="header-actions">
        <div class="btn-group" role="group" aria-label="View">
          <button type="button" class="btn btn-sm" [class.btn-primary]="view() === 'month'" [class.btn-secondary]="view() !== 'month'" [attr.aria-pressed]="view() === 'month'" [disabled]="narrow()" (click)="go({ view: 'month' })">Month</button>
          <button type="button" class="btn btn-sm" [class.btn-primary]="view() === 'agenda'" [class.btn-secondary]="view() !== 'agenda'" [attr.aria-pressed]="view() === 'agenda'" (click)="go({ view: 'agenda' })">Agenda</button>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" (click)="settingsOpen.set(!settingsOpen())" [attr.aria-expanded]="settingsOpen()" aria-controls="calendar-settings">Time zone &amp; reminders</button>
      </div>
    </div>

    @if (settingsOpen() && config(); as cfg) {
      <section id="calendar-settings" class="section-card card settings" aria-labelledby="settings-heading">
        <h2 id="settings-heading" class="card-title">Time zone and reminders</h2>
        <p class="muted" role="status">Times are shown in <strong>{{ cfg.timeZone.resolved }}</strong>, {{ sourceText(cfg) }}. Deadlines such as a task due date are calendar days and never move when you change zone.</p>
        @if (cfg.timeZone.source === 'utc' && !cfg.timeZone.practice.configured) {
          <p class="notice" role="note">{{ cfg.timeZone.practice.invalid ? 'The practice time zone setting is not a valid zone, so UTC is used.' : 'No practice time zone is configured, so UTC is used until you choose your own.' }}</p>
        }
        <div class="settings-row">
          <label for="pref-zone" class="form-label">Your time zone</label>
          <select id="pref-zone" class="form-select" [ngModel]="zoneChoice()" (ngModelChange)="zoneChoice.set($event)">
            <option value="">Use the practice default</option>
            @for (z of zones(); track z) { <option [value]="z">{{ z }}</option> }
          </select>
          @if (suggested(); as s) {
            <button type="button" class="btn btn-link btn-sm" (click)="zoneChoice.set(s)">Use my browser's time zone ({{ s }})</button>
          }
          <p class="field-error" role="alert">{{ settingsErrors()['timeZone'] }}</p>
        </div>
        <fieldset class="reminders">
          <legend class="form-label">Reminders</legend>
          <label class="check"><input type="checkbox" [ngModel]="deadlineReminders()" (ngModelChange)="deadlineReminders.set($event)" /> Remind me before deadlines I am responsible for</label>
          <label class="check"><input type="checkbox" [ngModel]="appointmentReminders()" (ngModelChange)="appointmentReminders.set($event)" /> Remind me before appointments and timed events</label>
          <p class="hint">Reminders only change notifications. Everything stays visible on this calendar.</p>
        </fieldset>
        <button type="button" class="btn btn-primary btn-sm" [disabled]="savingSettings()" (click)="saveSettings()">Save</button>
      </section>
    }

    <div class="filters-bar card">
      <div class="filter-group">
        <label for="cal-scope" class="sr-only">Whose dates</label>
        <select id="cal-scope" class="form-select" [ngModel]="state().scope" (ngModelChange)="go({ scope: $event })">
          <option value="mine">My calendar</option>
          <option value="team">Everything I can see</option>
        </select>
      </div>
      @if (config(); as cfg) {
        <fieldset class="filter-group kinds">
          <legend class="sr-only">Show</legend>
          @for (k of cfg.kinds; track k.value) {
            <label class="check"><input type="checkbox" [checked]="kindOn(k.value)" (change)="toggleKind(k.value, $any($event.target).checked)" /> {{ k.label }}</label>
          }
        </fieldset>
      }
      <label class="check"><input type="checkbox" [checked]="state().includeCompleted" (change)="go({ includeCompleted: $any($event.target).checked })" /> Include completed</label>
      @if (state().caseId; as c) {
        <span class="chip">One case <button type="button" class="chip-x" aria-label="Show all cases" (click)="go({ caseId: null })">×</button></span>
      }
    </div>

    <div class="section-card card">
      <div class="cal-nav">
        <button type="button" class="btn btn-secondary btn-sm" (click)="go({ month: prevMonth(), day: null })" aria-label="Previous month">‹</button>
        <h2 class="cal-title" aria-live="polite">{{ monthTitle() }}</h2>
        <button type="button" class="btn btn-secondary btn-sm" (click)="go({ month: nextMonth(), day: null })" aria-label="Next month">›</button>
        <button type="button" class="btn btn-secondary btn-sm" (click)="goToday()">Today</button>
      </div>

      @if (isLoading()) {
        <ih-skeleton [rows]="6" rowHeight="2.5rem"></ih-skeleton>
      } @else if (isError()) {
        <ih-error-state [title]="forbidden() ? 'Calendar not available' : 'Failed to load the calendar'" [message]="errorMessage()" [retryable]="!forbidden()" (retry)="reload()"></ih-error-state>
      } @else {
        @if (data()?.truncated) {
          <p class="notice" role="note">Some dates are not shown because there are very many in this range. Narrow the filters or pick another month.</p>
        }

        @if (view() === 'month') {
          <table class="month" aria-label="Calendar for {{ monthTitle() }}">
            <thead>
              <tr>
                @for (w of weekdays; track w.short) { <th scope="col"><abbr [title]="w.long">{{ w.short }}</abbr></th> }
              </tr>
            </thead>
            <tbody>
              @for (week of grid().weeks; track week[0]) {
                <tr>
                  @for (d of week; track d) {
                    <td [class.out]="!inMonth(d)" [class.today]="d === today()" [class.selected]="d === state().day">
                      <button type="button" class="day-btn" [attr.aria-label]="dayLabel(d)" [attr.aria-pressed]="d === state().day" [attr.aria-current]="d === today() ? 'date' : null" (click)="selectDay(d)">{{ dayNumber(d) }}</button>
                      <ul class="cell-items" aria-hidden="true">
                        @for (item of cellItems(d); track item.id) {
                          <li class="chip-item kind-{{ item.kind }}" [class.overdue]="overdue(item)">{{ item.title }}</li>
                        }
                        @if (moreCount(d) > 0) { <li class="more">+{{ moreCount(d) }} more</li> }
                      </ul>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>

          @if (state().day; as day) {
            <section class="day-panel" aria-labelledby="day-heading">
              <h3 id="day-heading">{{ longDay(day) }}</h3>
              @if (itemsOn(day).length === 0) { <p class="muted">Nothing is scheduled for this day.</p> }
              <ih-calendar-agenda [groups]="[[day, itemsOn(day)]]" [headings]="false" [zone]="zone()" [today]="today()" idPrefix="day-" (eventSelected)="openEvent($event)"></ih-calendar-agenda>
            </section>
          } @else if (itemTotal() === 0) {
            <ih-empty-state title="No dates this month" [description]="emptyText()"></ih-empty-state>
          }
        } @else {
          @if (agendaDays().length === 0) {
            <ih-empty-state title="No dates this month" [description]="emptyText()"></ih-empty-state>
          } @else {
            <ih-calendar-agenda [groups]="agendaDays()" [zone]="zone()" [today]="today()" (eventSelected)="openEvent($event)"></ih-calendar-agenda>
          }
        }
      }
    </div>

    @if (editing(); as ev) {
      <ih-calendar-event-dialog
        [caseId]="ev.caseId"
        [eventId]="ev.eventId"
        [defaultZone]="zone()"
        [canManage]="config()?.canManage ?? false"
        (saved)="onEventChanged()"
        (cancelled)="onEventChanged()"
        (closed)="editing.set(null)"
      ></ih-calendar-event-dialog>
    }
  `,
  styles: [`
    .header-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
    .btn-group { display: inline-flex; gap: .25rem; }
    .kinds { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: .25rem .75rem; }
    .check { display: inline-flex; gap: .375rem; align-items: center; font-size: .875rem; margin: 0; }
    .chip { display: inline-flex; gap: .25rem; align-items: center; background: #eef2f7; color: #1e3a5f; border-radius: 9999px; padding: .125rem .5rem; font-size: .8125rem; }
    .chip-x { background: none; border: 0; cursor: pointer; font-size: 1rem; line-height: 1; color: inherit; }
    .btn:focus-visible, .day-btn:focus-visible, .chip-x:focus-visible { outline: 3px solid #b8892b; outline-offset: 2px; }
    .settings { margin-bottom: 1rem; display: grid; gap: .5rem; }
    .settings-row { display: grid; gap: .25rem; max-width: 24rem; }
    .reminders { border: 0; padding: 0; margin: 0; display: grid; gap: .25rem; }
    .muted { color: #4b5563; font-size: .8125rem; } .hint { font-size: .75rem; color: #4b5563; margin: .125rem 0; }
    .field-error { color: #b91c1c; font-size: .8125rem; margin: .125rem 0; } .field-error:empty { display: none; }
    .notice { padding: .5rem .75rem; border-radius: .375rem; background: #fef3c7; color: #78350f; margin: 0 0 .75rem; font-size: .875rem; }
    .cal-nav { display: flex; align-items: center; gap: .5rem; margin-bottom: .75rem; }
    .cal-title { flex: 1; text-align: center; margin: 0; font-size: 1.125rem; }
    table.month { width: 100%; border-collapse: collapse; table-layout: fixed; }
    table.month th { font-size: .75rem; font-weight: 600; color: #4b5563; padding: .25rem; text-align: left; }
    table.month abbr { text-decoration: none; }
    table.month td { border: 1px solid #e5e7eb; vertical-align: top; height: 6.5rem; padding: .25rem; overflow: hidden; background: #fff; }
    table.month td.out { background: #f9fafb; } table.month td.out .day-btn { color: #6b7280; }
    table.month td.today .day-btn { background: #1e3a5f; color: #fff; }
    table.month td.selected { box-shadow: inset 0 0 0 2px #b8892b; }
    .day-btn { background: none; border: 0; cursor: pointer; font-weight: 600; border-radius: 9999px; min-width: 1.75rem; height: 1.75rem; padding: 0 .35rem; color: #111827; }
    .day-btn:hover { background: #eef2f7; }
    .cell-items { list-style: none; margin: .125rem 0 0; padding: 0; display: grid; gap: .125rem; }
    .chip-item { font-size: .6875rem; padding: .0625rem .3rem; border-radius: .25rem; background: #eef2f7; color: #1e3a5f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 3px solid #1e3a5f; }
    .chip-item.kind-task_due { border-left-color: #2563eb; } .chip-item.kind-appointment, .chip-item.kind-manual_event { border-left-color: #7c3aed; }
    .chip-item.kind-document_due { border-left-color: #0f766e; } .chip-item.kind-uscis_response { border-left-color: #b45309; } .chip-item.kind-target_filing { border-left-color: #1e3a5f; }
    .chip-item.overdue { background: #fef2f2; color: #991b1b; }
    .more { font-size: .6875rem; color: #4b5563; }
    .day-panel { margin-top: 1rem; border-top: 1px solid #e5e7eb; padding-top: .75rem; } .day-panel h3 { margin: 0 0 .5rem; font-size: 1rem; }
    @media (max-width: 700px) { .cal-nav { flex-wrap: wrap; } }
  `],
})
export class CalendarComponent implements OnInit {
  private api = inject(CalendarApi);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private toast = inject(ToastService);

  readonly weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((long) => ({ long, short: long.slice(0, 3) }));
  readonly sourceText = (cfg: CalendarConfig) => SOURCE_TEXT[cfg.timeZone.source];

  config = signal<CalendarConfig | null>(null);
  state = signal<CalendarState>(parseState({ get: () => null }, dayInZone(new Date(), 'UTC')));
  data = signal<CalendarResponse | null>(null);
  isLoading = signal(true);
  isError = signal(false);
  forbidden = signal(false);
  errorMessage = signal('');
  narrow = signal(false);
  editing = signal<{ caseId: string; eventId: string } | null>(null);

  settingsOpen = signal(false);
  savingSettings = signal(false);
  settingsErrors = signal<Record<string, string>>({});
  zoneChoice = signal('');
  deadlineReminders = signal(true);
  appointmentReminders = signal(true);

  /** The zone dates are shown in: the server's resolution of this employee's saved zone, the practice zone, then UTC. */
  zone = computed(() => this.config()?.timeZone.resolved ?? 'UTC');
  today = computed(() => dayInZone(new Date(), this.zone()));
  view = computed<CalendarView>(() => (this.narrow() ? 'agenda' : this.state().view));
  grid = computed(() => monthGrid(this.state().month));
  monthTitle = computed(() => formatMonth(this.state().month));
  zones = computed(() => supportedZones([this.zone()]));
  suggested = computed(() => {
    const z = browserZone();
    return z && z !== this.zoneChoice() ? z : null;
  });

  private byDay = computed(() => groupByDay(this.data()?.items ?? [], this.zone(), this.grid().from, this.grid().to));
  agendaDays = computed(() => [...this.byDay()].filter(([d]) => d.startsWith(this.state().month)));
  itemTotal = computed(() => this.agendaDays().reduce((n, [, items]) => n + items.length, 0));

  ngOnInit() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const query = window.matchMedia('(max-width: 700px)');
      this.narrow.set(query.matches);
      const onChange = (e: MediaQueryListEvent) => this.narrow.set(e.matches);
      query.addEventListener?.('change', onChange);
      this.destroyRef.onDestroy(() => query.removeEventListener?.('change', onChange));
    }

    this.api.config().subscribe({
      next: ({ data }) => {
        this.adoptConfig(data);
        // The URL is the page state: every control navigates, and each navigation reloads.
        this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((q) => {
          this.state.set(parseState(q, this.today()));
          this.load();
        });
      },
      error: (err) => this.fail(err),
    });
  }

  private adoptConfig(cfg: CalendarConfig) {
    this.config.set(cfg);
    this.zoneChoice.set(cfg.timeZone.userValue ?? '');
    this.deadlineReminders.set(cfg.reminders.deadlineReminders);
    this.appointmentReminders.set(cfg.reminders.appointmentReminders);
  }

  private fail(err: unknown) {
    this.isLoading.set(false);
    this.isError.set(true);
    this.forbidden.set((err as { status?: number })?.status === 403);
    this.errorMessage.set((err as { status?: number })?.status === 403 ? 'You do not have access to the calendar.' : apiErrorMessage(err, 'The calendar could not be loaded.'));
  }

  load() {
    const s = this.state();
    const g = this.grid();
    this.isLoading.set(true);
    this.isError.set(false);
    this.api.query({ from: g.from, to: g.to, timeZone: this.zone(), scope: s.scope, kinds: s.kinds, caseId: s.caseId, includeCompleted: s.includeCompleted }).subscribe({
      next: ({ data }) => {
        this.data.set(data);
        this.isLoading.set(false);
      },
      error: (err) => this.fail(err),
    });
  }

  reload() {
    this.load();
  }

  /** Every control writes the URL; the queryParamMap subscription then applies it and loads. */
  go(change: Partial<CalendarState>) {
    const next = { ...this.state(), ...change };
    void this.router.navigate([], { relativeTo: this.route, queryParams: toQueryParams(next, this.today()), replaceUrl: true });
  }

  goToday() {
    this.go({ month: this.today().slice(0, 7), day: this.today() });
  }

  prevMonth = () => shiftMonth(this.state().month, -1);
  nextMonth = () => shiftMonth(this.state().month, 1);
  inMonth = (d: string) => d.startsWith(this.state().month);
  dayNumber = (d: string) => Number(d.slice(8));
  longDay = (d: string) => formatDay(d, 'long');

  selectDay(d: string) {
    this.go({ day: this.state().day === d ? null : d, month: d.slice(0, 7) });
  }

  itemsOn = (d: string): CalendarItem[] => this.byDay().get(d) ?? [];
  cellItems = (d: string): CalendarItem[] => this.itemsOn(d).slice(0, 3);
  moreCount = (d: string): number => Math.max(0, this.itemsOn(d).length - 3);
  overdue = (item: CalendarItem) => isOverdue(item, this.today());
  dayLabel(d: string): string {
    const n = this.itemsOn(d).length;
    return `${formatDay(d, 'long')}, ${n === 0 ? 'no items' : n === 1 ? '1 item' : `${n} items`}`;
  }
  emptyText = () => (this.state().scope === 'mine' ? 'Nothing assigned to you or shared with you falls in this month. Try "Everything I can see".' : 'No dates you can see fall in this month.');

  kindOn(kind: CalendarKind): boolean {
    const k = this.state().kinds;
    return !k || k.includes(kind);
  }

  toggleKind(kind: CalendarKind, on: boolean) {
    const all = (this.config()?.kinds ?? []).map((k) => k.value);
    const current = this.state().kinds ?? all;
    const next = on ? [...new Set([...current, kind])] : current.filter((k) => k !== kind);
    // Everything ticked is the default and is not written to the URL; an empty selection means everything too.
    this.go({ kinds: next.length === all.length || next.length === 0 ? null : next });
  }

  openEvent(item: CalendarItem) {
    if (item.case) this.editing.set({ caseId: item.case.id, eventId: item.sourceId });
  }

  onEventChanged() {
    this.editing.set(null);
    this.load();
  }

  saveSettings() {
    if (this.savingSettings()) return;
    this.savingSettings.set(true);
    this.settingsErrors.set({});
    this.api.savePreferences({ timeZone: this.zoneChoice() || null, deadlineReminders: this.deadlineReminders(), appointmentReminders: this.appointmentReminders() }).subscribe({
      next: ({ data }) => {
        this.savingSettings.set(false);
        this.adoptConfig(data);
        this.auth.timeZone.set({ value: data.timeZone.userValue, resolved: data.timeZone.resolved, source: data.timeZone.source });
        this.toast.success('Calendar preferences saved.');
        this.load();
      },
      error: (err) => {
        this.savingSettings.set(false);
        this.settingsErrors.set(apiFieldErrors(err));
        if (!Object.keys(apiFieldErrors(err)).length) this.toast.error(apiErrorMessage(err, 'Your preferences could not be saved.'));
      },
    });
  }
}
