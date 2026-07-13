import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { TokenService } from './token.service';
import { AuthService } from './auth.service';
import { STORAGE_KEYS } from '../../models/auth.model';

describe('TokenService', () => {
  let service: TokenService;
  let authServiceMock: {
    getTokenExpiry: ReturnType<typeof vi.fn>;
    refreshTokens: ReturnType<typeof vi.fn>;
  };
  let refreshSubject: Subject<{ accessToken: string; user?: unknown }>;

  beforeEach(() => {
    localStorage.clear();
    refreshSubject = new Subject();
    authServiceMock = {
      // A REFRESH_THRESHOLD (5 perc) alatti lejárat -> shouldRefreshToken()===true.
      getTokenExpiry: vi.fn().mockReturnValue(new Date(Date.now() + 60_000)),
      refreshTokens: vi.fn().mockReturnValue(refreshSubject.asObservable()),
    };

    TestBed.configureTestingModule({
      providers: [TokenService, { provide: AuthService, useValue: authServiceMock }],
    });

    service = TestBed.inject(TokenService);
    localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'old.token.value');
  });

  afterEach(() => localStorage.clear());

  // UI-TT-44: fetchValidAccessToken() egy MÁSHONNAN már folyamatban lévő refresh alatt
  // a lejárat előtt álló RÉGI tokent adta vissza ahelyett, hogy megvárta volna a friss
  // eredményt — a waitForRefresh()-nek ezen a hívási úton is el kellett érhetővé válnia.
  it('BUG UI-TT-44: egy máshonnan folyamatban lévő refresh alatt megvárja az eredményt, nem a régi tokent adja vissza azonnal', async () => {
    // "Máshonnan" (pl. az AuthStore init-je) elindított refresh, nem várjuk meg —
    // a performTokenRefresh() szinkron módon refreshInProgress=true-t állít az await előtt.
    const externalRefresh = service.performTokenRefresh();

    let resolved = false;
    const validTokenPromise = service.getValidAccessToken().then((token) => {
      resolved = true;
      return token;
    });

    // Rövid várakozás után MÉG NEM szabadna feloldódnia: a folyamatban lévő
    // refresh eredményét kellene megvárnia, nem a régi tokent visszaadnia.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(resolved).toBe(false);

    refreshSubject.next({ accessToken: 'fresh.token.value', user: undefined } as never);
    refreshSubject.complete();

    const [externalResult, validToken] = await Promise.all([externalRefresh, validTokenPromise]);

    expect(externalResult).toBe('fresh.token.value');
    expect(validToken).toBe('fresh.token.value');
  });

  it('ha nincs folyamatban lévő refresh, saját maga indítja el és a friss tokent adja vissza', async () => {
    const validTokenPromise = service.getValidAccessToken();

    // A getValidAccessToken()->fetchValidAccessToken()->performTokenRefresh() lánc
    // több egymást követő await-en át jut el a refreshTokens() feliratkozásig —
    // egy makrotaszk-váltás (setTimeout 0) garantáltan lefuttatja ezeket.
    await new Promise((resolve) => setTimeout(resolve, 0));
    refreshSubject.next({ accessToken: 'own-refresh.token.value', user: undefined } as never);
    refreshSubject.complete();

    const validToken = await validTokenPromise;
    expect(validToken).toBe('own-refresh.token.value');
  });
});
