import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { MockExamService } from './mock-exam.service';
import { expectRequest } from '../testing/expect-request';

describe('MockExamService', () => {
  let service: MockExamService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/teacher/mock-exams`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(MockExamService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getCurrent: GET /mock-exams/public/current (a publikus végpont); üres válasz → null', () => {
    const result = expectRequest(httpMock, service.getCurrent(), { method: 'GET', url: `${environment.apiUrl}/mock-exams/public/current` });
    expect(result).toBeNull();
  });

  it('get: GET /teacher/mock-exams/{slug}/groups', () => {
    expectRequest(httpMock, service.get('osz-2026'), { method: 'GET', url: `${api}/osz-2026/groups` });
  });

  it('registerGroup: POST /teacher/mock-exams/{slug}/groups { groupId, defaultLevel }', () => {
    expectRequest(httpMock, service.registerGroup('osz-2026', 3, 'emelt'), {
      method: 'POST',
      url: `${api}/osz-2026/groups`,
      body: { groupId: 3, defaultLevel: 'emelt' },
    });
  });

  it('revokeGroup: DELETE /teacher/mock-exams/{slug}/groups/{groupId}', () => {
    expectRequest(httpMock, service.revokeGroup('osz-2026', 3), { method: 'DELETE', url: `${api}/osz-2026/groups/3` });
  });

  it('getGroupResults: GET /teacher/mock-exams/{slug}/groups/{groupId}/results', () => {
    expectRequest(httpMock, service.getGroupResults('osz-2026', 3), { method: 'GET', url: `${api}/osz-2026/groups/3/results` });
  });
});
