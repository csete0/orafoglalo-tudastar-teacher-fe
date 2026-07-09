import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthStore } from '../services/auth/store/auth.store';

describe('roleGuard', () => {
  let authStoreMock: { roles: ReturnType<typeof vi.fn> };
  let routerMock: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authStoreMock = { roles: vi.fn().mockReturnValue([]) };
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

  it('ha a userben megvan a role, átengedi', () => {
    authStoreMock.roles.mockReturnValue(['student', 'teacher']);

    expect(run('teacher')).toBe(true);
  });

  it('teacher role hiányában a jelentkezési oldalra irányít', () => {
    authStoreMock.roles.mockReturnValue(['student']);

    const result = run('teacher');

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/jelentkezes']);
    expect(result).toBe('URL_TREE');
  });

  it('admin role hiányában a dashboardra irányít', () => {
    authStoreMock.roles.mockReturnValue(['student', 'teacher']);

    const result = run('admin');

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe('URL_TREE');
  });

  it('intézmény-admin (igazgató) szerep NEM befolyásolja — csak a platform role számít', () => {
    // A MyRole==='Admin' egy iskola-DTO mezője, sosem a JWT roles tömbjében;
    // ez a teszt dokumentálja, hogy a guard nem téveszti össze a kettőt.
    authStoreMock.roles.mockReturnValue(['student', 'teacher']);

    expect(run('admin')).not.toBe(true);
  });
});
