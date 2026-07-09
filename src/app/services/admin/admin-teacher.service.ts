import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminTaskSetDto, TeacherProfileAdminDto } from '../../models/teacher-moderation.model';

@Injectable({ providedIn: 'root' })
export class AdminTeacherService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin`;

  getTeachers(): Observable<TeacherProfileAdminDto[]> {
    return this.http.get<TeacherProfileAdminDto[]>(`${this.baseUrl}/teachers`);
  }

  setActive(teacherProfileId: number, isActive: boolean): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/teachers/${teacherProfileId}/set-active`, { isActive });
  }

  getTaskSets(teacherProfileId: number): Observable<AdminTaskSetDto[]> {
    return this.http.get<AdminTaskSetDto[]>(`${this.baseUrl}/teachers/${teacherProfileId}/task-sets`);
  }

  takedownTaskSet(taskSetId: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/task-sets/${taskSetId}/takedown`, {});
  }
}
