import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { GroupSeatService } from './group-seat.service';
import { expectRequest } from '../testing/expect-request';

describe('GroupSeatService', () => {
  let service: GroupSeatService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/groups`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(GroupSeatService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getOverview: GET /groups/{id}/seats', () => {
    expectRequest(httpMock, service.getOverview(4), { method: 'GET', url: `${api}/4/seats` });
  });

  it('releaseSeat: POST /groups/{id}/seats/{userId}/release üres törzzsel', () => {
    expectRequest(httpMock, service.releaseSeat(4, 12), { method: 'POST', url: `${api}/4/seats/12/release`, body: {} });
  });

  it('releaseAll: POST /groups/{id}/seats/release-all üres törzzsel', () => {
    expectRequest(httpMock, service.releaseAll(4), { method: 'POST', url: `${api}/4/seats/release-all`, body: {} });
  });
});
