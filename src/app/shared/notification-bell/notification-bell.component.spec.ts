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

    fixture.nativeElement.querySelector('button[aria-label^="Értesítések"]').click();
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
    expect(panel).not.toBeNull();
    expect(panel.textContent).toContain('Teszt értesítés');
  });

  // UI-TT-131: ugyanaz az "aria-expanded hiánya" mintázat, mint UI-TT-129/UI-TT-130-nál, csak itt
  // nem egy harmonika-fejléc, hanem magán a harang-gombon (triggerBtn, `open()` signal) - a gomb
  // nyitja/csukja a lenyíló értesítés-panelt, de sem aria-expanded, sem aria-haspopup nincs rajta,
  // az `aria-label="Értesítések"` MINDKÉT állapotban (nyitva/csukva) ugyanaz a statikus szöveg marad.
  it('BUG (ÚJ, UI-TT-131): a harang-gombon (triggerBtn) nincs aria-expanded, holott a gomb ténylegesen nyitja/csukja az értesítés-panelt (open() signal)', () => {
    const fixture = configure([makeNotification({ title: 'Teszt értesítés' })]);
    const bellButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[aria-label^="Értesítések"]');

    bellButton.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.open()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="notification-panel"]')).not.toBeNull();

    // Bukó elvárás: a panel ténylegesen nyitva van, de a gombon nincs aria-expanded="true".
    expect(bellButton.getAttribute('aria-expanded')).toBe('true');
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

  // UI-TT-NEXT: az értesítés-sor (a mark-as-read + actionUrl-navigáció
  // egyetlen kiváltója) csupasz <div (click)>-ként van megvalósítva, tabindex,
  // role vagy (keydown.enter)/(keydown.space) nélkül - ugyanaz az anti-minta,
  // mint a UI-TS-130/UI-TS-131-nél (topic-card, nav-profile-dropdown). Élőben
  // (Playwright, Tab-only navigáció) igazolva: a panel megnyitása után a fókusz
  // egyenesen az "Összes megjelölése olvasottként" gombról a sor "Törlés"
  // gombjára ugrik, MAGÁT a sort (onItemClick) sosem érinti - billentyűzettel
  // az értesítés so sem olvasható el/nyitható meg, csak törölhető.
  it('UI-TT-NEXT: az értesítés-sor (li div, onItemClick) billentyűzettel fókuszálható kell legyen (button vagy tabindex="0")', () => {
    const fixture = configure([makeNotification({ userNotificationId: 5, isRead: false })]);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    const itemEl = fixture.nativeElement.querySelector('li div') as HTMLElement;
    expect(itemEl).not.toBeNull();

    const isNativeButton = itemEl.tagName === 'BUTTON';
    const hasTabIndexZero = itemEl.getAttribute('tabindex') === '0';

    expect(isNativeButton || hasTabIndexZero).toBe(true);
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

      (fixture.nativeElement.querySelector('button[aria-label^="Értesítések"]') as HTMLButtonElement).click();
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

      (fixture.nativeElement.querySelector('button[aria-label^="Értesítések"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      vi.runAllTimers();

      const panel = fixture.nativeElement.querySelector('[data-testid="notification-panel"]');
      expect(panel.querySelectorAll('button, [href], input, select, textarea').length).toBe(0);
      expect(document.activeElement).toBe(panel);
    });

    it('Escape bezárja a dropdownt és visszaadja a fókuszt a harang-gombra', () => {
      vi.useFakeTimers();
      const fixture = configure([makeNotification({ isRead: false })]);
      const trigger = fixture.nativeElement.querySelector('button[aria-label^="Értesítések"]') as HTMLButtonElement;

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

      (fixture.nativeElement.querySelector('button[aria-label^="Értesítések"]') as HTMLButtonElement).click();
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

      (fixture.nativeElement.querySelector('button[aria-label^="Értesítések"]') as HTMLButtonElement).click();
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

  // UI-TT-162: `AppComponent`-ben KÉT `<app-notification-bell />` van egyszerre
  // mountolva (desktop + mobil header-sáv, ld. `app.component.ts` 77./91. sor),
  // egymástól teljesen független `open` szignállal - csak Tailwind
  // `hidden md:flex` / `md:hidden flex` CSS dönti el, melyik LÁTSZIK egy adott
  // viewport-szélességnél, de EGYIK PÉLDÁNY DOM-ból/élettartamból SOSEM tűnik
  // el, tehát az `open` szignálja is megmarad, amíg a felhasználó explicit
  // nem zárja be AZT A PÉLDÁNYT. A `HeaderDropdownCoordinatorService` csak a
  // "melyik FELÜLET (bell/menu) van nyitva" kérdést tudja - a két harang-
  // példány között NINCS kölcsönös kizárás (ld. a komponens saját
  // dokumentáció-kommentje 178-188. sor: ez SZÁNDÉKOS, hogy elkerülje a
  // flush-ciklusbeli versenyhelyzetet). Élőben (`browser_resize` 390x844 →
  // 1280x900 → vissza 390x844-re, konkrét lépések + screenshotok:
  // evidence/prelaunch-bell-resize-step{1,2,3}-*.png) ez azt eredményezi,
  // hogy a mobil harang panelje ÚJRA NYITVA jelenik meg (aria-expanded="true",
  // "Nincs értesítésed" panel látható) egyetlen kattintás NÉLKÜL, pusztán
  // attól, hogy a böngésző-ablakot desktop szélességre húzva-vissza-mobilra
  // húzzuk - a mobil példány `open` jele sosem lett hamis, csak a CSS
  // eltakarta, majd megint felfedte. Az alábbi teszt ugyanezt a hiányzó
  // kölcsönös kizárást mutatja be közvetlenül, két, UGYANAZT a
  // (TestBed-singleton) coordinatort megosztó példányon keresztül.
  describe('UI-TT-162: két egyidejűleg mountolt harang-példány (desktop+mobil) között nincs kizárás', () => {
    it('az egyik példány megnyitása NEM zárja be a MÁSIK, már nyitott példányt', () => {
      // Mindkét "fizikai" harang-példány ugyanabban a TestBed modulban,
      // ugyanazt a (providedIn: 'root') coordinator-singletont osztja meg -
      // pont úgy, ahogy `app.component.ts`-ben a desktop és mobil
      // `<app-notification-bell />` is ugyanazt az injektort örökli.
      const desktopFixture = configure([]);
      const mobileFixture = TestBed.createComponent(NotificationBellComponent);
      mobileFixture.detectChanges();
      const coordinator = TestBed.inject(HeaderDropdownCoordinatorService);

      // A "desktop" példány megnyílik (pl. a felhasználó szűk viewporton
      // becsukja, majd kiszélesíti az ablakot úgy, hogy közben nem katt,
      // itt viszont csak azt szimuláljuk, hogy MINDKÉT példány létezik és
      // az egyik nyitva van).
      desktopFixture.componentInstance.toggle();
      desktopFixture.detectChanges();
      expect(desktopFixture.componentInstance.open()).toBe(true);
      expect(coordinator.openDropdown()).toBe('bell');

      // A "mobil" példány is megnyílik (a felhasználó ténylegesen ide
      // kattint mobil nézetben) - a coordinator még mindig csak annyit tud,
      // hogy "bell" van nyitva, arról fogalma sincs, hogy ez egy MÁSIK
      // fizikai példány.
      mobileFixture.componentInstance.toggle();
      mobileFixture.detectChanges();
      expect(mobileFixture.componentInstance.open()).toBe(true);

      // Bukó elvárás: a coordinatornak a MÁSIK harang-példány megnyílásakor
      // a KORÁBBAN nyitott példányt is be kellene csuknia (ugyanúgy, ahogy a
      // "menu" megnyitása is bezárja - ld. a fenti "kölcsönös kizárás a
      // hamburger-menüvel" leírást), különben egy viewport-váltás
      // (böngésző-ablak átméretezése, tablet elforgatása) után a korábban
      // "eltűnt" (CSS-sel elrejtett) példány panelje kattintás nélkül,
      // magától újra megjelenik, amint a CSS ismét megjeleníti azt a
      // wrappert (ld. élő screenshot-bizonyíték a fájl tetején). A tényleges
      // kód ezt NEM garantálja - ez a teszt jelenleg BUKIK.
      expect(desktopFixture.componentInstance.open()).toBe(false);
    });
  });

  // BUG UI-TT-127: the unread-count badge (data-testid="notification-unread-badge")
  // is purely visual - the trigger button's aria-label is the static "Értesítések"
  // string, never updated to reflect the count, and the badge <span> itself sits
  // outside any aria-live region. A sighted user sees a red "3" appear on the bell
  // the moment a new notification arrives (even without opening the panel); a
  // screen-reader user gets no announcement at all and, on focusing the button,
  // hears only "Értesítések, button" with no indication that anything is unread.
  describe('olvasatlan jelvény nem érhető el screen readerrel (UI-TT-127)', () => {
    it('BUG: a harang gomb elérhető neve nem tükrözi az olvasatlan darabszámot', () => {
      const fixture = configure([makeNotification({ isRead: false })]);
      const trigger: HTMLButtonElement = fixture.nativeElement.querySelector('button[aria-label]');
      expect(trigger).toBeTruthy();

      const accessibleName = trigger.getAttribute('aria-label') || '';
      expect(accessibleName).toContain('1');
    });

    it('BUG: az olvasatlan jelvény nincs aria-live régióban', () => {
      const fixture = configure([makeNotification({ isRead: false })]);
      const badge: HTMLElement = fixture.nativeElement.querySelector(
        '[data-testid="notification-unread-badge"]',
      );
      expect(badge).toBeTruthy();

      const liveRegionAncestor = badge.closest('[aria-live]');
      expect(liveRegionAncestor).toBeTruthy();
    });
  });
});
