import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { SearchApi } from '../../core/api/search-api.service';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, SEARCH_TYPE_NOUN, SearchGroup, SearchResult, SearchType, isSafeAppPath } from '../../core/api/search.types';
import { EmptyStateComponent } from '../../shared/empty-state.component';
import { ErrorStateComponent } from '../../shared/error-state.component';
import { SkeletonComponent } from '../../shared/skeleton.component';

const PAGE_SIZE = 25;
const GROUPED_LIMIT = 10;
const TYPES = Object.keys(SEARCH_TYPE_NOUN) as SearchType[];

/**
 * Full Staff search results (ADR-028). The URL is the page state (`q`, `type`, `page`), so back/forward and links just work. All
 * sources show grouped summaries; choosing one source shows its paginated full list. Only the sources the server says this
 * employee may search are offered as filters, and nothing here claims to search content the server deliberately does not
 * (document contents, message bodies, form answers, petition text, internal notes).
 */
@Component({
  selector: 'ih-search-page',
  standalone: true,
  imports: [FormsModule, RouterLink, SkeletonComponent, EmptyStateComponent, ErrorStateComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>Search</h1>
        <p class="page-subtitle">Find cases, clients, consultations, tasks, documents, queries, evidence, forms, petitions, filing packets, USCIS filings and conversations by name, number or title. Only what you have access to is shown.</p>
      </div>
    </div>

    <form class="search-form card" role="search" (ngSubmit)="submit()">
      <label for="page-search-input" class="sr-only">Search</label>
      <input id="page-search-input" type="search" class="form-control" autocomplete="off" [attr.maxlength]="maxLength" [ngModel]="draft()" (ngModelChange)="draft.set($event)" name="q" placeholder="Case number, name, email, receipt number…" />
      <button type="submit" class="btn btn-primary" [disabled]="draft().trim().length < minLength">Search</button>
    </form>
    <p class="hint-line">Search covers names, numbers, titles and labels. It does not search inside documents, messages, form answers, petition text or internal notes.</p>

    @if (tooShort()) {
      <p class="hint-line" role="status">Enter at least {{ minLength }} characters to search.</p>
    } @else {
      @if (types().length) {
        <nav class="filters" aria-label="Search sources">
          <a class="chip" [class.on]="!type()" [attr.aria-current]="!type() ? 'true' : null" routerLink="/search" [queryParams]="{ q: q() }">All sources</a>
          @for (t of types(); track t.type) {
            <a class="chip" [class.on]="type() === t.type" [attr.aria-current]="type() === t.type ? 'true' : null" routerLink="/search" [queryParams]="{ q: q(), type: t.type }">{{ t.label }}</a>
          }
        </nav>
      }

      <div class="section-card card" aria-live="polite">
        @if (isLoading()) {
          <ih-skeleton [rows]="5" rowHeight="2.5rem"></ih-skeleton>
        } @else if (isError()) {
          <ih-error-state title="Search failed" [message]="errorMessage()" (retry)="load()"></ih-error-state>
        } @else {
          @if (unavailable().length) {
            <p class="notice" role="status">These sources could not be searched right now: {{ unavailable().join(', ') }}. Results from the others are shown.</p>
          }
          @if (groups().length === 0) {
            <ih-empty-state title="No results" description="Nothing you can access matches that search. Try a case number, a client name or email, a receipt number or a document name."></ih-empty-state>
          }
          @for (group of groups(); track group.type) {
            <section class="group" [attr.aria-labelledby]="'group-' + group.type">
              <h2 class="group-title" [id]="'group-' + group.type">{{ group.label }}</h2>
              <ul class="results">
                @for (item of group.items; track item.id) {
                  <li class="result">
                    <a [routerLink]="link(item)" [queryParams]="linkParams(item)" class="result-main">
                      <span class="result-title">{{ item.title }}</span>
                      @if (item.subtitle) { <span class="result-sub">{{ item.subtitle }}</span> }
                    </a>
                    <span class="result-meta">
                      <span class="type-badge">{{ noun(item.type) }}</span>
                      @if (item.statusLabel) { <span>{{ item.statusLabel }}</span> }
                      @for (c of item.context; track c) { <span>{{ c }}</span> }
                      @if (item.case && item.type !== 'cases') { <span>Case {{ item.case.caseNumber }}</span> }
                    </span>
                  </li>
                }
              </ul>
              @if (!type() && group.hasMore) {
                <a class="more-link" routerLink="/search" [queryParams]="{ q: q(), type: group.type }">Show all {{ group.label.toLowerCase() }} results</a>
              }
            </section>
          }
          @if (type() && groups().length) {
            <nav class="pager" aria-label="Pagination">
              <button type="button" class="btn btn-secondary btn-sm" [disabled]="page() <= 1" (click)="goto(page() - 1)">Previous</button>
              <span>Page {{ page() }}</span>
              <button type="button" class="btn btn-secondary btn-sm" [disabled]="!hasMore()" (click)="goto(page() + 1)">Next</button>
            </nav>
          }
        }
      </div>
    }
  `,
  styles: [`
    .search-form { display: flex; gap: .5rem; padding: .75rem; margin-bottom: .5rem; } .search-form input { flex: 1; min-width: 0; }
    .hint-line { color: #4b5563; font-size: .8125rem; margin: .25rem 0 1rem; }
    .filters { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
    .chip { border: 1px solid #d1d5db; border-radius: 9999px; padding: .25rem .75rem; font-size: .8125rem; color: #1e3a5f; text-decoration: none; background: #fff; }
    .chip.on { background: #1e3a5f; color: #fff; border-color: #1e3a5f; }
    .chip:focus-visible, .result-main:focus-visible, .more-link:focus-visible, .btn:focus-visible { outline: 3px solid #b8892b; outline-offset: 2px; }
    .notice { padding: .5rem .75rem; border-radius: .375rem; background: #fef3c7; color: #78350f; margin: 0 0 1rem; font-size: .875rem; }
    .group + .group { margin-top: 1.5rem; } .group-title { font-size: 1rem; margin: 0 0 .5rem; color: #243b53; }
    .results { list-style: none; margin: 0; padding: 0; display: grid; gap: .375rem; }
    .result { display: flex; justify-content: space-between; gap: 1rem; padding: .5rem .75rem; border: 1px solid #e5e7eb; border-radius: .375rem; }
    .result-main { display: grid; min-width: 0; text-decoration: none; color: inherit; } .result-title { font-weight: 600; color: #1e3a5f; text-decoration: underline; } .result-sub { font-size: .8125rem; color: #4b5563; }
    .result-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: flex-start; gap: .375rem; font-size: .75rem; color: #4b5563; text-align: right; }
    .type-badge { font-weight: 700; color: #1e3a5f; background: #eef2f7; border-radius: 9999px; padding: .0625rem .5rem; }
    .more-link { display: inline-block; margin-top: .5rem; font-size: .8125rem; color: #1e3a5f; font-weight: 600; }
    .pager { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1.25rem; font-size: .875rem; }
    @media (max-width: 700px) { .result { flex-direction: column; gap: .25rem; } .result-meta { justify-content: flex-start; text-align: left; } }
  `],
})
export class SearchPageComponent implements OnInit {
  private api = inject(SearchApi);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly minLength = MIN_QUERY_LENGTH;
  readonly maxLength = MAX_QUERY_LENGTH;
  readonly noun = (t: SearchType) => SEARCH_TYPE_NOUN[t];

  q = signal('');
  draft = signal('');
  type = signal<SearchType | null>(null);
  page = signal(1);
  groups = signal<SearchGroup[]>([]);
  types = signal<{ type: SearchType; label: string }[]>([]);
  unavailableTypes = signal<SearchType[]>([]);
  hasMore = signal(false);
  isLoading = signal(false);
  isError = signal(false);
  errorMessage = signal('');

  tooShort = computed(() => this.q().trim().length < MIN_QUERY_LENGTH);
  unavailable = computed(() => this.unavailableTypes().map((t) => SEARCH_TYPE_NOUN[t] + 's'));

  ngOnInit() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const q = (params.get('q') ?? '').trim().slice(0, MAX_QUERY_LENGTH);
      const type = params.get('type');
      const page = Number(params.get('page'));
      this.q.set(q);
      this.draft.set(q);
      this.type.set(TYPES.includes(type as SearchType) ? (type as SearchType) : null);
      this.page.set(Number.isInteger(page) && page >= 1 && page <= 200 ? page : 1);
      if (!this.tooShort()) this.load();
      else {
        this.groups.set([]);
        this.isLoading.set(false);
      }
    });
  }

  load() {
    this.isLoading.set(true);
    this.isError.set(false);
    const request = this.type() ? this.api.page(this.q(), this.type() as SearchType, this.page(), PAGE_SIZE) : this.api.grouped(this.q(), GROUPED_LIMIT);
    request.subscribe({
      next: ({ data, unavailableTypes }) => {
        this.groups.set(data.groups.filter((g) => g.items.length > 0));
        this.types.set(data.availableTypes);
        this.unavailableTypes.set(unavailableTypes);
        this.hasMore.set(data.groups.some((g) => g.hasMore));
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.isError.set(true);
        this.groups.set([]);
        this.errorMessage.set(err?.status === 403 ? 'You cannot search that type.' : err?.status === 429 ? 'Too many searches. Wait a moment and try again.' : apiErrorMessage(err, 'Search is unavailable right now.'));
      },
    });
  }

  submit() {
    const q = this.draft().trim();
    if (q.length < MIN_QUERY_LENGTH) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q, type: this.type(), page: null } });
  }

  goto(page: number) {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q: this.q(), type: this.type(), page: page > 1 ? page : null } });
  }

  /** The server owns every href; split it into a router path and query params, ignoring anything that is not a plain in-app path. */
  link(item: SearchResult): string {
    return isSafeAppPath(item.href) ? item.href.split('?')[0] : '/search';
  }

  linkParams(item: SearchResult): Record<string, string> {
    if (!isSafeAppPath(item.href)) return {};
    return Object.fromEntries(new URLSearchParams(item.href.split('?')[1] ?? ''));
  }
}
