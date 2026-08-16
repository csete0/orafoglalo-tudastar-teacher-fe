import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthStore } from './services/auth/store/auth.store';
import { HeaderDropdownCoordinatorService } from './shared/header-dropdown-coordinator.service';

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

  // UI-TT-177: a "hidden md:flex"/"md:hidden" töréspont-pár 768px-nél fix - ez elég a
  // 3 tanári linkhez, de a hasAdminRole() melletti 6 linkes desktop-nav élőben teljes
  // oldal-szintű vízszintes túlcsordulást okozott 768px és kb. 1115px között (1200px-nél
  // élőben már tiszta). Admin usernél a desktop-nav/profil-blokk küszöbét min-[1200px]-re
  // kell emelni, a mobil harang+hamburger blokknak (és lenyíló panelnek) pedig ezzel
  // lépést tartva min-[1200px]:hidden-re, különben 768-1200px között SEM a desktop-nav,
  // SEM a hamburger nem jelenne meg.
  it('BUG UI-TT-177 javítva: admin usernél a desktop-nav/profil-blokk töréspontja min-[1200px]-re emelve, a mobil harang+hamburger pedig ugyanerre a küszöbre vált', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);
    authStoreMock.hasAdminRole.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
    expect(nav.className).toContain('min-[1200px]:flex');
    expect(nav.className).not.toContain('md:flex');

    const mobileToggle = fixture.nativeElement.querySelector('[aria-label="Menü"]')!.closest('div') as HTMLElement;
    expect(mobileToggle.className).toContain('min-[1200px]:hidden');
    expect(mobileToggle.className).not.toContain('md:hidden');
  });

  it('nem-admin usernél a töréspont-pár változatlanul md:flex/md:hidden marad', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);
    authStoreMock.hasAdminRole.mockReturnValue(false);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
    expect(nav.className).toContain('md:flex');
    expect(nav.className).not.toContain('min-[1200px]:flex');

    const mobileToggle = fixture.nativeElement.querySelector('[aria-label="Menü"]')!.closest('div') as HTMLElement;
    expect(mobileToggle.className).toContain('md:hidden');
    expect(mobileToggle.className).not.toContain('min-[1200px]:hidden');
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

  // UI-TT-101: a mobil hamburger-menü és a fejléc harang-dropdownja (két
  // egymástól független, azonos z-40-es lenyíló) korábban SEMMILYEN kölcsönös
  // kizárást nem ismertek - egyszerre nyitva tartva a KÉSŐBB a DOM-fába kerülő
  // hamburger-panel valós nav-linkjei/"Kilépés" gombja a harang dropdownja
  // "alatt/mögött" élő, kattintható maradt. A HeaderDropdownCoordinatorService
  // köti össze a két felületet, pontosan úgy, ahogy a menü már eddig is
  // záródott Router/NavigationEnd-re (UI-TT-78).
  it('BUG UI-TT-101 javítva: a menü megnyitása "menu"-ként jelzi magát a coordinatorban', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const coordinator = TestBed.inject(HeaderDropdownCoordinatorService);
    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();

    expect(coordinator.openDropdown()).toBe('menu');
  });

  it('BUG UI-TT-101 javítva: ha a harang dropdown megnyílik (coordinator "bell"), a nyitva lévő mobil hamburger-menü bezáródik', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.menuOpen()).toBe(true);

    const coordinator = TestBed.inject(HeaderDropdownCoordinatorService);
    coordinator.open('bell');
    fixture.detectChanges();

    expect(fixture.componentInstance.menuOpen()).toBe(false);
  });

  it('BUG UI-TT-101 javítva: a valódi harang-gombra kattintva bezárul a nyitva lévő hamburger-menü', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.menuOpen()).toBe(true);

    const bellButton = fixture.nativeElement.querySelector('button[aria-label="Értesítések"]') as HTMLButtonElement;
    bellButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.menuOpen()).toBe(false);
  });

  // UI-TT-189: a mobil hamburger-menü panelje - a NotificationBellComponent
  // dropdownjával (fixed inset-0 backdrop (click)="open.set(false)" ÉS
  // (keydown.escape) handler) ellentétben - SEM kattintás-a-panelen-kívülre,
  // SEM Escape billentyűre nem záródik be. Egyetlen módja a bezárásnak: a
  // hamburger-gombra ismételt kattintás, egy panelen belüli linkre kattintás,
  // vagy navigáció (UI-TT-78 fixe). Amíg nyitva marad, a panel (absolute
  // top-full inset-x-0 z-40) ténylegesen letiltja a pointer-eseményeket az
  // alatta lévő oldaltartalomra.
  it('BUG UI-TT-189: Escape billentyűre a nyitott mobil hamburger-menü NEM záródik be', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.menuOpen()).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    // Elvárt (helyes) viselkedés: false. Tényleges: true marad, mert nincs
    // semmilyen (keydown.escape) handler a menu-panelen vagy az AppComponent-en.
    expect(fixture.componentInstance.menuOpen()).toBe(false);
  });

  it('BUG UI-TT-189: a panelen KÍVÜLI (pl. document body) kattintásra a nyitott mobil hamburger-menü NEM záródik be', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();
    expect(fixture.componentInstance.menuOpen()).toBe(true);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    // Elvárt (helyes) viselkedés: false, ahogy a testvér NotificationBellComponent
    // dropdownja saját "fixed inset-0" backdrop-kattintással bezáródik. Tényleges:
    // true marad, mert a menu-panelnek nincs saját backdropja/document-click listenere.
    expect(fixture.componentInstance.menuOpen()).toBe(false);
  });
});
