import { Component, input } from '@angular/core';

@Component({
  selector: 'ih-skeleton',
  standalone: true,
  template: `
    <div class="skeleton-container" [style.height]="height()" [style.width]="width()">
      @for (row of rowsArray(); track $index) {
        <div class="skeleton-row" [style.height]="rowHeight()"></div>
      }
    </div>
  `,
  styles: [`
    .skeleton-container {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
    }
    .skeleton-row {
      width: 100%;
      background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
      background-size: 200% 100%;
      border-radius: 0.375rem;
      animation: skeleton-shimmer 1.5s infinite;
    }
    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `]
})
export class SkeletonComponent {
  rows = input<number>(3);
  rowHeight = input<string>('2rem');
  height = input<string>('auto');
  width = input<string>('100%');

  rowsArray() {
    return Array(this.rows()).fill(0);
  }
}
