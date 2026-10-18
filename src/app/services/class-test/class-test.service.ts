import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ClassTestFeedbackDraftsDto,
  ClassTestFeedbackItem,
  ClassTestFeedbackSaveResultDto,
  ClassTestOverview,
} from '../../models/class-test.model';

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

  /** Diákonkénti visszajelzés-vázlat MI-vel (nem ment). `userIds` null: a csoport minden tagja (legfeljebb 60). */
  draftFeedback(assignmentId: number, userIds: number[] | null): Observable<ClassTestFeedbackDraftsDto> {
    return this.http.post<ClassTestFeedbackDraftsDto>(`${this.baseUrl}/${assignmentId}/feedback-drafts`, { userIds });
  }

  /** Egész dolgozatra szóló visszajelzések mentése egy tranzakcióban (pont változatlan; üres szöveg = törlés). */
  saveFeedback(assignmentId: number, items: ClassTestFeedbackItem[]): Observable<ClassTestFeedbackSaveResultDto> {
    return this.http.put<ClassTestFeedbackSaveResultDto>(`${this.baseUrl}/${assignmentId}/feedback`, { items });
  }
}
