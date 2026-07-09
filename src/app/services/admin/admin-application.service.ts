import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RejectTeacherApplicationRequest, TeacherApplicationAdminDto } from '../../models/teacher-application.model';

@Injectable({ providedIn: 'root' })
export class AdminApplicationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/teacher-applications`;

  getApplications(status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending'): Observable<TeacherApplicationAdminDto[]> {
    return this.http.get<TeacherApplicationAdminDto[]>(this.baseUrl, { params: { status } });
  }

  approve(id: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/approve`, {});
  }

  reject(id: number, request: RejectTeacherApplicationRequest): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${id}/reject`, request);
  }
}
