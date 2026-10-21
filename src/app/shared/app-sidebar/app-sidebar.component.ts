import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { NgTemplateOutlet } from '@angular/common';
import { filter } from 'rxjs/operators';
import { AuthStore } from '../../services/auth/store/auth.store';
import { MockExamService } from '../../services/mock-exam/mock-exam.service';
import { HeaderDropdownCoordinatorService } from '../header-dropdown-coordinator.service';
import { IconComponent, IconName } from '../icon/icon.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';

export interface NavLink {
  path: string;
  label: string;
  icon: IconName;
}

const MOCK_EXAM_LINK: NavLink = { path: '/probaerettsegi', label: 'Próbaérettségi', icon: 'academic-cap' };

/** Menüpontok a makett sorrendjében; a Próbaérettségi csak közzétett eseménynél kerül az Intézményeim elé. */
const TEACHER_LINKS: NavLink[] = [
  { path: '/dashboard', label: 'Vezérlőpult', icon: 'chart' },
  { path: '/csoportok', label: 'Csoportok', icon: 'users' },
  { path: '/feladatsorok', label: 'Feladatsorok', icon: 'clipboard-list' },
  { path: '/feladatsorok/kvizek', label: 'Kvízek és élő játék', icon: 'trophy' },
  { path: '/feladatsorok/projektek', label: 'Projektek', icon: 'code' },
  { path: '/intezmenyek', label: 'Intézményeim', icon: 'building' },
];

export const SIDEBAR_COLLAPSED_KEY = 'teacher.sidebarCollapsed';

/** A leghosszabb, szegmenshatáron illeszkedő menüpont az aktív (pl. `/feladatsorok/kvizek/5/szerkesztes` → Kvízek). */
export function activeLinkPath(url: string, links: readonly NavLink[]): string | null {
  const path = url.split(/[?#]/)[0];
  let best: string | null = null;
  for (const { path: p } of links) {
    if ((path === p || path.startsWith(p + '/')) && p.length > (best?.length ?? 0)) best = p;
  }
  return best;
}

function isWideRoute(root: ActivatedRouteSnapshot): boolean {
  let route: ActivatedRouteSnapshot | null = root;
  while (route?.firstChild) route = route.firstChild;
  return route?.data['wide'] === true;
}

function readCollapsed(): boolean | null {
  try {
    const value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return value === null ? null : value === 'true';
  } catch {
    return null;
  }
}

/**
 * Az alkalmazás-keret navigációja: `lg` felett bal oldali, sticky oldalsáv (15rem ↔ 4rem ikonsáv),
 * alatta vékony felső sáv (logó, harang, hamburger) + bal oldali drawer. A host `display: contents`,
 * hogy a sticky elemek az app-keret flex-elrendezésében, ne a host dobozában ragadjanak.
 *
 * A drawer zárása: Escape, kívül-kattintás, bármilyen `NavigationEnd` (UI-TT-78/189), és a
 * harang-dropdownnal kölcsönösen kizárják egymást a `HeaderDropdownCoordinatorService`-en át (UI-TT-101).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet, IconComponent, NotificationBellComponent],
  host: {
    class: 'contents',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
  template: `
    <ng-template #navList let-compact>
      <ul class="space-y-1">
        @for (link of links(); track link.path) {
          <li>
            <a [routerLink]="link.path" [attr.aria-current]="activePath() === link.path ? 'page' : null"
              [attr.title]="compact ? link.label : null"
              class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary"
              [class.justify-center]="compact"
              [class]="activePath() === link.path
                ? 'text-primary font-semibold bg-primary-subtle'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-element'">
              <app-icon [name]="link.icon" class="w-5 h-5 block shrink-0" />
              <span [class]="compact ? 'sr-only' : 'truncate'">{{ link.label }}</span>
            </a>
          </li>
        }
      </ul>
    </ng-template>

    <!-- Asztali oldalsáv (lg+) -->
    <aside data-testid="app-sidebar"
      class="hidden lg:flex sticky top-0 z-30 h-screen shrink-0 flex-col border-r border-border-default bg-bg-panel transition-[width] print:hidden"
      [class]="collapsed() ? 'w-16' : 'w-60'">
      <div class="flex items-center gap-2 px-3 py-3" [class.flex-col]="collapsed()">
        <a routerLink="/dashboard" aria-label="PaTricks Tanári Felület"
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-sm shrink-0">
          <img src="assets/patricks/patricks_logo.png" alt="" class="w-6 h-6 object-contain" />
        </a>
        @if (!collapsed()) {
          <span class="font-black text-sm leading-tight flex-1 min-w-0 truncate">PaTricks<br />
            <span class="font-medium text-text-muted">Tanári felület</span></span>
        }
        <button type="button" data-testid="sidebar-toggle" (click)="toggleCollapsed()"
          [attr.aria-expanded]="!collapsed()" [attr.aria-label]="collapsed() ? 'Menü kinyitása' : 'Menü összecsukása'"
          [attr.title]="collapsed() ? 'Menü kinyitása' : 'Menü összecsukása'"
          class="btn btn-ghost !px-2 shrink-0">
          <app-icon name="chevron-down" class="w-5 h-5 block" [class]="collapsed() ? '-rotate-90' : 'rotate-90'" />
        </button>
      </div>

      <nav aria-label="Fő navigáció" class="flex-1 min-h-0 overflow-y-auto px-2 py-2">
        <ng-container [ngTemplateOutlet]="navList" [ngTemplateOutletContext]="{ $implicit: collapsed() }" />
      </nav>

      <div class="border-t border-border-default px-2 py-3 flex items-center gap-1" [class.flex-col]="collapsed()">
        <app-notification-bell placement="side" />
        <div class="flex items-center gap-2 min-w-0 flex-1 px-1" [title]="userEmail()" [class.justify-center]="collapsed()">
          <div class="w-8 h-8 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center shrink-0"
            data-testid="profile-monogram">{{ monogram() }}</div>
          <span [class]="collapsed() ? 'sr-only' : 'text-sm truncate'">{{ userName() }}</span>
        </div>
        <button type="button" (click)="logout()" aria-label="Kilépés" title="Kilépés"
          class="btn btn-ghost !px-2 hover:!text-danger shrink-0">
          <app-icon name="logout" class="w-5 h-5 block" />
        </button>
      </div>
    </aside>

    <!-- Mobil felső sáv (< lg) -->
    <header data-testid="mobile-topbar"
      class="lg:hidden sticky top-0 z-30 h-14 flex items-center justify-between gap-2 px-4 border-b border-border-default bg-bg-panel shadow-sm print:hidden">
      <a routerLink="/dashboard" aria-label="PaTricks Tanári Felület"
        class="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-sm shrink-0">
        <img src="assets/patricks/patricks_logo.png" alt="" class="w-5 h-5 object-contain" />
      </a>
      <div class="flex items-center gap-1">
        <app-notification-bell />
        <button #menuBtn type="button" (click)="menuOpen.set(!menuOpen())" aria-label="Menü"
          aria-controls="mobile-drawer" [attr.aria-expanded]="menuOpen()"
          class="btn btn-ghost !px-2">
          <app-icon [name]="menuOpen() ? 'x' : 'menu'" class="w-6 h-6 block" />
        </button>
      </div>
    </header>

    @if (menuOpen()) {
      <div class="lg:hidden fixed inset-0 z-40 bg-black/40 print:hidden" (click)="menuOpen.set(false)"></div>
      <div #panel id="mobile-drawer" data-testid="mobile-drawer"
        class="lg:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] flex flex-col bg-bg-panel border-r border-border-default shadow-lg print:hidden">
        <nav aria-label="Fő navigáció (mobil)" class="flex-1 min-h-0 overflow-y-auto px-2 py-3">
          <ng-container [ngTemplateOutlet]="navList" [ngTemplateOutletContext]="{ $implicit: false }" />
        </nav>
        <div class="border-t border-border-default flex items-center justify-between px-3 py-3">
          <div class="flex items-center gap-2 min-w-0" [title]="userEmail()">
            <div class="w-8 h-8 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center shrink-0">
              {{ monogram() }}</div>
            <span class="text-sm truncate">{{ userName() }}</span>
          </div>
          <button type="button" (click)="logout()" aria-label="Kilépés"
            class="btn btn-ghost !px-2 hover:!text-danger shrink-0">
            <app-icon name="logout" class="w-5 h-5 block" />
          </button>
        </div>
      </div>
    }
  `,
})
export class AppSidebarComponent {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dropdownCoordinator = inject(HeaderDropdownCoordinatorService);
  private readonly mockExams = inject(MockExamService);
  readonly authStore = inject(AuthStore);

  /** Van közzétett próbaérettségi - csak akkor kap menüpontot. */
  private readonly mockExamActive = signal(false);
  readonly links = computed<NavLink[]>(() => {
    if (!this.authStore.hasTeacherRole()) return [];
    if (!this.mockExamActive()) return TEACHER_LINKS;
    return [...TEACHER_LINKS.slice(0, -1), MOCK_EXAM_LINK, TEACHER_LINKS[TEACHER_LINKS.length - 1]];
  });

  private readonly url = signal(this.router.url);
  readonly activePath = computed(() => activeLinkPath(this.url(), this.links()));

  /** Adatoldalon (`route.data.wide`) alapból összecsukva; a kézi választás (localStorage) felülírja. */
  private readonly wideRoute = signal(isWideRoute(this.router.routerState.snapshot.root));
  private readonly userCollapsed = signal<boolean | null>(readCollapsed());
  readonly collapsed = computed(() => this.userCollapsed() ?? this.wideRoute());

  readonly menuOpen = signal(false);
  private readonly menuBtn = viewChild<ElementRef<HTMLElement>>('menuBtn');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

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

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
        this.url.set(this.router.url);
        this.wideRoute.set(isWideRoute(this.router.routerState.snapshot.root));
      });

    // Próbaérettségi-menüpont: tanárnál egyszer lekérjük, van-e közzétett esemény (hiba = nincs menüpont).
    effect(() => {
      if (!this.authStore.hasTeacherRole() || this.mockExamActive()) return;
      this.mockExams.getCurrent().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (current) => this.mockExamActive.set(current != null),
        error: () => this.mockExamActive.set(false),
      });
    });

    effect(() => {
      if (this.menuOpen()) this.dropdownCoordinator.open('menu');
      else this.dropdownCoordinator.close('menu');
    });

    effect(() => {
      if (this.dropdownCoordinator.openDropdown() === 'bell') this.menuOpen.set(false);
    });
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.userCollapsed.set(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    } catch {
      // Privát mód / tiltott tároló: a választás csak erre a munkamenetre él.
    }
  }

  /** A hamburger saját (click)-je fut előbb; a gombra és a drawerre eső kattintás nem zár. */
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    const target = event.target as Node;
    if (this.menuBtn()?.nativeElement.contains(target)) return;
    if (this.panel()?.nativeElement.contains(target)) return;
    this.menuOpen.set(false);
  }

  logout(): void {
    this.menuOpen.set(false);
    this.authStore.logout(() => this.router.navigateByUrl('/login'));
  }
}
