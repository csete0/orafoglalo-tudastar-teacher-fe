import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { CreateInstitutionalInquiryRequest } from '../models/institutional-inquiry.model';

@Injectable({ providedIn: 'root' })
export class InstitutionalInquiryService {
  private readonly http = inject(HttpClient);

  submit(request: CreateInstitutionalInquiryRequest): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/institutional-inquiries`, request);
  }
}
