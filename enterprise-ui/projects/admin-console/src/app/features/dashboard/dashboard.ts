import { Component, inject } from '@angular/core';
import { AdminAuthService } from '../../core/auth/admin-auth.service';

@Component({
  selector: 'iha-dashboard',
  template: `
    <div class="page-header">
      <div>
        <h1>Dashboard</h1>
        @if (auth.currentAdmin(); as admin) { <p class="page-subtitle">Signed in as {{ admin.name }} · {{ admin.role.label }}</p> }
      </div>
    </div>
  `,
})
export class AdminDashboard {
  protected readonly auth = inject(AdminAuthService);
}
