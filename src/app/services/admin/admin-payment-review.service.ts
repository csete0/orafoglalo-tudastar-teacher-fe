import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface NeedsReviewPaymentDto {
  id: number;
  userEmail: string;
  amount: number;
  stripePaymentIntentId: string;
  createdAt: string;
  reviewNote: string | null;
}

@Injectable({ providedIn: 'root' })
export class AdminPaymentReviewService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin`;

  getNeedsReview(): Observable<NeedsReviewPaymentDto[]> {
    return this.http.get<NeedsReviewPaymentDto[]>(`${this.baseUrl}/payments/needs-review`);
  }

  markReviewDone(id: number): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/payments/${id}/review-done`, {});
  }
}
