import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateInstitutionalLicenseRequest,
  InstitutionalLicenseDto,
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

  revoke(id: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/licenses/${id}/revoke`, {});
  }

  getSeats(id: number): Observable<InstitutionalSeatHolderDto[]> {
    return this.http.get<InstitutionalSeatHolderDto[]>(`${this.baseUrl}/licenses/${id}/seats`);
  }

  releaseSeat(id: number, userId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/licenses/${id}/seats/${userId}/release`, {});
  }
}
