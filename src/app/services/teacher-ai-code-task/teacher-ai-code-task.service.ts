import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AiCodeTaskApplyResult,
  AiCodeTaskJobDto,
  AiCodeTaskProposal,
  AiCodeTaskQuotaDto,
  AiCodeTaskStartRequest,
  AiCodeTaskStartResult,
  AiCodeTaskValidateResult,
} from '../../models/ai-code-task.model';

@Injectable({ providedIn: 'root' })
export class TeacherAiCodeTaskService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;
  /** Az ebben a munkamenetben „Elvetés”-sel félretett jobok - ezekhez nyitáskor nem kapcsolódunk vissza magától. */
  private readonly dismissed = new Set<number>();

  getQuota(): Observable<AiCodeTaskQuotaDto> {
    return this.http.get<AiCodeTaskQuotaDto>(`${this.baseUrl}/ai-code-task/quota`);
  }

  startJob(taskSetId: number, request: AiCodeTaskStartRequest): Observable<AiCodeTaskStartResult> {
    return this.http.post<AiCodeTaskStartResult>(`${this.taskSetUrl(taskSetId)}/jobs`, request);
  }

  getJob(taskSetId: number, jobId: number): Observable<AiCodeTaskJobDto> {
    return this.http.get<AiCodeTaskJobDto>(`${this.taskSetUrl(taskSetId)}/jobs/${jobId}`);
  }

  /** Újraellenőrzés MI nélkül; a válasz normalizált javaslatát kell később pontosan így menteni. */
  validate(taskSetId: number, jobId: number, proposal: AiCodeTaskProposal): Observable<AiCodeTaskValidateResult> {
    return this.http.post<AiCodeTaskValidateResult>(`${this.taskSetUrl(taskSetId)}/validate`, { jobId, proposal });
  }

  apply(taskSetId: number, jobId: number, proposal: AiCodeTaskProposal): Observable<AiCodeTaskApplyResult> {
    return this.http.post<AiCodeTaskApplyResult>(`${this.taskSetUrl(taskSetId)}/apply`, { jobId, proposal });
  }

  /** A tanár futó vagy elkészült, még nem mentett jobja ezen a feladatsoron (204 = nincs). Visszakapcsolódáshoz (újratöltés után is). */
  getActiveJob(taskSetId: number): Observable<AiCodeTaskJobDto | null> {
    return this.http
      .get<AiCodeTaskJobDto>(`${this.taskSetUrl(taskSetId)}/jobs/active`, { observe: 'response' })
      .pipe(map((res) => (res.status === 204 ? null : res.body)));
  }

  dismiss(jobId: number): void {
    this.dismissed.add(jobId);
  }

  isDismissed(jobId: number): boolean {
    return this.dismissed.has(jobId);
  }

  private taskSetUrl(taskSetId: number): string {
    return `${this.baseUrl}/task-sets/${taskSetId}/ai-code-task`;
  }
}
