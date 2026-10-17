import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TeacherQuizService } from './teacher-quiz.service';

/**
 * C5: a szerkesztő-végpontok két gyökér alatt élnek azonos alakkal (api/teacher, api/admin) -
 * a `scope` paraméter kizárólag a gyökeret váltja. A csoport-függő végpontok (kiadás,
 * eredmények) nem kapnak scope-ot, mert a platform-kvíznek nincs csoportja.
 */
describe('TeacherQuizService - C5 scope (api/teacher ↔ api/admin)', () => {
  let service: TeacherQuizService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    service = TestBed.inject(TeacherQuizService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('scope nélkül a tanári gyökeret hívja (a meglévő hívók változatlanok)', () => {
    service.getMine().subscribe();
    service.getDetail(7).subscribe();
    service.publish(7).subscribe();

    httpMock.expectOne({ method: 'GET', url: `${environment.apiUrl}/teacher/quizzes` }).flush([]);
    httpMock.expectOne({ method: 'GET', url: `${environment.apiUrl}/teacher/quizzes/7` }).flush({});
    httpMock.expectOne({ method: 'POST', url: `${environment.apiUrl}/teacher/quizzes/7/publish` }).flush({});
  });

  it("scope = 'admin' esetén ugyanazok az útvonalak az api/admin gyökér alatt", () => {
    service.getMine('admin').subscribe();
    service.getDetail(7, 'admin').subscribe();
    service.create({ title: 'x', description: null, feedbackMode: 'after', shuffleQuestions: true, allowLateSubmission: true }, 'admin').subscribe();
    service.publish(7, 'admin').subscribe();
    service.unpublish(7).subscribe();
    service.reorderQuestion(10, 20, 'admin').subscribe();
    service.searchBankQuestions('SQL', null, null, 'admin').subscribe();

    httpMock.expectOne({ method: 'GET', url: `${environment.apiUrl}/admin/quizzes` }).flush([]);
    httpMock.expectOne({ method: 'GET', url: `${environment.apiUrl}/admin/quizzes/7` }).flush({});
    httpMock.expectOne({ method: 'POST', url: `${environment.apiUrl}/admin/quizzes` }).flush({});
    httpMock.expectOne({ method: 'POST', url: `${environment.apiUrl}/admin/quizzes/7/publish` }).flush({});
    httpMock.expectOne({ method: 'POST', url: `${environment.apiUrl}/admin/quizzes/7/unpublish` }).flush(null);
    httpMock.expectOne({ method: 'POST', url: `${environment.apiUrl}/admin/quiz-questions/10/reorder` }).flush(null);
    httpMock
      .expectOne((req) => req.method === 'GET' && req.url === `${environment.apiUrl}/admin/quiz-bank-questions`)
      .flush([]);
  });

  it('a kiadás és az eredmények MINDIG a tanári gyökéren maradnak (nincs scope)', () => {
    service.assignToGroup(7, { groupId: 1, dueAt: null }).subscribe();
    service.getResults(7).subscribe();

    httpMock.expectOne({ method: 'POST', url: `${environment.apiUrl}/teacher/quizzes/7/assignments` }).flush({});
    httpMock.expectOne({ method: 'GET', url: `${environment.apiUrl}/teacher/quizzes/7/results` }).flush({});
  });

  it('„Kérdések szövegből”: multipart - szövegnél text, fájlnál file (text nélkül), ismételt questionTypes', () => {
    service.generateFromSource(7, { text: 'tananyag', topicId: 3, count: 5, difficulty: 'Hard', questionTypes: ['single', 'truefalse'] }).subscribe();
    const textReq = httpMock.expectOne(`${environment.apiUrl}/teacher/quizzes/7/generate-from-source`);
    expect(textReq.request.method).toBe('POST');
    const form = textReq.request.body as FormData;
    expect(form.get('text')).toBe('tananyag');
    expect(form.has('file')).toBe(false);
    expect(form.get('topicId')).toBe('3');
    expect(form.get('count')).toBe('5');
    expect(form.get('difficulty')).toBe('Hard');
    expect(form.getAll('questionTypes')).toEqual(['single', 'truefalse']);
    textReq.flush({ created: [], dropped: [], sourceChars: 0, model: 'm', refunded: true });

    const file = new File(['x'], 'jegyzet.pdf');
    service.generateFromSource(7, { file, topicId: 3, count: 2, difficulty: 'Easy', questionTypes: [] }).subscribe();
    const fileReq = httpMock.expectOne(`${environment.apiUrl}/teacher/quizzes/7/generate-from-source`);
    const fileForm = fileReq.request.body as FormData;
    expect((fileForm.get('file') as File).name).toBe('jegyzet.pdf');
    expect(fileForm.has('text')).toBe(false);
    expect(fileForm.has('questionTypes')).toBe(false);
    fileReq.flush({});
  });
});
