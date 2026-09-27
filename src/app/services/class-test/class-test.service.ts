import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClassTestOverview } from '../../models/class-test.model';

/** Dolgozat mód (tanár): áttekintő és az eredmények közzététele. */
@Injectable({ providedIn: 'root' })
export class ClassTestService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/teacher/class-tests`;

  getOverview(assignmentId: number): Observable<ClassTestOverview> {
    return this.http.get<ClassTestOverview>(`${this.baseUrl}/${assignmentId}`);
  }

  publish(assignmentId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${assignmentId}/publish`, {});
  }
}
