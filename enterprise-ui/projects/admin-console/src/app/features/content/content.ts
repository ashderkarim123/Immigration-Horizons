import { Component } from '@angular/core';

@Component({
  selector: 'iha-content',
  standalone: true,
  template: `
    <div class="page-header">
      <h1>Content Management</h1>
      <p class="page-subtitle">Blog, FAQs, testimonials, and media</p>
    </div>
    <div class="empty-state">
      <h2>No content modules loaded</h2>
      <p>CMS content management will be migrated from the existing Express/EJS admin in Phase 17.</p>
      <p class="phase-note">This is a structural placeholder demonstrating the content route.</p>
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
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: var(--ih-space-16) var(--ih-space-6);
      background: var(--ih-bg-primary);
      border: 1px dashed var(--ih-border-medium);
      border-radius: var(--ih-radius-lg);
      h2 { font-size: var(--ih-font-size-lg); margin-bottom: var(--ih-space-2); }
      p { font-size: var(--ih-font-size-sm); color: var(--ih-text-secondary); max-width: 400px; }
    }
    .phase-note {
      margin-top: var(--ih-space-3);
      font-size: var(--ih-font-size-xs) !important;
      color: var(--ih-text-muted) !important;
    }
  `,
})
export class ContentPlaceholder {}
