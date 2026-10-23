import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { InstitutionalInquiryService } from './institutional-inquiry.service';
import { CreateInstitutionalInquiryRequest } from '../models/institutional-inquiry.model';
import { expectRequest } from './testing/expect-request';

describe('InstitutionalInquiryService', () => {
  let service: InstitutionalInquiryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(InstitutionalInquiryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('submit: POST /institutional-inquiries a kérés törzsével', () => {
    const request: CreateInstitutionalInquiryRequest = {
      schoolName: 'Petőfi Gimnázium',
      contactName: 'Kovács Anna',
      email: 'anna@example.com',
      estimatedStudents: 120,
      turnstileToken: 'tt',
    };
    expectRequest(httpMock, service.submit(request), {
      method: 'POST',
      url: `${environment.apiUrl}/institutional-inquiries`,
      body: request,
    });
  });
});
