import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'ih-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="not-found">
      <h1>404</h1>
      <p>The page you're looking for doesn't exist.</p>
      <a routerLink="/dashboard" class="back-link">Back to Dashboard</a>
    </div>
  `,
  styles: `
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      text-align: center;

      h1 {
        font-size: 4rem;
        font-weight: 800;
        color: var(--ih-gray-200);
        line-height: 1;
      }

      p {
        margin-top: var(--ih-space-3);
        color: var(--ih-text-secondary);
        font-size: var(--ih-font-size-base);
      }

      .back-link {
        margin-top: var(--ih-space-6);
        display: inline-flex;
        align-items: center;
        padding: var(--ih-space-2) var(--ih-space-5);
        background: var(--ih-brand-600);
        color: white;
        border-radius: var(--ih-radius-md);
        font-size: var(--ih-font-size-sm);
        font-weight: 500;
        transition: background var(--ih-transition-fast);

        &:hover {
          background: var(--ih-brand-700);
        }
      }
    }
  `,
})
export class NotFound {}
