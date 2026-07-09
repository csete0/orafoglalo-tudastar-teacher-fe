import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthorizedFileService } from './authorized-file.service';

describe('AuthorizedFileService', () => {
  let service: AuthorizedFileService;
  let httpMock: HttpTestingController;
  const createdObjectUrls: string[] = [];

  beforeEach(() => {
    createdObjectUrls.length = 0;

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthorizedFileService);
    httpMock = TestBed.inject(HttpTestingController);

    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:mock-${createdObjectUrls.length}`;
      createdObjectUrls.push(url);
      return url;
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  it('nem tanári URL-t változatlanul, HTTP-hívás nélkül adja vissza', async () => {
    let resolvedUrl: string | undefined;
    const promise = new Promise<void>((resolve) => {
      service.resolveUrl('/valami/mas.png').subscribe((url) => {
        resolvedUrl = url;
        resolve();
      });
    });

    await promise;
    expect(resolvedUrl).toBe('/valami/mas.png');
    httpMock.expectNone(() => true);
  });

  it('/api/teacher-files/ URL-nél HttpClient-en (auth-interceptoron) át tölti le, majd blob object URL-t ad vissza', async () => {
    const teacherFileUrl = 'http://localhost:7083/api/teacher-files/abc-123';
    let resolvedUrl: string | undefined;

    const promise = new Promise<void>((resolve) => {
      service.resolveUrl(teacherFileUrl).subscribe((url) => {
        resolvedUrl = url;
        resolve();
      });
    });

    const req = httpMock.expectOne(teacherFileUrl);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['pdf-content'], { type: 'application/pdf' }));

    await promise;
    expect(resolvedUrl).toBe('blob:mock-0');
  });

  it('isAuthorizedFileUrl csak a /api/teacher-files/ jelölésű URL-eknél igaz', () => {
    expect(service.isAuthorizedFileUrl('https://www.patricks.hu/api/teacher-files/xyz')).toBe(true);
    expect(service.isAuthorizedFileUrl('/valami/mas.png')).toBe(false);
    expect(service.isAuthorizedFileUrl(null)).toBe(false);
    expect(service.isAuthorizedFileUrl(undefined)).toBe(false);
  });

  it('revoke csak a saját maga által létrehozott object URL-eket vonja vissza', async () => {
    const promise = new Promise<void>((resolve) => {
      service.resolveUrl('http://localhost:7083/api/teacher-files/abc').subscribe(() => resolve());
    });
    const req = httpMock.expectOne('http://localhost:7083/api/teacher-files/abc');
    req.flush(new Blob(['x']));
    await promise;

    service.revoke('blob:mock-0');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-0');

    (URL.revokeObjectURL as any).mockClear();
    service.revoke('blob:not-tracked');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
});
