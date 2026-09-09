import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CouponAdminDto, CouponCreateRequest, SubscriptionTypeOption } from '../../models/coupon.model';

/** B3: kuponok admin CRUD - törlés nincs (a beváltás Payment-hivatkozást tart), csak inaktiválás. */
@Injectable({ providedIn: 'root' })
export class AdminCouponService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin/coupons`;

  list(): Observable<CouponAdminDto[]> {
    return this.http.get<CouponAdminDto[]>(this.baseUrl);
  }

  create(request: CouponCreateRequest): Observable<CouponAdminDto> {
    return this.http.post<CouponAdminDto>(this.baseUrl, request);
  }

  deactivate(id: number): Observable<CouponAdminDto> {
    return this.http.post<CouponAdminDto>(`${this.baseUrl}/${id}/deactivate`, {});
  }

  /** A csomag-szűrő legördülőjéhez - az aktív, fizetős csomagok (a `free` kuponra nem érvényes). */
  subscriptionTypes(): Observable<SubscriptionTypeOption[]> {
    return this.http.get<SubscriptionTypeOption[]>(`${environment.apiUrl}/Payment/sub-types`);
  }
}
