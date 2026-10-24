import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { CategoryService } from './category.service';
import { expectRequest } from '../testing/expect-request';

describe('CategoryService', () => {
  let service: CategoryService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(withXhr()), provideHttpClientTesting()] });
    service = TestBed.inject(CategoryService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll: GET /public/categories (a diák-app publikus végpontja)', () => {
    const categories = [{ id: 1, name: 'Informatika' }];
    const result = expectRequest(httpMock, service.getAll(), { method: 'GET', url: `${environment.apiUrl}/public/categories` }, categories);
    expect(result).toEqual(categories);
  });
});
