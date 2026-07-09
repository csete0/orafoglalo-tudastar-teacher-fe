import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { StudentActivityDetailDto, StudentActivitySummaryDto, TeacherTaskSetResultsDto } from '../../models/report.model';

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

  getStudentActivity(studentUserId: number, from?: Date, to?: Date): Observable<StudentActivityDetailDto> {
    return this.http.get<StudentActivityDetailDto>(
      `${this.baseUrl}/students/${studentUserId}/activity`,
      { params: this.dateRangeParams(from, to) },
    );
  }

  getTaskSetResults(taskSetId: number): Observable<TeacherTaskSetResultsDto> {
    return this.http.get<TeacherTaskSetResultsDto>(`${this.baseUrl}/task-sets/${taskSetId}/results`);
  }

  private dateRangeParams(from?: Date, to?: Date): HttpParams {
    let params = new HttpParams();
    if (from) params = params.set('from', from.toISOString());
    if (to) params = params.set('to', to.toISOString());
    return params;
  }
}
