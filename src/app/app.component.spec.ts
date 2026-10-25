import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { AuthStore } from './services/auth/store/auth.store';
import { MockExamService } from './services/mock-exam/mock-exam.service';
import { TutorialVideoService } from './services/tutorial-video/tutorial-video.service';

describe('AppComponent', () => {
  let isAuthenticated: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    isAuthenticated = vi.fn().mockReturnValue(false);
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: {
            isAuthenticated,
            hasAdminRole: vi.fn().mockReturnValue(false),
            hasTeacherRole: vi.fn().mockReturnValue(true),
            currentUser: vi.fn().mockReturnValue({ firstName: 'Elek', lastName: 'Teszt', email: 'teszt@example.com' }),
            demo: vi.fn().mockReturnValue(null),
            logout: vi.fn(),
          },
        },
        { provide: MockExamService, useValue: { getCurrent: () => of(null) } },
        { provide: TutorialVideoService, useValue: { hasPremium: () => of(true) } },
      ],
    }).compileComponents();
  });

  it('létrejön a shell (router-outlet a main-ben)', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('main router-outlet')).toBeTruthy();
  });

  it('nem autentikált userre nincs menü (sem oldalsáv, sem mobil sáv)', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-sidebar')).toBeNull();
    expect(fixture.nativeElement.querySelector('nav')).toBeNull();
  });

  it('autentikált usernél a menü a main ELŐTT, azon kívül áll (a régi felső fejléc nincs)', () => {
    isAuthenticated.mockReturnValue(true);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const sidebar = root.querySelector('app-sidebar')!;
    expect(sidebar).toBeTruthy();
    expect(sidebar.nextElementSibling?.tagName).toBe('MAIN');
    expect(root.querySelector('main [data-testid="app-sidebar"]')).toBeNull();
    expect(root.querySelector('main')!.className).toContain('min-w-0');
    // A régi admin-ágú max-w-7xl/1400 px fejléc-trükkök megszűntek.
    expect(root.innerHTML).not.toContain('max-w-7xl');
    expect(root.innerHTML).not.toContain('min-[1400px]');
  });
});
