import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationStore } from '../../services/notification/notification.store';
import { Notification } from '../../models/notification.model';

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
    unreadCount: ReturnType<typeof signal<number>>;
    loading: ReturnType<typeof signal<boolean>>;
    load: ReturnType<typeof vi.fn>;
    markAsRead: ReturnType<typeof vi.fn>;
    markAllAsRead: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  function configure(notifications: Notification[] = []) {
    storeMock = {
      notifications: signal(notifications),
      unreadCount: signal(notifications.filter((n) => !n.isRead).length),
      loading: signal(false),
      load: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      delete: vi.fn(),
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
});
