import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  GradingQualityDto,
  RubricQuotaDto,
  TeacherRubricDto,
  UpdateTeacherRubricItemRequest,
} from '../../models/teacher-content.model';

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

  /** A legfrissebb tanári lista (vázlat vagy jóváhagyott); null, ha még nincs. */
  getRubric(taskSetId: number, taskId: number): Observable<TeacherRubricDto | null> {
    return this.http.get<TeacherRubricDto | null>(`${this.taskUrl(taskSetId, taskId)}/rubric`);
  }

  /**
   * Új vázlat MI-vel (1 egység a havi keretből; a korábbi vázlat lecserélődik). Szinkron:
   * a válasz 1–2 perc is lehet. Hibák: `RubricDraftQuotaExceeded`, `RubricDraftNeedsSolution`.
   */
  createRubricDraft(taskSetId: number, taskId: number): Observable<TeacherRubricDto> {
    return this.http.post<TeacherRubricDto>(`${this.taskUrl(taskSetId, taskId)}/rubric/draft`, {});
  }

  /** Csak vázlaton; a gépi tétel szövege/pontja is szerkeszthető, a szabálya nem. */
  updateRubricItem(taskSetId: number, taskId: number, itemId: number, request: UpdateTeacherRubricItemRequest): Observable<TeacherRubricDto> {
    return this.http.put<TeacherRubricDto>(`${this.taskUrl(taskSetId, taskId)}/rubric/items/${itemId}`, request);
  }

  /** Csak vázlaton; gépi tétel is törölhető. */
  deleteRubricItem(taskSetId: number, taskId: number, itemId: number): Observable<TeacherRubricDto> {
    return this.http.delete<TeacherRubricDto>(`${this.taskUrl(taskSetId, taskId)}/rubric/items/${itemId}`);
  }

  /** Hiba (`RubricHasProblems`), ha a vázlatnak van jóváhagyást akadályozó problémája. */
  approveRubric(taskSetId: number, taskId: number): Observable<TeacherRubricDto> {
    return this.http.post<TeacherRubricDto>(`${this.taskUrl(taskSetId, taskId)}/rubric/approve`, {});
  }

  getRubricQuota(): Observable<RubricQuotaDto> {
    return this.http.get<RubricQuotaDto>(`${this.baseUrl}/rubric-quota`);
  }
}
