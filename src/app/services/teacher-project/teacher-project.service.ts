import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AssignProjectRequest,
  CodeCommentThreadDto,
  ProjectAssignmentDto,
  ProjectAssignmentStudentsDto,
  StudentProjectCodeDto,
  TeacherProjectDto,
} from '../../models/teacher-project.model';

/** Projektműhely a tanári oldalon: katalógus, kiadás, osztály-nézet, a diák kódja (csak olvasás) és a kódmegjegyzések. */
@Injectable({ providedIn: 'root' })
export class TeacherProjectService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher`;

  list(): Observable<TeacherProjectDto[]> {
    return this.http.get<TeacherProjectDto[]>(`${this.baseUrl}/projects`);
  }

  assign(slug: string, request: AssignProjectRequest): Observable<ProjectAssignmentDto> {
    return this.http.post<ProjectAssignmentDto>(`${this.baseUrl}/projects/${encodeURIComponent(slug)}/assignments`, request);
  }

  revoke(assignmentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/project-assignments/${assignmentId}`);
  }

  forGroup(groupId: number): Observable<ProjectAssignmentDto[]> {
    return this.http.get<ProjectAssignmentDto[]>(`${this.baseUrl}/groups/${groupId}/project-assignments`);
  }

  students(assignmentId: number): Observable<ProjectAssignmentStudentsDto> {
    return this.http.get<ProjectAssignmentStudentsDto>(`${this.baseUrl}/project-assignments/${assignmentId}/students`);
  }

  studentCode(assignmentId: number, userId: number): Observable<StudentProjectCodeDto> {
    return this.http.get<StudentProjectCodeDto>(`${this.baseUrl}/project-assignments/${assignmentId}/students/${userId}/workspace`);
  }

  comments(assignmentId: number, userId: number): Observable<CodeCommentThreadDto[]> {
    return this.http.get<CodeCommentThreadDto[]>(this.commentsUrl(assignmentId, userId));
  }

  createComment(assignmentId: number, userId: number, path: string, line: number, body: string): Observable<CodeCommentThreadDto> {
    return this.http.post<CodeCommentThreadDto>(this.commentsUrl(assignmentId, userId), { path, line, body });
  }

  replyComment(assignmentId: number, userId: number, commentId: number, body: string): Observable<CodeCommentThreadDto> {
    return this.http.post<CodeCommentThreadDto>(`${this.commentsUrl(assignmentId, userId)}/${commentId}/replies`, { body });
  }

  private commentsUrl(assignmentId: number, userId: number): string {
    return `${this.baseUrl}/project-assignments/${assignmentId}/students/${userId}/comments`;
  }
}
