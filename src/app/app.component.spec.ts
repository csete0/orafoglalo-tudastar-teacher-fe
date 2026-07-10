import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthStore } from './services/auth/store/auth.store';

describe('AppComponent', () => {
  let authStoreMock: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    hasAdminRole: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authStoreMock = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      hasAdminRole: vi.fn().mockReturnValue(false),
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
      providers: [provideRouter([]), { provide: AuthStore, useValue: authStoreMock }],
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

  it('a profil-chip monogramja magyar sorrendben: vezetéknév + keresztnév kezdőbetű', () => {
    authStoreMock.isAuthenticated.mockReturnValue(true);

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const monogram = fixture.nativeElement.querySelector('[data-testid="profile-monogram"]');
    expect(monogram).toBeTruthy();
    expect(monogram.textContent.trim()).toBe('TE');
  });
});
