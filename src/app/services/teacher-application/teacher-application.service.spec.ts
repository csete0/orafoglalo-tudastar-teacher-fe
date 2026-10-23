import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TeacherApplicationService } from './teacher-application.service';
import { ApplyTeacherRequest } from '../../models/teacher-application.model';
import { expectRequest } from '../testing/expect-request';

describe('TeacherApplicationService', () => {
  let service: TeacherApplicationService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/teacher-applications`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherApplicationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('apply: POST /teacher-applications a kérés törzsével', () => {
    const request: ApplyTeacherRequest = { motivation: 'Informatikát tanítok.', institutionName: 'Petőfi Gimnázium' };
    expectRequest(httpMock, service.apply(request), { method: 'POST', url: api, body: request });
  });

  it('getMine: GET /teacher-applications/mine', () => {
    expectRequest(httpMock, service.getMine(), { method: 'GET', url: `${api}/mine` });
  });
});
