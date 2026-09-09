import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { InstitutionalInquiryListDto } from '../../models/institutional-inquiry.model';

@Injectable({ providedIn: 'root' })
export class AdminInstitutionalInquiryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/admin`;

  getInquiries(onlyOpen = true, page = 1, pageSize = 20): Observable<InstitutionalInquiryListDto> {
    const params = new HttpParams()
      .set('onlyOpen', onlyOpen)
      .set('page', page)
      .set('pageSize', pageSize);
    return this.http.get<InstitutionalInquiryListDto>(`${this.baseUrl}/institutional-inquiries`, { params });
  }

  markHandled(id: number, note: string | null): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/institutional-inquiries/${id}/handled`, { note });
  }
}
