import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SchoolAdminDto, SchoolMergeResultDto } from '../../models/teacher-moderation.model';

@Injectable({ providedIn: 'root' })
export class AdminSchoolService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin`;

  getSchools(): Observable<SchoolAdminDto[]> {
    return this.http.get<SchoolAdminDto[]>(`${this.baseUrl}/schools`);
  }

  merge(sourceSchoolId: number, targetSchoolId: number): Observable<SchoolMergeResultDto> {
    return this.http.post<SchoolMergeResultDto>(`${this.baseUrl}/schools/merge`, {
      sourceSchoolId,
      targetSchoolId,
    });
  }
}
