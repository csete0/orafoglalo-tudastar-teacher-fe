import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { guestGuard } from './guest.guard';
import { AuthStore } from '../services/auth/store/auth.store';

describe('guestGuard', () => {
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

  function run() {
    return TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never));
  }

  // UI-TT-87: a /login route-nak korábban nem volt guest-only őre - egy már
  // autentikált user a /login-ra navigálva a bejelentkezett navigáció ALATT is
  // látta a teljes, aktív bejelentkezési formot.
  it('BUG UI-TT-87 javítva: autentikált usert a dashboardra irányítja, NEM engedi a /login-on maradni', async () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const result = await run();

    expect(authStoreMock.ensureInitialization).toHaveBeenCalled();
    expect(routerMock.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
    expect(result).toBe('URL_TREE');
  });

  it('nem autentikált (vendég) usert átengedi a /login-ra', async () => {
    authStoreMock.isAuthenticated.mockReturnValue(false);

    const result = await run();

    expect(result).toBe(true);
    expect(routerMock.createUrlTree).not.toHaveBeenCalled();
  });
});
