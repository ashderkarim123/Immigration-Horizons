import { Component, input, output } from '@angular/core';

@Component({
  selector: 'ih-error-state',
  standalone: true,
  template: `
    <div class="error-state" role="alert">
      <div class="error-icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <h3 class="error-title">{{ title() }}</h3>
      <p class="error-message">{{ message() }}</p>
      @if (retryable()) {
        <button type="button" class="btn-retry" (click)="retry.emit()">
          Try Again
        </button>
      }
    </div>
  `,
  styles: [`
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1.5rem;
      text-align: center;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 0.5rem;
    }
    .error-icon { margin-bottom: 0.75rem; }
    .error-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #991b1b;
      margin: 0 0 0.25rem 0;
    }
    .error-message {
      font-size: 0.875rem;
      color: #7f1d1d;
      margin: 0 0 1rem 0;
      max-width: 24rem;
    }
    .btn-retry {
      padding: 0.5rem 1rem;
      background: #dc2626;
      color: white;
      border: none;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }
    .btn-retry:hover { background: #b91c1c; }
  `]
})
export class ErrorStateComponent {
  title = input<string>('Unable to load data');
  message = input<string>('An error occurred while loading this section. Please try again.');
  retryable = input<boolean>(true);
  retry = output<void>();
}
