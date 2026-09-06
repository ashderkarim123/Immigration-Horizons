import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api/api.service';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'ih-tasks',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="page-header">
      <h1>My Tasks</h1>
      <p class="page-subtitle">Your assigned tasks</p>
    </div>

    <div class="section-card">
      @if (isLoading()) {
        <p>Loading tasks...</p>
      } @else {
        @if (tasks().length) {
          <table class="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              @for (t of tasks(); track t._id) {
                <tr>
                  <td>{{ t.title }}</td>
                  <td>{{ t.type }}</td>
                  <td><span class="badge">{{ t.status }}</span></td>
                  <td><span class="badge">{{ t.priority }}</span></td>
                  <td>{{ t.dueDate ? (t.dueDate | date) : 'None' }}</td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="empty-state">No tasks assigned.</p>
        }
      }
    </div>
  `,
  styleUrls: ['../dashboard/dashboard.scss']
})
export class TasksComponent implements OnInit {
  private api = inject(ApiService);
  
  tasks = signal<any[]>([]);
  isLoading = signal(true);

  ngOnInit() {
    this.api.get('/staff/tasks').subscribe({
      next: (res: any) => {
        this.tasks.set(res.data.items);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }
}
