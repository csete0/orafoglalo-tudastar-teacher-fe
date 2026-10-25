import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateTheoryTestRequest,
  QuizTestOverviewDto,
  QuizTestReviewDto,
  TeacherQuizAssignmentDto,
  TheoryTestOptionDto,
} from '../../models/teacher-quiz.model';

/** Kvíz-dolgozat (áttekintő, diákonkénti válaszok, közzététel) és a technikumi elméleti dolgozat kiadása. */
@Injectable({ providedIn: 'root' })
export class TeacherQuizTestService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;

  getOverview(assignmentId: number): Observable<QuizTestOverviewDto> {
    return this.http.get<QuizTestOverviewDto>(`${this.baseUrl}/quiz-tests/${assignmentId}`);
  }

  getStudentReview(assignmentId: number, sessionId: number): Observable<QuizTestReviewDto> {
    return this.http.get<QuizTestReviewDto>(`${this.baseUrl}/quiz-tests/${assignmentId}/sessions/${sessionId}`);
  }

  publish(assignmentId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/quiz-tests/${assignmentId}/publish`, {});
  }

  getTheoryTestOptions(): Observable<TheoryTestOptionDto[]> {
    return this.http.get<TheoryTestOptionDto[]>(`${this.baseUrl}/technikum/theory-tests/options`);
  }

  createTheoryTest(request: CreateTheoryTestRequest): Observable<TeacherQuizAssignmentDto> {
    return this.http.post<TeacherQuizAssignmentDto>(`${this.baseUrl}/technikum/theory-tests`, request);
  }
}
