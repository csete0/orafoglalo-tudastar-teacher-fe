import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { KahootHostService } from './kahoot-host.service';
import { expectRequest } from '../testing/expect-request';

describe('KahootHostService', () => {
  let service: KahootHostService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/teacher`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(KahootHostService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('createRoom: POST /teacher/quizzes/{quizId}/kahoot-sessions { groupId }', () => {
    expectRequest(httpMock, service.createRoom(9, 4), { method: 'POST', url: `${api}/quizzes/9/kahoot-sessions`, body: { groupId: 4 } });
  });

  it('getGames: GET /teacher/quizzes/{quizId}/kahoot-sessions', () => {
    expectRequest(httpMock, service.getGames(9), { method: 'GET', url: `${api}/quizzes/9/kahoot-sessions` });
  });

  it('getRoom: GET /teacher/kahoot-sessions/{id}', () => {
    expectRequest(httpMock, service.getRoom(21), { method: 'GET', url: `${api}/kahoot-sessions/21` });
  });

  it('getActiveRooms: GET /teacher/kahoot-sessions/active', () => {
    expectRequest(httpMock, service.getActiveRooms(), { method: 'GET', url: `${api}/kahoot-sessions/active` });
  });
});
