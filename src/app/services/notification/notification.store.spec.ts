import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { NotificationStore } from './notification.store';
import { NotificationService } from './notification.service';
import { Notification } from '../../models/notification.model';

// UI-TT-82: a teacher-fe-nek eddig egyáltalán nem volt értesítés-felülete.
// Ezek a tesztek a store betöltés/megjelölés/törlés logikáját ellenőrzik,
// mockolt NotificationService-szel.
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

describe('NotificationStore', () => {
  let serviceMock: {
    getNotifications: ReturnType<typeof vi.fn>;
    markAsRead: ReturnType<typeof vi.fn>;
    markAllAsRead: ReturnType<typeof vi.fn>;
    deleteNotification: ReturnType<typeof vi.fn>;
  };
  let store: NotificationStore;

  function configure() {
    serviceMock = {
      getNotifications: vi.fn(),
      markAsRead: vi.fn().mockReturnValue(of(undefined)),
      markAllAsRead: vi.fn().mockReturnValue(of(undefined)),
      deleteNotification: vi.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: NotificationService, useValue: serviceMock }],
    });

    store = TestBed.inject(NotificationStore);
  }

  it('load() sikeres válasz után feltölti a notifications listát', () => {
    configure();
    const list = [makeNotification({ userNotificationId: 1 }), makeNotification({ userNotificationId: 2 })];
    serviceMock.getNotifications.mockReturnValue(of(list));

    store.load();

    expect(store.notifications()).toEqual(list);
    expect(store.loading()).toBe(false);
  });

  it('load() hiba esetén error()-t állít, nem hagyja üresen a notifications-t hibaüzenet nélkül', () => {
    configure();
    serviceMock.getNotifications.mockReturnValue(throwError(() => ({ error: { errorMessage: 'Szerverhiba.' } })));

    store.load();

    expect(store.error()).toBe('Szerverhiba.');
    expect(store.notifications()).toEqual([]);
  });

  it('unreadCount csak az isRead=false elemeket számolja', () => {
    configure();
    serviceMock.getNotifications.mockReturnValue(
      of([
        makeNotification({ userNotificationId: 1, isRead: false }),
        makeNotification({ userNotificationId: 2, isRead: true }),
        makeNotification({ userNotificationId: 3, isRead: false }),
      ]),
    );

    store.load();

    expect(store.unreadCount()).toBe(2);
  });

  it('markAsRead() sikeres válasz UTÁN olvasottra állítja a megfelelő elemet', () => {
    configure();
    serviceMock.getNotifications.mockReturnValue(
      of([makeNotification({ userNotificationId: 1, isRead: false }), makeNotification({ userNotificationId: 2, isRead: false })]),
    );
    store.load();

    store.markAsRead(1);

    expect(store.notifications().find((n) => n.userNotificationId === 1)?.isRead).toBe(true);
    expect(store.notifications().find((n) => n.userNotificationId === 2)?.isRead).toBe(false);
    expect(store.unreadCount()).toBe(1);
    expect(serviceMock.markAsRead).toHaveBeenCalledWith(1);
  });

  it('markAllAsRead() minden elemet olvasottra állít', () => {
    configure();
    serviceMock.getNotifications.mockReturnValue(
      of([makeNotification({ userNotificationId: 1, isRead: false }), makeNotification({ userNotificationId: 2, isRead: false })]),
    );
    store.load();

    store.markAllAsRead();

    expect(store.unreadCount()).toBe(0);
  });

  it('delete() eltávolítja az elemet a listából', () => {
    configure();
    serviceMock.getNotifications.mockReturnValue(
      of([makeNotification({ userNotificationId: 1 }), makeNotification({ userNotificationId: 2 })]),
    );
    store.load();

    store.delete(1);

    expect(store.notifications().map((n) => n.userNotificationId)).toEqual([2]);
    expect(serviceMock.deleteNotification).toHaveBeenCalledWith(1);
  });

  // UI-TT-97: korábban IGAZI, visszaállítás nélküli optimista frissítést végzett -
  // a lista MÉG A HÁLÓZATI HÍVÁS ELINDÍTÁSA ELŐTT módosult, hiba esetén sosem állt
  // vissza. Egy ténylegesen sikertelen művelet a tanár számára megkülönböztethetetlen
  // volt egy valódi sikeres művelettől.
  it('markAsRead() hiba esetén NEM módosítja a listát, és beállítja az error()-t', () => {
    configure();
    serviceMock.getNotifications.mockReturnValue(
      of([makeNotification({ userNotificationId: 1, isRead: false })]),
    );
    store.load();
    serviceMock.markAsRead.mockReturnValue(throwError(() => ({ error: { errorMessage: 'Megjelölés sikertelen.' } })));

    store.markAsRead(1);

    expect(store.notifications().find((n) => n.userNotificationId === 1)?.isRead).toBe(false);
    expect(store.error()).toBe('Megjelölés sikertelen.');
  });

  it('markAllAsRead() hiba esetén NEM módosítja a listát, és beállítja az error()-t', () => {
    configure();
    serviceMock.getNotifications.mockReturnValue(
      of([makeNotification({ userNotificationId: 1, isRead: false })]),
    );
    store.load();
    serviceMock.markAllAsRead.mockReturnValue(throwError(() => ({ error: { errorMessage: 'Megjelölés sikertelen.' } })));

    store.markAllAsRead();

    expect(store.notifications().find((n) => n.userNotificationId === 1)?.isRead).toBe(false);
    expect(store.error()).toBe('Megjelölés sikertelen.');
  });

  it('delete() hiba esetén NEM távolítja el az elemet a listából, és beállítja az error()-t', () => {
    configure();
    serviceMock.getNotifications.mockReturnValue(
      of([makeNotification({ userNotificationId: 1 })]),
    );
    store.load();
    serviceMock.deleteNotification.mockReturnValue(throwError(() => ({ error: { errorMessage: 'Törlés sikertelen.' } })));

    store.delete(1);

    expect(store.notifications().map((n) => n.userNotificationId)).toEqual([1]);
    expect(store.error()).toBe('Törlés sikertelen.');
  });

  // UI-TT-96: a diák-fe UI-TS-69 fixe óta kiszűri a lejárt (expiryDate < ma)
  // sorokat a jelvényből ÉS a listából - ez a store nulláról íródva nem vette
  // át ezt a szűrést, pedig a backend sosem szűri ki a lejárt sorokat.
  it('unreadCount NEM számítja bele a lejárt (expiryDate < ma) olvasatlan értesítéseket', () => {
    configure();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    serviceMock.getNotifications.mockReturnValue(
      of([
        makeNotification({ userNotificationId: 1, isRead: false, expiryDate: yesterday }),
        makeNotification({ userNotificationId: 2, isRead: false, expiryDate: nextWeek }),
        makeNotification({ userNotificationId: 3, isRead: false }),
      ]),
    );

    store.load();

    expect(store.unreadCount()).toBe(2);
  });

  it('activeNotifications kiszűri a lejárt sorokat, de az olvasottakat/érvényeseket megtartja', () => {
    configure();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    serviceMock.getNotifications.mockReturnValue(
      of([
        makeNotification({ userNotificationId: 1, expiryDate: yesterday }),
        makeNotification({ userNotificationId: 2 }),
      ]),
    );

    store.load();

    expect(store.activeNotifications().map((n) => n.userNotificationId)).toEqual([2]);
  });
});
