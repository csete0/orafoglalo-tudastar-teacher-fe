import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ReportService } from './report.service';
import { TeacherScoreOverrideRequest } from '../../models/report.model';
import { expectRequest } from '../testing/expect-request';

describe('ReportService', () => {
  let service: ReportService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/teacher`;
  const from = new Date('2026-10-01T00:00:00Z');
  const to = new Date('2026-10-15T00:00:00Z');
  const range = { from: from.toISOString(), to: to.toISOString() };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(ReportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('aktivitás (from/to csak megadva kerül a query-be)', () => {
    it('getGroupActivity: GET /teacher/groups/{id}/activity', () => {
      expectRequest(httpMock, service.getGroupActivity(4), { method: 'GET', url: `${api}/groups/4/activity` });
      expectRequest(httpMock, service.getGroupActivity(4, from, to), { method: 'GET', url: `${api}/groups/4/activity`, params: range });
    });

    it('getSchoolActivity: GET /teacher/schools/{id}/activity', () => {
      expectRequest(httpMock, service.getSchoolActivity(2, from), {
        method: 'GET',
        url: `${api}/schools/2/activity`,
        params: { from: range.from },
      });
    });

    it('getStudentActivity: GET /teacher/students/{userId}/activity', () => {
      expectRequest(httpMock, service.getStudentActivity(12, undefined, to), {
        method: 'GET',
        url: `${api}/students/12/activity`,
        params: { to: range.to },
      });
    });
  });

  it('getSchoolClassOverview: GET /teacher/schools/{id}/class-overview?days', () => {
    expectRequest(httpMock, service.getSchoolClassOverview(2, 30), {
      method: 'GET',
      url: `${api}/schools/2/class-overview`,
      params: { days: '30' },
    });
  });

  it('getDashboard: GET /teacher/dashboard', () => {
    expectRequest(httpMock, service.getDashboard(), { method: 'GET', url: `${api}/dashboard` });
  });

  it('getGroupWeakTopics: GET …/weak-topics, threshold csak megadva', () => {
    expectRequest(httpMock, service.getGroupWeakTopics(4), { method: 'GET', url: `${api}/groups/4/weak-topics` });
    expectRequest(httpMock, service.getGroupWeakTopics(4, 0), { method: 'GET', url: `${api}/groups/4/weak-topics`, params: { threshold: '0' } });
  });

  it('getGroupWeakTopicSummary: GET …/weak-topics/summary, threshold csak megadva', () => {
    expectRequest(httpMock, service.getGroupWeakTopicSummary(4), { method: 'GET', url: `${api}/groups/4/weak-topics/summary` });
    expectRequest(httpMock, service.getGroupWeakTopicSummary(4, 0.6), {
      method: 'GET',
      url: `${api}/groups/4/weak-topics/summary`,
      params: { threshold: '0.6' },
    });
  });

  it('getAiHelperQuota: GET /teacher/ai-helpers/quota', () => {
    expectRequest(httpMock, service.getAiHelperQuota(), { method: 'GET', url: `${api}/ai-helpers/quota` });
  });

  describe('getTaskSetResults', () => {
    const url = `${api}/task-sets/9/results`;

    it('szűrő nélkül nincs query-paraméter', () => {
      expectRequest(httpMock, service.getTaskSetResults(9), { method: 'GET', url });
    });

    it('a teljes szűrő minden mezője a query-be kerül (a 0-s csoport is)', () => {
      expectRequest(httpMock, service.getTaskSetResults(9, { groupId: 0, from, to, status: 'completed' }), {
        method: 'GET',
        url,
        params: { groupId: '0', ...range, status: 'completed' },
      });
    });

    it('a null csoport kimarad', () => {
      expectRequest(httpMock, service.getTaskSetResults(9, { groupId: null, status: 'all' }), { method: 'GET', url, params: { status: 'all' } });
    });
  });

  it('getAttemptReview: GET /teacher/exam-attempts/{id}/review', () => {
    expectRequest(httpMock, service.getAttemptReview(55), { method: 'GET', url: `${api}/exam-attempts/55/review` });
  });

  it('downloadAttemptFile: GET …/exam-attempts/{id}/files/{fileId} blobként', () => {
    const file = new Blob(['xlsx']);
    const result = expectRequest(httpMock, service.downloadAttemptFile(55, 'f-1'), { method: 'GET', url: `${api}/exam-attempts/55/files/f-1` }, file);
    expect(result).toBeInstanceOf(Blob);
  });

  it('overrideScore / revertOverride: PUT a kéréssel és DELETE …/score-override', () => {
    const request: TeacherScoreOverrideRequest = { earnedPoints: 7, teacherFeedback: null, feedbackProvided: false };
    expectRequest(httpMock, service.overrideScore(55, request), { method: 'PUT', url: `${api}/exam-attempts/55/score-override`, body: request });
    expectRequest(httpMock, service.revertOverride(55), { method: 'DELETE', url: `${api}/exam-attempts/55/score-override` });
  });
});
