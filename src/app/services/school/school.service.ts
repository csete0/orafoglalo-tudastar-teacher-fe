import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ChangeSchoolMemberRoleRequest,
  CreateSchoolRequest,
  JoinSchoolRequest,
  SchoolDto,
  SchoolGroupDto,
  SchoolMemberDto,
} from '../../models/school.model';

@Injectable({ providedIn: 'root' })
export class SchoolService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/schools`;

  getMine(): Observable<SchoolDto[]> {
    return this.http.get<SchoolDto[]>(this.baseUrl);
  }

  create(request: CreateSchoolRequest): Observable<SchoolDto> {
    return this.http.post<SchoolDto>(this.baseUrl, request);
  }

  update(id: number, request: CreateSchoolRequest): Observable<SchoolDto> {
    return this.http.put<SchoolDto>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/${id}`);
  }

  join(request: JoinSchoolRequest): Observable<SchoolDto> {
    return this.http.post<SchoolDto>(`${this.baseUrl}/join`, request);
  }

  leave(id: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/leave`, {});
  }

  regenerateTeacherInvite(id: number): Observable<SchoolDto> {
    return this.http.post<SchoolDto>(`${this.baseUrl}/${id}/regenerate-teacher-invite`, {});
  }

  getMembers(id: number): Observable<SchoolMemberDto[]> {
    return this.http.get<SchoolMemberDto[]>(`${this.baseUrl}/${id}/members`);
  }

  removeMember(id: number, memberTeacherProfileId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/${id}/members/${memberTeacherProfileId}`);
  }

  changeMemberRole(id: number, memberTeacherProfileId: number, request: ChangeSchoolMemberRoleRequest): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/${id}/members/${memberTeacherProfileId}/role`, request);
  }

  getSchoolGroups(id: number): Observable<SchoolGroupDto[]> {
    return this.http.get<SchoolGroupDto[]>(`${this.baseUrl}/${id}/groups`);
  }
}
