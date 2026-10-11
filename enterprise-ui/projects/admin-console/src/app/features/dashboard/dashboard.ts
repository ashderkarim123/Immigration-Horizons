import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminApi } from '../../core/api/admin-api.service';
import { Dashboard } from '../../core/api/admin.types';
import { AdminAuthService } from '../../core/auth/admin-auth.service';
import { apiErrorMessage } from '../../core/errors/api-error';
import { ErrorStateComponent, SkeletonComponent } from '../../shared/staff-ui';
import { humanize } from '../../shared/widgets';

@Component({
  selector: 'iha-dashboard',
  imports: [RouterLink, DatePipe, ErrorStateComponent, SkeletonComponent],
  template: `
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        <p class="page-subtitle">Website content and platform administration@if (auth.currentAdmin(); as admin) { · signed in as {{ admin.name }} }</p>
      </div>
      @if (auth.hasCapability('blog.manage')) { <div class="page-actions"><a class="btn btn-primary" routerLink="/content/blog/new">New blog post</a></div> }
    </div>

    @if (error()) {
      <ih-error-state title="The dashboard could not be loaded" [message]="error()" (retry)="load()" />
    } @else if (!data()) {
      <ih-skeleton [rows]="4" rowHeight="4.5rem" />
    } @else {
      @let d = data()!;
      <section aria-label="Content totals" class="metrics">
        <a class="metric" routerLink="/content/blog">
          <span class="m-label">Blog posts</span><span class="m-value">{{ d.blog.total }}</span>
          <span class="m-note">{{ d.blog.published }} published · {{ d.blog.drafts }} drafts</span>
        </a>
        <a class="metric" routerLink="/content/faqs">
          <span class="m-label">FAQs</span><span class="m-value">{{ d.faqs.total }}</span><span class="m-note">{{ d.faqs.published }} published</span>
        </a>
        <a class="metric" routerLink="/content/testimonials">
          <span class="m-label">Testimonials</span><span class="m-value">{{ d.testimonials.total }}</span><span class="m-note">{{ d.testimonials.published }} published</span>
        </a>
        <a class="metric" routerLink="/content/media">
          <span class="m-label">Media items</span><span class="m-value">{{ d.media.total }}</span><span class="m-note">in the library</span>
        </a>
        <a class="metric" routerLink="/content/seo">
          <span class="m-label">SEO entries</span><span class="m-value">{{ d.seo.configuredPages }}</span><span class="m-note">pages with saved metadata</span>
        </a>
        @if (d.users) {
          <a class="metric" routerLink="/users">
            <span class="m-label">Active accounts</span><span class="m-value">{{ d.users.active }}</span><span class="m-note">employees who can sign in</span>
          </a>
        }
      </section>

      <div class="columns">
        <section class="card" aria-labelledby="recent-posts">
          <div class="card-body">
            <h2 class="card-title" id="recent-posts">Recently edited posts</h2>
            @if (!d.recentPosts.length) { <p class="muted">No blog posts yet.</p> }
            <ul class="list" role="list">
              @for (post of d.recentPosts; track post.id) {
                <li>
                  <a [routerLink]="['/content/blog', post.id]">{{ post.title }}</a>
                  <span class="badge" [class]="post.published ? 'badge badge-success' : 'badge badge-neutral'">{{ post.published ? 'Published' : 'Draft' }}</span>
                  <span class="cell-sub">{{ post.updatedAt | date: 'mediumDate' }}</span>
                </li>
              }
            </ul>
          </div>
        </section>

        @if (d.recentSecurityEvents; as events) {
          <section class="card" aria-labelledby="recent-events">
            <div class="card-body">
              <h2 class="card-title" id="recent-events">Recent security events</h2>
              @if (!events.length) { <p class="muted">Nothing recorded yet.</p> }
              <ul class="list" role="list">
                @for (event of events; track event.id) {
                  <li>
                    <span>{{ label(event.type) }}</span>
                    <span class="badge" [class]="event.result === 'success' ? 'badge badge-success' : 'badge badge-warning'">{{ label(event.result) }}</span>
                    <span class="cell-sub">{{ event.actorName || event.subjectEmail || '—' }} · {{ event.createdAt | date: 'short' }}</span>
                  </li>
                }
              </ul>
              <p><a routerLink="/security">Open the security record</a></p>
            </div>
          </section>
        }
      </div>
      <p class="cell-sub asof">Figures as of {{ d.asOf | date: 'medium' }}.</p>
    }
  `,
  styles: `
    .metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(12.5rem, 1fr)); gap: var(--ih-space-4); margin-bottom: var(--ih-space-6); }
    .metric { display: flex; flex-direction: column; gap: 2px; padding: var(--ih-space-4) var(--ih-space-5); background: #fff; border: 1px solid var(--ih-border-light); border-top: 3px solid var(--ih-brand-900); border-radius: var(--ih-radius-lg); text-decoration: none; color: inherit; }
    .metric:hover { border-top-color: var(--ih-accent-500); box-shadow: var(--ih-shadow-md); }
    .m-label { font-size: var(--ih-font-size-xs); font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ih-text-secondary); }
    .m-value { font-size: 2rem; font-weight: 700; line-height: 1.15; color: var(--ih-brand-900); }
    .m-note { font-size: var(--ih-font-size-xs); color: var(--ih-text-muted); }
    .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(20rem, 1fr)); gap: var(--ih-space-4); }
    .list { list-style: none; display: flex; flex-direction: column; }
    .list li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.6rem 0; border-bottom: 1px solid var(--ih-border-light); }
    .list li:last-child { border-bottom: 0; }
    .list .cell-sub { margin-left: auto; }
    .asof { margin-top: var(--ih-space-4); }
  `,
})
export class AdminDashboard {
  private readonly api = inject(AdminApi);
  protected readonly auth = inject(AdminAuthService);
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly error = signal('');
  protected readonly label = humanize;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.error.set('');
    this.api.get<Dashboard>('/dashboard').subscribe({
      next: (data) => this.data.set(data),
      error: (err) => this.error.set(apiErrorMessage(err, 'Please try again.')),
    });
  }
}
