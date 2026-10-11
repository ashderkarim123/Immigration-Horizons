import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

let nextId = 0;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible dialog: labelled, modal, closes on Escape, keeps Tab inside, and hands focus back to whatever opened it.
 * Body is projected; put actions in an element marked `modal-footer`.
 */
@Component({
  selector: 'iha-modal',
  template: `
    @if (open()) {
      <div class="modal-backdrop" (click)="dismissOnBackdrop() && closed.emit()">
        <div #card class="modal-card" [class.wide]="wide()" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId" tabindex="-1"
          (click)="$event.stopPropagation()" (keydown)="onKeydown($event)">
          <div class="modal-header">
            <h2 [id]="titleId">{{ title() }}</h2>
            <button type="button" class="btn-close" aria-label="Close dialog" (click)="closed.emit()">×</button>
          </div>
          <div class="modal-body"><ng-content /></div>
          <div class="modal-footer"><ng-content select="[modal-footer]" /></div>
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly wide = input(false);
  /** False for content that cannot be shown again (a one-time credential): a stray click must not lose it. */
  readonly dismissOnBackdrop = input(true);
  readonly closed = output<void>();

  protected readonly titleId = `iha-modal-${++nextId}`;
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private opener: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const card = this.card()?.nativeElement;
      if (card) {
        this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        card.focus();
      } else if (this.opener) {
        this.opener.focus();
        this.opener = null;
      }
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closed.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(this.card()!.nativeElement.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === this.card()!.nativeElement)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
  }
}
