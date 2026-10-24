import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TeacherRubricService } from './teacher-rubric.service';
import { TeacherRunInputDto } from '../../models/teacher-content.model';
import { expectRequest } from '../testing/expect-request';

describe('TeacherRubricService', () => {
  let service: TeacherRubricService;
  let httpMock: HttpTestingController;
  const task = `${environment.apiUrl}/teacher/task-sets/9/tasks/3`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherRubricService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getGradingQuality: GET …/tasks/{taskId}/grading-quality', () => {
    expectRequest(httpMock, service.getGradingQuality(9, 3), { method: 'GET', url: `${task}/grading-quality` });
  });

  it('getRubric: GET …/rubric; null válasz → null', () => {
    const result = expectRequest(httpMock, service.getRubric(9, 3), { method: 'GET', url: `${task}/rubric` });
    expect(result).toBeNull();
  });

  it('createRubricDraft: POST …/rubric/draft üres törzzsel', () => {
    expectRequest(httpMock, service.createRubricDraft(9, 3), { method: 'POST', url: `${task}/rubric/draft`, body: {} });
  });

  it('updateRubricItem: PUT …/rubric/items/{itemId} a kérés törzsével', () => {
    const request = { text: 'A lekérdezés rendez.', points: 2 };
    expectRequest(httpMock, service.updateRubricItem(9, 3, 14, request), { method: 'PUT', url: `${task}/rubric/items/14`, body: request });
  });

  it('deleteRubricItem: DELETE …/rubric/items/{itemId}', () => {
    expectRequest(httpMock, service.deleteRubricItem(9, 3, 14), { method: 'DELETE', url: `${task}/rubric/items/14` });
  });

  it('approveRubric: POST …/rubric/approve üres törzzsel', () => {
    expectRequest(httpMock, service.approveRubric(9, 3), { method: 'POST', url: `${task}/rubric/approve`, body: {} });
  });

  it('getRunInput / saveRunInput: GET és PUT …/run-input', () => {
    const input: TeacherRunInputDto = { stdin: '3\n4', isRandom: false };
    expectRequest(httpMock, service.getRunInput(9, 3), { method: 'GET', url: `${task}/run-input` });
    expectRequest(httpMock, service.saveRunInput(9, 3, input), { method: 'PUT', url: `${task}/run-input`, body: input });
  });

  it('getRubricQuota: GET /teacher/rubric-quota', () => {
    expectRequest(httpMock, service.getRubricQuota(), { method: 'GET', url: `${environment.apiUrl}/teacher/rubric-quota` });
  });
});
