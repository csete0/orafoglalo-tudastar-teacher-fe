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

  readonly unreadCount = computed(
    () => this._notifications().filter((n) => !n.isRead).length,
  );

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
    // Optimista frissítés: nincs szükség újratöltésre, a válasz nem ad
    // vissza tartalmat (204) - ugyanaz a minta, mint a diák-fe store-jában.
    this._notifications.update((list) =>
      list.map((n) =>
        n.userNotificationId === userNotificationId
          ? { ...n, isRead: true, readAt: new Date() }
          : n,
      ),
    );

    this.service
      .markAsRead(userNotificationId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err) => this._error.set(extractErrorMessage(err, 'Az értesítés megjelölése sikertelen.')),
      });
  }

  markAllAsRead(): void {
    this._notifications.update((list) =>
      list.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt: new Date() })),
    );

    this.service
      .markAllAsRead()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err) => this._error.set(extractErrorMessage(err, 'Az értesítések megjelölése sikertelen.')),
      });
  }

  delete(userNotificationId: number): void {
    this._notifications.update((list) => list.filter((n) => n.userNotificationId !== userNotificationId));

    this.service
      .deleteNotification(userNotificationId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: (err) => this._error.set(extractErrorMessage(err, 'Az értesítés törlése sikertelen.')),
      });
  }

  clearError(): void {
    this._error.set(null);
  }
}
