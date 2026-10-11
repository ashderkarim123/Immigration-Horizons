import { DatePipe } from '@angular/common';
import { Component, HostListener, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../../core/api/admin-api.service';
import { SeoList, SeoPage, ServiceItem } from '../../core/api/admin.types';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { apiErrorMessage, apiFieldErrors } from '../../core/errors/api-error';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { ErrorStateComponent, SkeletonComponent, ToastService } from '../../shared/staff-ui';
import { humanize } from '../../shared/widgets';

/** The service catalogue is code-owned: this page previews each service and links to its SEO record, nothing more. */
@Component({
  selector: 'iha-services',
  imports: [RouterLink, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>Services</h1><p class="page-subtitle">Service pages are part of the website's code. Here you can open each one and manage how it appears in search results.</p></div>
    </div>
    @if (error()) {
      <ih-error-state title="Services could not be loaded" [message]="error()" (retry)="load()" />
    } @else if (!items()) {
      <ih-skeleton [rows]="4" rowHeight="2.75rem" />
    } @else {
      <div class="table-wrap">
        <table class="data-table stacked">
          <caption class="sr-only">Website services</caption>
          <thead><tr><th scope="col">Service</th><th scope="col">Search title</th><th scope="col">Indexing</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (service of items()!; track service.slug) {
              <tr>
                <td data-label="Service"><div><span class="cell-title">{{ service.title }}</span><div class="cell-sub">{{ service.tagline }} · /services/{{ service.slug }}</div></div></td>
                <td data-label="Search title">@if (service.seo.seoTitle) { {{ service.seo.seoTitle }} } @else { <span class="muted">Not set</span> }</td>
                <td data-label="Indexing"><span [class]="service.seo.noindex ? 'badge badge-warning' : 'badge badge-success'">{{ service.seo.noindex ? 'Noindex' : 'Indexable' }}</span></td>
                <td class="actions">
                  <a class="btn btn-sm" [href]="service.publicUrl" target="_blank" rel="noopener">View<span class="sr-only"> {{ service.title }} on the website</span></a>
                  <a class="btn btn-sm" [routerLink]="['/content/seo', service.seoPageRef]">Edit SEO<span class="sr-only"> for {{ service.title }}</span></a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class ServicesComponent {
  private readonly api = inject(AdminApi);
  protected readonly items = signal<ServiceItem[] | null>(null);
  protected readonly error = signal('');

  constructor() {
    this.load();
  }
  protected load(): void {
    this.error.set('');
    this.api.get<{ items: ServiceItem[] }>('/services').subscribe({
      next: (res) => this.items.set(res.items),
      error: (err) => this.error.set(apiErrorMessage(err, 'Please try again.')),
    });
  }
}

@Component({
  selector: 'iha-seo-list',
  imports: [RouterLink, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>SEO</h1><p class="page-subtitle">Search and social metadata for each page of the public website.</p></div>
    </div>
    @if (error()) {
      <ih-error-state title="SEO pages could not be loaded" [message]="error()" (retry)="load()" />
    } @else if (!pages()) {
      <ih-skeleton [rows]="8" rowHeight="2.75rem" />
    } @else {
      <div class="table-wrap">
        <table class="data-table stacked">
          <caption class="sr-only">Pages and their SEO metadata</caption>
          <thead><tr><th scope="col">Page</th><th scope="col">Title</th><th scope="col">Description</th><th scope="col">Indexing</th><th scope="col">Canonical</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (page of pages()!; track page.pageRef) {
              <tr>
                <td data-label="Page"><div><span class="cell-title">{{ page.label }}</span><div class="cell-sub">{{ label(page.pageType) }}</div></div></td>
                <td data-label="Title">@if (page.seoTitle) { {{ page.seoTitle }} } @else { <span class="muted">Not set</span> }</td>
                <td data-label="Description">@if (page.metaDescription) { {{ page.metaDescription.length }} characters } @else { <span class="muted">Not set</span> }</td>
                <td data-label="Indexing"><span [class]="page.noindex ? 'badge badge-warning' : 'badge badge-success'">{{ page.noindex ? 'Noindex' : 'Indexable' }}</span></td>
                <td data-label="Canonical">@if (page.canonicalUrl) { <span class="cell-sub">{{ page.canonicalUrl }}</span> } @else { <span class="muted">Default</span> }</td>
                <td class="actions">
                  @if (page.publicUrl) { <a class="btn btn-sm" [href]="page.publicUrl" target="_blank" rel="noopener">View<span class="sr-only"> {{ page.label }} on the website</span></a> }
                  <a class="btn btn-sm" [routerLink]="['/content/seo', page.pageRef]">{{ page.actions.edit ? 'Edit' : 'Open' }}<span class="sr-only"> SEO for {{ page.label }}</span></a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
})
export class SeoListComponent {
  private readonly api = inject(AdminApi);
  protected readonly pages = signal<SeoPage[] | null>(null);
  protected readonly error = signal('');
  protected readonly label = humanize;

  constructor() {
    this.load();
  }
  protected load(): void {
    this.error.set('');
    this.api.get<SeoList>('/seo').subscribe({
      next: (list) => this.pages.set(list.items),
      error: (err) => this.error.set(apiErrorMessage(err, 'Please try again.')),
    });
  }
}

type Draft = Pick<SeoPage, 'seoTitle' | 'metaDescription' | 'keywords' | 'canonicalUrl' | 'ogTitle' | 'ogDescription' | 'ogImage' | 'twitterImage' | 'slug' | 'robots' | 'noindex' | 'schemaType'>;
const FIELDS: (keyof Draft)[] = ['seoTitle', 'metaDescription', 'keywords', 'canonicalUrl', 'ogTitle', 'ogDescription', 'ogImage', 'twitterImage', 'slug', 'robots', 'noindex', 'schemaType'];
const ROBOTS = ['index,follow', 'noindex,follow', 'index,nofollow', 'noindex,nofollow'];

@Component({
  selector: 'iha-seo-editor',
  imports: [FormsModule, RouterLink, DatePipe, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div>
        <p><a routerLink="/content/seo">← All pages</a></p>
        <h1>SEO: {{ page()?.label ?? '' }}</h1>
        <p class="page-subtitle"><span class="save-state" role="status">{{ saveState() }}</span></p>
      </div>
      @if (page()?.publicUrl; as url) { <div class="page-actions"><a class="btn" [href]="url" target="_blank" rel="noopener">View page</a></div> }
    </div>

    @if (loadError()) {
      <ih-error-state title="This page could not be loaded" [message]="loadError()" (retry)="fetch()" />
    } @else if (!page()) {
      <ih-skeleton [rows]="8" rowHeight="2.75rem" />
    } @else {
      @if (!canManage()) { <div class="alert alert-info">You can read this metadata but your role cannot change it.</div> }
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
      <form class="card" (ngSubmit)="save()" novalidate>
        <fieldset class="card-body stack" [disabled]="!canManage() || saving()">
          <legend class="card-title">Search results</legend>
          <div class="field">
            <label for="seoTitle">SEO title</label>
            <input id="seoTitle" name="seoTitle" maxlength="200" [(ngModel)]="draft.seoTitle" aria-describedby="seoTitle-hint" />
            <span class="hint" id="seoTitle-hint">{{ draft.seoTitle.length }} characters. Search engines usually show about 60.</span>
            @if (errors()['seoTitle']) { <span class="error">{{ errors()['seoTitle'] }}</span> }
          </div>
          <div class="field">
            <label for="metaDescription">Meta description</label>
            <textarea id="metaDescription" name="metaDescription" rows="3" maxlength="500" [(ngModel)]="draft.metaDescription" aria-describedby="metaDescription-hint"></textarea>
            <span class="hint" id="metaDescription-hint">{{ draft.metaDescription.length }} characters. Search engines usually show about 155.</span>
            @if (errors()['metaDescription']) { <span class="error">{{ errors()['metaDescription'] }}</span> }
          </div>
          <div class="form-grid">
            <div class="field"><label for="keywords">Keywords</label><input id="keywords" name="keywords" maxlength="500" [(ngModel)]="draft.keywords" /></div>
            <div class="field">
              <label for="canonicalUrl">Canonical URL</label>
              <input id="canonicalUrl" name="canonicalUrl" placeholder="https://immigrationhorizons.com/…" [(ngModel)]="draft.canonicalUrl" [attr.aria-invalid]="!!errors()['canonicalUrl']" />
              @if (errors()['canonicalUrl']) { <span class="error">{{ errors()['canonicalUrl'] }}</span> }
            </div>
            <div class="field">
              <label for="slug">Slug</label><input id="slug" name="slug" maxlength="200" [(ngModel)]="draft.slug" [attr.aria-invalid]="!!errors()['slug']" />
              @if (errors()['slug']) { <span class="error">{{ errors()['slug'] }}</span> }
            </div>
            <div class="field">
              <label for="schemaType">Schema type</label>
              <select id="schemaType" name="schemaType" [(ngModel)]="draft.schemaType">@for (t of schemaOptions(); track t) { <option [value]="t">{{ t }}</option> }</select>
              @if (errors()['schemaType']) { <span class="error">{{ errors()['schemaType'] }}</span> }
            </div>
            <div class="field">
              <label for="robots">Robots</label>
              <select id="robots" name="robots" [(ngModel)]="draft.robots">@for (r of robotsOptions(); track r) { <option [value]="r">{{ r }}</option> }</select>
              @if (errors()['robots']) { <span class="error">{{ errors()['robots'] }}</span> }
            </div>
          </div>
          <label class="check"><input type="checkbox" name="noindex" [(ngModel)]="draft.noindex" /> Ask search engines not to index this page (noindex)</label>
        </fieldset>
        <fieldset class="card-body stack" [disabled]="!canManage() || saving()">
          <legend class="card-title">Social sharing</legend>
          <div class="form-grid">
            <div class="field"><label for="ogTitle">Open Graph title</label><input id="ogTitle" name="ogTitle" maxlength="200" [(ngModel)]="draft.ogTitle" /></div>
            <div class="field">
              <label for="ogImage">Open Graph image</label><input id="ogImage" name="ogImage" placeholder="/uploads/… or https://…" [(ngModel)]="draft.ogImage" [attr.aria-invalid]="!!errors()['ogImage']" />
              @if (errors()['ogImage']) { <span class="error">{{ errors()['ogImage'] }}</span> }
            </div>
            <div class="field span-all"><label for="ogDescription">Open Graph description</label><textarea id="ogDescription" name="ogDescription" rows="2" maxlength="500" [(ngModel)]="draft.ogDescription"></textarea></div>
            <div class="field">
              <label for="twitterImage">Twitter image</label><input id="twitterImage" name="twitterImage" placeholder="/uploads/… or https://…" [(ngModel)]="draft.twitterImage" [attr.aria-invalid]="!!errors()['twitterImage']" />
              @if (errors()['twitterImage']) { <span class="error">{{ errors()['twitterImage'] }}</span> }
            </div>
          </div>
        </fieldset>
        @if (canManage()) {
          <div class="card-body form-actions">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save metadata' }}</button>
            @if (page()?.updatedAt; as at) { <span class="save-state">Last saved {{ at | date: 'medium' }}</span> }
          </div>
        }
      </form>
    }
  `,
  styles: `fieldset { border: 0; min-width: 0; } fieldset + fieldset { border-top: 1px solid var(--ih-border-light); } legend { float: left; width: 100%; } legend + * { clear: both; }`,
})
export class SeoEditorComponent implements HasUnsavedChanges {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AdminAuthService);

  readonly pageRef = input.required<string>();

  protected draft: Draft = { seoTitle: '', metaDescription: '', keywords: '', canonicalUrl: '', ogTitle: '', ogDescription: '', ogImage: '', twitterImage: '', slug: '', robots: 'index,follow', noindex: false, schemaType: 'WebPage' };
  private saved = '';
  private schemaTypes: string[] = [];
  protected readonly page = signal<SeoPage | null>(null);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly canManage = () => this.auth.hasCapability('seo.manage');
  // A legacy value outside the allowlist stays selectable, so opening and saving a page never silently changes it.
  protected readonly schemaOptions = () => [...new Set([...this.schemaTypes, this.draft.schemaType])];
  protected readonly robotsOptions = () => [...new Set([...ROBOTS, this.draft.robots])];

  constructor() {
    effect(() => { this.pageRef(); this.fetch(); });
  }

  hasUnsavedChanges(): boolean {
    return this.canManage() && !!this.page() && JSON.stringify(this.draft) !== this.saved;
  }
  protected saveState(): string {
    return this.saving() ? 'Saving…' : this.hasUnsavedChanges() ? 'Unsaved changes' : this.page()?.configured ? 'All changes saved' : '';
  }

  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  protected fetch(): void {
    this.loadError.set('');
    this.page.set(null);
    this.api.get<SeoList>('/seo').subscribe({ next: (list) => (this.schemaTypes = list.schemaTypes), error: () => undefined });
    this.api.get<SeoPage>(`/seo/${encodeURIComponent(this.pageRef())}`).subscribe({
      next: (page) => this.apply(page),
      error: (err) => this.loadError.set(apiErrorMessage(err, 'Please try again.')),
    });
  }

  private apply(page: SeoPage): void {
    this.draft = Object.fromEntries(FIELDS.map((field) => [field, page[field]])) as unknown as Draft;
    this.saved = JSON.stringify(this.draft);
    this.errors.set({});
    this.error.set('');
    this.page.set(page);
  }

  protected save(): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.put<SeoPage>(`/seo/${encodeURIComponent(this.pageRef())}`, this.draft).subscribe({
      next: (page) => {
        this.apply(page);
        this.saving.set(false);
        this.toast.success('SEO metadata saved.');
      },
      error: (err) => {
        this.errors.set(apiFieldErrors(err));
        this.error.set(apiErrorMessage(err, 'The metadata could not be saved.'));
        this.saving.set(false);
      },
    });
  }
}
