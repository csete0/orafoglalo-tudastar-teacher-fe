import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AssignProjectRequest,
  ProjectAssignmentDto,
  ProjectAssignmentStudentsDto,
  StudentProjectCodeDto,
  TeacherProjectDto,
} from '../../models/teacher-project.model';

/** Projektműhely a tanári oldalon: katalógus, kiadás, osztály-nézet, a diák kódja (csak olvasás). */
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
}
