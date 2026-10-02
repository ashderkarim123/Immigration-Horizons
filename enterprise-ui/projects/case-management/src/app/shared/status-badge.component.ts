import { Component, input, computed } from '@angular/core';

@Component({
  selector: 'ih-status-badge',
  standalone: true,
  template: `
    <span [class]="badgeClass()" [attr.aria-label]="label()">
      {{ formattedLabel() }}
    </span>
  `,
  styles: [`
    :host { display: inline-block; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
      line-height: 1;
    }
    .badge-info { background-color: #e0f2fe; color: #0369a1; }
    .badge-success { background-color: #dcfce7; color: #15803d; }
    .badge-warning { background-color: #fef3c7; color: #b45309; }
    .badge-danger { background-color: #fee2e2; color: #b91c1c; }
    .badge-neutral { background-color: #f3f4f6; color: #4b5563; }
    .badge-purple { background-color: #f3e8ff; color: #6b21a8; }
  `]
})
export class StatusBadgeComponent {
  status = input.required<string>();
  variant = input<'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'purple' | 'auto'>('auto');

  label = computed(() => this.status());

  formattedLabel = computed(() => {
    const s = this.status() || '';
    return s.replace(/_/g, ' ');
  });

  badgeClass = computed(() => {
    let v = this.variant();
    if (v === 'auto') {
      const s = (this.status() || '').toLowerCase();
      if (['active', 'approved', 'completed', 'active_case'].includes(s)) v = 'success';
      else if (['pending', 'in_progress', 'processing', 'initial_review', 'document_collection'].includes(s)) v = 'info';
      else if (['on_hold', 'under_review', 'paused'].includes(s)) v = 'warning';
      else if (['archived', 'closed', 'rejected', 'denied', 'inactive', 'locked'].includes(s)) v = 'danger';
      else if (['decision_pending', 'submitted'].includes(s)) v = 'purple';
      else v = 'neutral';
    }
    return `badge badge-${v}`;
  });
}
