import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PublishResultDto } from '../../models/teacher-content.model';
import { QuizQuestionReportListDto } from '../../models/question-report.model';
import {
  AssignTeacherQuizRequest,
  CreateTeacherQuizQuestionRequest,
  CreateTeacherQuizRequest,
  GenerateTeacherQuizQuestionsRequest,
  QuizAuthoringScope,
  QuizBankQuestionDto,
  QuizDifficulty,
  QuizResultsMode,
  QuizTopicGroupDto,
  TeacherGroupAssignmentDto,
  TeacherQuizResultsDto,
  TeacherQuizAssignmentDto,
  TeacherQuizDetailDto,
  TeacherQuizDto,
  TeacherQuizQuestionDto,
} from '../../models/teacher-quiz.model';

/**
 * Vékony HTTP-réteg a kvíz-szerkesztő végpontokhoz.
 *
 * C5: a szerkesztő végpontok KÉT gyökér alatt élnek azonos alakkal - `api/teacher/…` a
 * tanár saját kvízeihez, `api/admin/…` a platform-kvízekhez (tulajdonos nélküli, minden
 * előfizetőnek szóló "Hivatalos kvízek"). A `scope` paraméter csak a gyökeret váltja; az
 * alapértelmezés `teacher`, hogy a meglévő hívók változatlanul működjenek. A kiadás, az
 * eredmények és a csoport-kiadások KIZÁRÓLAG tanáriak (a platform-kvíznek nincs csoportja),
 * ezért azoknak nincs scope-juk.
 */
@Injectable({ providedIn: 'root' })
export class TeacherQuizService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;

  private root(scope: QuizAuthoringScope): string {
    return `${environment.apiUrl}/${scope}`;
  }

  getMine(scope: QuizAuthoringScope = 'teacher'): Observable<TeacherQuizDto[]> {
    return this.http.get<TeacherQuizDto[]>(`${this.root(scope)}/quizzes`);
  }

  getDetail(id: number, scope: QuizAuthoringScope = 'teacher'): Observable<TeacherQuizDetailDto> {
    return this.http.get<TeacherQuizDetailDto>(`${this.root(scope)}/quizzes/${id}`);
  }

  create(request: CreateTeacherQuizRequest, scope: QuizAuthoringScope = 'teacher'): Observable<TeacherQuizDto> {
    return this.http.post<TeacherQuizDto>(`${this.root(scope)}/quizzes`, request);
  }

  update(
    id: number,
    request: CreateTeacherQuizRequest,
    scope: QuizAuthoringScope = 'teacher',
  ): Observable<TeacherQuizDto> {
    return this.http.put<TeacherQuizDto>(`${this.root(scope)}/quizzes/${id}`, request);
  }

  delete(id: number, scope: QuizAuthoringScope = 'teacher'): Observable<unknown> {
    return this.http.delete(`${this.root(scope)}/quizzes/${id}`);
  }

  publish(id: number, scope: QuizAuthoringScope = 'teacher'): Observable<PublishResultDto> {
    return this.http.post<PublishResultDto>(`${this.root(scope)}/quizzes/${id}/publish`, {});
  }

  /**
   * C5: platform-kvíz visszavonása a diákok elől (IsPublished = false). Csak admin-scope:
   * a tanári kvíznél a "levétel" az admin takedown-ja, nem a tanár saját művelete.
   */
  unpublish(id: number, scope: QuizAuthoringScope = 'admin'): Observable<unknown> {
    return this.http.post(`${this.root(scope)}/quizzes/${id}/unpublish`, {});
  }

  addQuestion(
    quizId: number,
    request: CreateTeacherQuizQuestionRequest,
    scope: QuizAuthoringScope = 'teacher',
  ): Observable<TeacherQuizQuestionDto> {
    return this.http.post<TeacherQuizQuestionDto>(`${this.root(scope)}/quizzes/${quizId}/questions`, request);
  }

  updateQuestion(
    questionId: number,
    request: CreateTeacherQuizQuestionRequest,
    scope: QuizAuthoringScope = 'teacher',
  ): Observable<TeacherQuizQuestionDto> {
    return this.http.put<TeacherQuizQuestionDto>(`${this.root(scope)}/quiz-questions/${questionId}`, request);
  }

  deleteQuestion(questionId: number, scope: QuizAuthoringScope = 'teacher'): Observable<unknown> {
    return this.http.delete(`${this.root(scope)}/quiz-questions/${questionId}`);
  }

  approveQuestion(questionId: number, scope: QuizAuthoringScope = 'teacher'): Observable<TeacherQuizQuestionDto> {
    return this.http.post<TeacherQuizQuestionDto>(`${this.root(scope)}/quiz-questions/${questionId}/approve`, {});
  }

  /**
   * UI-TT-213: két szomszédos kérdés DisplayOrder-jének ATOMI cseréje - a BE egyetlen
   * mentésben végzi mindkettőt, nem két külön updateQuestion()-hívással, mint korábban.
   */
  reorderQuestion(
    questionId: number,
    neighbourQuestionId: number,
    scope: QuizAuthoringScope = 'teacher',
  ): Observable<unknown> {
    return this.http.post(`${this.root(scope)}/quiz-questions/${questionId}/reorder`, {
      neighbourQuestionId,
    });
  }

  generateQuestions(
    quizId: number,
    request: GenerateTeacherQuizQuestionsRequest,
    scope: QuizAuthoringScope = 'teacher',
  ): Observable<TeacherQuizQuestionDto[]> {
    return this.http.post<TeacherQuizQuestionDto[]>(
      `${this.root(scope)}/quizzes/${quizId}/generate-questions`,
      request,
    );
  }

  /**
   * UI-UX: keresés a közös AI-kérdésbankban ("meglévő kérdés hozzáadása" a szerkesztőben) -
   * csak jóváhagyott, szabad gyakorlásra használt kérdések között.
   */
  searchBankQuestions(
    search: string | null,
    topicId: number | null,
    difficulty: QuizDifficulty | null,
    scope: QuizAuthoringScope = 'teacher',
  ): Observable<QuizBankQuestionDto[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (topicId != null) params = params.set('topicId', topicId);
    if (difficulty) params = params.set('difficulty', difficulty);
    return this.http.get<QuizBankQuestionDto[]>(`${this.root(scope)}/quiz-bank-questions`, { params });
  }

  /** Egy közös bankbeli kérdés MÁSOLATÁNAK felvétele a kvízbe. */
  addExistingQuestion(
    quizId: number,
    bankQuestionId: number,
    scope: QuizAuthoringScope = 'teacher',
  ): Observable<TeacherQuizQuestionDto> {
    return this.http.post<TeacherQuizQuestionDto>(
      `${this.root(scope)}/quizzes/${quizId}/questions/existing`,
      { bankQuestionId },
    );
  }

  getQuestionReports(quizId?: number, onlyOpen = true): Observable<QuizQuestionReportListDto> {
    let params = new HttpParams().set('onlyOpen', onlyOpen).set('pageSize', 100);
    if (quizId != null) params = params.set('quizId', quizId);
    return this.http.get<QuizQuestionReportListDto>(`${this.baseUrl}/question-reports`, { params });
  }

  resolveQuestionReport(id: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/question-reports/${id}/resolve`, {});
  }

  assignToGroup(quizId: number, request: AssignTeacherQuizRequest): Observable<TeacherQuizAssignmentDto> {
    return this.http.post<TeacherQuizAssignmentDto>(`${this.baseUrl}/quizzes/${quizId}/assignments`, request);
  }

  revokeAssignment(assignmentId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/quiz-assignments/${assignmentId}`);
  }

  /** UI-UX-T3: a csoport aktív kvíz-kiadásai a csoport-oldal "Kiadva" füléhez. */
  getGroupAssignments(groupId: number): Observable<TeacherGroupAssignmentDto[]> {
    return this.http.get<TeacherGroupAssignmentDto[]>(
      `${this.baseUrl}/groups/${groupId}/quiz-assignments`);
  }

  /**
   * @param mode 'all' = minden kitöltés; 'live' = csak élő menetek; 'solo' = csak önálló.
   * @param kahootSessionId egy KONKRÉT élő játékra szűkítés.
   */
  getResults(
    quizId: number,
    mode: QuizResultsMode = 'all',
    kahootSessionId: number | null = null,
  ): Observable<TeacherQuizResultsDto> {
    let params = new HttpParams();
    if (mode !== 'all') params = params.set('mode', mode);
    if (kahootSessionId != null) params = params.set('kahootSessionId', kahootSessionId);
    return this.http.get<TeacherQuizResultsDto>(`${this.baseUrl}/quizzes/${quizId}/results`, { params });
  }

  /**
   * A választható témakörök. SZÁNDÉKOSAN a diák-oldali, kategóriánként csoportosított
   * `/quiz/topics` végpontot használja (csak bejelentkezést kér, előfizetést nem) - a
   * témakör-lista közös, nincs értelme tanári másolatot építeni belőle.
   */
  getTopics(): Observable<QuizTopicGroupDto[]> {
    return this.http.get<QuizTopicGroupDto[]>(`${environment.apiUrl}/quiz/topics`);
  }

  uploadQuizImage(quizId: number, file: File): Observable<{ id: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ id: string }>(`${this.baseUrl}/quizzes/${quizId}/images`, form);
  }

  duplicateQuestion(questionId: number): Observable<TeacherQuizQuestionDto> {
    return this.http.post<TeacherQuizQuestionDto>(`${this.baseUrl}/quiz-questions/${questionId}/duplicate`, {});
  }

  cloneQuiz(quizId: number): Observable<TeacherQuizDto> {
    return this.http.post<TeacherQuizDto>(`${this.baseUrl}/quizzes/${quizId}/clone`, {});
  }
}
