import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { SchoolService } from './school.service';
import { CreateSchoolRequest } from '../../models/school.model';
import { expectRequest } from '../testing/expect-request';

describe('SchoolService', () => {
  let service: SchoolService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/schools`;
  const request: CreateSchoolRequest = { name: 'Petőfi Gimnázium', city: 'Szeged' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(SchoolService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getMine: GET /schools', () => {
    expectRequest(httpMock, service.getMine(), { method: 'GET', url: api });
  });

  it('create: POST /schools a kérés törzsével', () => {
    expectRequest(httpMock, service.create(request), { method: 'POST', url: api, body: request });
  });

  it('update: PUT /schools/{id} a kérés törzsével', () => {
    expectRequest(httpMock, service.update(2, request), { method: 'PUT', url: `${api}/2`, body: request });
  });

  it('delete: DELETE /schools/{id}', () => {
    expectRequest(httpMock, service.delete(2), { method: 'DELETE', url: `${api}/2` });
  });

  it('join: POST /schools/join { code }', () => {
    expectRequest(httpMock, service.join({ code: 'T-42' }), { method: 'POST', url: `${api}/join`, body: { code: 'T-42' } });
  });

  it('leave: POST /schools/{id}/leave üres törzzsel', () => {
    expectRequest(httpMock, service.leave(2), { method: 'POST', url: `${api}/2/leave`, body: {} });
  });

  it('regenerateTeacherInvite: POST /schools/{id}/regenerate-teacher-invite üres törzzsel', () => {
    expectRequest(httpMock, service.regenerateTeacherInvite(2), { method: 'POST', url: `${api}/2/regenerate-teacher-invite`, body: {} });
  });

  it('getMembers: GET /schools/{id}/members', () => {
    expectRequest(httpMock, service.getMembers(2), { method: 'GET', url: `${api}/2/members` });
  });

  it('removeMember: DELETE /schools/{id}/members/{teacherProfileId}', () => {
    expectRequest(httpMock, service.removeMember(2, 15), { method: 'DELETE', url: `${api}/2/members/15` });
  });

  it('changeMemberRole: PUT /schools/{id}/members/{teacherProfileId}/role { role }', () => {
    expectRequest(httpMock, service.changeMemberRole(2, 15, { role: 'Admin' }), {
      method: 'PUT',
      url: `${api}/2/members/15/role`,
      body: { role: 'Admin' },
    });
  });

  it('getSchoolGroups: GET /schools/{id}/groups', () => {
    expectRequest(httpMock, service.getSchoolGroups(2), { method: 'GET', url: `${api}/2/groups` });
  });

  it('getLicenseOverview: GET /schools/{id}/licenses', () => {
    expectRequest(httpMock, service.getLicenseOverview(2), { method: 'GET', url: `${api}/2/licenses` });
  });
});
