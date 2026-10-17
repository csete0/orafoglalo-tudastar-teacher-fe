import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AiCodeTaskApplyResult,
  AiCodeTaskJobDto,
  AiCodeTaskMode,
  AiCodeTaskProposal,
  AiCodeTaskQuotaDto,
  AiCodeTaskStartRequest,
  AiCodeTaskStartResult,
  AiCodeTaskValidateResult,
} from '../../models/ai-code-task.model';

/** Egy elindított, még nem mentett AI-feladat - a párbeszédablak bezárása után is megnyitható újra (a job a háttérben fut tovább). */
export interface RememberedAiJob {
  jobId: number;
  mode: AiCodeTaskMode;
  taskId: number | null;
  taskTitle: string | null;
}

@Injectable({ providedIn: 'root' })
export class TeacherAiCodeTaskService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;
  /** Feladatsoronként az utoljára indított job (memóriában, az oldal újratöltéséig). */
  private readonly remembered = new Map<number, RememberedAiJob>();

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

  rememberedJob(taskSetId: number): RememberedAiJob | null {
    return this.remembered.get(taskSetId) ?? null;
  }

  remember(taskSetId: number, job: RememberedAiJob): void {
    this.remembered.set(taskSetId, job);
  }

  forget(taskSetId: number, jobId: number): void {
    if (this.remembered.get(taskSetId)?.jobId === jobId) this.remembered.delete(taskSetId);
  }

  private taskSetUrl(taskSetId: number): string {
    return `${this.baseUrl}/task-sets/${taskSetId}/ai-code-task`;
  }
}
