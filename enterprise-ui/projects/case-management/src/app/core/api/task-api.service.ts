import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiResponse, ApiService } from './api.service';
import { TaskFields, TaskItem, TaskStatus } from './task.types';

/** Every call answers with the refreshed TaskItem, so callers replace the row instead of merging. */
@Injectable({ providedIn: 'root' })
export class TaskApi {
  private api = inject(ApiService);

  create(caseId: string, fields: TaskFields & { assignee?: string | null }): Observable<ApiResponse<TaskItem>> {
    return this.api.post<TaskItem>(`/staff/cases/${caseId}/tasks`, fields);
  }

  update(id: string, fields: TaskFields): Observable<ApiResponse<TaskItem>> {
    return this.api.patch<TaskItem>(`/staff/tasks/${id}`, fields);
  }

  setStatus(id: string, status: TaskStatus): Observable<ApiResponse<TaskItem>> {
    return this.api.patch<TaskItem>(`/staff/tasks/${id}/status`, { status });
  }

  assign(id: string, assignee: string | null): Observable<ApiResponse<TaskItem>> {
    return this.api.patch<TaskItem>(`/staff/tasks/${id}/assignee`, { assignee });
  }
}
