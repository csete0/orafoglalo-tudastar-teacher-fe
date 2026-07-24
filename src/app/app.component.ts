import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthStore } from './services/auth/store/auth.store';
import { ConfirmDialogComponent } from './shared/confirm/confirm-dialog.component';
import { HeaderDropdownCoordinatorService } from './shared/header-dropdown-coordinator.service';
import { IconComponent, IconName } from './shared/icon/icon.component';
import { NotificationBellComponent } from './shared/notification-bell/notification-bell.component';
import { ToastComponent } from './shared/toast/toast.component';

interface NavLink {
  path: string;
  label: string;
  icon: IconName;
}

const TEACHER_LINKS: NavLink[] = [
  { path: '/intezmenyek', label: 'Intézmények', icon: 'building' },
  { path: '/csoportok', label: 'Csoportok', icon: 'users' },
  { path: '/feladatsorok', label: 'Feladatsorok', icon: 'clipboard-list' },
];

const ADMIN_LINKS: NavLink[] = [
  { path: '/admin/jelentkezesek', label: 'Jelentkezések', icon: 'inbox' },
  { path: '/admin/tanarok', label: 'Tanárok', icon: 'academic-cap' },
  { path: '/admin/intezmenyek', label: 'Intézmények (admin)', icon: 'shield' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    NotificationBellComponent,
    ToastComponent,
    ConfirmDialogComponent,
  ],
  template: `
    <header class="sticky top-0 z-30 relative border-b border-border-default bg-bg-panel shadow-sm">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <a routerLink="/dashboard" aria-label="PaTricks Tanári Felület"
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-sm shrink-0">
          <img src="assets/patricks/patricks_logo.png" alt="" class="w-6 h-6 object-contain" />
        </a>

        @if (authStore.isAuthenticated()) {
          <!-- Desktop nav -->
          <nav class="hidden md:flex items-center gap-1 text-sm">
            @if (authStore.hasTeacherRole()) {
              @for (link of teacherLinks; track link.path) {
                <a [routerLink]="link.path" routerLinkActive="text-primary font-semibold bg-primary-subtle"
                  class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-text-muted hover:text-text-primary transition-colors">
                  <app-icon [name]="link.icon" class="w-4 h-4 block" />
                  {{ link.label }}
                </a>
              }
            }
            @if (authStore.hasAdminRole()) {
              <div class="h-4 w-px bg-border-default mx-1"></div>
              @for (link of adminLinks; track link.path) {
                <a [routerLink]="link.path" routerLinkActive="text-primary font-semibold bg-primary-subtle"
                  class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-text-muted hover:text-text-primary transition-colors">
                  <app-icon [name]="link.icon" class="w-4 h-4 block" />
                  {{ link.label }}
                </a>
              }
            }
          </nav>

          <!-- Profil-chip + kijelentkezés (desktop) -->
          <div class="hidden md:flex items-center gap-2 shrink-0">
            <app-notification-bell />
            <div class="flex items-center gap-2" [title]="userEmail()">
              <div class="w-8 h-8 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center"
                data-testid="profile-monogram">{{ monogram() }}</div>
              <span class="hidden lg:inline text-sm">{{ userName() }}</span>
            </div>
            <button (click)="logout()" aria-label="Kilépés" title="Kilépés"
              class="btn btn-ghost !px-2 hover:!text-danger">
              <app-icon name="logout" class="w-5 h-5 block" />
            </button>
          </div>

          <!-- Harang + hamburger (mobil) -->
          <div class="md:hidden flex items-center gap-1">
            <app-notification-bell />
            <button (click)="menuOpen.set(!menuOpen())" aria-label="Menü"
              class="btn btn-ghost !px-2">
              <app-icon [name]="menuOpen() ? 'x' : 'menu'" class="w-6 h-6 block" />
            </button>
          </div>
        }
      </div>

      <!-- Mobil lenyíló panel (div, NEM nav — a spec querySelector('nav')-jai
           a desktop navigációt célozzák egyértelműen) -->
      @if (authStore.isAuthenticated() && menuOpen()) {
        <div class="md:hidden absolute top-full inset-x-0 bg-bg-panel border-b border-border-default shadow-lg z-40 px-4 py-3 space-y-1">
          @if (authStore.hasTeacherRole()) {
            @for (link of teacherLinks; track link.path) {
              <a [routerLink]="link.path" (click)="menuOpen.set(false)"
                routerLinkActive="text-primary font-semibold bg-primary-subtle"
                class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted">
                <app-icon [name]="link.icon" class="w-4 h-4 block" />
                {{ link.label }}
              </a>
            }
          }
          @if (authStore.hasAdminRole()) {
            <div class="h-px bg-border-default my-2"></div>
            @for (link of adminLinks; track link.path) {
              <a [routerLink]="link.path" (click)="menuOpen.set(false)"
                routerLinkActive="text-primary font-semibold bg-primary-subtle"
                class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted">
                <app-icon [name]="link.icon" class="w-4 h-4 block" />
                {{ link.label }}
              </a>
            }
          }
          <div class="h-px bg-border-default my-2"></div>
          <div class="flex items-center justify-between px-3 py-2">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-8 h-8 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center shrink-0">
                {{ monogram() }}</div>
              <span class="text-sm truncate">{{ userName() }}</span>
            </div>
            <button (click)="logout()" aria-label="Kilépés"
              class="btn btn-ghost !px-2 hover:!text-danger shrink-0">
              <app-icon name="logout" class="w-5 h-5 block" />
            </button>
          </div>
        </div>
      }
    </header>

    <main>
      <router-outlet />
    </main>

    <app-toast />
    <app-confirm-dialog />
  `,
})
export class AppComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dropdownCoordinator = inject(HeaderDropdownCoordinatorService);
  readonly authStore = inject(AuthStore);

  readonly teacherLinks = TEACHER_LINKS;
  readonly adminLinks = ADMIN_LINKS;
  readonly menuOpen = signal(false);

  constructor() {
    // UI-TT-78: a mobil lenyíló panel korábban csak a PANELEN BELÜLI linkekre
    // (és logout()-ra) kattintva záródott be - a fejléc-logóra, a dashboard-
    // kártyák saját linkjeire, VAGY a böngésző Vissza/Előre gombjára (popstate,
    // ami sosem fut le (click) handleren keresztül) navigálva nyitva maradt,
    // átfedve az újonnan betöltött oldal tartalmát. Egy Router.events/
    // NavigationEnd-alapú zárás minden navigációs útvonalat lefed.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.menuOpen.set(false));

    // UI-TT-101: kölcsönös kizárás a harang-dropdownnal - ha a harang megnyílik,
    // ez a menü záródjon be (és fordítva, ld. NotificationBellComponent), hogy
    // a két egymástól független, azonos z-indexű lenyíló sose maradhasson
    // EGYSZERRE nyitva (mobilon a hamburger-panel valós "Kilépés"/nav-linkjei
    // korábban élők/kattinthatók maradtak a harang dropdownja "alatt/mögött").
    effect(() => {
      if (this.menuOpen()) {
        this.dropdownCoordinator.open('menu');
      } else {
        this.dropdownCoordinator.close('menu');
      }
    });

    effect(() => {
      if (this.dropdownCoordinator.openDropdown() === 'bell') {
        this.menuOpen.set(false);
      }
    });
  }

  /** Magyar névsorrend: vezetéknév + keresztnév kezdőbetűje. */
  readonly monogram = computed(() => {
    const user = this.authStore.currentUser();
    if (!user) return '';
    return `${user.lastName?.[0] ?? ''}${user.firstName?.[0] ?? ''}`.toUpperCase();
  });

  readonly userName = computed(() => {
    const user = this.authStore.currentUser();
    if (!user) return '';
    return `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim();
  });

  readonly userEmail = computed(() => this.authStore.currentUser()?.email ?? '');

  logout(): void {
    this.menuOpen.set(false);
    this.authStore.logout(() => this.router.navigateByUrl('/login'));
  }
}
