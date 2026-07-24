import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationStore } from '../../services/notification/notification.store';
import { Notification } from '../../models/notification.model';
import { HeaderDropdownCoordinatorService } from '../header-dropdown-coordinator.service';

// UI-TT-82: a teacher-fe-nek eddig egyáltalán nem volt harang-ikonja/lenyíló
// értesítés-listája. Ezek a tesztek a komponens megjelenítési/interakciós
// logikáját ellenőrzik mockolt store-ral.
function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    notificationId: 1,
    userNotificationId: 1,
    title: 'Cím',
    content: 'Tartalom',
    isRead: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('NotificationBellComponent', () => {
  let storeMock: {
    notifications: ReturnType<typeof signal<Notification[]>>;
    activeNotifications: ReturnType<typeof signal<Notification[]>>;
    unreadCount: ReturnType<typeof signal<number>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    load: ReturnType<typeof vi.fn>;
    markAsRead: ReturnType<typeof vi.fn>;
    markAllAsRead: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    clearError: ReturnType<typeof vi.fn>;
  };

  // UI-TT-96: activeNotifications (a lejárt sorokat kiszűrő lista) alapértelmezetten
  // megegyezik a notifications-szel - az explicit lejárat-tesztek felülírják.
  function configure(notifications: Notification[] = [], activeNotifications: Notification[] = notifications) {
    storeMock = {
      notifications: signal(notifications),
      activeNotifications: signal(activeNotifications),
      unreadCount: signal(activeNotifications.filter((n) => !n.isRead).length),
      loading: signal(false),
      error: signal<string | null>(null),
      load: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      delete: vi.fn(),
      clearError: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [{ provide: NotificationStore, useValue: storeMock }, provideRouter([])],
    });

    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('ngOnInit meghívja a store.load()-ot', () => {
    configure();
    expect(storeMock.load).toHaveBeenCalled();
  });

  it('nem jelenít meg olvasatlan jelvényt, ha unreadCount 0', () => {
    const fixture = configure([]);
    expect(fixture.nativeElement.querySelector('[data-testid="notification-unread-badge"]')).toBeNull();
  });

  it('megjeleníti az olvasatlan jelvényt a helyes darabszámmal', () => {
    const fixture = configure([makeNotification({ isRead: false })]);
    const badge = fixture.nativeElement.querySelector('[data-testid="notification-unread-badge"]');
    expect(badge?.textContent?.trim()).toBe('1');
  });

  it('kattintásra kinyílik a panel, és a lista megjelenik', () => {
    const fixture = configure([makeNotification({ title: 'Teszt értesítés' })]);
    expect(fixture.nativeElement.querySelector('[data-testid="notification-panel"]')).toBeNull();

    fixture.nativeElement.querySelector('button[aria-label="Értesítések"]').click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Teszt értesítés');
  });

  it('egy olvasatlan elemre kattintva markAsRead()-et hív és bezárja a panelt', () => {
    const fixture = configure([makeNotification({ userNotificationId: 5, isRead: false })]);
    const component = fixture.componentInstance;
    component.open.set(true);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('li div').click();

    expect(storeMock.markAsRead).toHaveBeenCalledWith(5);
    expect(component.open()).toBe(false);
  });

  it('egy már olvasott elemre kattintva NEM hívja meg a markAsRead()-et', () => {
    const fixture = configure([makeNotification({ userNotificationId: 5, isRead: true })]);
    const component = fixture.componentInstance;
    component.open.set(true);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('li div').click();

    expect(storeMock.markAsRead).not.toHaveBeenCalled();
  });

  it('actionUrl-lel rendelkező elemre kattintva navigál oda', () => {
    const fixture = configure([
      makeNotification({ userNotificationId: 5, isRead: true, actionUrl: '/csoportok/1' }),
    ]);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    const component = fixture.componentInstance;
    component.open.set(true);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('li div').click();

    expect(navigateSpy).toHaveBeenCalledWith('/csoportok/1');
  });

  it('a törlés gomb kattintása nem váltja ki a mark-as-read/navigációs logikát (stopPropagation)', () => {
    const fixture = configure([makeNotification({ userNotificationId: 5, isRead: false })]);
    const component = fixture.componentInstance;
    component.open.set(true);
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button[aria-label="Törlés"]').click();

    expect(storeMock.delete).toHaveBeenCalledWith(5);
    expect(storeMock.markAsRead).not.toHaveBeenCalled();
  });

  it('"Összes megjelölése olvasottként" gomb NEM jelenik meg, ha nincs olvasatlan elem', () => {
    const fixture = configure([makeNotification({ isRead: true })]);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    expect(
      Array.from(fixture.nativeElement.querySelectorAll('button')).some((b: any) =>
        b.textContent.includes('Összes megjelölése'),
      ),
    ).toBe(false);
  });

  it('"Összes megjelölése olvasottként" gomb megjelenik, ha van olvasatlan elem', () => {
    const fixture = configure([makeNotification({ isRead: false })]);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    expect(
      Array.from(fixture.nativeElement.querySelectorAll('button')).some((b: any) =>
        b.textContent.includes('Összes megjelölése'),
      ),
    ).toBe(true);
  });

  // UI-TT-96: a lista a store.activeNotifications()-t olvassa, nem a nyers
  // store.notifications()-t - egy lejárt sor kiszűrve NEM jelenik meg a
  // panelben, akkor sem, ha a store.notifications() még tartalmazza.
  it('a lejárt (activeNotifications által kiszűrt) elem nem jelenik meg a panelben', () => {
    const all = [makeNotification({ userNotificationId: 1, title: 'Lejárt' }), makeNotification({ userNotificationId: 2, title: 'Aktív' })];
    const active = [all[1]];
    const fixture = configure(all, active);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
    expect(panel.textContent).not.toContain('Lejárt');
    expect(panel.textContent).toContain('Aktív');
  });

  // UI-TT-97: egy ténylegesen beállított store.error() a panelben látható
  // hibaüzenetként jelenik meg, nem csak csendben elnyelve.
  it('megjeleníti a store.error()-t, ha be van állítva', () => {
    const fixture = configure([makeNotification()]);
    storeMock.error.set('Az értesítés törlése sikertelen.');
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
    expect(panel.textContent).toContain('Az értesítés törlése sikertelen.');
  });

  it('NEM jelenít meg hibasávot, ha store.error() null', () => {
    const fixture = configure([makeNotification()]);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
    expect(panel.textContent).not.toContain('sikertelen');
  });

  // UI-TT-100: a panel megnyitásakor a fókusz korábban SEHOVA nem került (a
  // gombon maradt), így egy Tab a panel MÖGÖTTI, DOM-sorrendben rákövetkező
  // testvér-elemre (élőben a "Kilépés" gombra) ugorhatott. Ezek a tesztek azt
  // igazolják, amit jsdom valóban hitelesen ellenőrizni tud (a valós
  // böngésző-layout/z-index-alapú takarás nem reprodukálható jsdomban, ld.
  // ledger UI-TS-55/UI-TT-78/UI-TT-100/UI-TT-101 indoklása).
  describe('UI-TT-100: fókusz-csapdázás', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('megnyitáskor a fókusz a panel első fókuszálható elemére kerül', () => {
      vi.useFakeTimers();
      const fixture = configure([makeNotification({ isRead: false })]);

      (fixture.nativeElement.querySelector('button[aria-label="Értesítések"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      vi.runAllTimers();

      const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
      expect(panel).not.toBeNull();
      expect(panel.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBeNull();
    });

    // Ez pontosan az élő reprodukció esete (browserhunt-teacher-20260710@example.com,
    // "Nincs értesítésed." - nincs olvasatlan jelvény, tehát nincs "Összes
    // megjelölése" gomb sem): ha a panelnek NINCS egyetlen fókuszálható eleme
    // sem, a fókusz a panel konténerén ragad, nem a mögötte lévő elemeken.
    it('üres listánál (nincs fókuszálható elem a panelben) a fókusz magán a panelen ragad', () => {
      vi.useFakeTimers();
      const fixture = configure([]);

      (fixture.nativeElement.querySelector('button[aria-label="Értesítések"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      vi.runAllTimers();

      const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
      expect(panel.querySelectorAll('button, [href], input, select, textarea').length).toBe(0);
      expect(document.activeElement).toBe(panel);
    });

    it('Escape bezárja a dropdownt és visszaadja a fókuszt a harang-gombra', () => {
      vi.useFakeTimers();
      const fixture = configure([makeNotification({ isRead: false })]);
      const trigger = fixture.nativeElement.querySelector('button[aria-label="Értesítések"]') as HTMLButtonElement;

      trigger.click();
      fixture.detectChanges();
      vi.runAllTimers();

      const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
      panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      fixture.detectChanges();

      expect(fixture.componentInstance.open()).toBe(false);
      expect(document.activeElement).toBe(trigger);
    });

    it('Tab az utolsó fókuszálható elemről az elsőre viszi a fókuszt, nem hagyja el a panelt', () => {
      vi.useFakeTimers();
      const fixture = configure([makeNotification({ isRead: false, userNotificationId: 9 })]);

      (fixture.nativeElement.querySelector('button[aria-label="Értesítések"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      vi.runAllTimers();

      const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
      const focusable = Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[];
      expect(focusable.length).toBeGreaterThan(1);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      last.focus();
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      panel.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
    });

    it('Shift+Tab az első fókuszálható elemről az utolsóra viszi a fókuszt, nem hagyja el a panelt', () => {
      vi.useFakeTimers();
      const fixture = configure([makeNotification({ isRead: false, userNotificationId: 9 })]);

      (fixture.nativeElement.querySelector('button[aria-label="Értesítések"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      vi.runAllTimers();

      const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
      const focusable = Array.from(panel.querySelectorAll('button')) as HTMLButtonElement[];
      expect(focusable.length).toBeGreaterThan(1);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      first.focus();
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
      panel.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(last);
    });
  });

  // UI-TT-101: a hamburger-menü és a harang dropdown korábban EGYMÁSTÓL
  // FÜGGETLEN szignálok voltak, kölcsönös kizárás nélkül - a
  // HeaderDropdownCoordinatorService köti össze őket (ugyanaz a minta, mint
  // ahogy a mobil menü már eddig is záródott Router/NavigationEnd-re, UI-TT-78).
  describe('UI-TT-101: kölcsönös kizárás a hamburger-menüvel', () => {
    it('nyitáskor (toggle()) "bell"-ként jelzi magát a coordinatorban', () => {
      const fixture = configure([]);
      const coordinator = TestBed.inject(HeaderDropdownCoordinatorService);

      fixture.componentInstance.toggle();
      fixture.detectChanges();

      expect(coordinator.openDropdown()).toBe('bell');
    });

    it('záráskor (close()) törli magát a coordinatorból', () => {
      const fixture = configure([]);
      const coordinator = TestBed.inject(HeaderDropdownCoordinatorService);

      fixture.componentInstance.toggle();
      fixture.detectChanges();
      fixture.componentInstance.close();
      fixture.detectChanges();

      expect(coordinator.openDropdown()).toBeNull();
    });

    it('ha a coordinator "menu"-t jelez (a hamburger-menü megnyílt), a dropdown bezáródik', () => {
      const fixture = configure([]);
      const coordinator = TestBed.inject(HeaderDropdownCoordinatorService);

      fixture.componentInstance.open.set(true);
      fixture.detectChanges();
      expect(fixture.componentInstance.open()).toBe(true);

      coordinator.open('menu');
      fixture.detectChanges();

      expect(fixture.componentInstance.open()).toBe(false);
    });
  });
});
