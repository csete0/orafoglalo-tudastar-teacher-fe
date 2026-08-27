import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PublishResultDto } from '../../models/teacher-content.model';
import {
  AssignTeacherQuizRequest,
  CreateTeacherQuizQuestionRequest,
  CreateTeacherQuizRequest,
  GenerateTeacherQuizQuestionsRequest,
  QuizTopicGroupDto,
  TeacherQuizAssignmentDto,
  TeacherQuizDetailDto,
  TeacherQuizDto,
  TeacherQuizQuestionDto,
} from '../../models/teacher-quiz.model';

/** Vékony HTTP-réteg a tanári kvíz-végpontokhoz (api/teacher/quizzes). */
@Injectable({ providedIn: 'root' })
export class TeacherQuizService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;

  getMine(): Observable<TeacherQuizDto[]> {
    return this.http.get<TeacherQuizDto[]>(`${this.baseUrl}/quizzes`);
  }

  getDetail(id: number): Observable<TeacherQuizDetailDto> {
    return this.http.get<TeacherQuizDetailDto>(`${this.baseUrl}/quizzes/${id}`);
  }

  create(request: CreateTeacherQuizRequest): Observable<TeacherQuizDto> {
    return this.http.post<TeacherQuizDto>(`${this.baseUrl}/quizzes`, request);
  }

  update(id: number, request: CreateTeacherQuizRequest): Observable<TeacherQuizDto> {
    return this.http.put<TeacherQuizDto>(`${this.baseUrl}/quizzes/${id}`, request);
  }

  delete(id: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/quizzes/${id}`);
  }

  publish(id: number): Observable<PublishResultDto> {
    return this.http.post<PublishResultDto>(`${this.baseUrl}/quizzes/${id}/publish`, {});
  }

  addQuestion(quizId: number, request: CreateTeacherQuizQuestionRequest): Observable<TeacherQuizQuestionDto> {
    return this.http.post<TeacherQuizQuestionDto>(`${this.baseUrl}/quizzes/${quizId}/questions`, request);
  }

  updateQuestion(
    questionId: number,
    request: CreateTeacherQuizQuestionRequest,
  ): Observable<TeacherQuizQuestionDto> {
    return this.http.put<TeacherQuizQuestionDto>(`${this.baseUrl}/quiz-questions/${questionId}`, request);
  }

  deleteQuestion(questionId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/quiz-questions/${questionId}`);
  }

  approveQuestion(questionId: number): Observable<TeacherQuizQuestionDto> {
    return this.http.post<TeacherQuizQuestionDto>(`${this.baseUrl}/quiz-questions/${questionId}/approve`, {});
  }

  generateQuestions(
    quizId: number,
    request: GenerateTeacherQuizQuestionsRequest,
  ): Observable<TeacherQuizQuestionDto[]> {
    return this.http.post<TeacherQuizQuestionDto[]>(
      `${this.baseUrl}/quizzes/${quizId}/generate-questions`,
      request,
    );
  }

  assignToGroup(quizId: number, request: AssignTeacherQuizRequest): Observable<TeacherQuizAssignmentDto> {
    return this.http.post<TeacherQuizAssignmentDto>(`${this.baseUrl}/quizzes/${quizId}/assignments`, request);
  }

  revokeAssignment(assignmentId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/quiz-assignments/${assignmentId}`);
  }

  /**
   * A választható témakörök. SZÁNDÉKOSAN a diák-oldali, kategóriánként csoportosított
   * `/quiz/topics` végpontot használja (csak bejelentkezést kér, előfizetést nem) - a
   * témakör-lista közös, nincs értelme tanári másolatot építeni belőle.
   */
  getTopics(): Observable<QuizTopicGroupDto[]> {
    return this.http.get<QuizTopicGroupDto[]>(`${environment.apiUrl}/quiz/topics`);
  }
}
