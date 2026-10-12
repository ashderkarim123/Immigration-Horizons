import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/api/api-error';
import { CaseListItem, Paginated } from '../../core/api/case.types';

/** Finds one case the employee can already see, by number or title. The server limits the list to their own cases. */
@Component({
  selector: 'ih-case-picker',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="picker">
      <label [for]="inputId">{{ label() }}</label>
      @if (selected(); as chosen) {
        <div class="chosen">
          <span><strong>{{ chosen.caseNumber }}</strong> — {{ chosen.title }}</span>
          <button type="button" class="link-btn" (click)="clear()">Remove<span class="sr-only"> {{ chosen.caseNumber }}</span></button>
        </div>
      } @else {
        <input [id]="inputId" type="search" class="form-control" autocomplete="off" placeholder="Case number or title" [ngModel]="term()" (ngModelChange)="onTerm($event)" />
        @if (error()) { <p class="field-error" role="alert">{{ error() }}</p> }
        @if (results().length) {
          <ul class="results" role="listbox" [attr.aria-label]="label() + ' results'">
            @for (item of results(); track item.id) {
              <li role="option" [attr.aria-selected]="false"><button type="button" (click)="choose(item)"><strong>{{ item.caseNumber }}</strong> — {{ item.title }}</button></li>
            }
          </ul>
        } @else if (searched() && !error()) { <p class="muted">No case you can open matches that.</p> }
      }
    </div>
  `,
  styles: `
    .picker { display: flex; flex-direction: column; gap: .35rem; }
    .chosen { display: flex; justify-content: space-between; gap: .75rem; align-items: center; padding: .5rem .75rem; border: 1px solid var(--ih-border-medium); border-radius: var(--ih-radius-md); background: var(--ih-brand-50); }
    .results { list-style: none; margin: 0; padding: 0; border: 1px solid var(--ih-border-light); border-radius: var(--ih-radius-md); max-height: 12rem; overflow-y: auto; background: #fff; }
    .results button { width: 100%; text-align: left; padding: .55rem .75rem; border: 0; background: none; }
    .results button:hover, .results button:focus-visible { background: var(--ih-brand-50); }
    .muted { color: var(--ih-text-secondary); margin: 0; font-size: var(--ih-font-size-sm); }
  `,
})
export class CasePickerComponent {
  private readonly api = inject(ApiService);
  private static nextId = 0;

  readonly label = input('Link to a case (optional)');
  readonly picked = output<CaseListItem | null>();

  protected readonly inputId = `ih-case-picker-${++CasePickerComponent.nextId}`;
  protected readonly term = signal('');
  protected readonly results = signal<CaseListItem[]>([]);
  protected readonly selected = signal<CaseListItem | null>(null);
  protected readonly searched = signal(false);
  protected readonly error = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private latest = 0;

  protected onTerm(value: string): void {
    this.term.set(value);
    clearTimeout(this.timer);
    this.error.set('');
    if (value.trim().length < 2) { this.results.set([]); this.searched.set(false); return; }
    this.timer = setTimeout(() => this.search(value.trim()), 250);
  }

  private search(term: string): void {
    const ticket = ++this.latest; // an older, slower response must not overwrite a newer one
    this.api.get<Paginated<CaseListItem>>('/staff/cases', { search: term, limit: 8 }).subscribe({
      next: ({ data }) => { if (ticket === this.latest) { this.results.set(data.items); this.searched.set(true); } },
      error: (err) => { if (ticket === this.latest) { this.error.set(apiErrorMessage(err, 'Cases could not be searched.')); this.results.set([]); } },
    });
  }

  protected choose(item: CaseListItem): void { this.selected.set(item); this.results.set([]); this.picked.emit(item); }
  protected clear(): void { this.selected.set(null); this.term.set(''); this.searched.set(false); this.picked.emit(null); }
}
