import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GroupSeatOverviewDto, ReleaseGroupSeatsResultDto } from '../../models/group-seat.model';

@Injectable({ providedIn: 'root' })
export class GroupSeatService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/groups`;

  getOverview(groupId: number): Observable<GroupSeatOverviewDto> {
    return this.http.get<GroupSeatOverviewDto>(`${this.baseUrl}/${groupId}/seats`);
  }

  releaseSeat(groupId: number, studentUserId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${groupId}/seats/${studentUserId}/release`, {});
  }

  releaseAll(groupId: number): Observable<ReleaseGroupSeatsResultDto> {
    return this.http.post<ReleaseGroupSeatsResultDto>(`${this.baseUrl}/${groupId}/seats/release-all`, {});
  }
}
