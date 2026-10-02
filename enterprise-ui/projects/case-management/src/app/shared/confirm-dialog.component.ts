import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'ih-confirm-dialog',
  standalone: true,
  imports: [FormsModule],
  template: `
    @if (isOpen()) {
      <div class="modal-backdrop" (click)="onCancel()">
        <div class="modal-card" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" [attr.aria-label]="title()">
          <div class="modal-header">
            <h3 class="modal-title">{{ title() }}</h3>
            <button type="button" class="btn-close" (click)="onCancel()" aria-label="Close">×</button>
          </div>

          <div class="modal-body">
            <p>{{ message() }}</p>

            @if (requireMatch()) {
              <div class="match-group">
                <label for="matchInput">
                  Type <strong>{{ requireMatch() }}</strong> to confirm:
                </label>
                <input
                  id="matchInput"
                  type="text"
                  class="input-match"
                  [ngModel]="matchText()"
                  (ngModelChange)="matchText.set($event)"
                  placeholder="Type to confirm"
                  autocomplete="off"
                />
              </div>
            }
          </div>

          <div class="modal-footer">
            <button type="button" class="btn-cancel" (click)="onCancel()">
              Cancel
            </button>
            <button
              type="button"
              [class]="confirmButtonClass()"
              [disabled]="isConfirmDisabled()"
              (click)="onConfirm()"
            >
              {{ confirmText() }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-card {
      background: white;
      border-radius: 0.5rem;
      width: 100%;
      max-width: 28rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #e5e7eb;
    }
    .modal-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #111827;
      margin: 0;
    }
    .btn-close {
      background: transparent;
      border: none;
      font-size: 1.25rem;
      color: #6b7280;
      cursor: pointer;
    }
    .modal-body {
      padding: 1.25rem;
      font-size: 0.875rem;
      color: #374151;
    }
    .match-group {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .input-match {
      padding: 0.5rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      width: 100%;
    }
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
      padding: 1rem 1.25rem;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
    }
    .btn-cancel {
      padding: 0.5rem 1rem;
      border: 1px solid #d1d5db;
      border-radius: 0.375rem;
      background: white;
      color: #374151;
      font-size: 0.875rem;
      cursor: pointer;
    }
    .btn-primary {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.375rem;
      background: #2563eb;
      color: white;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }
    .btn-danger {
      padding: 0.5rem 1rem;
      border: none;
      border-radius: 0.375rem;
      background: #dc2626;
      color: white;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `]
})
export class ConfirmDialogComponent {
  isOpen = input<boolean>(false);
  title = input<string>('Confirm Action');
  message = input<string>('Are you sure you want to proceed?');
  confirmText = input<string>('Confirm');
  variant = input<'primary' | 'danger'>('primary');
  requireMatch = input<string | null>(null);

  confirmed = output<void>();
  cancelled = output<void>();

  matchText = signal<string>('');

  confirmButtonClass() {
    return this.variant() === 'danger' ? 'btn-danger' : 'btn-primary';
  }

  isConfirmDisabled() {
    const match = this.requireMatch();
    if (match) {
      return this.matchText().trim() !== match.trim();
    }
    return false;
  }

  onConfirm(): void {
    if (!this.isConfirmDisabled()) {
      this.confirmed.emit();
      this.matchText.set('');
    }
  }

  onCancel(): void {
    this.cancelled.emit();
    this.matchText.set('');
  }
}
