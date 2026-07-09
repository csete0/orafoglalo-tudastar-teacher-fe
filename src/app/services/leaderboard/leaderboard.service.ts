import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LeaderboardCategory, LeaderboardPeriod, LeaderboardResponseDto } from '../../models/leaderboard.model';

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/leaderboard`;

  getGroupLeaderboard(groupId: number, category: LeaderboardCategory, period: LeaderboardPeriod): Observable<LeaderboardResponseDto> {
    return this.http.get<LeaderboardResponseDto>(`${this.baseUrl}/group/${groupId}`, {
      params: new HttpParams().set('category', category).set('period', period),
    });
  }

  getSchoolLeaderboard(schoolId: number, category: LeaderboardCategory, period: LeaderboardPeriod): Observable<LeaderboardResponseDto> {
    return this.http.get<LeaderboardResponseDto>(`${this.baseUrl}/school/${schoolId}`, {
      params: new HttpParams().set('category', category).set('period', period),
    });
  }
}
