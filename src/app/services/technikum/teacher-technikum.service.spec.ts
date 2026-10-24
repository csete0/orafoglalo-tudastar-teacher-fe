import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TeacherTechnikumService } from './teacher-technikum.service';
import { expectRequest } from '../testing/expect-request';

describe('TeacherTechnikumService', () => {
  let service: TeacherTechnikumService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/teacher/technikum`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherTechnikumService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('me: GET /technikum/me (nem a teacher alatt)', () => {
    const result = expectRequest(httpMock, service.me(), { method: 'GET', url: `${environment.apiUrl}/technikum/me` }, { visible: true, hasPremium: false });
    expect(result).toEqual({ visible: true, hasPremium: false });
  });

  it('heatmap: GET …/groups/{id}/heatmap', () => {
    expectRequest(httpMock, service.heatmap(4), { method: 'GET', url: `${api}/groups/4/heatmap` });
  });

  it('snapshot: GET …/sessions/{id}/snapshot', () => {
    expectRequest(httpMock, service.snapshot(70), { method: 'GET', url: `${api}/sessions/70/snapshot` });
  });

  it('guiImage: GET …/sessions/{id}/gui/images/{index} blobként', () => {
    const image = new Blob(['png'], { type: 'image/png' });
    const result = expectRequest(httpMock, service.guiImage(70, 0), { method: 'GET', url: `${api}/sessions/70/gui/images/0` }, image);
    expect(result).toBeInstanceOf(Blob);
  });

  it('comments: GET …/sessions/{id}/comments', () => {
    expectRequest(httpMock, service.comments(70), { method: 'GET', url: `${api}/sessions/70/comments` });
  });

  it('createComment: POST …/sessions/{id}/comments { partKey, path, line, body }', () => {
    expectRequest(httpMock, service.createComment(70, 'gui', 'MainWindow.xaml.cs', 12, 'Nincs hibakezelés.'), {
      method: 'POST',
      url: `${api}/sessions/70/comments`,
      body: { partKey: 'gui', path: 'MainWindow.xaml.cs', line: 12, body: 'Nincs hibakezelés.' },
    });
  });

  it('updateComment: PUT …/sessions/{id}/comments/{commentId} { body }', () => {
    expectRequest(httpMock, service.updateComment(70, 3, 'Javítva.'), {
      method: 'PUT',
      url: `${api}/sessions/70/comments/3`,
      body: { body: 'Javítva.' },
    });
  });

  it('deleteComment: DELETE …/sessions/{id}/comments/{commentId}', () => {
    expectRequest(httpMock, service.deleteComment(70, 3), { method: 'DELETE', url: `${api}/sessions/70/comments/3` });
  });

  it('commentSuggestions: POST …/sessions/{id}/comment-suggestions { partKey, paths }', () => {
    expectRequest(httpMock, service.commentSuggestions(70, 'console', null), {
      method: 'POST',
      url: `${api}/sessions/70/comment-suggestions`,
      body: { partKey: 'console', paths: null },
    });
  });

  it('scoreRubric / revertRubric: PUT { items } és DELETE …/results/{id}/rubric', () => {
    const items = [{ key: 'k1', points: 3 }];
    expectRequest(httpMock, service.scoreRubric(44, items), { method: 'PUT', url: `${api}/results/44/rubric`, body: { items } });
    expectRequest(httpMock, service.revertRubric(44), { method: 'DELETE', url: `${api}/results/44/rubric` });
  });

  it('scoreMachine / revertMachine: PUT { groups, note } és DELETE …/results/{id}/machine', () => {
    const groups = [{ groupKey: 'g1', passed: true }];
    expectRequest(httpMock, service.scoreMachine(44, groups, null), {
      method: 'PUT',
      url: `${api}/results/44/machine`,
      body: { groups, note: null },
    });
    expectRequest(httpMock, service.revertMachine(44), { method: 'DELETE', url: `${api}/results/44/machine` });
  });

  it('publish: POST …/sessions/assignment/{assignmentId}/publish üres törzzsel', () => {
    expectRequest(httpMock, service.publish(8), { method: 'POST', url: `${api}/sessions/assignment/8/publish`, body: {} });
  });
});
