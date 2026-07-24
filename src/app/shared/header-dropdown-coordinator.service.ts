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

  open(which: HeaderDropdown): void {
    this._openDropdown.set(which);
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
