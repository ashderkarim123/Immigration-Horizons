import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { CASE_STAGES, CASE_TYPES } from '../../core/api/case-catalog';
import { ReportsApi } from '../../core/api/reports-api.service';
import {
  DEADLINE_SOURCES,
  DeadlinesReport,
  OverviewReport,
  PRIORITIES,
  PipelineReport,
  REPORT_TABS,
  ReportFilters,
  ReportMeta,
  ReportName,
  ReviewQueuesReport,
  WorkloadReport,
  CountRow,
} from '../../core/api/reports.types';
import { AuthService } from '../../core/auth/auth.service';
import { ErrorStateComponent } from '../../shared/error-state.component';
import { SkeletonComponent } from '../../shared/skeleton.component';
import { barPercent, formatDate, formatGenerated, formatPeriod, parseFilters, parseTab, scopeOptions, toQueryParams } from './reports-model';

/**
 * Staff operational reports (ADR-028). Every number comes from the server's report services, which apply the actor's capabilities
 * and case scope; this page only labels and lays them out. Each section says whether it is a Current snapshot (the state right now)
 * or a Selected period (events between two dates), and a figure the server withheld shows as "Not available to your role", never
 * as zero. Tables are the source of truth; bars are decoration beside a visible count. There is no score, success rate or ranking.
 */
@Component({
  selector: 'ih-reports',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet, SkeletonComponent, ErrorStateComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>Reports</h1>
        <p class="page-subtitle">Operational reports from live case data. Figures are limited to the cases and records you can access.</p>
      </div>
      @if (generated(); as g) { <p class="generated" role="status">Generated {{ g }}</p> }
    </div>

    <nav class="tabs" aria-label="Reports">
      @for (t of tabs; track t.key) {
        <a class="tab" [class.on]="tab() === t.key" [attr.aria-current]="tab() === t.key ? 'page' : null" routerLink="/reports" [queryParams]="tabParams(t.key)">{{ t.label }}</a>
      }
    </nav>

    <form class="filters card" aria-label="Report filters" (submit)="$event.preventDefault()">
      <div class="field">
        <label for="rep-scope">Scope</label>
        <select id="rep-scope" class="form-select" [ngModel]="filters().scope" name="scope" (ngModelChange)="change({ scope: $event })">
          @for (s of scopes(); track s.value) { <option [value]="s.value">{{ s.label }}</option> }
        </select>
      </div>
      @if (hasPeriod()) {
        <div class="field">
          <label for="rep-from">From</label>
          <input id="rep-from" type="date" class="form-control" [ngModel]="shownFrom()" name="from" (change)="change({ from: $any($event.target).value || null })" />
        </div>
        <div class="field">
          <label for="rep-to">To</label>
          <input id="rep-to" type="date" class="form-control" [ngModel]="shownTo()" name="to" (change)="change({ to: $any($event.target).value || null })" />
        </div>
      }
      @if (tab() === 'pipeline') {
        <div class="field">
          <label for="rep-gran">Group by</label>
          <select id="rep-gran" class="form-select" [ngModel]="filters().granularity || ''" name="granularity" (ngModelChange)="change({ granularity: $event || null })">
            <option value="">Automatic</option><option value="week">Week</option><option value="month">Month</option>
          </select>
        </div>
      }
      <div class="field">
        <label for="rep-type">Case type</label>
        <select id="rep-type" class="form-select" [ngModel]="filters().caseType || ''" name="caseType" (ngModelChange)="change({ caseType: $event || null })">
          <option value="">All types</option>
          @for (t of caseTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
        </select>
      </div>
      <div class="field">
        <label for="rep-stage">Stage</label>
        <select id="rep-stage" class="form-select" [ngModel]="filters().stage || ''" name="stage" (ngModelChange)="change({ stage: $event || null })">
          <option value="">All stages</option>
          @for (s of stages; track s.value) { <option [value]="s.value">{{ s.label }}</option> }
        </select>
      </div>
      <div class="field">
        <label for="rep-priority">Priority</label>
        <select id="rep-priority" class="form-select" [ngModel]="filters().priority || ''" name="priority" (ngModelChange)="change({ priority: $event || null })">
          <option value="">All priorities</option>
          @for (p of priorities; track p.value) { <option [value]="p.value">{{ p.label }}</option> }
        </select>
      </div>
      @if (tab() === 'deadlines') {
        <div class="field">
          <label for="rep-source">Deadline type</label>
          <select id="rep-source" class="form-select" [ngModel]="filters().source || ''" name="source" (ngModelChange)="change({ source: $event || null })">
            <option value="">All deadline types</option>
            @for (d of deadlineSources; track d.value) { <option [value]="d.value">{{ d.label }}</option> }
          </select>
        </div>
      }
      @if (exportHref(); as href) {
        <div class="field export"><a class="btn btn-secondary" [href]="href" download>Export CSV</a></div>
      }
    </form>

    @if (isLoading()) {
      <ih-skeleton [rows]="6" rowHeight="2.5rem"></ih-skeleton>
    } @else if (isError()) {
      <ih-error-state [title]="forbidden() ? 'Report not available' : 'Failed to load the report'" [message]="errorMessage()" [retryable]="!forbidden()" (retry)="load()"></ih-error-state>
    } @else {
      @switch (tab()) {
        @case ('overview') {
          @if (overview(); as o) {
            <section class="block" aria-labelledby="ov-snap">
              <h2 id="ov-snap">Current snapshot</h2>
              <p class="basis">The state of your cases right now. These figures do not depend on the period below.</p>
              <ul class="metrics">
                @for (m of o.snapshot; track m.key) { <ng-container *ngTemplateOutlet="metricCard; context: { $implicit: m, basis: 'Current snapshot' }"></ng-container> }
              </ul>
            </section>
            <section class="block" aria-labelledby="ov-period">
              <h2 id="ov-period">Selected period: {{ period(o.period.from, o.period.to) }}</h2>
              <p class="basis">Events that happened between those dates. Not a trend of the snapshot above.</p>
              <ul class="metrics">
                @for (m of o.period.metrics; track m.key) { <ng-container *ngTemplateOutlet="metricCard; context: { $implicit: m, basis: period(o.period.from, o.period.to) }"></ng-container> }
              </ul>
            </section>
          }
        }
        @case ('pipeline') {
          @if (pipeline(); as p) {
            <section class="block" aria-labelledby="pl-snap">
              <h2 id="pl-snap">Active cases — Current snapshot</h2>
              <p class="basis">{{ p.snapshot.total }} active {{ p.snapshot.total === 1 ? 'case' : 'cases' }} right now, grouped four ways. Each group adds up to the same total.</p>
              <div class="grid">
                <ng-container *ngTemplateOutlet="countTable; context: { caption: 'By stage', rows: p.snapshot.byStage }"></ng-container>
                <ng-container *ngTemplateOutlet="countTable; context: { caption: 'By case type', rows: p.snapshot.byCaseType }"></ng-container>
                <ng-container *ngTemplateOutlet="countTable; context: { caption: 'By priority', rows: p.snapshot.byPriority }"></ng-container>
                <ng-container *ngTemplateOutlet="countTable; context: { caption: 'By project manager', rows: p.snapshot.byProjectManager }"></ng-container>
              </div>
            </section>
            <section class="block" aria-labelledby="pl-period">
              <h2 id="pl-period">Cases opened and closed — {{ period(p.period.from, p.period.to) }}</h2>
              <p class="basis">Opened = cases created in each {{ p.period.granularity }}; closed = cases archived in it. Selected period, not the snapshot.</p>
              <div class="table-responsive">
                <table class="data-table">
                  <caption class="sr-only">Cases opened and closed per {{ p.period.granularity }}</caption>
                  <thead><tr><th scope="col">{{ p.period.granularity === 'week' ? 'Week' : 'Month' }}</th><th scope="col" class="num">Opened</th><th scope="col" class="num">Closed</th></tr></thead>
                  <tbody>
                    @for (s of p.period.series; track s.bucket) { <tr><th scope="row">{{ s.bucket }} <span class="muted">(from {{ day(s.start) }})</span></th><td class="num">{{ s.opened }}</td><td class="num">{{ s.closed }}</td></tr> }
                  </tbody>
                  <tfoot><tr><th scope="row">Total</th><td class="num">{{ p.period.totals.opened }}</td><td class="num">{{ p.period.totals.closed }}</td></tr></tfoot>
                </table>
              </div>
            </section>
          }
        }
        @case ('workload') {
          @if (workload(); as w) {
            <section class="block" aria-labelledby="wl-snap">
              <h2 id="wl-snap">Open work by employee — Current snapshot</h2>
              <p class="basis">{{ w.snapshot.scopeNote }} Listed alphabetically; this is volume of open work, not a performance measure.</p>
              @if (w.snapshot.rows.length === 0) {
                <p class="empty">No open cases or tasks in this scope.</p>
              } @else {
                <div class="table-responsive">
                  <table class="data-table">
                    <caption class="sr-only">Open work by employee</caption>
                    <thead><tr><th scope="col">Employee</th><th scope="col" class="num">Open cases (as project manager)</th><th scope="col" class="num">Open tasks</th><th scope="col" class="num">Overdue tasks</th><th scope="col" class="num">Due within 7 days</th></tr></thead>
                    <tbody>
                      @for (r of w.snapshot.rows; track r.employeeId) { <tr><th scope="row">{{ r.name }}</th><td class="num">{{ r.openCases }}</td><td class="num">{{ r.openTasks }}</td><td class="num">{{ r.overdueTasks }}</td><td class="num">{{ r.dueSoonTasks }}</td></tr> }
                    </tbody>
                  </table>
                </div>
              }
              <ul class="plain">
                <li>Unassigned tasks: <strong>{{ w.snapshot.unassignedTasks === null ? 'Not available to your role' : w.snapshot.unassignedTasks }}</strong></li>
                <li>Cases without a project manager: <strong>{{ w.snapshot.casesWithoutProjectManager }}</strong></li>
              </ul>
            </section>
          }
        }
        @case ('deadlines') {
          @if (deadlines(); as d) {
            <section class="block" aria-labelledby="dl-snap">
              <h2 id="dl-snap">Deadlines — Current snapshot</h2>
              <p class="basis">Counts are cumulative: "within 7 days" includes today. Overdue covers deadlines up to {{ d.snapshot.overdueLookbackDays }} days past. Appointments are not deadlines.</p>
              <ul class="metrics">
                <li class="metric"><span class="m-label">Overdue</span><span class="m-value">{{ d.snapshot.overdue }}</span></li>
                <li class="metric"><span class="m-label">Due today</span><span class="m-value">{{ d.snapshot.dueToday }}</span></li>
                <li class="metric"><span class="m-label">Due within 7 days</span><span class="m-value">{{ d.snapshot.dueWithin7Days }}</span></li>
                <li class="metric"><span class="m-label">Due within 30 days</span><span class="m-value">{{ d.snapshot.dueWithin30Days }}</span></li>
              </ul>
              @if (d.snapshot.truncated) { <p class="notice" role="note">Some deadlines are not shown because there are very many. Narrow the filters.</p> }
              <h3>By type</h3>
              <ul class="plain">@for (s of d.snapshot.bySource; track s.key) { <li>{{ s.label }}: <strong>{{ s.count }}</strong></li> }</ul>
              <h3>Deadlines</h3>
              @if (d.snapshot.rows.length === 0) {
                <p class="empty">No deadlines in this scope.</p>
              } @else {
                <div class="table-responsive">
                  <table class="data-table">
                    <caption class="sr-only">Overdue and upcoming deadlines</caption>
                    <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Deadline</th><th scope="col">Case</th><th scope="col">Status</th></tr></thead>
                    <tbody>
                      @for (r of d.snapshot.rows; track r.date + r.title + r.case.id) {
                        <tr [class.late]="r.overdue">
                          <th scope="row">{{ day(r.date) }}@if (r.overdue) { <span class="flag"> Overdue</span> }</th>
                          <td>{{ r.kindLabel }}</td>
                          <td><a [routerLink]="r.link.path" [queryParams]="r.link.queryParams">{{ r.title }}</a></td>
                          <td><a [routerLink]="['/cases', r.case.id]">{{ r.case.caseNumber }}</a></td>
                          <td>{{ r.status }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (d.snapshot.rowsTotal > d.snapshot.rowsShown) { <p class="muted">Showing the first {{ d.snapshot.rowsShown }} of {{ d.snapshot.rowsTotal }}. The CSV export includes all of them.</p> }
              }
            </section>
          }
        }
        @case ('review-queues') {
          @if (queues(); as q) {
            <section class="block" aria-labelledby="rq-snap">
              <h2 id="rq-snap">Review and workflow queues — Current snapshot</h2>
              <p class="basis">Work waiting on someone right now. These match the queues on your Dashboard. A queue you do not have access to is marked as such, not shown as zero.</p>
              @for (queue of q.snapshot.queues; track queue.key) {
                <section class="queue" [attr.aria-labelledby]="'q-' + queue.key">
                  <h3 [id]="'q-' + queue.key">{{ queue.label }}: <span class="q-count">{{ queue.available ? queue.count : 'Not available to your role' }}</span></h3>
                  @if (queue.available && queue.rows.length) {
                    <div class="table-responsive">
                      <table class="data-table">
                        <caption class="sr-only">{{ queue.label }} by case</caption>
                        <thead><tr><th scope="col">Case</th><th scope="col">Title</th><th scope="col" class="num">Items</th></tr></thead>
                        <tbody>
                          @for (r of queue.rows; track r.caseId) { <tr><th scope="row"><a [routerLink]="r.link.path" [queryParams]="r.link.queryParams">{{ r.caseNumber || 'No case' }}</a></th><td>{{ r.caseTitle }}</td><td class="num">{{ r.count }}</td></tr> }
                        </tbody>
                      </table>
                    </div>
                    @if (queue.rowsTotal > queue.rows.length) { <p class="muted">Showing {{ queue.rows.length }} of {{ queue.rowsTotal }} cases. The CSV export includes all of them.</p> }
                  }
                </section>
              }
            </section>
          }
        }
      }
    }

    <ng-template #metricCard let-m let-basis="basis">
      <li class="metric">
        <a class="m-link" [routerLink]="m.href">
          <span class="m-label">{{ m.label }}</span>
          @if (m.value === null) { <span class="m-value na">Not available to your role</span> } @else { <span class="m-value">{{ m.value }}</span> }
          <span class="m-basis">{{ basis }}</span>
        </a>
      </li>
    </ng-template>

    <ng-template #countTable let-caption="caption" let-rows="rows">
      <div class="table-responsive">
        <table class="data-table">
          <caption>{{ caption }}</caption>
          <thead><tr><th scope="col">Group</th><th scope="col" class="num">Cases</th><th scope="col"><span class="sr-only">Share of the largest group</span></th></tr></thead>
          <tbody>
            @for (r of rows; track r.key) {
              <tr><th scope="row">{{ r.label }}</th><td class="num">{{ r.count }}</td><td class="bar-cell"><span class="bar" aria-hidden="true" [style.width.%]="bar(r, rows)"></span></td></tr>
            }
          </tbody>
        </table>
      </div>
    </ng-template>
  `,
  styles: [`
    .generated { color: #4b5563; font-size: .8125rem; margin: 0; }
    .tabs { display: flex; flex-wrap: wrap; gap: .25rem; border-bottom: 1px solid #d1d5db; margin-bottom: 1rem; }
    .tab { padding: .5rem .875rem; text-decoration: none; color: #1e3a5f; border-bottom: 3px solid transparent; font-weight: 500; }
    .tab.on { border-bottom-color: #1e3a5f; font-weight: 700; }
    .tab:focus-visible, .m-link:focus-visible, .btn:focus-visible, a:focus-visible { outline: 3px solid #b8892b; outline-offset: 2px; }
    .filters { display: flex; flex-wrap: wrap; gap: .75rem 1rem; align-items: flex-end; padding: .75rem 1rem; margin-bottom: 1rem; }
    .field { display: grid; gap: .25rem; min-width: 9rem; } .field label { font-size: .75rem; font-weight: 600; color: #374151; } .field.export { margin-left: auto; }
    .block { margin-bottom: 2rem; } .block h2 { font-size: 1.125rem; margin: 0 0 .25rem; color: #102a43; } .block h3 { font-size: .9375rem; margin: 1rem 0 .5rem; }
    .basis { color: #4b5563; font-size: .8125rem; margin: 0 0 .75rem; } .muted { color: #6b7280; font-size: .8125rem; } .empty { color: #4b5563; }
    .metrics { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .75rem; }
    .metric { background: #fff; border: 1px solid #d1d5db; border-radius: .5rem; display: grid; }
    .m-link, li.metric:not(:has(a)) { display: grid; gap: .125rem; padding: .75rem 1rem; text-decoration: none; color: inherit; }
    .m-label { font-size: .8125rem; color: #374151; } .m-value { font-size: 1.75rem; font-weight: 700; color: #102a43; font-variant-numeric: tabular-nums; } .m-value.na { font-size: .9375rem; font-weight: 500; color: #6b7280; }
    .m-basis { font-size: .6875rem; text-transform: uppercase; letter-spacing: .04em; color: #486581; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: 1rem; }
    .data-table caption { text-align: left; font-weight: 600; padding-bottom: .25rem; } .num { text-align: right; font-variant-numeric: tabular-nums; }
    .bar-cell { width: 35%; } .bar { display: block; height: .5rem; background: #486581; border-radius: .25rem; min-width: 0; }
    tr.late th, tr.late td { background: #fef2f2; } .flag { color: #991b1b; font-weight: 700; font-size: .75rem; }
    .notice { padding: .5rem .75rem; border-radius: .375rem; background: #fef3c7; color: #78350f; font-size: .875rem; }
    .plain { margin: .5rem 0; padding-left: 1.25rem; } .queue { margin: 1.25rem 0; } .q-count { font-variant-numeric: tabular-nums; }
    @media (max-width: 700px) { .field { min-width: 100%; } .field.export { margin-left: 0; } .grid { grid-template-columns: 1fr; } }
  `],
})
export class ReportsComponent implements OnInit {
  private api = inject(ReportsApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);

  readonly tabs = REPORT_TABS;
  readonly caseTypes = CASE_TYPES;
  readonly stages = CASE_STAGES;
  readonly priorities = PRIORITIES;
  readonly deadlineSources = DEADLINE_SOURCES;
  readonly period = formatPeriod;
  readonly day = formatDate;

  tab = signal<ReportName>('overview');
  filters = signal<ReportFilters>(parseFilters({ get: () => null }, false));
  meta = signal<ReportMeta | null>(null);
  overview = signal<OverviewReport | null>(null);
  pipeline = signal<PipelineReport | null>(null);
  workload = signal<WorkloadReport | null>(null);
  deadlines = signal<DeadlinesReport | null>(null);
  queues = signal<ReviewQueuesReport | null>(null);
  isLoading = signal(true);
  isError = signal(false);
  forbidden = signal(false);
  errorMessage = signal('');

  private canFirm = computed(() => this.auth.capabilities().includes('cases.view_all'));
  scopes = computed(() => scopeOptions(this.canFirm()));
  hasPeriod = computed(() => this.tab() === 'overview' || this.tab() === 'pipeline');
  generated = computed(() => (this.meta() ? formatGenerated(this.meta()!.asOf, this.meta()!.timeZone) : ''));
  /** The server's resolved period (defaults included), so the date inputs always show what the numbers cover. */
  shownFrom = computed(() => this.filters().from ?? this.meta()?.from ?? '');
  shownTo = computed(() => this.filters().to ?? this.meta()?.to ?? '');
  /** The CSV link carries exactly the filters on screen, and exists only for an exportable report and an employee who may export. */
  exportHref = computed(() => {
    const t = REPORT_TABS.find((x) => x.key === this.tab());
    if (!t?.exportable || !this.auth.capabilities().includes('csv.export')) return '';
    return this.api.exportUrl(this.tab(), this.filters());
  });

  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.tab.set(parseTab(params.get('tab')));
      this.filters.set(parseFilters(params, this.canFirm()));
      this.load();
    });
  }

  load() {
    const tab = this.tab();
    this.isLoading.set(true);
    this.isError.set(false);
    this.api.load<unknown>(tab, this.filters()).subscribe({
      next: ({ data, meta }) => {
        this.meta.set(meta);
        if (tab === 'overview') this.overview.set(data as OverviewReport);
        else if (tab === 'pipeline') this.pipeline.set(data as PipelineReport);
        else if (tab === 'workload') this.workload.set(data as WorkloadReport);
        else if (tab === 'deadlines') this.deadlines.set(data as DeadlinesReport);
        else this.queues.set(data as ReviewQueuesReport);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.isError.set(true);
        this.forbidden.set(err?.status === 403);
        this.errorMessage.set(err?.status === 403 ? 'You do not have access to this report.' : apiErrorMessage(err, 'The report could not be loaded.'));
      },
    });
  }

  /** Every control writes the URL; the queryParamMap subscription then applies it and reloads. */
  change(patch: Partial<ReportFilters>) {
    void this.router.navigate([], { relativeTo: this.route, queryParams: toQueryParams(this.tab(), { ...this.filters(), ...patch }), replaceUrl: true });
  }

  tabParams(tab: ReportName) {
    // A deadline type or queue key and a grouping only make sense inside their own report, so they do not travel between tabs.
    return toQueryParams(tab, { ...this.filters(), source: null, granularity: null });
  }

  bar(row: CountRow, rows: CountRow[]): number {
    return barPercent(row.count, Math.max(0, ...rows.map((r) => r.count)));
  }
}

