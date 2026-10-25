import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { demoRestrictedGuard } from './demo-restricted.guard';
import { AuthStore } from '../services/auth/store/auth.store';
import { ToastService } from '../shared/toast/toast.service';
import { DEMO_RESTRICTED_MESSAGE } from '../models/demo-session.model';

/** Demó-fiókban tiltott oldal (PATRICKS-DEMO-KORNYEZET-TERV.md F6). */
describe('demoRestrictedGuard', () => {
  const isDemo = signal(false);
  const warning = vi.fn();

  function run() {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { isDemo, ensureInitialization: () => Promise.resolve() } },
        { provide: ToastService, useValue: { warning } },
        { provide: Router, useValue: { createUrlTree: (cmds: string[]) => ({ cmds }) as unknown as UrlTree } },
      ],
    });
    return TestBed.runInInjectionContext(() => demoRestrictedGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
  }

  afterEach(() => {
    isDemo.set(false);
    warning.mockReset();
  });

  it('valódi fióknak (és kijelentkezve) átenged', async () => {
    expect(await run()).toBe(true);
  });

  it('demó-fiókot a vezérlőpultra visz a közös üzenettel', async () => {
    isDemo.set(true);
    expect(await run()).toEqual({ cmds: ['/dashboard'] });
    expect(warning).toHaveBeenCalledWith(DEMO_RESTRICTED_MESSAGE);
  });
});
