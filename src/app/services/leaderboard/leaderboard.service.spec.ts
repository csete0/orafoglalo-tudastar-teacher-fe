import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { LeaderboardService } from './leaderboard.service';
import { expectRequest } from '../testing/expect-request';

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/leaderboard`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(LeaderboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('csoport-ranglista: GET /leaderboard/group/{id}?category&period', () => {
    expectRequest(httpMock, service.getGroupLeaderboard(3, 'quiz', 'weekly'), {
      method: 'GET',
      url: `${api}/group/3`,
      params: { category: 'quiz', period: 'weekly' },
    });
  });

  it('iskola-ranglista: GET /leaderboard/school/{id}?category&period', () => {
    expectRequest(httpMock, service.getSchoolLeaderboard(5, 'exam', 'alltime'), {
      method: 'GET',
      url: `${api}/school/5`,
      params: { category: 'exam', period: 'alltime' },
    });
  });
});
