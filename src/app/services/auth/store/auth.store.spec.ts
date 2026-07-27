import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthStore } from './auth.store';
import { AuthService } from '../auth.service';
import { TokenService } from '../token.service';
import { STORAGE_KEYS, TeacherUserLoginDto, LoginResponseDto } from '../../../models/auth.model';
import { ToastService } from '../../../shared/toast/toast.service';

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
  let routerMock: { navigateByUrl: ReturnType<typeof vi.fn> };

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

    routerMock = { navigateByUrl: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        { provide: AuthService, useValue: authServiceMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: Router, useValue: routerMock },
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

  it('signIn hiba: status 0 (hálózati/CORS hiba) esetén NEM "hibás email/jelszó" üzenetet mutat', async () => {
    authServiceMock.signIn.mockReturnValue(throwError(() => ({ status: 0, error: null })));

    const store = TestBed.inject(AuthStore);
    const onError = vi.fn();
    store.signIn({ email: 'x@x.hu', password: 'jelszo' }, undefined, onError);
    await Promise.resolve();
    await Promise.resolve();

    expect(store.isAuthenticated()).toBe(false);
    expect(store.error()?.message).toBe('Nem sikerült kapcsolódni a szerverhez. Próbáld újra később.');
    expect(onError).toHaveBeenCalledWith('Nem sikerült kapcsolódni a szerverhez. Próbáld újra később.');
  });

  it('logout: törli a tokeneket és isAuthenticated=false lesz', async () => {
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'access.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() + 60 * 60_000));
    tokenServiceMock.getStoredUser.mockReturnValue(makeUser());
    authServiceMock.logout.mockReturnValue(of({}));

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();
    expect(store.isAuthenticated()).toBe(true);

    const callback = vi.fn();
    store.logout(callback);
    await Promise.resolve();
    await Promise.resolve();

    expect(tokenServiceMock.clearTokens).toHaveBeenCalled();
    expect(store.isAuthenticated()).toBe(false);
    expect(callback).toHaveBeenCalled();
    // UI-TT-144: a kijelentkezés a védett oldalról is elnavigál, nem csak a
    // fejlécet frissíti - a callback (app.component logout()) mellett a
    // store maga is felelős ezért, hogy minden hívóhely (cross-tab, mismatch,
    // token-refresh-hiba) "ingyen" megkapja.
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('cross-tab kijelentkezés: egy MÁSIK tabban törölt access_token localStorage-kulcsra érkező natív "storage" eseményre a store kijelentkezteti ezt a tabot is (isAuthenticated=false)', async () => {
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'access.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() + 60 * 60_000));
    tokenServiceMock.getStoredUser.mockReturnValue(makeUser({ roles: ['teacher'] }));

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();
    expect(store.isAuthenticated()).toBe(true);

    // Egy MÁSIK böngésző-tab kijelentkezett: a valós böngésző-viselkedésnek
    // megfelelően a natív 'storage' esemény csak a TÖBBI tabban tüzel, az
    // access_token kulcs törlésével (newValue: null).
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEYS.ACCESS_TOKEN,
        newValue: null,
        oldValue: 'access.tok.en',
        storageArea: window.localStorage,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(store.isAuthenticated()).toBe(false);
    expect(tokenServiceMock.clearTokens).toHaveBeenCalled();
    // UI-TT-144: a védett oldalról is el kell navigálni, nem csak a jelet
    // flip-elni - a tartalma korábban változatlanul, kattinthatóan a
    // képernyőn maradt.
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('UI-TT-142 fix: ha egy MÁSIK tab EGY MÁSIK, teljesen független fiókkal jelentkezik be ugyanazon origin alatt, ez a tab NEM veszi át csendben az idegen identitást, hanem kényszerített teljes kijelentkezés történik', async () => {
    // Tab "A" saját, legitim munkamenete: "Admin Tanár" (id 1051, admin+teacher).
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'admin.access.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() + 60 * 60_000));
    tokenServiceMock.getStoredUser.mockReturnValue(
      makeUser({ id: 1051, email: 'admin@example.com', roles: ['student', 'teacher', 'admin'] }),
    );

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();
    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()?.id).toBe(1051);
    expect(store.hasAdminRole()).toBe(true);

    // Egy MÁSIK tabban egy HARMADIK, ezzel a munkamenettel semmilyen
    // kapcsolatban nem álló felhasználó (id 1076, sima "student", nulla
    // jogosultság) jelentkezik be ugyanazon origin alatt - ez felülírja a
    // megosztott "teacher_access_token"/"teacher_user_data"
    // localStorage-kulcsokat, ami natív 'storage' eseményt vált ki EBBEN a
    // tabban is (newValue truthy, NEM egy kijelentkezés/törlés).
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'other.users.access.tok.en' : null,
    );
    tokenServiceMock.getStoredUser.mockReturnValue(
      makeUser({ id: 1076, email: 'other-unrelated-user@example.com', roles: ['student'] }),
    );

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEYS.ACCESS_TOKEN,
        newValue: 'other.users.access.tok.en',
        oldValue: 'admin.access.tok.en',
        storageArea: window.localStorage,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    // FIX UTÁN: a más fiók feltűnése ezen az origin-en kényszerített teljes
    // kijelentkezést vált ki (ugyanúgy, mint a token-törlés ág), NEM egy
    // csendes identitás-átvételt - az admin munkamenet nem "cserélődik le"
    // láthatatlanul egy másik felhasználóéra.
    expect(store.isAuthenticated()).toBe(false);
    expect(store.currentUser()).toBeNull();
    // Regresszió-fix: a mismatch-ág NEM hívhatja a clearTokens()-t, mert a
    // localStorage ilyenkor már a MÁSIK tab friss, legitim munkamenetét
    // tartalmazza - ld. a következő teszt a pontos forgatókönyvre.
    expect(tokenServiceMock.clearTokens).not.toHaveBeenCalled();
    expect(TestBed.inject(ToastService).toast()?.message).toContain('másik fiók');
    // UI-TT-144: a mismatch-ág is elnavigál a védett oldalról, ugyanúgy mint
    // a fenti valódi cross-tab logout eset - csak a storage-törlés maradt ki,
    // az elnavigálás mindkét ágon indokolt és biztonságos.
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('regresszió-fix: a mismatch-kényszerkijelentkezés NEM törli a megosztott localStorage-ot, mert az már a MÁSIK tab friss, legitim munkamenetét tartalmazza', async () => {
    // Tab "A" saját, legitim munkamenete: user 1051.
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'a.access.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() + 60 * 60_000));
    tokenServiceMock.getStoredUser.mockReturnValue(makeUser({ id: 1051 }));

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();
    expect(store.isAuthenticated()).toBe(true);

    // Tab "B" időközben ÉRVÉNYESEN bejelentkezett egy másik userrel (1076),
    // felülírva a megosztott token/user kulcsokat - ez a jelenlegi (valós)
    // állapot a storage-ban, amíg ez a teszt fut.
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'b.access.tok.en' : null,
    );
    tokenServiceMock.getStoredUser.mockReturnValue(makeUser({ id: 1076 }));

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEYS.ACCESS_TOKEN,
        newValue: 'b.access.tok.en',
        oldValue: 'a.access.tok.en',
        storageArea: window.localStorage,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    // Tab A helyesen csendben (memóriában) kijelentkezik...
    expect(store.isAuthenticated()).toBe(false);
    // ...de EZ SOSEM hívhatja a clearTokens()-t: az törölné Tab B friss,
    // érvényes munkamenetét is, mivel a kulcsok origin-szintűek. A régi hiba
    // pontosan ez volt: Tab A kijelentkezése "visszaharapott" Tab B-re.
    expect(tokenServiceMock.clearTokens).not.toHaveBeenCalled();
    // UI-TT-144: Tab A-nak viszont el KELL navigálnia a nála épp nyitva lévő
    // védett oldalról - korábban ez elmaradt, és a tartalom (pl. diáklista,
    // "Eltávolítás" gombokkal) tovább látszott/kattintható maradt.
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('UI-TT-142 fix mellett a LEGITIM eset (ugyanaz a user frissült egy másik tabban, pl. token-refresh) továbbra is helyesen működik', async () => {
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'old.access.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() + 60 * 60_000));
    tokenServiceMock.getStoredUser.mockReturnValue(
      makeUser({ id: 42, email: 'tanar@example.com', roles: ['teacher'] }),
    );

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();
    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()?.id).toBe(42);

    // Egy MÁSIK tabban UGYANAZ a user frissítette a tokenjét (pl. proaktív
    // refresh) - a user-id nem változik, csak a token-string.
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'refreshed.access.tok.en' : null,
    );
    tokenServiceMock.getStoredUser.mockReturnValue(
      makeUser({ id: 42, email: 'tanar@example.com', roles: ['teacher'] }),
    );

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEYS.ACCESS_TOKEN,
        newValue: 'refreshed.access.tok.en',
        oldValue: 'old.access.tok.en',
        storageArea: window.localStorage,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    // Ugyanazon user token-frissülésénél NEM szabad kényszerített
    // kijelentkezésnek történnie - a munkamenetnek élnie kell tovább.
    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()?.id).toBe(42);
    expect(tokenServiceMock.clearTokens).not.toHaveBeenCalled();
    // UI-TT-144: mivel itt a munkamenet NEM szűnt meg, semmilyen elnavigálás
    // nem indokolt - Tab B (a legitim, tovább élő munkamenet tulajdonosa)
    // sosem eshet át ezen az ágon, hiszen isAuthenticated()-je nem vált false-ra.
    expect(routerMock.navigateByUrl).not.toHaveBeenCalled();
  });

  it('UI-TT-144: token-refresh sikertelensége (pl. lejárt refresh-token menet közben) is elnavigál a védett oldalról, nem csak a jelet flip-eli', async () => {
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'access.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() + 60 * 60_000));
    tokenServiceMock.getStoredUser.mockReturnValue(makeUser({ roles: ['teacher'] }));

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();
    expect(store.isAuthenticated()).toBe(true);

    // A tokenService ezt hívná meg, ha egy háttérben futó proaktív
    // token-refresh sikertelen (pl. a refresh-token is lejárt/érvénytelen).
    await tokenServiceMock.onTokenRefreshFailed!();

    expect(store.isAuthenticated()).toBe(false);
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('UI-TT-16/UI-TT-144 regresszió-fix: refreshTokenWithoutAutoRedirect() sikertelen refresh esetén NEM navigál el, de a jel flip-el false-ra', async () => {
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'access.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() + 60 * 60_000));
    tokenServiceMock.getStoredUser.mockReturnValue(makeUser({ roles: ['teacher'] }));

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();
    expect(store.isAuthenticated()).toBe(true);

    // A valódi TokenService.doTokenRefresh() a saját catch ágában HÍVJA az
    // onTokenRefreshFailed hookot, MIELŐTT performTokenRefresh() null-lal
    // felold - ezt szimuláljuk itt, hogy a tényleges hívási sorrendet teszteljük.
    tokenServiceMock.performTokenRefresh.mockImplementation(async () => {
      await tokenServiceMock.onTokenRefreshFailed!();
      return null;
    });

    const result = await store.refreshTokenWithoutAutoRedirect();

    expect(result).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    // A hívó (pl. "Belépés tanárként") a saját dedikált inline hibaüzenetét
    // mutatja - a megosztott auto-redirect NEM futhat le emellett/helyette.
    expect(routerMock.navigateByUrl).not.toHaveBeenCalled();
  });

  it('UI-TT-16/UI-TT-144 regresszió-fix: a redirect-elnyomás NEM ragad be - egy KÉSŐBBI, független ambiens refresh-hiba a hívás lezárása után továbbra is elnavigál', async () => {
    tokenServiceMock.getFromStorage.mockImplementation((key: string) =>
      key === STORAGE_KEYS.ACCESS_TOKEN ? 'access.tok.en' : null,
    );
    authServiceMock.getTokenExpiry.mockReturnValue(new Date(Date.now() + 60 * 60_000));
    tokenServiceMock.getStoredUser.mockReturnValue(makeUser({ roles: ['teacher'] }));

    const store = TestBed.inject(AuthStore);
    await store.ensureInitialization();
    expect(store.isAuthenticated()).toBe(true);

    // A saját hívás sikerrel zárul (nem hiba) - a suppress-flagnek utána
    // vissza kell állnia.
    tokenServiceMock.performTokenRefresh.mockResolvedValue('new.tok.en');
    await store.refreshTokenWithoutAutoRedirect();
    expect(routerMock.navigateByUrl).not.toHaveBeenCalled();

    // Egy KÉSŐBBI, ehhez a híváshoz nem kapcsolódó, háttérben induló
    // refresh-kísérlet sikertelen - ennek MÁR el kell navigálnia.
    await tokenServiceMock.onTokenRefreshFailed!();

    expect(store.isAuthenticated()).toBe(false);
    expect(routerMock.navigateByUrl).toHaveBeenCalledWith('/login');
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
