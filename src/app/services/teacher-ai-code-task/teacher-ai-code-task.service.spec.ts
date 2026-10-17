import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TeacherAiCodeTaskService } from './teacher-ai-code-task.service';
import { AiCodeTaskJobDto } from '../../models/ai-code-task.model';

describe('TeacherAiCodeTaskService', () => {
  let service: TeacherAiCodeTaskService;
  let httpMock: HttpTestingController;
  const activeUrl = `${environment.apiUrl}/teacher/task-sets/9/ai-code-task/jobs/active`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherAiCodeTaskService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('aktív job: 204 → null', () => {
    let result: AiCodeTaskJobDto | null | undefined;
    service.getActiveJob(9).subscribe((job) => (result = job));
    httpMock.expectOne(activeUrl).flush(null, { status: 204, statusText: 'No Content' });
    expect(result).toBeNull();
  });

  it('aktív job: 200 → a job', () => {
    let result: AiCodeTaskJobDto | null | undefined;
    service.getActiveJob(9).subscribe((job) => (result = job));
    httpMock.expectOne(activeUrl).flush({ jobId: 77, status: 'running' });
    expect(result).toEqual({ jobId: 77, status: 'running' });
  });

  it('elvetés: POST …/jobs/{jobId}/dismiss', () => {
    let done = false;
    service.dismiss(9, 77).subscribe(() => (done = true));
    const req = httpMock.expectOne(`${environment.apiUrl}/teacher/task-sets/9/ai-code-task/jobs/77/dismiss`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(done).toBe(true);
  });
});
