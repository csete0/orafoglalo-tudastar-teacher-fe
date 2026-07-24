import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { OauthCallbackComponent } from './oauth-callback.component';
import { AuthStore } from '../../services/auth/store/auth.store';
import { ToastService } from '../../shared/toast/toast.service';

describe('OauthCallbackComponent', () => {
  let authStoreMock: { autoLogin: ReturnType<typeof vi.fn> };
  let toastMock: { success: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn> };

  function configure(queryParams: Record<string, string>) {
    authStoreMock = { autoLogin: vi.fn() };
    toastMock = { success: vi.fn(), danger: vi.fn() };

    TestBed.configureTestingModule({
      imports: [OauthCallbackComponent],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: authStoreMock },
        { provide: ToastService, useValue: toastMock },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParams } } },
      ],
    });
  }

  it('sikeres OAuth-bejelentkezésnél, ha nincs elmentett returnUrl, a dashboardra navigál (kontroll, meglévő viselkedés)', () => {
    configure({ google_authentication: 'success' });
    sessionStorage.removeItem('teacher_oauth_return_url');

    const fixture = TestBed.createComponent(OauthCallbackComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();

    expect(authStoreMock.autoLogin).toHaveBeenCalled();
    const [onSuccess] = authStoreMock.autoLogin.mock.calls[0];
    onSuccess();

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard'], { replaceUrl: true });
  });

  // UI-TT-11x (javasolt): a sikeres OAuth-ág (`ngOnInit`, 42-51. sor) FELTÉTEL
  // NÉLKÜL a dashboardra navigál, akkor is, ha a bejelentkezési folyamatot egy
  // védett mélylinkről (authGuard `returnUrl`-je) indították. Ez éles ellentétben
  // áll a jelszavas bejelentkezés `LoginComponent.submit()` ágával, ami a
  // `returnUrl`-re navigál sikeres bejelentkezés után. Ha egy előző lépés
  // (`LoginComponent.signInWithProvider()`) elmentette volna a returnUrl-t a
  // teljes oldal-navigáción túlélő helyre (sessionStorage), ennek a
  // komponensnek kellene azt visszaolvasnia és oda navigálnia, nem hardcode-olt
  // '/dashboard'-ra.
  it('BUG: sikeres OAuth-bejelentkezés MINDIG a dashboardra navigál, akkor is, ha egy védett mélylinkről indult a bejelentkezés (elmentett returnUrl figyelmen kívül hagyva)', () => {
    configure({ google_authentication: 'success' });
    sessionStorage.setItem('teacher_oauth_return_url', '/csoportok/42');

    const fixture = TestBed.createComponent(OauthCallbackComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();

    const [onSuccess] = authStoreMock.autoLogin.mock.calls[0];
    onSuccess();

    expect(navigateSpy).toHaveBeenCalledWith(['/csoportok/42'], { replaceUrl: true });

    sessionStorage.removeItem('teacher_oauth_return_url');
  });
});
