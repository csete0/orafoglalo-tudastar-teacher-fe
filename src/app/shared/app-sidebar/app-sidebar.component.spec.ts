import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthStore } from '../../services/auth/store/auth.store';
import { MockExamService } from '../../services/mock-exam/mock-exam.service';
import { HeaderDropdownCoordinatorService } from '../header-dropdown-coordinator.service';
import { AppSidebarComponent, SIDEBAR_COLLAPSED_KEY, activeLinkPath } from './app-sidebar.component';

@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class BlankComponent {}

describe('AppSidebarComponent', () => {
  let authStoreMock: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    hasAdminRole: ReturnType<typeof vi.fn>;
    hasTeacherRole: ReturnType<typeof vi.fn>;
    currentUser: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let mockExamCurrent: unknown;

  beforeEach(async () => {
    localStorage.clear();
    mockExamCurrent = null;
    authStoreMock = {
      isAuthenticated: vi.fn().mockReturnValue(true),
      hasAdminRole: vi.fn().mockReturnValue(false),
      hasTeacherRole: vi.fn().mockReturnValue(true),
      currentUser: vi.fn().mockReturnValue({
        id: 1,
        email: 'teszt@example.com',
        firstName: 'Elek',
        lastName: 'Teszt',
        roles: ['teacher'],
      }),
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AppSidebarComponent],
      providers: [
        provideRouter([
          { path: 'adat', component: BlankComponent, data: { wide: true } },
          { path: '**', component: BlankComponent },
        ]),
        { provide: AuthStore, useValue: authStoreMock },
        { provide: MockExamService, useValue: { getCurrent: () => of(mockExamCurrent) } },
      ],
    }).compileComponents();
  });

  afterEach(() => localStorage.clear());

  function create() {
    const fixture = TestBed.createComponent(AppSidebarComponent);
    fixture.detectChanges();
    return fixture;
  }

  const sidebar = (f: ReturnType<typeof create>) =>
    f.nativeElement.querySelector('[data-testid="app-sidebar"]') as HTMLElement;
  const linkLabels = (root: HTMLElement) =>
    Array.from(root.querySelectorAll('nav a')).map((a) => a.textContent!.trim());

  it('a menüpontok a makett sorrendjében, ikonnal', () => {
    const fixture = create();

    expect(linkLabels(sidebar(fixture))).toEqual([
      'Vezérlőpult',
      'Csoportok',
      'Feladatsorok',
      'Kvízek és élő játék',
      'Projektek',
      'Intézményeim',
    ]);
    expect(sidebar(fixture).querySelectorAll('nav a app-icon').length).toBe(6);
    expect(sidebar(fixture).textContent).not.toContain('Fejlesztőműhely');
  });

  it('közzétett próbaérettséginél a Próbaérettségi az Intézményeim elé kerül', () => {
    mockExamCurrent = { slug: 'osz' };
    const fixture = create();
    fixture.detectChanges();

    const labels = linkLabels(sidebar(fixture));
    expect(labels.at(-2)).toBe('Próbaérettségi');
    expect(labels.at(-1)).toBe('Intézményeim');
  });

  it('BUG UI-TT-15: teacher role NÉLKÜL nincs tanári menüpont, de kilépni lehet', () => {
    authStoreMock.hasTeacherRole.mockReturnValue(false);
    const fixture = create();

    expect(sidebar(fixture).querySelector('nav')).toBeTruthy();
    expect(linkLabels(sidebar(fixture))).toEqual([]);
    expect(sidebar(fixture).querySelector('button[aria-label="Kilépés"]')).toBeTruthy();
  });

  it('activeLinkPath: a leghosszabb, szegmenshatáron illeszkedő menüpont nyer', () => {
    const links = [
      { path: '/feladatsorok', label: '', icon: 'chart' as const },
      { path: '/feladatsorok/kvizek', label: '', icon: 'chart' as const },
    ];
    expect(activeLinkPath('/feladatsorok', links)).toBe('/feladatsorok');
    expect(activeLinkPath('/feladatsorok/12/szerkesztes', links)).toBe('/feladatsorok');
    expect(activeLinkPath('/feladatsorok/kvizek/5/szerkesztes?x=1', links)).toBe('/feladatsorok/kvizek');
    expect(activeLinkPath('/feladatsorokx', links)).toBeNull();
    expect(activeLinkPath('/dolgozatok/3', links)).toBeNull();
  });

  it('navigáció után pontosan egy menüpont aria-current="page" (kvíz-szerkesztőn a Kvízek, nem a Feladatsorok)', async () => {
    const fixture = create();
    await TestBed.inject(Router).navigateByUrl('/feladatsorok/kvizek/5/szerkesztes');
    fixture.detectChanges();

    const current = sidebar(fixture).querySelectorAll('nav a[aria-current="page"]');
    expect(current.length).toBe(1);
    expect(current[0].textContent!.trim()).toBe('Kvízek és élő játék');
    expect(current[0].className).toContain('bg-primary-subtle');
  });

  it('összecsukás: 15rem ↔ 4rem, aria-expanded/aria-label, a címkék sr-only + title, localStorage-ba ment', () => {
    const fixture = create();
    const toggle = sidebar(fixture).querySelector('[data-testid="sidebar-toggle"]') as HTMLButtonElement;

    expect(sidebar(fixture).className).toContain('w-60');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Menü összecsukása');

    toggle.click();
    fixture.detectChanges();

    expect(sidebar(fixture).className).toContain('w-16');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Menü kinyitása');
    const firstLink = sidebar(fixture).querySelector('nav a') as HTMLElement;
    expect(firstLink.getAttribute('title')).toBe('Vezérlőpult');
    expect(firstLink.querySelector('span')!.className).toContain('sr-only');
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');
  });

  it('a mentett választás új példányban is érvényes', () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
    expect(sidebar(create()).className).toContain('w-16');
  });

  it('adatoldalon (route.data.wide) alapból összecsukva, máshol kinyitva; a kézi választás felülírja', async () => {
    const fixture = create();
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/adat');
    fixture.detectChanges();
    expect(sidebar(fixture).className).toContain('w-16');

    await router.navigateByUrl('/csoportok');
    fixture.detectChanges();
    expect(sidebar(fixture).className).toContain('w-60');

    (sidebar(fixture).querySelector('[data-testid="sidebar-toggle"]') as HTMLButtonElement).click();
    await router.navigateByUrl('/adat');
    await router.navigateByUrl('/csoportok');
    fixture.detectChanges();
    expect(sidebar(fixture).className).toContain('w-16');
  });

  it('tiltott localStorage mellett is működik az összecsukás', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      const fixture = create();
      (sidebar(fixture).querySelector('[data-testid="sidebar-toggle"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(sidebar(fixture).className).toContain('w-16');
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });

  it('a profil-blokk monogramja magyar sorrendben, e-mail a title-ben; a Kilépés kijelentkeztet', () => {
    const fixture = create();
    const monogram = sidebar(fixture).querySelector('[data-testid="profile-monogram"]') as HTMLElement;

    expect(monogram.textContent!.trim()).toBe('TE');
    expect(monogram.parentElement!.getAttribute('title')).toBe('teszt@example.com');

    (sidebar(fixture).querySelector('button[aria-label="Kilépés"]') as HTMLButtonElement).click();
    expect(authStoreMock.logout).toHaveBeenCalled();
  });

  it('a sáv, a mobil felső sáv és a drawer nyomtatásban rejtett', () => {
    const fixture = create();
    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();

    for (const id of ['app-sidebar', 'mobile-topbar', 'mobile-drawer']) {
      expect(fixture.nativeElement.querySelector(`[data-testid="${id}"]`).className).toContain('print:hidden');
    }
  });

  describe('mobil drawer', () => {
    const drawer = (f: ReturnType<typeof create>) =>
      f.nativeElement.querySelector('[data-testid="mobile-drawer"]') as HTMLElement | null;

    it('a hamburger nyitja (aria-expanded), benne ugyanazok a menüpontok', () => {
      const fixture = create();
      const burger = fixture.nativeElement.querySelector('button[aria-label="Menü"]') as HTMLButtonElement;
      expect(drawer(fixture)).toBeNull();

      burger.click();
      fixture.detectChanges();

      expect(burger.getAttribute('aria-expanded')).toBe('true');
      expect(linkLabels(drawer(fixture)!)).toEqual(linkLabels(sidebar(fixture)));
    });

    it('BUG UI-TT-78: bármilyen NavigationEnd bezárja', async () => {
      const fixture = create();
      fixture.componentInstance.menuOpen.set(true);

      await TestBed.inject(Router).navigateByUrl('/dashboard');

      expect(fixture.componentInstance.menuOpen()).toBe(false);
    });

    it('BUG UI-TT-189: Escape bezárja', () => {
      const fixture = create();
      fixture.componentInstance.menuOpen.set(true);
      fixture.detectChanges();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(fixture.componentInstance.menuOpen()).toBe(false);
    });

    it('dialógus-szemantika: nyitáskor az első menüpont kap fókuszt, Escape után a hamburger', () => {
      const fixture = create();
      document.body.appendChild(fixture.nativeElement); // fókusz csak dokumentumba kötött elemen működik
      const burger = fixture.nativeElement.querySelector('button[aria-label="Menü"]') as HTMLButtonElement;
      burger.click();
      fixture.detectChanges();

      const panel = drawer(fixture)!;
      expect(panel.getAttribute('role')).toBe('dialog');
      expect(panel.getAttribute('aria-modal')).toBe('true');
      expect(document.activeElement).toBe(panel.querySelector('a[href]'));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(document.activeElement).toBe(burger);
      fixture.nativeElement.remove();
    });

    it('fókuszcsapda: Tab az utolsó elemről az elsőre, Shift+Tab az elsőről az utolsóra', () => {
      const fixture = create();
      document.body.appendChild(fixture.nativeElement);
      fixture.componentInstance.menuOpen.set(true);
      fixture.detectChanges();

      const items = drawer(fixture)!.querySelectorAll<HTMLElement>('a[href], button');
      const first = items[0];
      const last = items[items.length - 1];
      last.focus();
      last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      expect(document.activeElement).toBe(first);

      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
      expect(document.activeElement).toBe(last);
      fixture.nativeElement.remove();
    });

    it('BUG UI-TT-189: a draweren kívüli kattintás bezárja, a belső nem', () => {
      const fixture = create();
      fixture.componentInstance.menuOpen.set(true);
      fixture.detectChanges();

      drawer(fixture)!.querySelector('nav')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(fixture.componentInstance.menuOpen()).toBe(true);

      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(fixture.componentInstance.menuOpen()).toBe(false);
    });

    it('BUG UI-TT-101: nyitva "menu"-ként jelzi magát a coordinatorban', () => {
      const fixture = create();
      fixture.componentInstance.menuOpen.set(true);
      fixture.detectChanges();

      expect(TestBed.inject(HeaderDropdownCoordinatorService).openDropdown()).toBe('menu');
    });

    it('BUG UI-TT-101: a mobil sáv harangjára kattintva a drawer bezáródik', () => {
      const fixture = create();
      fixture.componentInstance.menuOpen.set(true);
      fixture.detectChanges();

      const topbar = fixture.nativeElement.querySelector('[data-testid="mobile-topbar"]') as HTMLElement;
      (topbar.querySelector('button[aria-label="Értesítések"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(fixture.componentInstance.menuOpen()).toBe(false);
    });
  });
});
