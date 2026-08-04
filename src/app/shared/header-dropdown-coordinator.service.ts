import { Injectable, computed, signal } from '@angular/core';

export type HeaderDropdown = 'menu' | 'bell';

/**
 * UI-TT-101: a fejléc mobil hamburger-menüje (`AppComponent.menuOpen`) és a
 * `NotificationBellComponent` saját, független `open` szignálja korábban
 * SEMMILYEN kölcsönös kizárást nem ismertek - mindkettő ugyanazt a `z-40`
 * z-indexet használta, így egyszerre nyitva tartva a KÉSŐBB a DOM-fába
 * kerülő hamburger-panel valós, kattintható tartalma (nav-linkek, "Kilépés")
 * a harang dropdownja "alá/mögé" csúszva élő maradt, egy odaszánt koppintás
 * jelzés nélküli kijelentkezést válthatott ki.
 *
 * Ez a szolgáltatás pontosan azt a mintát követi, amivel a `menuOpen` már
 * eddig is záródott `Router`/`NavigationEnd`-re (UI-TT-78): mindkét felület
 * (`AppComponent` és `NotificationBellComponent`) egy `effect()`-tel jelzi
 * ide a saját nyitott/zárt állapotát, és egy másik `effect()`-tel reagál rá,
 * ha a MÁSIK felület nyílt meg - így egyik felület sem veszíti el a saját,
 * tesztek által is közvetlenül állítható `signal`-ját, csak a kettő közti
 * kizárás kerül egy közös helyre.
 */
@Injectable({ providedIn: 'root' })
export class HeaderDropdownCoordinatorService {
  private readonly _openDropdown = signal<HeaderDropdown | null>(null);
  readonly openDropdown = computed(() => this._openDropdown());

  // UI-TT-162: a "bell" KÉT teljesen független fizikai DOM-példányban is
  // mountolva van egyszerre (desktop + mobil header-sáv), csak CSS dönti el,
  // melyik LÁTSZIK - mindkettő él a komponensfában, saját `open` szignállal.
  // Az `openDropdown()==='bell'` reaktív effect-alapú figyelése (ahogy a
  // 'menu' esetnél) ITT nem elég: egy `effect()` csak a FIGYELŐ komponens
  // SAJÁT következő change-detection/flush-ciklusán fut le, ami a MÁSIK
  // (épp nem látható, CSS-sel elrejtett) példánynál tetszőlegesen később
  // következik be - viewport-váltás közben pont ez hagyta nyitva a nem
  // látszó példány panelét "szellem"-állapotban. Ezért a bell-vs-bell
  // kizárás SZINKRON, imperatív callback-regisztráción megy (ugyanaz a
  // "ne effect()-tel" elv, amit a NotificationBellComponent már eddig is
  // követett a saját nyitás-jelzésénél): minden élő bell-példány
  // regisztrálja a saját "kényszerített bezárás" callbackjét, és az `open()`
  // hívás AZONNAL, a jelzéssel egy időben meghívja az ÖSSZES MÁSIK
  // regisztrált példány callbackjét.
  private readonly bellCloseCallbacks = new Map<string, () => void>();

  registerBell(instanceId: string, onForceClose: () => void): void {
    this.bellCloseCallbacks.set(instanceId, onForceClose);
  }

  unregisterBell(instanceId: string): void {
    this.bellCloseCallbacks.delete(instanceId);
  }

  constructor() {
    // UI-TT-164: a fenti `bellCloseCallbacks` mechanizmus (UI-TT-162 fix)
    // KIZÁRÓLAG akkor sül el, ha egy MÁSIK bell-példány ténylegesen meghívja a
    // saját `open()`-jét - egy puszta viewport-váltás (kattintás NÉLKÜL), ami a
    // CSS-sel elrejtett, korábban nyitva hagyott példányt egyszerűen újra
    // láthatóvá teszi, ezt sosem triggereli. Az `app.component.ts` a Tailwind
    // `hidden md:flex`/`md:hidden flex` osztályokkal (768px, az alapértelmezett
    // `md` breakpoint) dönt a desktop/mobil harang-wrapper láthatóságáról -
    // ugyanezt a breakpointot figyelve MINDEN átlépéskor bezárjuk az ÖSSZES
    // regisztrált bell-példányt, függetlenül attól, hívott-e bárki `open()`-t
    // közben. Ez a szolgáltatás `providedIn: 'root'`, egyetlen példánya él az
    // app teljes élettartama alatt - a listenernek nincs explicit leiratkozása,
    // ahogy a többi itteni állapotnak sincs.
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      window.matchMedia('(min-width: 768px)').addEventListener('change', () => {
        for (const onForceClose of this.bellCloseCallbacks.values()) onForceClose();
      });
    }
  }

  open(which: HeaderDropdown, instanceId?: string): void {
    this._openDropdown.set(which);
    if (which === 'bell' && instanceId !== undefined) {
      for (const [id, onForceClose] of this.bellCloseCallbacks) {
        if (id !== instanceId) onForceClose();
      }
    }
  }

  /** Csak akkor nullázza az állapotot, ha még mindig EZ a felület számít
   *  nyitottnak - így egy elavult "bezáródtam" jelzés nem írja felül egy
   *  közben megnyílt MÁSIK felület állapotát. */
  close(which: HeaderDropdown): void {
    if (this._openDropdown() === which) {
      this._openDropdown.set(null);
    }
  }
}
