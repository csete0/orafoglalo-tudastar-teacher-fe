import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Team, TeamActivity, TeamFile, TeamGithubStatus, TeamMilestone, TeamMilestoneEdit, TeamMilestoneTest, TeamRepoReview, TeamReviews, TeamTree, TestRunnerOption,
} from '../../models/team.model';

/** A tanár által módosítható csapatadatok (PUT api/teacher/teams/{id}; a hiányzó mező változatlan marad). */
export interface TeamUpdate { name?: string; projectTitle?: string; examDate?: string; roles?: Record<number, string | null>; }

/** Vizsgaremek-csapatok a tanári felületen (BE: TeacherTeamsController + a közös TeamsController csapat-adatai). */
@Injectable({ providedIn: 'root' })
export class TeacherTeamService {
  private readonly http = inject(HttpClient);
  private readonly teacher = `${environment.apiUrl}/teacher/teams`;
  private readonly teams = `${environment.apiUrl}/teams`;

  forGroup(groupId: number): Observable<Team[]> { return this.http.get<Team[]>(`${this.teacher}/groups/${groupId}`); }
  create(groupId: number, name: string, memberUserIds: number[], projectTitle: string | null): Observable<Team> {
    return this.http.post<Team>(`${this.teacher}/groups/${groupId}`, { groupId, name, memberUserIds, projectTitle });
  }
  approve(id: number): Observable<Team> { return this.http.post<Team>(`${this.teacher}/${id}/approve`, {}); }
  reject(id: number, reason: string | null): Observable<void> { return this.http.post<void>(`${this.teacher}/${id}/reject`, { reason }); }
  addMember(id: number, userId: number): Observable<Team> { return this.http.post<Team>(`${this.teacher}/${id}/members`, { userId }); }
  removeMember(id: number, userId: number): Observable<Team> { return this.http.delete<Team>(`${this.teacher}/${id}/members/${userId}`); }
  update(id: number, body: TeamUpdate): Observable<Team> { return this.http.put<Team>(`${this.teacher}/${id}`, body); }
  archive(id: number): Observable<void> { return this.http.post<void>(`${this.teacher}/${id}/archive`, {}); }

  get(id: number): Observable<Team> { return this.http.get<Team>(`${this.teams}/${id}`); }
  /** A csapattároló létrehozásának újrapróbálása (ha a létrehozáskor a Git-szerver nem volt elérhető). */
  ensureRepo(id: number): Observable<Team> { return this.http.post<Team>(`${this.teams}/${id}/repo`, {}); }
  activity(id: number, weeks = 16): Observable<TeamActivity> { return this.http.get<TeamActivity>(`${this.teams}/${id}/activity`, { params: { weeks } }); }
  tree(id: number, ref: string | null): Observable<TeamTree> { return this.http.get<TeamTree>(`${this.teams}/${id}/files`, { params: ref ? { ref } : {} }); }
  file(id: number, ref: string, path: string): Observable<TeamFile> {
    return this.http.get<TeamFile>(`${this.teams}/${id}/files/content`, { params: new HttpParams().set('ref', ref).set('path', path) });
  }
  milestones(id: number): Observable<TeamMilestone[]> { return this.http.get<TeamMilestone[]>(`${this.teams}/${id}/milestones`); }
  addMilestone(id: number, edit: TeamMilestoneEdit): Observable<TeamMilestone[]> { return this.http.post<TeamMilestone[]>(`${this.teams}/${id}/milestones`, edit); }
  updateMilestone(id: number, mid: number, edit: TeamMilestoneEdit): Observable<TeamMilestone[]> {
    return this.http.put<TeamMilestone[]>(`${this.teams}/${id}/milestones/${mid}`, edit);
  }
  deleteMilestone(id: number, mid: number): Observable<TeamMilestone[]> { return this.http.delete<TeamMilestone[]>(`${this.teams}/${id}/milestones/${mid}`); }
  checkMilestones(id: number): Observable<TeamMilestone[]> { return this.http.post<TeamMilestone[]>(`${this.teams}/${id}/milestones/check`, {}); }
  tickMilestone(id: number, mid: number, done: boolean, note: string | null): Observable<TeamMilestone[]> {
    return this.http.post<TeamMilestone[]>(`${this.teams}/${id}/milestones/${mid}/tick`, { done, note });
  }
  testMilestone(id: number, mid: number): Observable<TeamMilestoneTest> { return this.http.post<TeamMilestoneTest>(`${this.teams}/${id}/milestones/${mid}/test`, {}); }
  testRunners(): Observable<TestRunnerOption[]> { return this.http.get<TestRunnerOption[]>(`${this.teams}/test-runners`); }
  reviews(id: number): Observable<TeamReviews> { return this.http.get<TeamReviews>(`${this.teams}/${id}/reviews`); }
  requestReview(id: number, branch: string | null): Observable<TeamRepoReview> { return this.http.post<TeamRepoReview>(`${this.teams}/${id}/reviews`, { branch }); }
  github(id: number): Observable<TeamGithubStatus> { return this.http.get<TeamGithubStatus>(`${this.teams}/${id}/github`); }
}
