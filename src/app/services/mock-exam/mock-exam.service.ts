import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MockExamCurrent, MockExamGroupResults, MockExamLevel, MockExamTeacherEvent } from '../../models/mock-exam.model';

/** Próbaérettségi (tanár): az aktuális esemény, a saját csoportok jelentkeztetése és áttekintése. */
@Injectable({ providedIn: 'root' })
export class MockExamService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher/mock-exams`;

  /** Az aktuális közzétett esemény; null, ha nincs (204). */
  getCurrent(): Observable<MockExamCurrent | null> {
    return this.http.get<MockExamCurrent | null>(`${environment.apiUrl}/mock-exams/public/current`);
  }

  get(slug: string): Observable<MockExamTeacherEvent> {
    return this.http.get<MockExamTeacherEvent>(`${this.baseUrl}/${slug}/groups`);
  }

  registerGroup(slug: string, groupId: number, defaultLevel: MockExamLevel): Observable<MockExamTeacherEvent> {
    return this.http.post<MockExamTeacherEvent>(`${this.baseUrl}/${slug}/groups`, { groupId, defaultLevel });
  }

  revokeGroup(slug: string, groupId: number): Observable<MockExamTeacherEvent> {
    return this.http.delete<MockExamTeacherEvent>(`${this.baseUrl}/${slug}/groups/${groupId}`);
  }

  getGroupResults(slug: string, groupId: number): Observable<MockExamGroupResults> {
    return this.http.get<MockExamGroupResults>(`${this.baseUrl}/${slug}/groups/${groupId}/results`);
  }
}
