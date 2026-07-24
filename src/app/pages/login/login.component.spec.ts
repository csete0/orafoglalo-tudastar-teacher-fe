import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { LoginComponent } from './login.component';
import { AuthStore } from '../../services/auth/store/auth.store';

describe('LoginComponent', () => {
  let authStoreMock: {
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<{ message: string; timestamp: Date } | null>>;
    signIn: ReturnType<typeof vi.fn>;
    signInWithProvider: ReturnType<typeof vi.fn>;
  };

  function configure(queryParams: Record<string, string> = {}) {
    authStoreMock = {
      loading: signal(false),
      error: signal(null),
      signIn: vi.fn(),
      signInWithProvider: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: authStoreMock },
        { provide: ActivatedRoute, useValue: { queryParams: of(queryParams) } },
      ],
    });
  }

  // Kontroll: a jelszavas bejelentkezés helyesen kezeli a mélylinkről (authGuard
  // redirectjéből) érkező returnUrl-t.
  it('jelszavas bejelentkezés sikerénél a returnUrl query-paraméterre navigál, nem a dashboardra', () => {
    configure({ returnUrl: '/csoportok/42' });
    authStoreMock.signIn.mockImplementation((_model, onSuccess) => onSuccess());

    const fixture = TestBed.createComponent(LoginComponent);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture.detectChanges();

    fixture.componentInstance.form.setValue({ email: 'teszt@example.com', password: 'jelszo123' });
    fixture.componentInstance.submit();

    expect(navigateSpy).toHaveBeenCalledWith('/csoportok/42', { replaceUrl: true });
  });

  // UI-TT-11x (javasolt): a signInWithProvider() ág egyáltalán nem használja a
  // this.returnUrl-t, amit a konstruktor a queryParams-ból már beolvasott a
  // password-ág számára — a social-login egy TELJES oldal-navigációt indít
  // (window.location.href, AuthService.signInWithProvider), ami az egész
  // Angular-alkalmazás JS-állapotát (beleértve a returnUrl mezőt) megsemmisíti.
  // Egy helyes implementációnak legalább el kellene mentenie a returnUrl-t egy,
  // a teljes oldal-navigáción túlélő helyre (pl. sessionStorage), mielőtt a
  // social-login redirect elindul — enélkül a mélylink szándéka visszaállíthatatlanul
  // elvész, és a felhasználó a sikeres OAuth-bejelentkezés után mindig a
  // dashboardra kerül vissza, függetlenül attól, milyen védett oldalról indult.
  it('BUG: Google/Facebook/Apple bejelentkezésnél a returnUrl NEM kerül elmentésre a teljes oldal-navigáció (OAuth-redirect) előtt, szemben a jelszavas bejelentkezéssel, ami helyesen eljut a mélylinkre', () => {
    configure({ returnUrl: '/csoportok/42' });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();

    sessionStorage.removeItem('teacher_oauth_return_url');

    fixture.componentInstance.signInWithProvider('google');

    // A social-login ág ténylegesen elindítja a redirectet (a mock authStore-on
    // keresztül), de a returnUrl-t sehova nem menti el előtte.
    expect(authStoreMock.signInWithProvider).toHaveBeenCalledWith('google');
    expect(sessionStorage.getItem('teacher_oauth_return_url')).toBe('/csoportok/42');
  });
});
