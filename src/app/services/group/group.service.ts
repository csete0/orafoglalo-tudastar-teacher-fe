import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CreateGroupRequest, GroupDto, GroupMemberDto, JoinGroupRequest, MyGroupDto, MyGroupTaskSetDto } from '../../models/group.model';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/groups`;
  private readonly myGroupsUrl = `${environment.apiUrl}/my-groups`;

  // ── Tanári oldal ──────────────────────────────────────────
  getMine(): Observable<GroupDto[]> {
    return this.http.get<GroupDto[]>(this.baseUrl);
  }

  create(request: CreateGroupRequest): Observable<GroupDto> {
    return this.http.post<GroupDto>(this.baseUrl, request);
  }

  update(id: number, request: CreateGroupRequest): Observable<GroupDto> {
    return this.http.put<GroupDto>(`${this.baseUrl}/${id}`, request);
  }

  regenerateInvite(id: number): Observable<GroupDto> {
    return this.http.post<GroupDto>(`${this.baseUrl}/${id}/regenerate-invite`, {});
  }

  getMembers(id: number): Observable<GroupMemberDto[]> {
    return this.http.get<GroupMemberDto[]>(`${this.baseUrl}/${id}/members`);
  }

  removeMember(id: number, memberUserId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/${id}/members/${memberUserId}`);
  }

  archive(id: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/archive`, {});
  }

  setJoinEnabled(id: number, enabled: boolean): Observable<unknown> {
    return this.http.put(`${this.baseUrl}/${id}/join-enabled`, { enabled });
  }

  // ── Diák oldal ────────────────────────────────────────────
  getMyGroups(): Observable<MyGroupDto[]> {
    return this.http.get<MyGroupDto[]>(this.myGroupsUrl);
  }

  getMyGroupsTaskSets(): Observable<MyGroupTaskSetDto[]> {
    return this.http.get<MyGroupTaskSetDto[]>(`${this.myGroupsUrl}/task-sets`);
  }

  join(request: JoinGroupRequest): Observable<MyGroupDto> {
    return this.http.post<MyGroupDto>(`${this.myGroupsUrl}/join`, request);
  }

  leave(groupId: number): Observable<unknown> {
    return this.http.post(`${this.myGroupsUrl}/${groupId}/leave`, {});
  }
}
