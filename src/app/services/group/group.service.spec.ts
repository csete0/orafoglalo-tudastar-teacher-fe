import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { GroupService } from './group.service';
import { CreateGroupRequest } from '../../models/group.model';
import { expectRequest } from '../testing/expect-request';

describe('GroupService', () => {
  let service: GroupService;
  let httpMock: HttpTestingController;
  const groups = `${environment.apiUrl}/groups`;
  const myGroups = `${environment.apiUrl}/my-groups`;
  const request: CreateGroupRequest = { name: '11.B', schoolId: 2, rowVersion: 'AAA=' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(GroupService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('tanári oldal', () => {
    it('getMine: GET /groups', () => {
      expectRequest(httpMock, service.getMine(), { method: 'GET', url: groups });
    });

    it('create: POST /groups a kérés törzsével', () => {
      expectRequest(httpMock, service.create(request), { method: 'POST', url: groups, body: request });
    });

    it('update: PUT /groups/{id} a kérés törzsével (rowVersion-nel)', () => {
      expectRequest(httpMock, service.update(6, request), { method: 'PUT', url: `${groups}/6`, body: request });
    });

    it('regenerateInvite: POST /groups/{id}/regenerate-invite üres törzzsel', () => {
      expectRequest(httpMock, service.regenerateInvite(6), { method: 'POST', url: `${groups}/6/regenerate-invite`, body: {} });
    });

    it('getMembers: GET /groups/{id}/members', () => {
      expectRequest(httpMock, service.getMembers(6), { method: 'GET', url: `${groups}/6/members` });
    });

    it('removeMember: DELETE /groups/{id}/members/{userId}', () => {
      expectRequest(httpMock, service.removeMember(6, 31), { method: 'DELETE', url: `${groups}/6/members/31` });
    });

    it('archive / unarchive: POST /groups/{id}/archive | unarchive üres törzzsel', () => {
      expectRequest(httpMock, service.archive(6), { method: 'POST', url: `${groups}/6/archive`, body: {} });
      expectRequest(httpMock, service.unarchive(6), { method: 'POST', url: `${groups}/6/unarchive`, body: {} });
    });

    it('setJoinEnabled: PUT /groups/{id}/join-enabled { enabled }', () => {
      expectRequest(httpMock, service.setJoinEnabled(6, false), { method: 'PUT', url: `${groups}/6/join-enabled`, body: { enabled: false } });
    });
  });

  describe('diák oldal', () => {
    it('getMyGroups: GET /my-groups', () => {
      expectRequest(httpMock, service.getMyGroups(), { method: 'GET', url: myGroups });
    });

    it('getMyGroupsTaskSets: GET /my-groups/task-sets', () => {
      expectRequest(httpMock, service.getMyGroupsTaskSets(), { method: 'GET', url: `${myGroups}/task-sets` });
    });

    it('join: POST /my-groups/join { code }', () => {
      expectRequest(httpMock, service.join({ code: 'ABC123' }), { method: 'POST', url: `${myGroups}/join`, body: { code: 'ABC123' } });
    });

    it('leave: POST /my-groups/{id}/leave üres törzzsel', () => {
      expectRequest(httpMock, service.leave(6), { method: 'POST', url: `${myGroups}/6/leave`, body: {} });
    });
  });
});
