import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthStore } from '../services/auth/store/auth.store';

describe('authGuard', () => {
  let authStoreMock: { ensureInitialization: ReturnType<typeof vi.fn>; isAuthenticated: ReturnType<typeof vi.fn> };
  let routerMock: { createUrlTree: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    authStoreMock = {
      ensureInitialization: vi.fn().mockResolvedValue(undefined),
      isAuthenticated: vi.fn(),
    };
    routerMock = { createUrlTree: vi.fn().mockReturnValue('URL_TREE' as unknown as UrlTree) };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: authStoreMock },
        { provide: Router, useValue: routerMock },
      ],
    });
  });

  function run(url = '/dashboard') {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url } as never),
    );
  }

  it('autentikált usernél átengedi', async () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const result = await run();

    expect(authStoreMock.ensureInitialization).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('nem autentikált usert a login oldalra irányítja, returnUrl-lel', async () => {
    authStoreMock.isAuthenticated.mockReturnValue(false);

    const result = await run('/csoportok');

    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/csoportok' },
    });
    expect(result).toBe('URL_TREE');
  });
});
