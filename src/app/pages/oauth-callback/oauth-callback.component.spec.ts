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

  // UI-TT-113 (JAVÍTVA): a sikeres OAuth-ág (`ngOnInit`) korábban FELTÉTEL
  // NÉLKÜL a dashboardra navigált, akkor is, ha a bejelentkezési folyamatot egy
  // védett mélylinkről (authGuard `returnUrl`-je) indították. Ez éles ellentétben
  // áll a jelszavas bejelentkezés `LoginComponent.submit()` ágával, ami a
  // `returnUrl`-re navigál sikeres bejelentkezés után. Ha egy előző lépés
  // (`LoginComponent.signInWithProvider()`) elmentette volna a returnUrl-t a
  // teljes oldal-navigáción túlélő helyre (sessionStorage), ennek a
  // komponensnek kellene azt visszaolvasnia és oda navigálnia, nem hardcode-olt
  // '/dashboard'-ra.
  it('UI-TT-113 JAVÍTVA: sikeres OAuth-bejelentkezés az elmentett returnUrl-re navigál, nem feltétel nélkül a dashboardra', () => {
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

  // UI-TT-122: a `login.component.ts` saját kommentje szerint a
  // 'teacher_oauth_return_url' kulcsot kifejezetten azért kell törölni sikeres
  // bejelentkezés UTÁN, "hogy ne szivárogjon át egy KÉSŐBBI, ezzel össze nem
  // függő bejelentkezésbe" — de ez a törlés a `ngOnInit` MINDKÉT hiba-ágából
  // (nincs social-auth siker paraméter; autoLogin hiba-callback) hiányzott.
  it('BUG UI-TT-122: sikertelen OAuth-callback (nincs social-auth siker paraméter) törli a korábban elmentett returnUrl-t', () => {
    configure({ error: 'access_denied' });
    sessionStorage.setItem('teacher_oauth_return_url', '/csoportok/42');

    const fixture = TestBed.createComponent(OauthCallbackComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    expect(toastMock.danger).toHaveBeenCalled();
    // A hibás/megszakított kísérlethez tartozó elmentett cél ne éljen tovább.
    expect(sessionStorage.getItem('teacher_oauth_return_url')).toBeNull();

    sessionStorage.removeItem('teacher_oauth_return_url');
  });

  it('BUG UI-TT-122 (autoLogin hiba-ág): a backend-oldali autoLogin-hiba esetén is törli a returnUrl-t', () => {
    configure({ google_authentication: 'success' });
    sessionStorage.setItem('teacher_oauth_return_url', '/csoportok/42');

    const fixture = TestBed.createComponent(OauthCallbackComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();

    const [, onError] = authStoreMock.autoLogin.mock.calls[0];
    onError('Sikertelen bejelentkezés.');

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], { replaceUrl: true });
    expect(sessionStorage.getItem('teacher_oauth_return_url')).toBeNull();

    sessionStorage.removeItem('teacher_oauth_return_url');
  });
});
