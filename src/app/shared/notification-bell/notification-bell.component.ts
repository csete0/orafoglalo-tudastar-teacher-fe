import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IconComponent, IconName } from '../icon/icon.component';
import { NotificationStore } from '../../services/notification/notification.store';
import { Notification } from '../../models/notification.model';

const ICON_TYPE_MAP: Record<number, IconName> = {
  1: 'inbox', // Info
  2: 'academic-cap', // Badge
  3: 'chart', // Streak
  4: 'warning-triangle', // Warning
  5: 'check', // Success
};

/**
 * UI-TT-82: harang-ikon + lenyíló lista - a teacher-fe eddig egyáltalán nem
 * jelenítette meg a backend által a tanárnak generált értesítéseket (pl.
 * intézmény-törlés, jelentkezés elbírálás, feladatsor levétel admin által).
 * Egyszer mountolva az AppComponent fejlécében, mindig látható amíg a
 * felhasználó be van jelentkezve (nem a mobil hamburger-panel része, hogy a
 * két lenyíló ne zavarja egymást).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-notification-bell',
  standalone: true,
  imports: [IconComponent],
  template: `
    <div class="relative">
      <button (click)="toggle()" aria-label="Értesítések" title="Értesítések"
              class="btn btn-ghost !px-2 relative">
        <app-icon name="bell" class="w-5 h-5 block" />
        @if (store.unreadCount() > 0) {
          <span data-testid="notification-unread-badge"
                class="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full
                       bg-danger text-white text-[0.65rem] leading-[1.1rem] font-bold text-center">
            {{ store.unreadCount() > 9 ? '9+' : store.unreadCount() }}
          </span>
        }
      </button>

      @if (open()) {
        <!-- Teljes képernyős, láthatatlan backdrop a kívülre-kattintásos záráshoz. -->
        <div class="fixed inset-0 z-40" (click)="open.set(false)"></div>

        <div data-testid="notification-panel"
             class="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto
                    rounded-xl border border-border-default bg-bg-panel shadow-lg z-50">
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-border-default">
            <span class="text-sm font-semibold">Értesítések</span>
            @if (store.unreadCount() > 0) {
              <button (click)="store.markAllAsRead()"
                      class="text-xs text-primary hover:underline">
                Összes megjelölése olvasottként
              </button>
            }
          </div>

          @if (store.error()) {
            <div class="flex items-start justify-between gap-2 px-4 py-2 text-xs text-danger bg-danger-subtle">
              <span>{{ store.error() }}</span>
              <button (click)="store.clearError()" aria-label="Hibaüzenet bezárása" class="shrink-0 hover:opacity-70">
                <app-icon name="x" class="w-3 h-3 block" />
              </button>
            </div>
          }

          @if (store.loading() && store.notifications().length === 0) {
            <p class="px-4 py-6 text-sm text-text-muted text-center">Betöltés...</p>
          } @else if (visibleNotifications().length === 0) {
            <p class="px-4 py-6 text-sm text-text-muted text-center">Nincs értesítésed.</p>
          } @else {
            <ul>
              @for (n of visibleNotifications(); track n.userNotificationId) {
                <li class="border-b border-border-subtle last:border-b-0">
                  <div (click)="onItemClick(n)"
                       class="flex items-start gap-2.5 px-4 py-3 cursor-pointer transition-colors hover:bg-bg-elevated"
                       [class.bg-primary-subtle]="!n.isRead">
                    <div class="icon-tile w-8 h-8 shrink-0 text-primary bg-primary-subtle">
                      <app-icon [name]="iconFor(n)" class="w-4 h-4 block" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium truncate">{{ n.title }}</p>
                      <p class="text-xs text-text-muted line-clamp-2">{{ n.content }}</p>
                      <p class="text-[0.7rem] text-text-muted mt-0.5">{{ timeAgo(n.createdAt) }}</p>
                    </div>
                    <button (click)="onDeleteClick($event, n.userNotificationId)"
                            aria-label="Törlés"
                            class="text-text-muted hover:text-danger transition-colors shrink-0">
                      <app-icon name="x" class="w-3.5 h-3.5 block" />
                    </button>
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
})
export class NotificationBellComponent implements OnInit {
  private readonly router = inject(Router);
  readonly store = inject(NotificationStore);

  readonly open = signal(false);

  // Törölt (delete()) elemek a store-ból azonnal kikerülnek, nincs "isDeleted"
  // szűrés itt szükséges - a diák-fe-vel ellentétben (ahol soft-delete a
  // listában marad megjelölve) ez a lista mindig csak az aktuálisan
  // létező, még nem törölt sorokat mutatja.
  // UI-TT-96: a store.activeNotifications() már kiszűri a lejárt (expiryDate
  // < ma) sorokat is - ugyanaz a lista, amiből a jelvény-szám (unreadCount)
  // is számol, hogy a kettő strukturálisan ne tudjon szétcsúszni.
  readonly visibleNotifications = computed<Notification[]>(() => this.store.activeNotifications());

  ngOnInit(): void {
    this.store.load();
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  iconFor(n: Notification): IconName {
    return (n.iconTypeId && ICON_TYPE_MAP[n.iconTypeId]) || 'bell';
  }

  onItemClick(n: Notification): void {
    if (!n.isRead) {
      this.store.markAsRead(n.userNotificationId);
    }
    this.open.set(false);
    if (n.actionUrl) {
      this.router.navigateByUrl(n.actionUrl);
    }
  }

  onDeleteClick(event: Event, userNotificationId: number): void {
    event.stopPropagation();
    this.store.delete(userNotificationId);
  }

  timeAgo(date?: Date): string {
    if (!date) return '';
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'most';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} perce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} órája`;
    const days = Math.floor(hours / 24);
    return `${days} napja`;
  }
}
