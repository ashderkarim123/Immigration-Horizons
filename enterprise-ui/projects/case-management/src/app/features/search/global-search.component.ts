import { Component, DestroyRef, ElementRef, HostListener, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, catchError, debounce, distinctUntilChanged, map, of, switchMap, timer } from 'rxjs';
import { apiErrorMessage } from '../../core/api/api-error';
import { SearchApi } from '../../core/api/search-api.service';
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, SEARCH_TYPE_NOUN, SearchGroup, SearchResult, SearchType, isSafeAppPath } from '../../core/api/search.types';

const DEBOUNCE_MS = 300;

type PaletteState = 'idle' | 'loading' | 'results' | 'empty' | 'error';

/**
 * The Staff command search (ADR-028): a real control in the header and Ctrl/Cmd+K, backed by GET /staff/search. It shows what the
 * server returned and nothing else: the server applies every capability and row rule, and owns every link. Results are plain text
 * (no innerHTML), the type of each is named in words, and nothing about a search is remembered: no history, no recents.
 */
@Component({
  selector: 'ih-global-search',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <button type="button" class="search-trigger" aria-label="Search" aria-haspopup="dialog" [attr.aria-expanded]="isOpen()" aria-keyshortcuts="Control+K Meta+K" (click)="open()">
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" width="16" height="16"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd"/></svg>
      <span class="search-label">Search</span>
      <kbd class="search-kbd" aria-hidden="true">{{ shortcutHint }}</kbd>
    </button>

    @if (isOpen()) {
      <div class="palette-backdrop" (click)="close()">
        <div class="palette" role="dialog" aria-modal="true" aria-label="Search" (click)="$event.stopPropagation()" (keydown)="onDialogKey($event)">
          <div class="palette-input">
            <label for="ih-search-input" class="sr-only">Search cases, clients, tasks, documents and more</label>
            <input
              #input
              id="ih-search-input"
              type="search"
              role="combobox"
              autocomplete="off"
              spellcheck="false"
              placeholder="Search cases, clients, tasks, documents…"
              aria-autocomplete="list"
              aria-controls="ih-search-listbox"
              [attr.aria-expanded]="options().length > 0"
              [attr.aria-activedescendant]="options().length ? 'ih-search-opt-' + activeIndex() : null"
              [attr.maxlength]="maxLength"
              [ngModel]="query()"
              (ngModelChange)="onInput($event)"
              (keydown)="onInputKey($event)"
            />
            <button type="button" class="palette-close" aria-label="Close search" (click)="close()">Esc</button>
          </div>

          <div class="palette-body" aria-live="polite">
            @switch (state()) {
              @case ('idle') { <p class="hint">Type at least {{ minLength }} characters to search. Results only include what you have access to.</p> }
              @case ('loading') { <p class="hint" role="status">Searching…</p> }
              @case ('error') { <p class="hint error" role="alert">{{ error() }}</p> }
              @case ('empty') { <p class="hint" role="status">No results. Try a case number, a client name or email, a receipt number or a document name.</p> }
            }
            @if (unavailable().length) {
              <p class="hint warn" role="status">These sources could not be searched right now: {{ unavailable().join(', ') }}. Results from the others are shown.</p>
            }

            @if (state() === 'results') {
              <div id="ih-search-listbox" role="listbox" aria-label="Search results">
                @for (group of groups(); track group.type) {
                  <div role="group" [attr.aria-labelledby]="'ih-search-group-' + group.type">
                    <div class="group-title" [id]="'ih-search-group-' + group.type">{{ group.label }}@if (group.hasMore) { <span class="more"> · more in full results</span> }</div>
                    @for (item of group.items; track item.id) {
                      <div
                        role="option"
                        class="option"
                        [id]="'ih-search-opt-' + indexOf(item)"
                        [class.active]="indexOf(item) === activeIndex()"
                        [attr.aria-selected]="indexOf(item) === activeIndex()"
                        (click)="openResult(item)"
                        (mousemove)="activeIndex.set(indexOf(item))"
                      >
                        <span class="option-main">
                          <span class="option-title">{{ item.title }}</span>
                          @if (item.subtitle) { <span class="option-sub">{{ item.subtitle }}</span> }
                        </span>
                        <span class="option-meta">
                          <span class="type-badge">{{ noun(item.type) }}</span>
                          @if (item.statusLabel) { <span>{{ item.statusLabel }}</span> }
                          @if (item.case && item.type !== 'cases') { <span>{{ item.case.caseNumber }}</span> }
                        </span>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <div class="palette-foot">
            <span class="keys" aria-hidden="true">↑↓ to move · Enter to open · Esc to close</span>
            @if (query().trim().length >= minLength) {
              <a class="view-all" routerLink="/search" [queryParams]="{ q: query().trim() }" (click)="close()">View all results</a>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .search-trigger { display: inline-flex; align-items: center; gap: .5rem; background: transparent; border: 1px solid var(--ih-border-medium); border-radius: var(--ih-radius-sm); padding: .3rem .625rem; cursor: pointer; font-size: .875rem; color: var(--ih-text-primary); min-width: 11rem; }
    .search-trigger:hover { background: var(--ih-brand-50, #f0f4f8); }
    .search-label { flex: 1; text-align: left; color: var(--ih-text-muted); }
    .search-kbd { font-size: .6875rem; border: 1px solid var(--ih-border-medium); border-radius: .25rem; padding: 0 .3rem; color: var(--ih-text-muted); }
    .search-trigger:focus-visible, .palette-close:focus-visible, .view-all:focus-visible, .palette input:focus-visible { outline: 3px solid #b8892b; outline-offset: 2px; }
    .palette-backdrop { position: fixed; inset: 0; background: rgba(16, 42, 67, .55); z-index: 2000; display: flex; justify-content: center; align-items: flex-start; padding: 8vh 1rem 1rem; }
    .palette { background: #fff; width: 100%; max-width: 40rem; border-radius: .5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,.2); display: flex; flex-direction: column; max-height: 80vh; }
    .palette-input { display: flex; gap: .5rem; align-items: center; padding: .75rem; border-bottom: 1px solid #e5e7eb; }
    .palette-input input { flex: 1; font-size: 1rem; padding: .5rem .625rem; border: 1px solid #d1d5db; border-radius: .375rem; min-width: 0; }
    .palette-close { background: transparent; border: 1px solid #d1d5db; border-radius: .25rem; font-size: .75rem; padding: .25rem .5rem; cursor: pointer; }
    .palette-body { overflow: auto; padding: .5rem; min-height: 4rem; }
    .hint { margin: .5rem; color: #4b5563; font-size: .875rem; } .hint.error { color: #b91c1c; } .hint.warn { color: #92400e; }
    .group-title { font-size: .75rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #486581; padding: .5rem .5rem .25rem; }
    .more { font-weight: 400; text-transform: none; letter-spacing: 0; color: #6b7280; }
    .option { display: flex; justify-content: space-between; gap: 1rem; padding: .5rem; border-radius: .375rem; cursor: pointer; }
    .option.active { background: #eef2f7; outline: 2px solid #1e3a5f; outline-offset: -2px; }
    .option-main { display: grid; min-width: 0; } .option-title { font-weight: 600; color: #102a43; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .option-sub { font-size: .8125rem; color: #4b5563; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .option-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: .375rem; font-size: .75rem; color: #4b5563; text-align: right; }
    .type-badge { font-weight: 700; color: #1e3a5f; background: #eef2f7; border-radius: 9999px; padding: .0625rem .5rem; }
    .palette-foot { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: .5rem .75rem; border-top: 1px solid #e5e7eb; font-size: .75rem; color: #6b7280; }
    .view-all { font-weight: 600; color: #1e3a5f; }
    @media (max-width: 700px) {
      .search-trigger { min-width: 0; } .search-label, .search-kbd { display: none; }
      .palette-backdrop { padding: 0; } .palette { max-width: none; height: 100%; max-height: none; border-radius: 0; } .keys { display: none; }
    }
  `],
})
export class GlobalSearchComponent {
  private api = inject(SearchApi);
  private router = inject(Router);
  private document = inject(DOCUMENT);
  private injector = inject(Injector);
  private destroyRef = inject(DestroyRef);

  readonly minLength = MIN_QUERY_LENGTH;
  readonly maxLength = MAX_QUERY_LENGTH;
  readonly noun = (t: SearchType) => SEARCH_TYPE_NOUN[t];
  readonly shortcutHint = /Mac|iPhone|iPad/i.test(typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent || '') ? '⌘K' : 'Ctrl K';

  private inputRef = viewChild<ElementRef<HTMLInputElement>>('input');
  private input$ = new Subject<string>();
  private returnFocusTo: HTMLElement | null = null;

  isOpen = signal(false);
  query = signal('');
  state = signal<PaletteState>('idle');
  error = signal('');
  groups = signal<SearchGroup[]>([]);
  unavailableTypes = signal<SearchType[]>([]);
  activeIndex = signal(0);

  options = computed<SearchResult[]>(() => this.groups().flatMap((g) => g.items));
  unavailable = computed(() => this.unavailableTypes().map((t) => SEARCH_TYPE_NOUN[t] + 's'));

  constructor() {
    this.input$
      .pipe(
        map((q) => q.trim()),
        // A short query is answered at once (and cancels anything in flight); a real one waits for a pause in typing.
        debounce((q) => (q.length < MIN_QUERY_LENGTH ? of(0) : timer(DEBOUNCE_MS))),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.length < MIN_QUERY_LENGTH) return of({ kind: 'idle' as const });
          this.state.set('loading');
          return this.api.quick(q).pipe(
            map((outcome) => ({ kind: 'ok' as const, outcome })),
            catchError((err) => of({ kind: 'error' as const, err })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((r) => {
        this.activeIndex.set(0);
        if (r.kind === 'idle') {
          this.groups.set([]);
          this.unavailableTypes.set([]);
          this.state.set('idle');
        } else if (r.kind === 'error') {
          this.groups.set([]);
          this.error.set((r.err as { status?: number })?.status === 429 ? 'Too many searches. Wait a moment and try again.' : apiErrorMessage(r.err, 'Search is unavailable right now.'));
          this.state.set('error');
        } else {
          const groups = r.outcome.data.groups.filter((g) => g.items.length > 0);
          this.groups.set(groups);
          this.unavailableTypes.set(r.outcome.unavailableTypes);
          this.state.set(groups.length ? 'results' : 'empty');
        }
      });
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKey(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (this.isOpen()) this.close();
      else this.open();
    }
  }

  open() {
    this.returnFocusTo = this.document.activeElement as HTMLElement | null;
    this.query.set('');
    this.groups.set([]);
    this.unavailableTypes.set([]);
    this.state.set('idle');
    this.activeIndex.set(0);
    this.isOpen.set(true);
    afterNextRender(() => this.inputRef()?.nativeElement.focus(), { injector: this.injector });
  }

  close() {
    if (!this.isOpen()) return;
    this.isOpen.set(false);
    this.input$.next('');
    this.returnFocusTo?.focus?.();
    this.returnFocusTo = null;
  }

  onInput(value: string) {
    this.query.set(value);
    if (value.trim().length >= MIN_QUERY_LENGTH) this.state.set('loading');
    this.input$.next(value);
  }

  indexOf(item: SearchResult): number {
    return this.options().indexOf(item);
  }

  onInputKey(event: KeyboardEvent) {
    const n = this.options().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (n) this.activeIndex.update((i) => (i + 1) % n);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (n) this.activeIndex.update((i) => (i - 1 + n) % n);
        break;
      case 'Home':
        if (n) { event.preventDefault(); this.activeIndex.set(0); }
        break;
      case 'End':
        if (n) { event.preventDefault(); this.activeIndex.set(n - 1); }
        break;
      case 'Enter': {
        event.preventDefault();
        const active = this.options()[this.activeIndex()];
        if (this.state() === 'results' && active) this.openResult(active);
        else if (this.query().trim().length >= MIN_QUERY_LENGTH) this.viewAll();
        break;
      }
    }
  }

  /** Escape closes from anywhere in the dialog; Tab stays inside it. */
  onDialogKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    } else if (event.key === 'Tab') {
      // Everything focusable in the dialog is visible, so no layout check is needed (and none works without a browser engine).
      const controls = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input, button:not([disabled]), a[href]'));
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && this.document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && this.document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }

  openResult(item: SearchResult) {
    // The server owns every href; anything that is not a plain in-app path is ignored rather than followed.
    if (!isSafeAppPath(item.href)) return;
    this.close();
    void this.router.navigateByUrl(item.href);
  }

  viewAll() {
    const q = this.query().trim();
    this.close();
    void this.router.navigate(['/search'], { queryParams: { q } });
  }
}
