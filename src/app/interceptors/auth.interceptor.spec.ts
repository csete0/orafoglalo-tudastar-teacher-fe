import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthStore } from '../services/auth/store/auth.store';
import { ToastService } from '../shared/toast/toast.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authStoreMock: { getValidAccessToken: ReturnType<typeof vi.fn>; refreshToken: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authStoreMock = {
      getValidAccessToken: vi.fn().mockResolvedValue('valid-token'),
      refreshToken: vi.fn().mockResolvedValue(null),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: authStoreMock },
      ],
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('publikus végpontnál (login) nem kér tokent', async () => {
    const promise = new Promise<void>((resolve) => {
      httpClient.post('/api/auth/login', {}).subscribe(() => resolve());
    });

    const req = httpMock.expectOne('/api/auth/login');
    expect(authStoreMock.getValidAccessToken).not.toHaveBeenCalled();
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});

    await promise;
  });

  it('védett végpontnál Bearer fejlécet tesz rá', async () => {
    const promise = new Promise<void>((resolve) => {
      httpClient.get('/api/schools').subscribe(() => resolve());
    });

    await Promise.resolve();
    await Promise.resolve();

    const req = httpMock.expectOne('/api/schools');
    expect(req.request.headers.get('Authorization')).toBe('Bearer valid-token');
    req.flush({});

    await promise;
  });

  it('401-re megpróbál refresh-elni és újraküldi a kérést', async () => {
    authStoreMock.refreshToken.mockResolvedValue('refreshed-token');

    let result: unknown;
    const promise = new Promise<void>((resolve) => {
      httpClient.get('/api/schools').subscribe((r) => {
        result = r;
        resolve();
      });
    });

    await Promise.resolve();
    await Promise.resolve();
    const firstReq = httpMock.expectOne('/api/schools');
    firstReq.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const retryReq = httpMock.expectOne('/api/schools');
    expect(retryReq.request.headers.get('Authorization')).toBe('Bearer refreshed-token');
    retryReq.flush({ ok: true });

    await promise;
    expect(result).toEqual({ ok: true });
  });

  it('sikertelen refresh esetén az eredeti 401 hibát adja tovább', async () => {
    authStoreMock.refreshToken.mockResolvedValue(null);

    let error: unknown;
    const promise = new Promise<void>((resolve) => {
      httpClient.get('/api/schools').subscribe({
        error: (err) => {
          error = err;
          resolve();
        },
      });
    });

    await Promise.resolve();
    await Promise.resolve();
    const req = httpMock.expectOne('/api/schools');
    req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await promise;
    expect((error as { status: number }).status).toBe(401);
  });

  it('nem-GET hiba (nem 401) danger toastot lő a backend üzenetével', async () => {
    const toastService = TestBed.inject(ToastService);
    const dangerSpy = vi.spyOn(toastService, 'danger');

    const promise = new Promise<void>((resolve) => {
      httpClient.post('/api/schools', {}).subscribe({ error: () => resolve() });
    });

    await Promise.resolve();
    await Promise.resolve();
    const req = httpMock.expectOne('/api/schools');
    req.flush({ error: 'Az intézmény nem található.' }, { status: 400, statusText: 'Bad Request' });

    await promise;
    expect(dangerSpy).toHaveBeenCalledWith('Az intézmény nem található.');
  });

  it('GET hiba nem lő toastot (a store inline error-ja jeleníti meg)', async () => {
    const toastService = TestBed.inject(ToastService);
    const dangerSpy = vi.spyOn(toastService, 'danger');

    const promise = new Promise<void>((resolve) => {
      httpClient.get('/api/schools').subscribe({ error: () => resolve() });
    });

    await Promise.resolve();
    await Promise.resolve();
    const req = httpMock.expectOne('/api/schools');
    req.flush({ error: 'Nem található.' }, { status: 404, statusText: 'Not Found' });

    await promise;
    expect(dangerSpy).not.toHaveBeenCalled();
  });

  // UI-TT-51: sikeres 401-refresh utáni ÚJRAKÜLDÖTT mutáció saját (nem 401) hibáját
  // (pl. 409 üzleti hiba) az interceptor korábban elnyelte, és mindig az EREDETI
  // 401-et adta tovább — sem a subscriber nem kapta meg a valós okot, sem a
  // mutáció-toast nem tüzelt vele.
  it('BUG UI-TT-51: sikeres refresh utáni újraküldött mutáció saját 409-es hibája nem vész el, és toastot is lő', async () => {
    authStoreMock.refreshToken.mockResolvedValue('refreshed-token');
    const toastService = TestBed.inject(ToastService);
    const dangerSpy = vi.spyOn(toastService, 'danger');

    let error: unknown;
    const promise = new Promise<void>((resolve) => {
      httpClient.post('/api/groups/9401/archive', {}).subscribe({
        error: (err) => {
          error = err;
          resolve();
        },
      });
    });

    await Promise.resolve();
    await Promise.resolve();
    const firstReq = httpMock.expectOne('/api/groups/9401/archive');
    firstReq.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const retryReq = httpMock.expectOne('/api/groups/9401/archive');
    expect(retryReq.request.headers.get('Authorization')).toBe('Bearer refreshed-token');
    retryReq.flush(
      { error: 'A csoport már archiválva van.' },
      { status: 409, statusText: 'Conflict' },
    );

    await promise;

    expect((error as { status: number }).status).toBe(409);
    expect(dangerSpy).toHaveBeenCalledWith('A csoport már archiválva van.');
  });

  it('sikertelen refresh esetén (a retry el sem indul) a toast NEM a retry-üzenettel, hanem egyáltalán nem tüzel emiatt az ágért', async () => {
    authStoreMock.refreshToken.mockResolvedValue(null);
    const toastService = TestBed.inject(ToastService);
    const dangerSpy = vi.spyOn(toastService, 'danger');

    let error: unknown;
    const promise = new Promise<void>((resolve) => {
      httpClient.post('/api/groups/9401/archive', {}).subscribe({
        error: (err) => {
          error = err;
          resolve();
        },
      });
    });

    await Promise.resolve();
    await Promise.resolve();
    const req = httpMock.expectOne('/api/groups/9401/archive');
    req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    await promise;

    expect((error as { status: number }).status).toBe(401);
    expect(dangerSpy).not.toHaveBeenCalled();
  });
});
