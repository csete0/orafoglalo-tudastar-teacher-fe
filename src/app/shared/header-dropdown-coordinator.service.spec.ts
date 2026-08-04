import { TestBed } from '@angular/core/testing';
import { HeaderDropdownCoordinatorService } from './header-dropdown-coordinator.service';

describe('HeaderDropdownCoordinatorService', () => {
  let service: HeaderDropdownCoordinatorService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HeaderDropdownCoordinatorService);
  });

  it('kezdeti állapotban nincs nyitott dropdown', () => {
    expect(service.openDropdown()).toBeNull();
  });

  it('open("menu") a "menu"-t állítja nyitottá', () => {
    service.open('menu');
    expect(service.openDropdown()).toBe('menu');
  });

  // UI-TT-100/101: a hamburger-menü és az értesítés-harang korábban egymástól
  // teljesen független, kölcsönös kizárás nélküli szignálokat használt - a
  // koordinátornak MINDIG csak EGY felületet szabad nyitva tartania.
  it('open("bell") majd open("menu") esetén csak a "menu" számít nyitottnak (kölcsönös kizárás)', () => {
    service.open('bell');
    expect(service.openDropdown()).toBe('bell');

    service.open('menu');
    expect(service.openDropdown()).toBe('menu');
  });

  it('close(which) csak akkor nullázza az állapotot, ha ÉPPEN az a felület számít nyitottnak', () => {
    service.open('menu');
    service.close('menu');
    expect(service.openDropdown()).toBeNull();
  });

  // Ez a `close()` doksi-kommentjében leírt, kifejezetten szándékos védelem:
  // ha a "bell" időközben megnyílt, egy elavult "menu bezárult" jelzés nem
  // írhatja felül (nullázhatja) a MÁR megnyílt "bell" állapotát.
  it('elavult close("menu") NEM zárja be a közben megnyílt "bell"-t', () => {
    service.open('menu');
    service.open('bell'); // a "bell" megnyílása implicit módon "bezárja" a menu-t

    service.close('menu'); // elavult jelzés a menu-től

    expect(service.openDropdown()).toBe('bell');
  });

  it('close(which), amikor már semmi sincs nyitva, no-op marad', () => {
    service.close('menu');
    expect(service.openDropdown()).toBeNull();
  });

  // UI-TT-164: a UI-TT-162 fix (bellCloseCallbacks) KIZÁRÓLAG akkor sül el, ha
  // egy MÁSIK bell-példány ténylegesen meghívja a saját open()-jét - egy puszta
  // viewport-váltás (kattintás NÉLKÜL), ami a CSS-sel elrejtett, korábban nyitva
  // hagyott példányt egyszerűen újra láthatóvá teszi, ezt sosem triggerelte. A
  // konstruktorban regisztrált `matchMedia('(min-width: 768px)')` change-listener
  // most MINDEN breakpoint-átlépéskor bezárja az ÖSSZES regisztrált bell-példányt,
  // függetlenül attól, hívott-e bárki `open()`-t közben.
  it('UI-TT-164: breakpoint-átlépéskor bezárja az ÖSSZES regisztrált bell-példányt, kattintás nélkül is', () => {
    let changeHandler: (() => void) | undefined;
    const mqlMock = {
      matches: false,
      addEventListener: (event: string, handler: () => void) => {
        if (event === 'change') changeHandler = handler;
      },
      removeEventListener: () => {},
    };
    // jsdom-ban a `window.matchMedia` alapból nem is létezik (nem csak eltérő
    // viselkedésű) - `vi.spyOn` csak MEGLÉVŐ függvényt tudna kicserélni, ezért
    // közvetlen hozzárendeléssel definiáljuk, majd a teszt végén állítjuk vissza.
    const original = window.matchMedia;
    window.matchMedia = (() => mqlMock as unknown as MediaQueryList) as typeof window.matchMedia;

    // Friss szolgáltatás-példány, hogy a konstruktor a mockolt matchMedia-t lássa
    // (a fenti `beforeEach`-ben injektált `service` már a mock ELŐTT példányosult).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(HeaderDropdownCoordinatorService);

    expect(changeHandler).toBeDefined();

    const closeBellA = vi.fn();
    const closeBellB = vi.fn();
    freshService.registerBell('desktop-instance', closeBellA);
    freshService.registerBell('mobile-instance', closeBellB);

    // Sem az egyik, sem a másik nem hívott open()-t - pusztán a breakpoint lép át.
    changeHandler!();

    expect(closeBellA).toHaveBeenCalledTimes(1);
    expect(closeBellB).toHaveBeenCalledTimes(1);

    window.matchMedia = original;
  });
});
