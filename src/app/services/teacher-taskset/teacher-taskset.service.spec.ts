import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TeacherTaskSetService } from './teacher-taskset.service';
import {
  AssignTaskSetToGroupRequest,
  CatalogAssignRequest,
  CreateTeacherSubTaskRequest,
  CreateTeacherTaskRequest,
  CreateTeacherTaskSetRequest,
  SnippetDto,
  SqlFilesValidationRequest,
  SqlGenerationRequest,
  SqlQueryApplyRequest,
  SqlQueryGenerationRequest,
  SqlQueryInput,
} from '../../models/teacher-content.model';
import { expectRequest } from '../testing/expect-request';

describe('TeacherTaskSetService', () => {
  let service: TeacherTaskSetService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/teacher`;
  const snippets: SnippetDto[] = [{ programmingLanguageId: 1, code: 'print(1)' }];
  const queries: SqlQueryInput[] = [{ subTaskId: 4, sql: 'SELECT 1;' }];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(TeacherTaskSetService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('feladatsor', () => {
    const request: CreateTeacherTaskSetRequest = { title: 'Ciklusok', description: '', levelId: 2, rowVersion: 'AAA=', requiredSkillIds: [] };

    it('getMine / getSkills / getDetail: GET', () => {
      expectRequest(httpMock, service.getMine(), { method: 'GET', url: `${api}/task-sets` });
      expectRequest(httpMock, service.getSkills(), { method: 'GET', url: `${api}/skills` });
      expectRequest(httpMock, service.getDetail(9), { method: 'GET', url: `${api}/task-sets/9` });
    });

    it('create / update / delete', () => {
      expectRequest(httpMock, service.create(request), { method: 'POST', url: `${api}/task-sets`, body: request });
      expectRequest(httpMock, service.update(9, request), { method: 'PUT', url: `${api}/task-sets/9`, body: request });
      expectRequest(httpMock, service.delete(9), { method: 'DELETE', url: `${api}/task-sets/9` });
    });

    it('publish / unpublish: POST üres törzzsel', () => {
      expectRequest(httpMock, service.publish(9), { method: 'POST', url: `${api}/task-sets/9/publish`, body: {} });
      expectRequest(httpMock, service.unpublish(9), { method: 'POST', url: `${api}/task-sets/9/unpublish`, body: {} });
    });
  });

  describe('feladat és részfeladat', () => {
    it('addTask / updateTask / deleteTask', () => {
      const request: CreateTeacherTaskRequest = { title: '1. feladat', description: 'Leírás', maxPoints: 10, taskTypeIds: [6] };
      expectRequest(httpMock, service.addTask(9, request), { method: 'POST', url: `${api}/task-sets/9/tasks`, body: request });
      expectRequest(httpMock, service.updateTask(3, request), { method: 'PUT', url: `${api}/tasks/3`, body: request });
      expectRequest(httpMock, service.deleteTask(3), { method: 'DELETE', url: `${api}/tasks/3` });
    });

    it('addSubTask / updateSubTask / deleteSubTask', () => {
      const request: CreateTeacherSubTaskRequest = { description: 'Írasd ki az összeget.', points: 2, label: 'a)' };
      expectRequest(httpMock, service.addSubTask(3, request), { method: 'POST', url: `${api}/tasks/3/subtasks`, body: request });
      expectRequest(httpMock, service.updateSubTask(4, request), { method: 'PUT', url: `${api}/subtasks/4`, body: request });
      expectRequest(httpMock, service.deleteSubTask(4), { method: 'DELETE', url: `${api}/subtasks/4` });
    });

    it('kódrészletek: PUT a részfeladat és az összevont megoldás végpontjára, a tömb a törzs', () => {
      expectRequest(httpMock, service.upsertSubTaskSnippets(4, snippets), { method: 'PUT', url: `${api}/subtasks/4/snippets`, body: snippets });
      expectRequest(httpMock, service.upsertCompleteSolutionSnippets(3, snippets), {
        method: 'PUT',
        url: `${api}/tasks/3/complete-solution-snippets`,
        body: snippets,
      });
    });
  });

  describe('fájlok', () => {
    it('uploadFile: POST multipart (file, kind, taskId csak megadva)', () => {
      const file = new File(['CREATE TABLE t (id int);'], 'create.sql');
      service.uploadFile(9, 'create', file, 3).subscribe();
      let req = httpMock.expectOne(`${api}/task-sets/9/files`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeInstanceOf(FormData);
      const form = req.request.body as FormData;
      expect((form.get('file') as File).name).toBe('create.sql');
      expect(form.get('kind')).toBe('create');
      expect(form.get('taskId')).toBe('3');
      req.flush(null);

      service.uploadFile(9, 'attachment', file).subscribe();
      req = httpMock.expectOne(`${api}/task-sets/9/files`);
      expect((req.request.body as FormData).has('taskId')).toBe(false);
      req.flush(null);
    });

    it('deleteFile: DELETE /teacher/files/{guid}', () => {
      expectRequest(httpMock, service.deleteFile('6f1c-guid'), { method: 'DELETE', url: `${api}/files/6f1c-guid` });
    });
  });

  describe('SQL-segédek', () => {
    it('generateSqlFiles / validateSqlFiles', () => {
      const generation: SqlGenerationRequest = { source: 'dataFiles', fileIds: ['f1'], hasHeader: true };
      const validation: SqlFilesValidationRequest = { createSql: 'CREATE TABLE t (id int);', createLiteSql: null };
      expectRequest(httpMock, service.generateSqlFiles(9, generation), { method: 'POST', url: `${api}/task-sets/9/sql-generation`, body: generation });
      expectRequest(httpMock, service.validateSqlFiles(9, validation), {
        method: 'POST',
        url: `${api}/task-sets/9/sql-generation/validate`,
        body: validation,
      });
    });

    it('generateSqlQueries / validateSqlQueries / applySqlQueries', () => {
      const base = `${api}/task-sets/9/tasks/3/sql-queries`;
      const generation: SqlQueryGenerationRequest = { regenerate: true, overwrite: false, subTaskIds: [4] };
      const apply: SqlQueryApplyRequest = { queries, overwrite: true };
      expectRequest(httpMock, service.generateSqlQueries(9, 3, generation), { method: 'POST', url: `${base}/generate`, body: generation });
      expectRequest(httpMock, service.validateSqlQueries(9, 3, queries, false), {
        method: 'POST',
        url: `${base}/validate`,
        body: { queries, overwrite: false },
      });
      expectRequest(httpMock, service.applySqlQueries(9, 3, apply), { method: 'POST', url: `${base}/apply`, body: apply });
    });
  });

  describe('katalógus', () => {
    const url = `${api}/catalog/task-sets`;

    it('getCatalog: a lapozás mindig, a szűrők csak megadva kerülnek a query-be', () => {
      expectRequest(httpMock, service.getCatalog({ page: 1, pageSize: 20, q: '', categoryId: null }), {
        method: 'GET',
        url,
        params: { page: '1', pageSize: '20' },
      });
      expectRequest(httpMock, service.getCatalog({ page: 2, pageSize: 20, q: 'sql', categoryId: 0, levelId: 2, year: 2024 }), {
        method: 'GET',
        url,
        params: { page: '2', pageSize: '20', q: 'sql', categoryId: '0', levelId: '2', year: '2024' },
      });
    });

    it('copyFromCatalog: POST …/copy, copyAgain csak true esetén a törzsben', () => {
      expectRequest(httpMock, service.copyFromCatalog(12), { method: 'POST', url: `${url}/12/copy`, body: {} });
      expectRequest(httpMock, service.copyFromCatalog(12, true), { method: 'POST', url: `${url}/12/copy`, body: { copyAgain: true } });
    });

    it('catalogAssign: POST /teacher/groups/{id}/catalog-assign a kérés törzsével', () => {
      const request: CatalogAssignRequest = { catalogTaskSetId: 12, opensAt: null, dueAt: '2026-11-01T10:00:00Z' };
      expectRequest(httpMock, service.catalogAssign(4, request), { method: 'POST', url: `${api}/groups/4/catalog-assign`, body: request });
    });
  });

  describe('kiadás', () => {
    it('getTaskSetAssignments / assignToGroup / revokeAssignment / getGroupTaskSetAssignments', () => {
      const request: AssignTaskSetToGroupRequest = { groupId: 4, isTest: true, timeLimitMinutes: 45 };
      expectRequest(httpMock, service.getTaskSetAssignments(9), { method: 'GET', url: `${api}/task-sets/9/assignments` });
      expectRequest(httpMock, service.assignToGroup(9, request), { method: 'POST', url: `${api}/task-sets/9/assign`, body: request });
      expectRequest(httpMock, service.revokeAssignment(21), { method: 'DELETE', url: `${api}/task-set-assignments/21` });
      expectRequest(httpMock, service.getGroupTaskSetAssignments(4), { method: 'GET', url: `${api}/groups/4/task-set-assignments` });
    });
  });
});
