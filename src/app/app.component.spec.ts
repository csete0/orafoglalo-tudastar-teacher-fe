import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthStore } from './services/auth/store/auth.store';

@Component({ standalone: true, template: '' })
class BlankTestComponent {}

describe('AppComponent', () => {
  let authStoreMock: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    hasAdminRole: ReturnType<typeof vi.fn>;
    hasTeacherRole: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authStoreMock = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      hasAdminRole: vi.fn().mockReturnValue(false),
      hasTeacherRole: vi.fn().mockReturnValue(true),
      currentUser: vi.fn().mockReturnValue({
        id: 1,
        userName: 'teszt@example.com',
        email: 'teszt@example.com',
        firstName: 'Elek',
        lastName: 'Teszt',
        roles: ['teacher'],
      }),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([{ path: 'dashboard', component: BlankTestComponent }]),
        { provide: AuthStore, useValue: authStoreMock },
      ],
    }).compileComponents();
  });

  it('létrejön a shell (router-outlet-tel)', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });

  it('nem autentikált userre nem jelenik meg a navigáció', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
  });

  it('autentikált userre megjelenik a navigáció, admin-linkkel csak admin role esetén', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);
    authStoreMock.hasAdminRole.mockReturnValue(false);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav');
    expect(nav).toBeTruthy();
    expect(nav.textContent).not.toContain('Jelentkezések');
  });

  it('platform-admin usernek megjelenik a "Jelentkezések" link', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);
    authStoreMock.hasAdminRole.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('nav').textContent).toContain('Jelentkezések');
  });

  // UI-TT-15: teacher role NÉLKÜLI (pl. elbírálás alatt álló) bejelentkezett usernek
  // a tanár-only nav-linkek (Csoportok/Feladatsorok/Intézmények) ne is jelenjenek meg,
  // ne csak a roleGuard dobja vissza kattintáskor néma módon.
  it('BUG UI-TT-15: teacher role NÉLKÜLI bejelentkezett usernek nem jelenik meg a tanári navigáció', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);
    authStoreMock.hasTeacherRole.mockReturnValue(false);
    authStoreMock.hasAdminRole.mockReturnValue(false);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav');
    expect(nav).toBeTruthy();
    expect(nav.textContent).not.toContain('Csoportok');
    expect(nav.textContent).not.toContain('Feladatsorok');
    expect(nav.textContent).not.toContain('Intézmények');
  });

  it('teacher role-lal rendelkező usernek megjelenik a tanári navigáció', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);
    authStoreMock.hasTeacherRole.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav');
    expect(nav.textContent).toContain('Csoportok');
    expect(nav.textContent).toContain('Feladatsorok');
    expect(nav.textContent).toContain('Intézmények');
  });

  it('a profil-chip monogramja magyar sorrendben: vezetéknév + keresztnév kezdőbetű', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const monogram = fixture.nativeElement.querySelector('[data-testid="profile-monogram"]');
    expect(monogram).toBeTruthy();
    expect(monogram.textContent.trim()).toBe('TE');
  });

  // UI-TT-78: a mobil lenyíló panel korábban csak a PANELEN BELÜLI linkekre (és
  // logout()-ra) kattintva záródott be - a fejléc-logóra, dashboard-kártyák saját
  // linkjeire, VAGY a böngésző Vissza/Előre gombjára (popstate, sosem fut le (click)
  // handleren) navigálva nyitva maradt. Egy Router.events/NavigationEnd-alapú zárás
  // MINDEN navigációs útvonalat lefed, (click)-handlerektől függetlenül.
  it('BUG UI-TT-78 javítva: a mobil menü BÁRMILYEN NavigationEnd-re bezáródik, nem csak a panelen belüli (click)-re', async () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    fixture.componentInstance.menuOpen.set(true);
    expect(fixture.componentInstance.menuOpen()).toBe(true);

    const router = TestBed.inject(Router);
    await router.navigate(['/dashboard']);

    expect(fixture.componentInstance.menuOpen()).toBe(false);
  });
});
