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
});
