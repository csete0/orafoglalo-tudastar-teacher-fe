import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateInstitutionalLicenseRequest,
  InstitutionalLicenseDto,
  InstitutionalLicenseRevokeResultDto,
  InstitutionalLicenseUsageDto,
  InstitutionalSeatHolderDto,
  UpdateInstitutionalLicenseRequest,
} from '../../models/institutional-license.model';

@Injectable({ providedIn: 'root' })
export class AdminLicenseService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin`;

  getLicenses(): Observable<InstitutionalLicenseDto[]> {
    return this.http.get<InstitutionalLicenseDto[]>(`${this.baseUrl}/licenses`);
  }

  create(request: CreateInstitutionalLicenseRequest): Observable<InstitutionalLicenseDto> {
    return this.http.post<InstitutionalLicenseDto>(`${this.baseUrl}/licenses`, request);
  }

  update(id: number, request: UpdateInstitutionalLicenseRequest): Observable<InstitutionalLicenseDto> {
    return this.http.put<InstitutionalLicenseDto>(`${this.baseUrl}/licenses/${id}`, request);
  }

  // UI-TT-200: a válasz teste (releasedCount/skippedDueToActiveSessionCount) a
  // valóságban mindig megérkezik - `Observable<void>`-ra tipizálva korábban fizikailag
  // eldobta a backend `SkippedDueToActiveSessionCount` mezőjét, mielőtt bármi kiolvashatta
  // volna.
  revoke(id: number): Observable<InstitutionalLicenseRevokeResultDto> {
    return this.http.post<InstitutionalLicenseRevokeResultDto>(`${this.baseUrl}/licenses/${id}/revoke`, {});
  }

  getSeats(id: number): Observable<InstitutionalSeatHolderDto[]> {
    return this.http.get<InstitutionalSeatHolderDto[]>(`${this.baseUrl}/licenses/${id}/seats`);
  }

  getUsage(id: number, days = 30): Observable<InstitutionalLicenseUsageDto> {
    return this.http.get<InstitutionalLicenseUsageDto>(`${this.baseUrl}/licenses/${id}/usage?days=${days}`);
  }

  releaseSeat(id: number, userId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/licenses/${id}/seats/${userId}/release`, {});
  }
}
