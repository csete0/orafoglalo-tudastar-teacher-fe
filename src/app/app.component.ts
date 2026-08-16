import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
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
    <header (document:click)="onDocumentClick($event)"
      class="sticky top-0 z-30 relative border-b border-border-default bg-bg-panel shadow-sm">
      <!-- UI-TT-181: flex-wrap hozzáadva - a korábbi, tördelés nélküli flex sor
           a viewport-alapú (media-query) mobil-hamburger töréspont ALATT (pl.
           1280px asztali szélességnél) is túlcsordult, ha a tartalom szöveg-
           alapon (root font-size, pl. Chrome "Nagy" betűméret akadálymentességi
           beállítása) nőtt - a header saját, width:auto háttér-doboza NEM nőtt
           a túlcsorduló, overflow-visible gyerek-tartalommal együtt, így a jobb
           oldali blokk (harang/admin-jelvény/névkártya/kilépés) a puszta
           oldalháttéren "lebegve" jelent meg. flex-wrap-pel a túlcsorduló elemek
           egy második sorra törnek UGYANAZON a dobozon belül, aminek a magassága
           (és így a háttere/alsó szegélye) automatikusan követi a tördelt
           tartalmat - nincs több "lebegő" elem a fejléc dobozán kívül. -->
      <div class="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <a routerLink="/dashboard" aria-label="PaTricks Tanári Felület"
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-sm shrink-0">
          <img src="assets/patricks/patricks_logo.png" alt="" class="w-6 h-6 object-contain" />
        </a>

        @if (authStore.isAuthenticated()) {
          <!-- Desktop nav. UI-TT-177: a "hidden md:flex"/"md:hidden" töréspont-pár
               768px-nél fix - ez elég a 3 tanári linkhez, de a hasAdminRole() melletti
               6 linkes nav+jobb blokk élőben teljes oldal-szintű vízszintes túlcsordulást
               okozott 768px és kb. 1115px között (élőben megerősítve 1200px-nél már
               tiszta). Adminnál a törésponot-pár min-[1200px]-re emeljük - eddig
               a MÁR MEGLÉVŐ, teljes funkcionalitású mobil hamburger-panel jelenik meg
               helyette (ugyanazokkal a linkekkel/haranggal/kijelentkezéssel), tehát
               ez nem új fallback, csak a meglévő kettő közötti váltásküszöb admin
               esetén szélesebbre húzva. -->
          <nav [class]="authStore.hasAdminRole() ? 'hidden min-[1200px]:flex flex-wrap items-center gap-1 text-sm' : 'hidden md:flex flex-wrap items-center gap-1 text-sm'">
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
          <div [class]="authStore.hasAdminRole() ? 'hidden min-[1200px]:flex items-center gap-2 shrink-0' : 'hidden md:flex items-center gap-2 shrink-0'">
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
          <div [class]="authStore.hasAdminRole() ? 'min-[1200px]:hidden flex items-center gap-1' : 'md:hidden flex items-center gap-1'">
            <app-notification-bell />
            <button #menuBtn (click)="menuOpen.set(!menuOpen())" aria-label="Menü"
              class="btn btn-ghost !px-2">
              <app-icon [name]="menuOpen() ? 'x' : 'menu'" class="w-6 h-6 block" />
            </button>
          </div>
        }
      </div>

      <!-- Mobil lenyíló panel (div, NEM nav — a spec querySelector('nav')-jai
           a desktop navigációt célozzák egyértelműen) -->
      @if (authStore.isAuthenticated() && menuOpen()) {
        <!-- UI-TT-189: a testvér NotificationBellComponent dropdownjához (UI-TT-100/101)
             hasonló bezáró mechanizmus - a panelnek korábban NEM volt sem Escape-,
             sem panelen-kívüli-kattintás-alapú bezárása, kizárólag a hamburger-gomb
             ismételt megnyomásával/navigációval lehetett bezárni. A globális
             document:keydown.escape binding (nem a panel elemére kötve) azért kell,
             mert a panel mobil nézeten nincs fókusz-kezelve (nincs tabindex/autofókusz,
             szemben a Confirm/harang dialógusokkal) - a bezárásnak a fókusz állapotától
             függetlenül kell működnie. A fixed inset-0 backdrop a valós böngésző-
             kattintás hit-testeléséhez kell (a panel alatti tartalom amúgy is le van
             tiltva pointer-events szempontból, ld. ledger); az onDocumentClick() a
             fejlécre kötött, MINDIG regisztrált (nem az at-if-en belüli) listener,
             ami a panel/hamburger-gomb tartalmán KÍVÜLI bármilyen kattintást (a
             backdroptól függetlenül, pl. teszt-környezetben programozottan
             kiváltott document.body-kattintást is) helyesen bezárja. -->
        <div class="fixed inset-0 z-30" (click)="menuOpen.set(false)"></div>
        <div #panel (document:keydown.escape)="menuOpen.set(false)"
          [class]="authStore.hasAdminRole() ? 'min-[1200px]:hidden absolute top-full inset-x-0 bg-bg-panel border-b border-border-default shadow-lg z-40 px-4 py-3 space-y-1' : 'md:hidden absolute top-full inset-x-0 bg-bg-panel border-b border-border-default shadow-lg z-40 px-4 py-3 space-y-1'">
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

  private readonly menuBtn = viewChild<ElementRef<HTMLElement>>('menuBtn');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

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

  // UI-TT-189: a `<header>`-re kötött (document:click) mindig regisztrálva van
  // (nem az @if(menuOpen())-en belül), tehát nincs "ugyanaz a kattintás, ami
  // megnyitja, azonnal be is csukja" időzítési kockázat - a hamburger-gomb
  // saját (click)="menuOpen.set(!menuOpen())" kezelője MINDIG lefut előbb
  // (target-fázis), majd ez a handler a bubble-fázisban fut, de a gomb-
  // konténmentellenőrzés miatt nem írja felül a friss állapotot.
  onDocumentClick(event: MouseEvent): void {
    if (!this.menuOpen()) return;
    const target = event.target as Node;
    if (this.menuBtn()?.nativeElement.contains(target)) return;
    if (this.panel()?.nativeElement.contains(target)) return;
    this.menuOpen.set(false);
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
