import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExamCodeCommentDto, ExamPartKey, ExamSessionSnapshotDto, PublishResultDto, TechnikumHeatmapDto } from '../../models/technikum.model';
import { CodeCommentSuggestionsResponse } from '../../models/teacher-project.model';

/** Technikum a tanári oldalon: vizsgarész-térkép, a beadott dolgozat pillanatképe (megjegyzésekkel, GUI-képekkel), eredmény-közzététel. */
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

  /** A beadott GUI-feltöltés képernyőképe (0-tól) - blobként, mert a JWT nem süti (közvetlen <img src> 401 lenne). */
  guiImage(sessionId: number, index: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/sessions/${sessionId}/gui/images/${index}`, { responseType: 'blob' });
  }

  comments(sessionId: number): Observable<ExamCodeCommentDto[]> {
    return this.http.get<ExamCodeCommentDto[]>(`${this.baseUrl}/sessions/${sessionId}/comments`);
  }

  createComment(sessionId: number, partKey: ExamPartKey, path: string, line: number, body: string): Observable<ExamCodeCommentDto> {
    return this.http.post<ExamCodeCommentDto>(`${this.baseUrl}/sessions/${sessionId}/comments`, { partKey, path, line, body });
  }

  updateComment(sessionId: number, commentId: number, body: string): Observable<ExamCodeCommentDto> {
    return this.http.put<ExamCodeCommentDto>(`${this.baseUrl}/sessions/${sessionId}/comments/${commentId}`, { body });
  }

  deleteComment(sessionId: number, commentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/sessions/${sessionId}/comments/${commentId}`);
  }

  /** MI-javaslatok egy rész beadott fájljaira (havi kód-megjegyzés keret) - nem mentett. */
  commentSuggestions(sessionId: number, partKey: ExamPartKey, paths: string[] | null): Observable<CodeCommentSuggestionsResponse> {
    return this.http.post<CodeCommentSuggestionsResponse>(`${this.baseUrl}/sessions/${sessionId}/comment-suggestions`, { partKey, paths });
  }

  /** A dolgozat-rész MI-szempontjainak kézi pontozása; a frissített beadott dolgozatot adja. */
  scoreRubric(resultId: number, items: { key: string; points: number }[]): Observable<ExamSessionSnapshotDto> {
    return this.http.put<ExamSessionSnapshotDto>(`${this.baseUrl}/results/${resultId}/rubric`, { items });
  }

  /** A kézi pontozás visszavonása (az MI eredeti pontjai). */
  revertRubric(resultId: number): Observable<ExamSessionSnapshotDto> {
    return this.http.delete<ExamSessionSnapshotDto>(`${this.baseUrl}/results/${resultId}/rubric`);
  }

  /** Saját gépes kliens-rész: a gépi esetek csoportonkénti kézi ítélete (a teljes felülbírálás) és megjegyzés; a frissített beadott dolgozatot adja. */
  scoreMachine(resultId: number, groups: { groupKey: string; passed: boolean }[], note: string | null): Observable<ExamSessionSnapshotDto> {
    return this.http.put<ExamSessionSnapshotDto>(`${this.baseUrl}/results/${resultId}/machine`, { groups, note });
  }

  /** A gépi felülbírálás visszavonása (az eredeti gépi ítéletek). */
  revertMachine(resultId: number): Observable<ExamSessionSnapshotDto> {
    return this.http.delete<ExamSessionSnapshotDto>(`${this.baseUrl}/results/${resultId}/machine`);
  }

  publish(assignmentId: number): Observable<PublishResultDto> {
    return this.http.post<PublishResultDto>(`${this.baseUrl}/sessions/assignment/${assignmentId}/publish`, {});
  }
}
