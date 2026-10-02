import { Component } from '@angular/core';

@Component({
  selector: 'iha-dashboard',
  standalone: true,
  template: `
    <div class="page-header">
      <h1>Admin Dashboard</h1>
      <p class="page-subtitle">Platform administration overview</p>
    </div>
    <div class="placeholder-grid">
      <div class="placeholder-card">
        <h3>Website Analytics</h3>
        <p>Site analytics will be available once the admin API is connected.</p>
      </div>
      <div class="placeholder-card">
        <h3>Content Management</h3>
        <p>Blog, FAQ, and testimonial management will be migrated in Phase 17.</p>
      </div>
      <div class="placeholder-card">
        <h3>User Administration</h3>
        <p>User and role management will be available in Phase 18.</p>
      </div>
      <div class="placeholder-card">
        <h3>Security Events</h3>
        <p>Security event viewing will be implemented in Phase 18.</p>
      </div>
    </div>
  `,
  styles: `
    .page-header {
      margin-bottom: var(--ih-space-8);
      h1 { font-size: var(--ih-font-size-2xl); font-weight: 700; }
    }
    .page-subtitle {
      font-size: var(--ih-font-size-sm);
      color: var(--ih-text-secondary);
      margin-top: var(--ih-space-1);
    }
    .placeholder-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--ih-space-5);
    }
    .placeholder-card {
      background: var(--ih-bg-primary);
      border: 1px solid var(--ih-border-light);
      border-radius: var(--ih-radius-lg);
      padding: var(--ih-space-6);
      transition: box-shadow var(--ih-transition-fast);
      &:hover { box-shadow: var(--ih-shadow-md); }
      h3 { font-size: var(--ih-font-size-base); font-weight: 600; margin-bottom: var(--ih-space-2); }
      p { font-size: var(--ih-font-size-sm); color: var(--ih-text-secondary); line-height: 1.5; }
    }
  `,
})
export class AdminDashboard {}
