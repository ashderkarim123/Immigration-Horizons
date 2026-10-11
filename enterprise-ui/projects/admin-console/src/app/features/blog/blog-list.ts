import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../../core/api/admin-api.service';
import { BlogList, BlogPost } from '../../core/api/admin.types';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { apiErrorMessage } from '../../core/errors/api-error';
import { ConfirmDialogComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent, ToastService } from '../../shared/staff-ui';

@Component({
  selector: 'iha-blog-list',
  imports: [FormsModule, RouterLink, DatePipe, ConfirmDialogComponent, EmptyStateComponent, ErrorStateComponent, PaginationComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div><h1>Blog</h1><p class="page-subtitle">Posts published on the public website.</p></div>
      @if (canManage()) { <div class="page-actions"><a class="btn btn-primary" routerLink="/content/blog/new">New post</a></div> }
    </div>

    <form class="filter-bar" role="search" (ngSubmit)="load(1)">
      <div class="field"><label for="blog-search">Search</label><input id="blog-search" name="search" type="search" placeholder="Title or excerpt" [(ngModel)]="search" /></div>
      <div class="field">
        <label for="blog-status">Status</label>
        <select id="blog-status" name="status" [(ngModel)]="status" (ngModelChange)="load(1)">
          <option value="">All</option><option value="published">Published</option><option value="draft">Draft</option>
        </select>
      </div>
      <div class="field">
        <label for="blog-category">Category</label>
        <select id="blog-category" name="category" [(ngModel)]="category" (ngModelChange)="load(1)">
          <option value="">All</option>
          @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
        </select>
      </div>
      <button type="submit" class="btn">Search</button>
    </form>

    @if (error()) {
      <ih-error-state title="Posts could not be loaded" [message]="error()" (retry)="load(page())" />
    } @else if (loading() && !posts().length) {
      <ih-skeleton [rows]="6" rowHeight="2.75rem" />
    } @else if (!posts().length) {
      <ih-empty-state title="No posts found" [description]="filtered() ? 'No post matches these filters.' : 'Write the first post to publish it on the website.'" />
    } @else {
      <div class="table-wrap" [attr.aria-busy]="loading()">
        <table class="data-table stacked">
          <caption class="sr-only">Blog posts</caption>
          <thead><tr><th scope="col">Post</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Publish date</th><th scope="col">Updated</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (post of posts(); track post.id) {
              <tr>
                <td data-label="Post"><div><a class="cell-title" [routerLink]="['/content/blog', post.id]">{{ post.title }}</a><div class="cell-sub">/blog/{{ post.slug }}</div></div></td>
                <td data-label="Category">{{ post.category }}</td>
                <td data-label="Status"><span [class]="post.published ? 'badge badge-success' : 'badge badge-neutral'">{{ post.published ? 'Published' : 'Draft' }}</span></td>
                <td data-label="Publish date">{{ post.publishDate ? (post.publishDate | date: 'mediumDate') : '—' }}</td>
                <td data-label="Updated">{{ post.updatedAt | date: 'mediumDate' }}</td>
                <td class="actions">
                  @if (post.previewUrl) { <a class="btn btn-sm" [href]="post.previewUrl" target="_blank" rel="noopener">View<span class="sr-only"> {{ post.title }} on the website</span></a> }
                  @if (post.actions.publish) {
                    <button type="button" class="btn btn-sm" [disabled]="busy() === post.id" (click)="setPublished(post, !post.published)">{{ post.published ? 'Unpublish' : 'Publish' }}<span class="sr-only"> {{ post.title }}</span></button>
                  }
                  @if (post.actions.delete) { <button type="button" class="btn btn-sm btn-danger" (click)="deleting.set(post)">Delete<span class="sr-only"> {{ post.title }}</span></button> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <ih-pagination [page]="page()" [totalPages]="totalPages()" [totalItems]="total()" (pageChange)="load($event)" />
    }

    <ih-confirm-dialog [isOpen]="!!deleting()" title="Delete this post?" [message]="'“' + (deleting()?.title ?? '') + '” will be removed from the website permanently.'"
      confirmText="Delete post" variant="danger" (confirmed)="remove()" (cancelled)="deleting.set(null)" />
  `,
})
export class BlogListComponent {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AdminAuthService);

  protected search = '';
  protected status = '';
  protected category = '';
  protected readonly posts = signal<BlogPost[]>([]);
  protected readonly categories = signal<string[]>([]);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal('');
  protected readonly deleting = signal<BlogPost | null>(null);
  protected readonly canManage = () => this.auth.hasCapability('blog.manage');
  protected readonly filtered = () => !!(this.search || this.status || this.category);

  constructor() {
    this.load(1);
  }

  protected load(page: number): void {
    this.loading.set(true);
    this.error.set('');
    this.api.get<BlogList>('/blog', { page, search: this.search.trim(), status: this.status, category: this.category }).subscribe({
      next: (list) => {
        this.posts.set(list.items);
        this.categories.set(list.categories);
        this.page.set(list.page);
        this.totalPages.set(list.totalPages);
        this.total.set(list.total);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiErrorMessage(err, 'Please try again.'));
        this.loading.set(false);
      },
    });
  }

  protected setPublished(post: BlogPost, published: boolean): void {
    this.busy.set(post.id);
    this.api.post<BlogPost>(`/blog/${post.id}/publish`, { published }).subscribe({
      next: (updated) => {
        this.posts.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
        this.toast.success(published ? 'Post published.' : 'Post moved back to draft.');
        this.busy.set('');
      },
      error: (err) => {
        this.toast.error(apiErrorMessage(err, 'The post could not be updated.'));
        this.busy.set('');
      },
    });
  }

  protected remove(): void {
    const post = this.deleting();
    if (!post) return;
    this.deleting.set(null);
    this.api.delete(`/blog/${post.id}`).subscribe({
      next: () => {
        this.toast.success('Post deleted.');
        this.load(this.posts().length === 1 && this.page() > 1 ? this.page() - 1 : this.page());
      },
      error: (err) => this.toast.error(apiErrorMessage(err, 'The post could not be deleted.')),
    });
  }
}
