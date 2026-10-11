import { Injectable, inject, signal } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges { hasUnsavedChanges(): boolean }

/** Holds the pending "leave without saving?" question; the shell renders the dialog and answers it. */
@Injectable({ providedIn: 'root' })
export class UnsavedChangesService {
  readonly asking = signal(false);
  private resolve: ((leave: boolean) => void) | null = null;

  confirm(): Promise<boolean> {
    this.asking.set(true);
    return new Promise((resolve) => { this.resolve = resolve; });
  }
  answer(leave: boolean): void {
    this.asking.set(false);
    this.resolve?.(leave);
    this.resolve = null;
  }
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) =>
  (component?.hasUnsavedChanges?.() ? inject(UnsavedChangesService).confirm() : true);
