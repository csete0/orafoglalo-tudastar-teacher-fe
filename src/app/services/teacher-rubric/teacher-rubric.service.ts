import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GradingQualityDto } from '../../models/teacher-content.model';

/**
 * A tanári feladat automatikus javításának minősége és a tanári szempontlista
 * (szerződés: plans/TANARI-SZEMPONTLISTA-API.md). Minden végpont csak a hívó tanár
 * SAJÁT feladatsorán működik.
 */
@Injectable({ providedIn: 'root' })
export class TeacherRubricService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;

  private taskUrl(taskSetId: number, taskId: number): string {
    return `${this.baseUrl}/task-sets/${taskSetId}/tasks/${taskId}`;
  }

  getGradingQuality(taskSetId: number, taskId: number): Observable<GradingQualityDto> {
    return this.http.get<GradingQualityDto>(`${this.taskUrl(taskSetId, taskId)}/grading-quality`);
  }
}
