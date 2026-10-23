import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TeacherDesktopTaskService } from './teacher-desktop-task.service';
import { DesktopTaskJobDto, DesktopTaskProposal, DesktopTaskStartRequest } from '../../models/desktop-task.model';
import { expectRequest } from '../testing/expect-request';

describe('TeacherDesktopTaskService', () => {
  let service: TeacherDesktopTaskService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/teacher/task-sets/9/desktop-task`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherDesktopTaskService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('startJob: POST …/desktop-task/jobs a kérés törzsével', () => {
    const request: DesktopTaskStartRequest = { topic: 'Mozijegy-foglaló', level: 'kozep', count: 2, framework: 'wpf' };
    expectRequest(httpMock, service.startJob(9, request), { method: 'POST', url: `${api}/jobs`, body: request });
  });

  it('getJob: GET …/desktop-task/jobs/{jobId}', () => {
    expectRequest(httpMock, service.getJob(9, 77), { method: 'GET', url: `${api}/jobs/77` });
  });

  it('getActiveJob: 204 → null', () => {
    let result: DesktopTaskJobDto | null | undefined;
    service.getActiveJob(9).subscribe((job) => (result = job));
    httpMock.expectOne(`${api}/jobs/active`).flush(null, { status: 204, statusText: 'No Content' });
    expect(result).toBeNull();
  });

  it('getActiveJob: 200 → a job', () => {
    let result: DesktopTaskJobDto | null | undefined;
    service.getActiveJob(9).subscribe((job) => (result = job));
    const req = httpMock.expectOne(`${api}/jobs/active`);
    expect(req.request.method).toBe('GET');
    req.flush({ jobId: 77, status: 'running' });
    expect(result).toEqual({ jobId: 77, status: 'running' });
  });

  it('dismiss: POST …/jobs/{jobId}/dismiss null törzzsel', () => {
    expectRequest(httpMock, service.dismiss(9, 77), { method: 'POST', url: `${api}/jobs/77/dismiss`, body: null });
  });

  it('apply: POST …/desktop-task/apply { jobId, proposal }', () => {
    const proposal: DesktopTaskProposal = { tasks: [] };
    expectRequest(httpMock, service.apply(9, 77, proposal), { method: 'POST', url: `${api}/apply`, body: { jobId: 77, proposal } });
  });
});
