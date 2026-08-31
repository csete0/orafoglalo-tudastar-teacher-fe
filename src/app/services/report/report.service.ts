import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  StudentActivityDetailDto,
  StudentActivitySummaryDto,
  TeacherAttemptReviewDto,
  TeacherScoreOverrideRequest,
  TeacherTaskSetResultsDto,
  TeacherDashboardDto,
} from '../../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;

  getGroupActivity(groupId: number, from?: Date, to?: Date): Observable<StudentActivitySummaryDto[]> {
    return this.http.get<StudentActivitySummaryDto[]>(
      `${this.baseUrl}/groups/${groupId}/activity`,
      { params: this.dateRangeParams(from, to) },
    );
  }

  getSchoolActivity(schoolId: number, from?: Date, to?: Date): Observable<StudentActivitySummaryDto[]> {
    return this.http.get<StudentActivitySummaryDto[]>(
      `${this.baseUrl}/schools/${schoolId}/activity`,
      { params: this.dateRangeParams(from, to) },
    );
  }

  /** UI-UX-T2: a vezérlőpult élő blokkjai (friss kvíz-eredmények + határidők). */
  getDashboard(): Observable<TeacherDashboardDto> {
    return this.http.get<TeacherDashboardDto>(`${this.baseUrl}/dashboard`);
  }

  getStudentActivity(studentUserId: number, from?: Date, to?: Date): Observable<StudentActivityDetailDto> {
    return this.http.get<StudentActivityDetailDto>(
      `${this.baseUrl}/students/${studentUserId}/activity`,
      { params: this.dateRangeParams(from, to) },
    );
  }

  getTaskSetResults(taskSetId: number): Observable<TeacherTaskSetResultsDto> {
    return this.http.get<TeacherTaskSetResultsDto>(`${this.baseUrl}/task-sets/${taskSetId}/results`);
  }

  getAttemptReview(attemptId: number): Observable<TeacherAttemptReviewDto> {
    return this.http.get<TeacherAttemptReviewDto>(`${this.baseUrl}/exam-attempts/${attemptId}/review`);
  }

  /** A válasz a FRISSÍTETT értékelő nézet — a hívónak nem kell külön újratöltenie a panelt. */
  overrideScore(attemptId: number, request: TeacherScoreOverrideRequest): Observable<TeacherAttemptReviewDto> {
    return this.http.put<TeacherAttemptReviewDto>(
      `${this.baseUrl}/exam-attempts/${attemptId}/score-override`,
      request,
    );
  }

  revertOverride(attemptId: number): Observable<TeacherAttemptReviewDto> {
    return this.http.delete<TeacherAttemptReviewDto>(
      `${this.baseUrl}/exam-attempts/${attemptId}/score-override`,
    );
  }

  private dateRangeParams(from?: Date, to?: Date): HttpParams {
    let params = new HttpParams();
    if (from) params = params.set('from', from.toISOString());
    if (to) params = params.set('to', to.toISOString());
    return params;
  }
}
