import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthStore } from '../services/auth/store/auth.store';

describe('roleGuard', () => {
  let authStoreMock: { roles: ReturnType<typeof vi.fn>; ensureInitialization: ReturnType<typeof vi.fn> };
  let routerMock: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authStoreMock = { roles: vi.fn().mockReturnValue([]), ensureInitialization: vi.fn().mockResolvedValue(undefined) };
    routerMock = { createUrlTree: vi.fn().mockReturnValue('URL_TREE' as unknown as UrlTree) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: authStoreMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  function run(role: 'teacher' | 'admin') {
    return TestBed.runInInjectionContext(() => roleGuard(role)({} as never, {} as never));
  }

  it('UI-TT-241: megvárja az auth-állapot betöltését (lejárt token frissítése), mielőtt a role-ról dönt', async () => {
    let finishInit!: () => void;
    authStoreMock.ensureInitialization.mockReturnValue(new Promise<void>((resolve) => (finishInit = resolve)));
    const pending = run('teacher');
    // A frissítés után kerülnek be a role-ok - addig a guard nem dönthet.
    authStoreMock.roles.mockReturnValue(['student', 'teacher']);
    finishInit();
    expect(await pending).toBe(true);
    expect(routerMock.createUrlTree).not.toHaveBeenCalled();
  });

  it('ha a userben megvan a role, átengedi', async () => {
    authStoreMock.roles.mockReturnValue(['student', 'teacher']);

    expect(await run('teacher')).toBe(true);
  });

  it('teacher role hiányában a jelentkezési oldalra irányít', async () => {
    authStoreMock.roles.mockReturnValue(['student']);

    const result = await run('teacher');

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/jelentkezes']);
    expect(result).toBe('URL_TREE');
  });

  it('admin role hiányában a dashboardra irányít', async () => {
    authStoreMock.roles.mockReturnValue(['student', 'teacher']);

    const result = await run('admin');

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe('URL_TREE');
  });

  it('intézmény-admin (igazgató) szerep NEM befolyásolja — csak a platform role számít', async () => {
    // A MyRole==='Admin' egy iskola-DTO mezője, sosem a JWT roles tömbjében;
    // ez a teszt dokumentálja, hogy a guard nem téveszti össze a kettőt.
    authStoreMock.roles.mockReturnValue(['student', 'teacher']);

    expect(await run('admin')).not.toBe(true);
  });
});
