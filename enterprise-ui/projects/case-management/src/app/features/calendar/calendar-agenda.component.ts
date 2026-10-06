import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CalendarItem, calendarKindLabel } from '../../core/api/calendar.types';
import { formatDay, isOverdue, timeLabel } from './calendar-model';

/**
 * Items grouped by day, read-only. Each item links to the module that owns its date; a manual event asks its parent to open the
 * event dialog instead. Used by the Agenda view, the month view's selected-day panel and the case Calendar tab.
 */
@Component({
  selector: 'ih-calendar-agenda',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="agenda">
      @for (group of groups(); track group[0]) {
        <section [attr.aria-labelledby]="idPrefix() + group[0]">
          @if (headings()) {
            <h3 [id]="idPrefix() + group[0]" class="agenda-day" [class.today]="group[0] === today()">{{ longDay(group[0]) }}</h3>
          }
          <ul class="rows">
            @for (item of group[1]; track item.id) {
              <li class="row" [class.overdue]="overdue(item)">
                <span class="when">{{ when(item) }}</span>
                <span class="kind kind-{{ item.kind }}">{{ kindLabel(item.kind) }}</span>
                <span class="main">
                  @if (item.sourceType === 'manual_event') {
                    <button type="button" class="link-btn" (click)="eventSelected.emit(item)">{{ item.title }}</button>
                  } @else {
                    <a [routerLink]="item.link.path" [queryParams]="item.link.queryParams">{{ item.title }}</a>
                  }
                  @if (showCase() && item.case) { <span class="muted"> · <a [routerLink]="['/cases', item.case.id]">{{ item.case.caseNumber }}</a></span> }
                  @if (item.person) { <span class="muted"> · {{ item.person }}</span> }
                  @if (overdue(item)) { <span class="flag flag-late">Overdue</span> }
                  @if (item.actionRequired) { <span class="flag flag-action">Action required</span> }
                  @if (item.status === 'completed' || item.status === 'cancelled') { <span class="flag">{{ item.status === 'cancelled' ? 'Cancelled' : 'Completed' }}</span> }
                </span>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
  styles: [`
    .agenda { display: grid; gap: 1rem; }
    .agenda-day { margin: 0 0 .5rem; font-size: 1rem; } .agenda-day.today { color: #1e3a5f; text-decoration: underline; }
    .rows { list-style: none; margin: 0; padding: 0; display: grid; gap: .375rem; }
    .row { display: grid; grid-template-columns: 6.5rem 9rem 1fr; gap: .5rem; align-items: baseline; padding: .375rem .5rem; border: 1px solid #e5e7eb; border-radius: .375rem; font-size: .875rem; }
    .row.overdue { border-color: #fecaca; background: #fef2f2; }
    .when { color: #374151; font-variant-numeric: tabular-nums; } .kind { font-size: .75rem; font-weight: 600; color: #1e3a5f; }
    .muted { color: #4b5563; font-size: .8125rem; }
    .link-btn { background: none; border: 0; padding: 0; cursor: pointer; color: #1e3a5f; text-decoration: underline; font: inherit; }
    .link-btn:focus-visible, a:focus-visible { outline: 3px solid #b8892b; outline-offset: 2px; }
    .flag { font-size: .6875rem; font-weight: 600; padding: .0625rem .5rem; border-radius: 9999px; background: #eef2f7; color: #1e3a5f; margin-left: .375rem; }
    .flag-late { background: #fee2e2; color: #991b1b; } .flag-action { background: #fef3c7; color: #92400e; }
    @media (max-width: 700px) { .row { grid-template-columns: 1fr; gap: .125rem; } }
  `],
})
export class CalendarAgendaComponent {
  groups = input.required<[string, CalendarItem[]][]>();
  zone = input<string>('UTC');
  today = input<string>('');
  headings = input<boolean>(true);
  showCase = input<boolean>(true);
  idPrefix = input<string>('agenda-');
  eventSelected = output<CalendarItem>();

  readonly kindLabel = calendarKindLabel;
  readonly longDay = (d: string) => formatDay(d, 'long');
  private zoneNow = computed(() => ({ zone: this.zone(), today: this.today() }));
  when = (item: CalendarItem) => timeLabel(item, this.zoneNow().zone);
  overdue = (item: CalendarItem) => !!this.zoneNow().today && isOverdue(item, this.zoneNow().today);
}
