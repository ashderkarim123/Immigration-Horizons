import { Component, input } from '@angular/core';

@Component({
  selector: 'ih-empty-state',
  standalone: true,
  template: `
    <div class="empty-state">
      <div class="empty-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 class="empty-title">{{ title() }}</h3>
      @if (description()) {
        <p class="empty-description">{{ description() }}</p>
      }
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem;
      text-align: center;
      background: white;
      border: 1px dashed #d1d5db;
      border-radius: 0.5rem;
      color: #6b7280;
    }
    .empty-icon {
      color: #9ca3af;
      margin-bottom: 0.75rem;
    }
    .empty-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #374151;
      margin: 0 0 0.25rem 0;
    }
    .empty-description {
      font-size: 0.875rem;
      color: #6b7280;
      margin: 0 0 1rem 0;
      max-width: 24rem;
    }
  `]
})
export class EmptyStateComponent {
  title = input<string>('No records found');
  description = input<string>('There are no records matching your request.');
}
