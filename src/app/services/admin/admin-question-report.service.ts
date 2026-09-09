import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { QuizQuestionReportListDto } from '../../models/question-report.model';

@Injectable({ providedIn: 'root' })
export class AdminQuestionReportService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin`;

  getReports(onlyOpen = true, page = 1, pageSize = 20): Observable<QuizQuestionReportListDto> {
    const params = new HttpParams()
      .set('onlyOpen', onlyOpen)
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get<QuizQuestionReportListDto>(`${this.baseUrl}/question-reports`, { params });
  }

  resolve(id: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/question-reports/${id}/resolve`, {});
  }

  approveQuestion(questionId: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/questions/${questionId}/approve`, {});
  }
}
