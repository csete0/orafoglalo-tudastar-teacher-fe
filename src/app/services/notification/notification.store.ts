import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { Notification } from '../../models/notification.model';
import { NotificationService } from './notification.service';

function extractErrorMessage(err: any, fallback: string): string {
  const body = err?.error;
  if (typeof body?.errorMessage === 'string' && body.errorMessage.trim()) {
    return body.errorMessage;
  }
  return fallback;
}

/**
 * UI-TT-82: a teacher-fe-nek eddig egyáltalán nem volt értesítés-felülete,
 * pedig a backend több tanár-célzott értesítést is generál (intézmény-
 * törlés, jelentkezés elbírálás, tanári fiók fel-/felfüggesztés, feladatsor
 * levétel admin által) - egyik sem jutott el a tanárhoz, ha kizárólag a
 * teacher-fe-t használta. A diák-fe NotificationStore-ját tükrözi, csak a
 * teacher-fe DestroyRef/takeUntilDestroyed konvencióját követve.
 */
@Injectable({ providedIn: 'root' })
export class NotificationStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(NotificationService);

  private readonly _notifications = signal<Notification[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly notifications = computed(() => this._notifications());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  // UI-TT-96: a diák-fe UI-TS-69 fixe óta már kiszűri a lejárt (expiryDate <
  // ma) sorokat a jelvényből ÉS a listából egyaránt - ez a store nulláról
  // íródott és nem vette át ezt a szűrést, pedig a backend (NotificationRepository.
  // GetNotificationsByUser) ugyanúgy sosem szűri ki a lejárt sorokat. Enélkül
  // egy lejárt, olvasatlan sor (pl. egy 30 napos lejáratú badge-értesítés)
  // örökre felduzzasztaná a jelvényt és a listában is örökre megmaradna.
  readonly activeNotifications = computed(() => {
    const now = new Date();
    return this._notifications().filter(
      (n) => !n.expiryDate || new Date(n.expiryDate) >= now,
    );
  });

  readonly unreadActiveNotifications = computed(() =>
    this.activeNotifications().filter((n) => !n.isRead),
  );

  readonly unreadCount = computed(() => this.unreadActiveNotifications().length);

  load(): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .getNotifications()
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (notifications) => this._notifications.set(notifications ?? []),
        error: (err) => this._error.set(extractErrorMessage(err, 'Az értesítések betöltése sikertelen.')),
      });
  }

  markAsRead(userNotificationId: number): void {
    // UI-TT-97: a fájl-fejléc tévesen azt állította, hogy ez a diák-fe
    // store-ját tükrözi - a diák-fe VALÓJÁBAN kizárólag a sikeres `next`
    // ágban módosítja a helyi listát, hiba esetén az érintetlen marad. Ez a
    // store korábban IGAZI, visszaállítás nélküli optimista frissítést
    // végzett: a listát MÉG A HÁLÓZATI HÍVÁS ELINDÍTÁSA ELŐTT módosította, és
    // hiba esetén sosem állította vissza - egy ténylegesen sikertelen
    // megjelölés a tanár számára megkülönböztethetetlen volt egy valódi
    // sikeres művelettől. A mutáció mostantól csak a sikeres válasz UTÁN fut.
    this.service
      .markAsRead(userNotificationId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this._notifications.update((list) =>
            list.map((n) =>
              n.userNotificationId === userNotificationId
                ? { ...n, isRead: true, readAt: new Date() }
                : n,
            ),
          ),
        error: (err) => this._error.set(extractErrorMessage(err, 'Az értesítés megjelölése sikertelen.')),
      });
  }

  markAllAsRead(): void {
    this.service
      .markAllAsRead()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this._notifications.update((list) =>
            list.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: new Date() })),
          ),
        error: (err) => this._error.set(extractErrorMessage(err, 'Az értesítések megjelölése sikertelen.')),
      });
  }

  delete(userNotificationId: number): void {
    this.service
      .deleteNotification(userNotificationId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () =>
          this._notifications.update((list) =>
            list.filter((n) => n.userNotificationId !== userNotificationId),
          ),
        error: (err) => this._error.set(extractErrorMessage(err, 'Az értesítés törlése sikertelen.')),
      });
  }

  clearError(): void {
    this._error.set(null);
  }
}
