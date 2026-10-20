import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DesktopTaskApplyResult,
  DesktopTaskJobDto,
  DesktopTaskProposal,
  DesktopTaskStartRequest,
  DesktopTaskStartResult,
} from '../../models/desktop-task.model';

/** Asztali (WPF/WinForms) feladatsor témából - a TeacherDesktopTaskController végpontjai. A keret a közös ai-helpers/quota `desktopTask` mezője. */
@Injectable({ providedIn: 'root' })
export class TeacherDesktopTaskService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher/task-sets`;

  startJob(taskSetId: number, request: DesktopTaskStartRequest): Observable<DesktopTaskStartResult> {
    return this.http.post<DesktopTaskStartResult>(`${this.url(taskSetId)}/jobs`, request);
  }

  getJob(taskSetId: number, jobId: number): Observable<DesktopTaskJobDto> {
    return this.http.get<DesktopTaskJobDto>(`${this.url(taskSetId)}/jobs/${jobId}`);
  }

  /** A tanár futó vagy elkészült, még nem mentett jobja ezen a feladatsoron (204 = nincs). */
  getActiveJob(taskSetId: number): Observable<DesktopTaskJobDto | null> {
    return this.http
      .get<DesktopTaskJobDto>(`${this.url(taskSetId)}/jobs/active`, { observe: 'response' })
      .pipe(map((res) => (res.status === 204 ? null : res.body)));
  }

  dismiss(taskSetId: number, jobId: number): Observable<void> {
    return this.http.post<void>(`${this.url(taskSetId)}/jobs/${jobId}/dismiss`, null);
  }

  apply(taskSetId: number, jobId: number, proposal: DesktopTaskProposal): Observable<DesktopTaskApplyResult> {
    return this.http.post<DesktopTaskApplyResult>(`${this.url(taskSetId)}/apply`, { jobId, proposal });
  }

  private url(taskSetId: number): string {
    return `${this.baseUrl}/${taskSetId}/desktop-task`;
  }
}
