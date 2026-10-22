import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AiHelperQuotaDto } from '../../shared/ai-helper-quota.util';
import {
  TeacherOralAssignmentDto,
  TeacherOralAssignmentRequest,
  TeacherOralDraftRequest,
  TeacherOralDraftResultDto,
  TeacherOralProfileOptionDto,
  TeacherOralResultsDto,
  TeacherOralReviewRequest,
  TeacherOralSessionDto,
  TeacherOralTopicDto,
  TeacherOralTopicListItemDto,
  TeacherOralTopicUpdateRequest,
} from '../../models/teacher-oral-exam.model';

/** Kikapcsolt szóbeli funkció (BE: `OralExam:Enabled = false` → minden végpont 404 FeatureDisabled). */
export function isOralExamDisabled(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 404 && err.error?.errorType === 'FeatureDisabled';
}

/** Tanári szóbeli – a TeacherOralExamController végpontjai (api/teacher/oral-exams). */
@Injectable({ providedIn: 'root' })
export class TeacherOralExamService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher/oral-exams`;

  /**
   * Be van-e kapcsolva a szóbeli (a fülsáv „Szóbeli” füle csak ekkor látszik): a keret-végpont egyszeri lekérése; csak a
   * FeatureDisabled rejt el (más hibánál az oldal maga jelzi a hibát).
   */
  readonly available = toSignal(
    this.quota().pipe(map(() => true), catchError((err) => of(!isOralExamDisabled(err)))),
    { initialValue: false },
  );

  quota(): Observable<AiHelperQuotaDto> {
    return this.http.get<AiHelperQuotaDto>(`${this.baseUrl}/quota`);
  }

  profiles(): Observable<TeacherOralProfileOptionDto[]> {
    return this.http.get<TeacherOralProfileOptionDto[]>(`${this.baseUrl}/profiles`);
  }

  topics(): Observable<TeacherOralTopicListItemDto[]> {
    return this.http.get<TeacherOralTopicListItemDto[]>(`${this.baseUrl}/topics`);
  }

  /** MI-vázlat a tanár anyagából (multipart; akár 100 s). */
  draft(request: TeacherOralDraftRequest): Observable<TeacherOralDraftResultDto> {
    const form = new FormData();
    if (request.file) form.append('file', request.file, request.file.name);
    else form.append('text', request.text ?? '');
    form.append('title', request.title);
    form.append('itemCount', String(request.itemCount));
    form.append('questionsPerItem', String(request.questionsPerItem));
    form.append('audience', request.audience);
    return this.http.post<TeacherOralDraftResultDto>(`${this.baseUrl}/topics/draft`, form);
  }

  topic(id: number): Observable<TeacherOralTopicDto> {
    return this.http.get<TeacherOralTopicDto>(`${this.baseUrl}/topics/${id}`);
  }

  updateTopic(id: number, request: TeacherOralTopicUpdateRequest): Observable<TeacherOralTopicDto> {
    return this.http.put<TeacherOralTopicDto>(`${this.baseUrl}/topics/${id}`, request);
  }

  approveTopic(id: number): Observable<TeacherOralTopicDto> {
    return this.http.post<TeacherOralTopicDto>(`${this.baseUrl}/topics/${id}/approve`, null);
  }

  deleteTopic(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/topics/${id}`);
  }

  /** A nem visszavont kiadások (csoportra szűrve, ha van). */
  assignments(groupId?: number): Observable<TeacherOralAssignmentDto[]> {
    const params = groupId == null ? undefined : new HttpParams().set('groupId', groupId);
    return this.http.get<TeacherOralAssignmentDto[]>(`${this.baseUrl}/assignments`, { params });
  }

  assign(request: TeacherOralAssignmentRequest): Observable<TeacherOralAssignmentDto> {
    return this.http.post<TeacherOralAssignmentDto>(`${this.baseUrl}/assignments`, request);
  }

  revokeAssignment(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/assignments/${id}`);
  }

  results(assignmentId: number): Observable<TeacherOralResultsDto> {
    return this.http.get<TeacherOralResultsDto>(`${this.baseUrl}/assignments/${assignmentId}/results`);
  }

  /** A szóbeli dolgozat eredményeinek közzététele (a diákok értesítést kapnak). */
  publishResults(assignmentId: number): Observable<TeacherOralAssignmentDto> {
    return this.http.post<TeacherOralAssignmentDto>(`${this.baseUrl}/assignments/${assignmentId}/publish`, null);
  }

  session(sessionId: number): Observable<TeacherOralSessionDto> {
    return this.http.get<TeacherOralSessionDto>(`${this.baseUrl}/sessions/${sessionId}`);
  }

  review(sessionId: number, request: TeacherOralReviewRequest): Observable<TeacherOralSessionDto> {
    return this.http.put<TeacherOralSessionDto>(`${this.baseUrl}/sessions/${sessionId}/review`, request);
  }

  /** A felülpontozás visszavonása: az MI-pont érvényes. */
  deleteReview(sessionId: number): Observable<TeacherOralSessionDto> {
    return this.http.delete<TeacherOralSessionDto>(`${this.baseUrl}/sessions/${sessionId}/review`);
  }
}
