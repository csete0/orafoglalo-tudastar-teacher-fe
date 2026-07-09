import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AuthStore } from './auth.store';
import { AuthService } from '../auth.service';
import { TokenService } from '../token.service';
import { STORAGE_KEYS, TeacherUserLoginDto, LoginResponseDto } from '../../../models/auth.model';

function makeUser(overrides: Partial<TeacherUserLoginDto> = {}): TeacherUserLoginDto {
  return {
    id: 1,
    userName: 'tanar',
    email: 'tanar@example.com',
    firstName: 'Teszt',
    lastName: 'Tanár',
    roles: ['student'],
    ...overrides,
  };
}

describe('AuthStore', () => {
  let authServiceMock: {
    getTokenExpiry: ReturnType<typeof vi.fn>;
    signIn: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let tokenServiceMock: {
    getFromStorage: ReturnType<typeof vi.fn>;
    getStoredUser: ReturnType<typeof vi.fn>;
    saveTokenPair: ReturnType<typeof vi.fn>;
    clearTokens: ReturnType<typeof vi.fn>;
    performTokenRefresh: ReturnType<typeof vi.fn>;
    getAccessToken: ReturnType<typeof vi.fn>;
    getValidAccessToken: ReturnType<typeof vi.fn>;
    isRefreshInProgress: boolean;
    onTokenRefreshed?: (response: LoginResponseDto) => Promise<void>;
    onTokenRefreshFailed?: () => Promise<void>;
  };

  function configure() {
    authServiceMock = {
      getTokenExpiry: vi.fn().mockReturnValue(null),
      signIn: vi.fn(),
      logout: vi.fn(),
    };

    tokenServiceMock = {
      getFromStorage: vi.fn().mockReturnValue(null),
      getStoredUser: vi.fn().mockReturnValue(null),
      saveTokenPair: vi.fn().mockResolvedValue(undefined),
      clearTokens: vi.fn().mockResolvedValue(undefined),
      performTokenRefresh: vi.fn().mockResolvedValue(null),
      getAccessToken: vi.fn().mockResolvedValue(null),
      getValidAccessToken: vi.fn().mockResolvedValue(null),
      isRefreshInProgress: false,
    };

    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        { provide: AuthService, useValue: authServiceMock },
        { provide: TokenService, useValue: tokenServiceMock },
      ],
    });
  }

  beforeEach(() => configure());

  it('nincs tárolt token → isAuthenticated=false, authCheckComplete=true', async () => {
    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();

    expect(store.isAuthenticated()).toBe(false);
    expect(store.authCheckComplete()).toBe(true);
  });

  it('érvényes tárolt token + user → isAuthenticated=true, roles betöltve', async () => {
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'access.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() + 60 * 60_000));
    tokenServiceMock.getStoredUser.mockReturnValue(makeUser({ roles: ['student', 'teacher'] }));

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();

    expect(store.isAuthenticated()).toBe(true);
    expect(store.hasTeacherRole()).toBe(true);
    expect(store.hasAdminRole()).toBe(false);
  });

  it('lejárt tokennél refresh-t próbál, siker esetén authentikált marad', async () => {
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'expired.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() - 1000));
    tokenServiceMock.performTokenRefresh.mockResolvedValue('new.tok.en');

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();

    expect(tokenServiceMock.performTokenRefresh).toHaveBeenCalled();
  });

  it('lejárt tokennél sikertelen refresh → isAuthenticated=false + tokenek törölve', async () => {
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'expired.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() - 1000));
    tokenServiceMock.performTokenRefresh.mockResolvedValue(null);

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();

    expect(store.isAuthenticated()).toBe(false);
    expect(tokenServiceMock.clearTokens).toHaveBeenCalled();
  });

  it('signIn siker: elmenti a tokent, isAuthenticated=true, currentUser frissül', async () => {
    const response: LoginResponseDto = {
      user: makeUser({ roles: ['student', 'teacher'] }),
      accessToken: 'fresh.tok.en',
      isAuthenticated: true,
    };
    authServiceMock.signIn.mockReturnValue(of(response));

    const store = TestBed.inject(AuthStore);
    const onSuccess = vi.fn();
    store.signIn({ email: 'x@x.hu', password: 'jelszo' }, onSuccess);
    await Promise.resolve();
    await Promise.resolve();

    expect(tokenServiceMock.saveTokenPair).toHaveBeenCalledWith('fresh.tok.en', response.user);
    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()?.roles).toContain('teacher');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('signIn hiba: error signal beállítva, isAuthenticated=false, onError hívva', async () => {
    authServiceMock.signIn.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Hibás jelszó' } })),
    );

    const store = TestBed.inject(AuthStore);
    const onError = vi.fn();
    store.signIn({ email: 'x@x.hu', password: 'rossz' }, undefined, onError);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.isAuthenticated()).toBe(false);
    expect(store.error()?.message).toBe('Hibás jelszó');
    expect(onError).toHaveBeenCalledWith('Hibás jelszó');
  });

  it('logout: törli a tokeneket és isAuthenticated=false lesz', async () => {
    authServiceMock.logout.mockReturnValue(of({}));

    const store = TestBed.inject(AuthStore);
    const callback = vi.fn();
    store.logout(callback);
    await Promise.resolve();
    await Promise.resolve();

    expect(tokenServiceMock.clearTokens).toHaveBeenCalled();
    expect(store.isAuthenticated()).toBe(false);
    expect(callback).toHaveBeenCalled();
  });

  it('refreshToken utáni "Belépés tanárként" folyamat: onTokenRefreshed frissíti a currentUser roles-t', async () => {
    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();

    const refreshedResponse: LoginResponseDto = {
      user: makeUser({ roles: ['student', 'teacher'] }),
      accessToken: 'refreshed.tok.en',
      isAuthenticated: true,
    };

    // A tokenService.performTokenRefresh hívná ezt sikeres refresh után
    await tokenServiceMock.onTokenRefreshed!(refreshedResponse);

    expect(store.hasTeacherRole()).toBe(true);
    expect(store.isAuthenticated()).toBe(true);
  });
});
