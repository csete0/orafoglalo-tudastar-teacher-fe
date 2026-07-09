import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApplyTeacherRequest, TeacherApplicationDto } from '../../models/teacher-application.model';

@Injectable({ providedIn: 'root' })
export class TeacherApplicationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher-applications`;

  apply(request: ApplyTeacherRequest): Observable<TeacherApplicationDto> {
    return this.http.post<TeacherApplicationDto>(this.baseUrl, request);
  }

  getMine(): Observable<TeacherApplicationDto> {
    return this.http.get<TeacherApplicationDto>(`${this.baseUrl}/mine`);
  }
}
