import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TeacherProjectService } from './teacher-project.service';
import { AssignProjectRequest } from '../../models/teacher-project.model';
import { expectRequest } from '../testing/expect-request';

describe('TeacherProjectService', () => {
  let service: TeacherProjectService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/teacher`;
  const student = `${api}/project-assignments/5/students/12`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherProjectService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('list: GET /teacher/projects', () => {
    expectRequest(httpMock, service.list(), { method: 'GET', url: `${api}/projects` });
  });

  it('assign: POST /teacher/projects/{slug}/assignments (kódolt sluggal) a kérés törzsével', () => {
    const request: AssignProjectRequest = {
      groupId: 4,
      opensAt: null,
      dueAt: '2026-11-01T10:00:00Z',
      runtime: 'browser-python',
      isTest: false,
      timeLimitSeconds: null,
    };
    expectRequest(httpMock, service.assign('todo app', request), {
      method: 'POST',
      url: `${api}/projects/todo%20app/assignments`,
      body: request,
    });
  });

  it('revoke: DELETE /teacher/project-assignments/{id}', () => {
    expectRequest(httpMock, service.revoke(5), { method: 'DELETE', url: `${api}/project-assignments/5` });
  });

  it('forGroup: GET /teacher/groups/{id}/project-assignments', () => {
    expectRequest(httpMock, service.forGroup(4), { method: 'GET', url: `${api}/groups/4/project-assignments` });
  });

  it('students: GET /teacher/project-assignments/{id}/students', () => {
    expectRequest(httpMock, service.students(5), { method: 'GET', url: `${api}/project-assignments/5/students` });
  });

  it('studentCode: GET …/students/{userId}/workspace', () => {
    expectRequest(httpMock, service.studentCode(5, 12), { method: 'GET', url: `${student}/workspace` });
  });

  it('comments: GET …/students/{userId}/comments', () => {
    expectRequest(httpMock, service.comments(5, 12), { method: 'GET', url: `${student}/comments` });
  });

  it('createComment: POST …/comments { path, line, body }', () => {
    expectRequest(httpMock, service.createComment(5, 12, 'src/main.py', 7, 'Ide kell egy ellenőrzés.'), {
      method: 'POST',
      url: `${student}/comments`,
      body: { path: 'src/main.py', line: 7, body: 'Ide kell egy ellenőrzés.' },
    });
  });

  it('replyComment: POST …/comments/{commentId}/replies { body }', () => {
    expectRequest(httpMock, service.replyComment(5, 12, 33, 'Köszi!'), {
      method: 'POST',
      url: `${student}/comments/33/replies`,
      body: { body: 'Köszi!' },
    });
  });

  it('commentSuggestions: POST …/comment-suggestions { paths } (null = minden fájl)', () => {
    expectRequest(httpMock, service.commentSuggestions(5, 12, null), {
      method: 'POST',
      url: `${student}/comment-suggestions`,
      body: { paths: null },
    });
    expectRequest(httpMock, service.commentSuggestions(5, 12, ['a.py']), {
      method: 'POST',
      url: `${student}/comment-suggestions`,
      body: { paths: ['a.py'] },
    });
  });
});
