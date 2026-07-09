import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateTeacherSolutionRequest,
  CreateTeacherTaskRequest,
  CreateTeacherTaskSetRequest,
  PublishResultDto,
  SnippetDto,
  TeacherSolutionDto,
  TeacherTaskDto,
  TeacherTaskSetDetailDto,
  TeacherTaskSetDto,
} from '../../models/teacher-content.model';

@Injectable({ providedIn: 'root' })
export class TeacherTaskSetService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;

  getMine(): Observable<TeacherTaskSetDto[]> {
    return this.http.get<TeacherTaskSetDto[]>(`${this.baseUrl}/task-sets`);
  }

  getDetail(id: number): Observable<TeacherTaskSetDetailDto> {
    return this.http.get<TeacherTaskSetDetailDto>(`${this.baseUrl}/task-sets/${id}`);
  }

  create(request: CreateTeacherTaskSetRequest): Observable<TeacherTaskSetDto> {
    return this.http.post<TeacherTaskSetDto>(`${this.baseUrl}/task-sets`, request);
  }

  update(id: number, request: CreateTeacherTaskSetRequest): Observable<TeacherTaskSetDto> {
    return this.http.put<TeacherTaskSetDto>(`${this.baseUrl}/task-sets/${id}`, request);
  }

  delete(id: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/task-sets/${id}`);
  }

  publish(id: number): Observable<PublishResultDto> {
    return this.http.post<PublishResultDto>(`${this.baseUrl}/task-sets/${id}/publish`, {});
  }

  addTask(taskSetId: number, request: CreateTeacherTaskRequest): Observable<TeacherTaskDto> {
    return this.http.post<TeacherTaskDto>(`${this.baseUrl}/task-sets/${taskSetId}/tasks`, request);
  }

  updateTask(taskId: number, request: CreateTeacherTaskRequest): Observable<TeacherTaskDto> {
    return this.http.put<TeacherTaskDto>(`${this.baseUrl}/tasks/${taskId}`, request);
  }

  deleteTask(taskId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/tasks/${taskId}`);
  }

  addSolution(taskId: number, request: CreateTeacherSolutionRequest): Observable<TeacherSolutionDto> {
    return this.http.post<TeacherSolutionDto>(`${this.baseUrl}/tasks/${taskId}/solutions`, request);
  }

  updateSolution(solutionId: number, request: CreateTeacherSolutionRequest): Observable<TeacherSolutionDto> {
    return this.http.put<TeacherSolutionDto>(`${this.baseUrl}/solutions/${solutionId}`, request);
  }

  deleteSolution(solutionId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/solutions/${solutionId}`);
  }

  upsertSolutionSnippets(solutionId: number, snippets: SnippetDto[]): Observable<TeacherSolutionDto> {
    return this.http.put<TeacherSolutionDto>(`${this.baseUrl}/solutions/${solutionId}/snippets`, snippets);
  }

  upsertCompleteSolutionSnippets(taskId: number, snippets: SnippetDto[]): Observable<SnippetDto[]> {
    return this.http.put<SnippetDto[]>(`${this.baseUrl}/tasks/${taskId}/complete-solution-snippets`, snippets);
  }

  uploadFile(taskSetId: number, kind: string, file: File, taskId?: number): Observable<unknown> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);
    if (taskId != null) formData.append('taskId', String(taskId));
    return this.http.post(`${this.baseUrl}/task-sets/${taskSetId}/files`, formData);
  }

  deleteFile(fileId: string): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/files/${fileId}`);
  }
}
