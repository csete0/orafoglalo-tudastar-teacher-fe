import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AssignTaskSetToGroupRequest,
  CatalogCopyResultDto,
  CatalogPageDto,
  CatalogQuery,
  CreateTeacherSubTaskRequest,
  CreateTeacherTaskRequest,
  CreateTeacherTaskSetRequest,
  PublishResultDto,
  SnippetDto,
  SqlFilesValidationRequest,
  SqlGenerationRequest,
  SqlGenerationResultDto,
  SqlQueryApplyRequest,
  SqlQueryApplyResultDto,
  SqlQueryGenerationRequest,
  SqlQueryInput,
  SqlQueryResultDto,
  TaskSetAssignmentDto,
  TeacherGroupTaskSetAssignmentDto,
  TeacherSkillDto,
  TeacherSubTaskDto,
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

  getSkills(): Observable<TeacherSkillDto[]> {
    return this.http.get<TeacherSkillDto[]>(`${this.baseUrl}/skills`);
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

  /** A publikalas parja. Enelkul a publikalas egyiranyu utca volt. */
  unpublish(id: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/task-sets/${id}/unpublish`, {});
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

  addSubTask(taskId: number, request: CreateTeacherSubTaskRequest): Observable<TeacherSubTaskDto> {
    return this.http.post<TeacherSubTaskDto>(`${this.baseUrl}/tasks/${taskId}/subtasks`, request);
  }

  updateSubTask(solutionId: number, request: CreateTeacherSubTaskRequest): Observable<TeacherSubTaskDto> {
    return this.http.put<TeacherSubTaskDto>(`${this.baseUrl}/subtasks/${solutionId}`, request);
  }

  deleteSubTask(solutionId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/subtasks/${solutionId}`);
  }

  upsertSubTaskSnippets(solutionId: number, snippets: SnippetDto[]): Observable<TeacherSubTaskDto> {
    return this.http.put<TeacherSubTaskDto>(`${this.baseUrl}/subtasks/${solutionId}/snippets`, snippets);
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

  /**
   * Hiányzó create.sql / create_lite.sql elkészítése (MI-séma + gépi adatátalakítás + futtatásos ellenőrzés).
   * Csak előnézet - a mentés a szokásos `uploadFile`-lal történik.
   */
  generateSqlFiles(taskSetId: number, request: SqlGenerationRequest): Observable<SqlGenerationResultDto> {
    return this.http.post<SqlGenerationResultDto>(`${this.baseUrl}/task-sets/${taskSetId}/sql-generation`, request);
  }

  /** A kézzel javított create.sql / create_lite.sql újraellenőrzése (MI nélkül, mentés nélkül) - ugyanaz a válaszalak. */
  validateSqlFiles(taskSetId: number, request: SqlFilesValidationRequest): Observable<SqlGenerationResultDto> {
    return this.http.post<SqlGenerationResultDto>(`${this.baseUrl}/task-sets/${taskSetId}/sql-generation/validate`, request);
  }

  /** SQL-feladat megoldó lekérdezései MI-vel - csak előnézet futtatásos ellenőrzéssel, nem ment. */
  generateSqlQueries(taskSetId: number, taskId: number, request: SqlQueryGenerationRequest): Observable<SqlQueryResultDto> {
    return this.http.post<SqlQueryResultDto>(`${this.baseUrl}/task-sets/${taskSetId}/tasks/${taskId}/sql-queries/generate`, request);
  }

  /** A (kézzel javított) lekérdezések újraellenőrzése MI nélkül, mentés nélkül - ugyanaz a válaszalak. */
  validateSqlQueries(taskSetId: number, taskId: number, queries: SqlQueryInput[]): Observable<SqlQueryResultDto> {
    return this.http.post<SqlQueryResultDto>(`${this.baseUrl}/task-sets/${taskSetId}/tasks/${taskId}/sql-queries/validate`, { queries });
  }

  /** A lekérdezések mentése a részfeladatok SQL-megoldásaként. */
  applySqlQueries(taskSetId: number, taskId: number, request: SqlQueryApplyRequest): Observable<SqlQueryApplyResultDto> {
    return this.http.post<SqlQueryApplyResultDto>(`${this.baseUrl}/task-sets/${taskSetId}/tasks/${taskId}/sql-queries/apply`, request);
  }

  /** A másolható hivatalos feladatsorok, lapozva és szűrve. */
  getCatalog(query: CatalogQuery): Observable<CatalogPageDto> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.q) params = params.set('q', query.q);
    if (query.categoryId != null) params = params.set('categoryId', query.categoryId);
    if (query.levelId != null) params = params.set('levelId', query.levelId);
    if (query.year != null) params = params.set('year', query.year);
    return this.http.get<CatalogPageDto>(`${this.baseUrl}/catalog/task-sets`, { params });
  }

  /** Egy hivatalos feladatsor átmásolása a tanár új, nem publikált feladatsorába. */
  copyFromCatalog(taskSetId: number): Observable<CatalogCopyResultDto> {
    return this.http.post<CatalogCopyResultDto>(`${this.baseUrl}/catalog/task-sets/${taskSetId}/copy`, {});
  }

  getTaskSetAssignments(taskSetId: number): Observable<TaskSetAssignmentDto[]> {
    return this.http.get<TaskSetAssignmentDto[]>(`${this.baseUrl}/task-sets/${taskSetId}/assignments`);
  }

  assignToGroup(taskSetId: number, request: AssignTaskSetToGroupRequest): Observable<TaskSetAssignmentDto> {
    return this.http.post<TaskSetAssignmentDto>(`${this.baseUrl}/task-sets/${taskSetId}/assign`, request);
  }

  revokeAssignment(assignmentId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/task-set-assignments/${assignmentId}`);
  }

  getGroupTaskSetAssignments(groupId: number): Observable<TeacherGroupTaskSetAssignmentDto[]> {
    return this.http.get<TeacherGroupTaskSetAssignmentDto[]>(`${this.baseUrl}/groups/${groupId}/task-set-assignments`);
  }
}
