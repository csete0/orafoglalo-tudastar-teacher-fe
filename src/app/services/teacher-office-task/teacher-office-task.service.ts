import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OfficeTaskApplyResult,
  OfficeTaskFileKind,
  OfficeTaskJobDto,
  OfficeTaskProposal,
  OfficeTaskStartRequest,
  OfficeTaskStartResult,
  OfficeTaskValidateResult,
} from '../../models/office-task.model';
import { AiHelperQuotaDto } from '../../shared/ai-helper-quota.util';

/** „Irodai feladat a megoldott fájlból” végpontjai (TeacherOfficeTaskController). */
@Injectable({ providedIn: 'root' })
export class TeacherOfficeTaskService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;

  /** A tanári MI-segítségek közös kerete (prémium + `officeTask` used/limit). */
  getQuota(): Observable<AiHelperQuotaDto> {
    return this.http.get<AiHelperQuotaDto>(`${this.baseUrl}/ai-helpers/quota`);
  }

  startJob(taskSetId: number, request: OfficeTaskStartRequest): Observable<OfficeTaskStartResult> {
    const form = new FormData();
    form.append('file', request.file, request.file.name);
    form.append('level', request.level);
    form.append('subtaskCount', String(request.subtaskCount));
    if (request.notes) form.append('notes', request.notes);
    return this.http.post<OfficeTaskStartResult>(`${this.taskSetUrl(taskSetId)}/jobs`, form);
  }

  getJob(taskSetId: number, jobId: number): Observable<OfficeTaskJobDto> {
    return this.http.get<OfficeTaskJobDto>(`${this.taskSetUrl(taskSetId)}/jobs/${jobId}`);
  }

  /** A tanár futó vagy elkészült, még nem mentett jobja ezen a feladatsoron (204 = nincs). */
  getActiveJob(taskSetId: number): Observable<OfficeTaskJobDto | null> {
    return this.http
      .get<OfficeTaskJobDto>(`${this.taskSetUrl(taskSetId)}/jobs/active`, { observe: 'response' })
      .pipe(map((res) => (res.status === 204 ? null : res.body)));
  }

  dismiss(taskSetId: number, jobId: number): Observable<void> {
    return this.http.post<void>(`${this.taskSetUrl(taskSetId)}/jobs/${jobId}/dismiss`, null);
  }

  /** Újraellenőrzés MI nélkül; `sourceFile`: a tanár saját kiinduló munkafüzete (ekkor a szerver „own” módra vált). */
  validate(taskSetId: number, jobId: number, proposal: OfficeTaskProposal, sourceFile: File | null): Observable<OfficeTaskValidateResult> {
    const form = new FormData();
    form.append('jobId', String(jobId));
    form.append('proposal', JSON.stringify(proposal));
    if (sourceFile) form.append('sourceFile', sourceFile, sourceFile.name);
    return this.http.post<OfficeTaskValidateResult>(`${this.taskSetUrl(taskSetId)}/validate`, form);
  }

  apply(taskSetId: number, jobId: number, proposal: OfficeTaskProposal): Observable<OfficeTaskApplyResult> {
    return this.http.post<OfficeTaskApplyResult>(`${this.taskSetUrl(taskSetId)}/apply`, { jobId, proposal });
  }

  /** A job fájljai bearer tokennel (blob) - a kiinduló fájl a legutóbbi ellenőrzésé. */
  downloadFile(taskSetId: number, jobId: number, kind: OfficeTaskFileKind): Observable<Blob> {
    return this.http.get(`${this.taskSetUrl(taskSetId)}/jobs/${jobId}/files/${kind}`, { responseType: 'blob' });
  }

  private taskSetUrl(taskSetId: number): string {
    return `${this.baseUrl}/task-sets/${taskSetId}/office-task`;
  }
}
