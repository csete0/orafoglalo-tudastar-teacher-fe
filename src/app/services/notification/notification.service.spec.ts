import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { NotificationService } from './notification.service';
import { expectRequest } from '../testing/expect-request';

describe('NotificationService', () => {
  let service: NotificationService;
  let httpMock: HttpTestingController;
  const api = `${environment.apiUrl}/notifications`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(NotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getNotifications: GET /notifications', () => {
    expectRequest(httpMock, service.getNotifications(), { method: 'GET', url: api }, []);
  });

  it('markAsRead: PUT /notifications/{id}/read üres törzzsel', () => {
    expectRequest(httpMock, service.markAsRead(8), { method: 'PUT', url: `${api}/8/read`, body: {} });
  });

  it('markAllAsRead: PUT /notifications/read-all üres törzzsel', () => {
    expectRequest(httpMock, service.markAllAsRead(), { method: 'PUT', url: `${api}/read-all`, body: {} });
  });

  it('deleteNotification: DELETE /notifications/{id}', () => {
    expectRequest(httpMock, service.deleteNotification(8), { method: 'DELETE', url: `${api}/8` });
  });

  it('deleteAllNotifications: DELETE /notifications/delete-all', () => {
    expectRequest(httpMock, service.deleteAllNotifications(), { method: 'DELETE', url: `${api}/delete-all` });
  });
});
