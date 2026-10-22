import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { isOralExamDisabled, TeacherOralExamService } from './teacher-oral-exam.service';
import { oralTopicErrors } from '../../models/teacher-oral-exam.model';

describe('TeacherOralExamService', () => {
  const base = `${environment.apiUrl}/teacher/oral-exams`;
  let service: TeacherOralExamService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherOralExamService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** A konstruktor egyszer lekéri a keretet (a „Szóbeli” fül láthatóságához). */
  function flushAvailability(response: object | HttpErrorResponse) {
    const req = http.expectOne({ method: 'GET', url: `${base}/quota` });
    if (response instanceof HttpErrorResponse) req.flush(response.error, { status: response.status, statusText: 'x' });
    else req.flush(response);
  }

  it('elérhető, ha a keret-végpont válaszol; FeatureDisabled-nél nem; más hibánál igen', () => {
    expect(service.available()).toBe(false);
    flushAvailability({ month: '2026-10' });
    expect(service.available()).toBe(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherOralExamService);
    http = TestBed.inject(HttpTestingController);
    flushAvailability(new HttpErrorResponse({ status: 404, error: { errorType: 'FeatureDisabled' } }));
    expect(service.available()).toBe(false);

    expect(isOralExamDisabled(new HttpErrorResponse({ status: 404, error: { errorType: 'NotFound' } }))).toBe(false);
    expect(isOralExamDisabled(new HttpErrorResponse({ status: 500 }))).toBe(false);
  });

  it('a témák, a kiadások és a munkamenetek végpontjai a szerződés szerint', () => {
    flushAvailability({});
    const update = { title: 'T', voiceMinuteOptions: [5, 10], defaultVoiceMinutes: 10, items: [], rubric: [] };
    const assign = { topicId: 3, profileSlug: null, groupId: 1, mode: 'exam' as const, voiceMinutes: 10, opensAt: null, dueAt: null };
    const review = { criteria: [{ key: 'tartalom', points: 12 }], note: 'Jó' };
    service.profiles().subscribe();
    service.topics().subscribe();
    service.topic(3).subscribe();
    service.updateTopic(3, update).subscribe();
    service.approveTopic(3).subscribe();
    service.deleteTopic(3).subscribe();
    service.assignments().subscribe();
    service.assignments(7).subscribe();
    service.assign(assign).subscribe();
    service.revokeAssignment(9).subscribe();
    service.results(9).subscribe();
    service.publishResults(9).subscribe();
    service.session(11).subscribe();
    service.review(11, review).subscribe();
    service.deleteReview(11).subscribe();

    http.expectOne({ method: 'GET', url: `${base}/profiles` }).flush([]);
    http.expectOne({ method: 'GET', url: `${base}/topics` }).flush([]);
    http.expectOne({ method: 'GET', url: `${base}/topics/3` }).flush({});
    expect(http.expectOne({ method: 'PUT', url: `${base}/topics/3` }).request.body).toEqual(update);
    http.expectOne({ method: 'POST', url: `${base}/topics/3/approve` }).flush({});
    http.expectOne({ method: 'DELETE', url: `${base}/topics/3` }).flush(null);
    http.expectOne({ method: 'GET', url: `${base}/assignments` }).flush([]);
    http.expectOne({ method: 'GET', url: `${base}/assignments?groupId=7` }).flush([]);
    expect(http.expectOne({ method: 'POST', url: `${base}/assignments` }).request.body).toEqual(assign);
    http.expectOne({ method: 'DELETE', url: `${base}/assignments/9` }).flush(null);
    http.expectOne({ method: 'GET', url: `${base}/assignments/9/results` }).flush({});
    http.expectOne({ method: 'POST', url: `${base}/assignments/9/publish` }).flush({});
    http.expectOne({ method: 'GET', url: `${base}/sessions/11` }).flush({});
    expect(http.expectOne({ method: 'PUT', url: `${base}/sessions/11/review` }).request.body).toEqual(review);
    http.expectOne({ method: 'DELETE', url: `${base}/sessions/11/review` }).flush({});
  });

  it('vázlat: multipart űrlap szöveggel vagy fájllal (a kettő közül egy)', () => {
    flushAvailability({});
    service.draft({ text: 'anyag', file: null, title: 'Fotoszintézis', itemCount: 4, questionsPerItem: 3, audience: 'emelt' }).subscribe();
    const textForm = http.expectOne({ method: 'POST', url: `${base}/topics/draft` }).request.body as FormData;
    expect([...textForm.entries()]).toEqual([
      ['text', 'anyag'], ['title', 'Fotoszintézis'], ['itemCount', '4'], ['questionsPerItem', '3'], ['audience', 'emelt'],
    ]);

    const file = new File(['x'], 'jegyzet.pdf');
    service.draft({ text: null, file, title: 'T', itemCount: 3, questionsPerItem: 3, audience: 'kozep' }).subscribe();
    const fileForm = http.expectOne({ method: 'POST', url: `${base}/topics/draft` }).request.body as FormData;
    expect(fileForm.has('text')).toBe(false);
    expect((fileForm.get('file') as File).name).toBe('jegyzet.pdf');
  });
});

describe('oralTopicErrors', () => {
  it('a validátor hibalistáját mezőútvonalra bontja; más hibánál üres', () => {
    const err = new HttpErrorResponse({
      status: 400,
      error: {
        errorType: 'OralTopicInvalid',
        errorMessage: 'A téma nem menthető',
        details: { errors: ['items[0].questions[2].expected: legalább 2 elem kell', 'rubric[1].points: 1–100', 'útvonal nélküli hiba'] },
      },
    });
    expect(oralTopicErrors(err)).toEqual([
      { path: 'items[0].questions[2].expected', message: 'legalább 2 elem kell' },
      { path: 'rubric[1].points', message: '1–100' },
      { path: '', message: 'útvonal nélküli hiba' },
    ]);
    expect(oralTopicErrors(new HttpErrorResponse({ status: 400, error: { errorType: 'Other', details: { errors: ['x: y'] } } }))).toEqual([]);
    expect(oralTopicErrors(null)).toEqual([]);
  });
});
