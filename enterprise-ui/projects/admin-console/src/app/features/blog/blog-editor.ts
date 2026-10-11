import { DatePipe } from '@angular/common';
import { Component, HostListener, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AdminApi } from '../../core/api/admin-api.service';
import { BlogList, BlogPost, MediaItem } from '../../core/api/admin.types';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { apiErrorMessage, apiFieldErrors } from '../../core/errors/api-error';
import { HasUnsavedChanges } from '../../core/guards/unsaved-changes.guard';
import { MediaPickerComponent } from '../../shared/media-picker.component';
import { RichTextComponent } from '../../shared/rich-text.component';
import { ConfirmDialogComponent, ErrorStateComponent, SkeletonComponent, ToastService } from '../../shared/staff-ui';

interface Draft { title: string; slug: string; category: string; excerpt: string; content: string; coverImage: string; author: string; tags: string; readingTime: number; publishDate: string }
const EMPTY: Draft = { title: '', slug: '', category: 'Immigration Tips', excerpt: '', content: '', coverImage: '', author: '', tags: '', readingTime: 0, publishDate: '' };

/** ISO instant -> the value a datetime-local input shows in the browser's own zone, and back. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (local: string) => (local ? new Date(local).toISOString() : null);

@Component({
  selector: 'iha-blog-editor',
  imports: [FormsModule, RouterLink, DatePipe, RichTextComponent, MediaPickerComponent, ConfirmDialogComponent, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div>
        <p><a routerLink="/content/blog">← All posts</a></p>
        <h1>{{ id() ? 'Edit post' : 'New post' }}</h1>
        <p class="page-subtitle">
          <span [class]="published() ? 'badge badge-success' : 'badge badge-neutral'">{{ published() ? 'Published' : 'Draft' }}</span>
          <span class="save-state" role="status">{{ saveState() }}</span>
        </p>
      </div>
      <div class="page-actions">
        @if (post()?.previewUrl; as url) { <a class="btn" [href]="url" target="_blank" rel="noopener">View on website</a> }
        @if (id() && canManage()) { <button type="button" class="btn btn-danger" (click)="confirmingDelete.set(true)">Delete</button> }
      </div>
    </div>

    @if (loadError()) {
      <ih-error-state title="This post could not be loaded" [message]="loadError()" (retry)="fetch()" />
    } @else if (loading()) {
      <ih-skeleton [rows]="8" rowHeight="2.75rem" />
    } @else {
      @if (!canManage()) { <div class="alert alert-info">You can read this post but your role cannot change it.</div> }
      @if (error()) { <div class="alert alert-error" role="alert">{{ error() }}</div> }
      <form class="card" (ngSubmit)="save()" novalidate>
        <fieldset class="card-body stack" [disabled]="!canManage() || saving()">
          <legend class="sr-only">Post details</legend>
          <div class="field">
            <label for="title">Title</label>
            <input id="title" name="title" maxlength="200" required [(ngModel)]="draft.title" [attr.aria-invalid]="!!errors()['title']" [attr.aria-describedby]="errors()['title'] ? 'title-error' : null" />
            @if (errors()['title']) { <span class="error" id="title-error">{{ errors()['title'] }}</span> }
          </div>
          <div class="form-grid">
            <div class="field">
              <label for="slug">Slug</label>
              <input id="slug" name="slug" maxlength="200" [(ngModel)]="draft.slug" [attr.aria-invalid]="!!errors()['slug']" aria-describedby="slug-hint" />
              <span class="hint" id="slug-hint">Lowercase letters, numbers and hyphens. Leave blank to make one from the title.</span>
              @if (errors()['slug']) { <span class="error">{{ errors()['slug'] }}</span> }
            </div>
            <div class="field">
              <label for="category">Category</label>
              <select id="category" name="category" [(ngModel)]="draft.category">
                @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
              </select>
              @if (errors()['category']) { <span class="error">{{ errors()['category'] }}</span> }
            </div>
          </div>
          <div class="field">
            <label for="excerpt">Excerpt</label>
            <textarea id="excerpt" name="excerpt" rows="2" maxlength="300" required [(ngModel)]="draft.excerpt" [attr.aria-invalid]="!!errors()['excerpt']" aria-describedby="excerpt-hint"></textarea>
            <span class="hint" id="excerpt-hint">{{ draft.excerpt.length }} / 300 characters</span>
            @if (errors()['excerpt']) { <span class="error">{{ errors()['excerpt'] }}</span> }
          </div>
          <div class="field">
            <span class="label" id="content-label">Content</span>
            <iha-rich-text label="Content" [(value)]="draft.content" (imageRequested)="picking.set('content')" />
            <span class="hint">Formatting is limited to headings, paragraphs, lists, quotes, links and images. Anything else is removed when the post is saved.</span>
            @if (errors()['content']) { <span class="error">{{ errors()['content'] }}</span> }
          </div>
          <div class="field">
            <label for="coverImage">Cover image</label>
            <div class="row">
              <input id="coverImage" name="coverImage" type="text" placeholder="/uploads/… or https://…" [(ngModel)]="draft.coverImage" [attr.aria-invalid]="!!errors()['coverImage']" style="flex:1" />
              <button type="button" class="btn" (click)="picking.set('cover')">Choose from Media</button>
            </div>
            @if (draft.coverImage) { <img class="cover" [src]="draft.coverImage" alt="Cover image preview" loading="lazy" /> }
            @if (errors()['coverImage']) { <span class="error">{{ errors()['coverImage'] }}</span> }
          </div>
          <div class="form-grid">
            <div class="field"><label for="author">Author</label><input id="author" name="author" maxlength="120" placeholder="Immigration Horizons Team" [(ngModel)]="draft.author" /></div>
            <div class="field">
              <label for="tags">Tags</label><input id="tags" name="tags" [(ngModel)]="draft.tags" aria-describedby="tags-hint" />
              <span class="hint" id="tags-hint">Separate tags with commas.</span>
              @if (errors()['tags']) { <span class="error">{{ errors()['tags'] }}</span> }
            </div>
            <div class="field">
              <label for="readingTime">Reading time (minutes)</label><input id="readingTime" name="readingTime" type="number" min="0" max="600" [(ngModel)]="draft.readingTime" />
              @if (errors()['readingTime']) { <span class="error">{{ errors()['readingTime'] }}</span> }
            </div>
            <div class="field">
              <label for="publishDate">Publish date</label>
              <input id="publishDate" name="publishDate" type="datetime-local" [(ngModel)]="draft.publishDate" aria-describedby="publish-hint" />
              <span class="hint" id="publish-hint">In your local time. A published post with a future date stays hidden until then.</span>
              @if (errors()['publishDate']) { <span class="error">{{ errors()['publishDate'] }}</span> }
            </div>
          </div>
        </fieldset>
        @if (canManage()) {
          <div class="card-body form-actions">
            <button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Saving…' : published() ? 'Save changes' : 'Save draft' }}</button>
            @if (published()) { <button type="button" class="btn" [disabled]="saving()" (click)="save(false)">Unpublish</button> }
            @else { <button type="button" class="btn btn-gold" [disabled]="saving()" (click)="save(true)">Publish</button> }
            @if (post(); as p) { <span class="save-state">Last saved {{ p.updatedAt | date: 'medium' }}</span> }
          </div>
        }
      </form>
    }

    <iha-media-picker [open]="!!picking()" (picked)="onPicked($event)" (closed)="picking.set('')" />
    <ih-confirm-dialog [isOpen]="confirmingDelete()" title="Delete this post?" message="The post will be removed from the website permanently."
      confirmText="Delete post" variant="danger" (confirmed)="remove()" (cancelled)="confirmingDelete.set(false)" />
  `,
  styles: `
    .cover { max-width: 16rem; max-height: 9rem; margin-top: 0.5rem; border-radius: var(--ih-radius-md); border: 1px solid var(--ih-border-light); object-fit: cover; }
    fieldset { border: 0; min-width: 0; }
    .page-subtitle { display: flex; align-items: center; gap: 0.6rem; }
  `,
})
export class BlogEditorComponent implements HasUnsavedChanges {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AdminAuthService);

  /** Route parameter; absent on /content/blog/new. */
  readonly id = input<string>();

  protected draft: Draft = { ...EMPTY };
  private saved = JSON.stringify(EMPTY);
  protected readonly post = signal<BlogPost | null>(null);
  protected readonly categories = signal<string[]>(['Immigration Tips']);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly picking = signal<'' | 'cover' | 'content'>('');
  protected readonly confirmingDelete = signal(false);
  protected readonly published = computed(() => !!this.post()?.published);
  protected readonly canManage = () => this.auth.hasCapability('blog.manage');
  private readonly editor = viewChild(RichTextComponent);

  constructor() {
    effect(() => { this.id(); this.fetch(); });
  }

  hasUnsavedChanges(): boolean {
    return this.canManage() && JSON.stringify(this.draft) !== this.saved;
  }
  protected saveState(): string {
    return this.saving() ? 'Saving…' : this.hasUnsavedChanges() ? 'Unsaved changes' : this.post() ? 'All changes saved' : '';
  }

  @HostListener('window:beforeunload', ['$event'])
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) event.preventDefault();
  }

  protected fetch(): void {
    this.loading.set(true);
    this.loadError.set('');
    // The category list is server-owned; one cheap list call supplies it for new and existing posts alike.
    this.api.get<BlogList>('/blog', { limit: 1 }).subscribe({ next: (list) => this.categories.set(list.categories), error: () => undefined });
    const id = this.id();
    if (!id) {
      this.apply(null);
      return;
    }
    this.api.get<BlogPost>(`/blog/${id}`).subscribe({
      next: (post) => this.apply(post),
      error: (err) => {
        this.loadError.set(apiErrorMessage(err, 'Please try again.'));
        this.loading.set(false);
      },
    });
  }

  private apply(post: BlogPost | null): void {
    this.post.set(post);
    this.draft = post
      ? { title: post.title, slug: post.slug, category: post.category, excerpt: post.excerpt, content: post.content ?? '', coverImage: post.coverImage, author: post.author, tags: post.tags.join(', '), readingTime: post.readingTime, publishDate: toLocalInput(post.publishDate) }
      : { ...EMPTY };
    this.saved = JSON.stringify(this.draft);
    this.errors.set({});
    this.error.set('');
    this.loading.set(false);
  }

  /** `publish` undefined keeps the current state; true/false changes it as part of the same save. */
  protected save(publish?: boolean): void {
    if (this.saving()) return;
    const d = this.draft;
    const body: Record<string, unknown> = {
      title: d.title, slug: d.slug.trim(), category: d.category, excerpt: d.excerpt, content: d.content, coverImage: d.coverImage.trim(), author: d.author,
      tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean), readingTime: Math.trunc(Number(d.readingTime)) || 0,
    };
    // Only when the editor actually changed it: the input has minute precision and must not round a stored instant.
    if (d.publishDate !== toLocalInput(this.post()?.publishDate ?? null)) body['publishDate'] = fromLocalInput(d.publishDate);
    if (publish !== undefined) body['published'] = publish;
    this.saving.set(true);
    this.error.set('');
    const id = this.id();
    (id ? this.api.patch<BlogPost>(`/blog/${id}`, body) : this.api.post<BlogPost>('/blog', body)).subscribe({
      next: (post) => {
        this.apply(post);
        this.saving.set(false);
        this.toast.success(publish === true ? 'Post published.' : publish === false ? 'Post moved back to draft.' : 'Post saved.');
        if (!id) void this.router.navigate(['/content/blog', post.id], { replaceUrl: true });
      },
      error: (err) => {
        this.errors.set(apiFieldErrors(err));
        this.error.set(apiErrorMessage(err, 'The post could not be saved.'));
        this.saving.set(false);
      },
    });
  }

  protected onPicked(item: MediaItem): void {
    if (this.picking() === 'cover') this.draft.coverImage = item.url;
    else this.editor()?.insertImage(item.url, item.altText);
    this.picking.set('');
  }

  protected remove(): void {
    this.confirmingDelete.set(false);
    this.api.delete(`/blog/${this.id()}`).subscribe({
      next: () => {
        this.saved = JSON.stringify(this.draft); // nothing left to lose
        this.toast.success('Post deleted.');
        void this.router.navigate(['/content/blog']);
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'The post could not be deleted.')),
    });
  }
}
