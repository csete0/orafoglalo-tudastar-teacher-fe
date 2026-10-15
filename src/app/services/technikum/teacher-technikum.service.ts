import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExamSessionSnapshotDto, TechnikumHeatmapDto } from '../../models/technikum.model';

/** Technikum a tanári oldalon: vizsgarész-térkép, a beadott dolgozat pillanatképe, eredmény-közzététel. */
@Injectable({ providedIn: 'root' })
export class TeacherTechnikumService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher/technikum`;

  heatmap(groupId: number): Observable<TechnikumHeatmapDto> {
    return this.http.get<TechnikumHeatmapDto>(`${this.baseUrl}/groups/${groupId}/heatmap`);
  }

  snapshot(sessionId: number): Observable<ExamSessionSnapshotDto> {
    return this.http.get<ExamSessionSnapshotDto>(`${this.baseUrl}/sessions/${sessionId}/snapshot`);
  }

  publish(assignmentId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/sessions/assignment/${assignmentId}/publish`, {});
  }
}
