import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExamSessionSnapshotDto, PublishResultDto, TechnikumHeatmapDto } from '../../models/technikum.model';

/** Technikum a tanári oldalon: vizsgarész-térkép, a beadott dolgozat pillanatképe, eredmény-közzététel. */
@Injectable({ providedIn: 'root' })
export class TeacherTechnikumService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher/technikum`;

  /** A Fejlesztőműhely láthatósága a tanárnak is: prémium tanár + bekapcsolt modul (BE: GET api/technikum/me; kikapcsolva 404). */
  me(): Observable<{ visible: boolean; hasPremium: boolean }> {
    return this.http.get<{ visible: boolean; hasPremium: boolean }>(`${environment.apiUrl}/technikum/me`);
  }

  heatmap(groupId: number): Observable<TechnikumHeatmapDto> {
    return this.http.get<TechnikumHeatmapDto>(`${this.baseUrl}/groups/${groupId}/heatmap`);
  }

  snapshot(sessionId: number): Observable<ExamSessionSnapshotDto> {
    return this.http.get<ExamSessionSnapshotDto>(`${this.baseUrl}/sessions/${sessionId}/snapshot`);
  }

  /** A dolgozat-rész MI-szempontjainak kézi pontozása; a frissített beadott dolgozatot adja. */
  scoreRubric(resultId: number, items: { key: string; points: number }[]): Observable<ExamSessionSnapshotDto> {
    return this.http.put<ExamSessionSnapshotDto>(`${this.baseUrl}/results/${resultId}/rubric`, { items });
  }

  /** A kézi pontozás visszavonása (az MI eredeti pontjai). */
  revertRubric(resultId: number): Observable<ExamSessionSnapshotDto> {
    return this.http.delete<ExamSessionSnapshotDto>(`${this.baseUrl}/results/${resultId}/rubric`);
  }

  publish(assignmentId: number): Observable<PublishResultDto> {
    return this.http.post<PublishResultDto>(`${this.baseUrl}/sessions/assignment/${assignmentId}/publish`, {});
  }
}
