import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { ClassTestService } from './class-test.service';
import { ReportService } from '../report/report.service';
import { TeacherTaskSetService } from '../teacher-taskset/teacher-taskset.service';

/** Tanári segítségek 2: a vázlat-, mentés-, gyenge-pont összefoglaló és a hivatalos sor kiadásának végpontjai és alakjai. */
describe('Tanári segítségek 2 - végpontok', () => {
  let httpMock: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('vázlatok: POST feedback-drafts { userIds }', () => {
    TestBed.inject(ClassTestService).draftFeedback(55, [1, 2]).subscribe();
    const req = httpMock.expectOne(`${api}/teacher/class-tests/55/feedback-drafts`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userIds: [1, 2] });
    req.flush({ assignmentId: 55, model: 'm', items: [], pendingUserIds: [] });
  });

  it('tömeges mentés: PUT feedback { items: [{ examSessionId, feedback }] }', () => {
    TestBed.inject(ClassTestService).saveFeedback(55, [{ examSessionId: 301, feedback: 'Szép.' }, { examSessionId: 302, feedback: null }]).subscribe();
    const req = httpMock.expectOne(`${api}/teacher/class-tests/55/feedback`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ items: [{ examSessionId: 301, feedback: 'Szép.' }, { examSessionId: 302, feedback: null }] });
    req.flush({ saved: 2, examSessionIds: [301, 302], notifiedStudents: 0 });
  });

  it('gyenge pontok összefoglalója: GET weak-topics/summary (küszöb opcionális)', () => {
    const reports = TestBed.inject(ReportService);
    reports.getGroupWeakTopicSummary(12).subscribe();
    httpMock.expectOne(`${api}/teacher/groups/12/weak-topics/summary`).flush({});
    reports.getGroupWeakTopicSummary(12, 40).subscribe();
    httpMock.expectOne(`${api}/teacher/groups/12/weak-topics/summary?threshold=40`).flush({});
  });

  it('hivatalos sor kiadása: POST groups/{id}/catalog-assign', () => {
    TestBed.inject(TeacherTaskSetService).catalogAssign(12, { catalogTaskSetId: 501, opensAt: null, dueAt: null }).subscribe();
    const req = httpMock.expectOne(`${api}/teacher/groups/12/catalog-assign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ catalogTaskSetId: 501, opensAt: null, dueAt: null });
    req.flush({});
  });
});
