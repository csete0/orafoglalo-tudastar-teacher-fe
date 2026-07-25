import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { GroupStore } from './group.store';
import { GroupService } from './group.service';
import { GroupDto } from '../../models/group.model';

function makeGroup(overrides: Partial<GroupDto> = {}): GroupDto {
  return {
    id: 501,
    name: 'Teszt csoport',
    inviteCode: 'ABCD1234',
    isArchived: true,
    isJoinEnabled: true,
    createdAt: new Date().toISOString(),
    memberCount: 3,
    ...overrides,
  };
}

describe('GroupStore', () => {
  let serviceMock: {
    getMine: ReturnType<typeof vi.fn>;
    unarchive: ReturnType<typeof vi.fn>;
  };
  let store: GroupStore;

  function configure() {
    serviceMock = {
      getMine: vi.fn(),
      unarchive: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: GroupService, useValue: serviceMock }],
    });

    store = TestBed.inject(GroupStore);
  }

  beforeEach(() => configure());

  // UI-TT-119: a `unarchive()` (UI-TT-34 óta létező, a csoport-archiválást
  // visszavonó út) a testvér `archive()`-tól eltérően a
  // `csoport-reszletek.component.ts`-ben SEMMILYEN `confirmService.ask()`-ot
  // nem kap (l. "Visszaállítás" gomb, csoport-reszletek.component.ts:38 —
  // csupasz `(click)="unarchive(group.id)"`, se megerősítés, se
  // `[disabled]="store.loading()"` binding), ÉS maga a `GroupStore.unarchive()`
  // (a közös `mutate()` helperen át) sem ellenőriz semmilyen "már folyamatban
  // van egy kérés" jelet, mielőtt új HTTP-hívást indítana. A UI-TT-117/118
  // családhoz hasonlóan itt sincs SEMMILYEN védelem (sem szándékos, sem a
  // confirm-dialógus melléktermékeként megjelenő véletlen védelem) egy
  // szinkron dupla-kattintás ellen — két egymást követő hívás, mielőtt az
  // első válasza megérkezne, két KÜLÖN valódi POST /api/groups/{id}/unarchive
  // kérést indít.
  it('BUG UI-TT-119: unarchive()-nál egy átfedő második hívás (dupla-kattintás) MÁSODIK valódi HTTP-kérést indít, mert nincs "loading" guard', () => {
    serviceMock.getMine.mockReturnValue(of([makeGroup()]));
    const unarchiveSubject = new Subject<unknown>();
    serviceMock.unarchive.mockReturnValue(unarchiveSubject.asObservable());

    store.loadMine();

    // Első kattintás a "Visszaállítás" gombon.
    store.unarchive(501);
    expect(serviceMock.unarchive).toHaveBeenCalledTimes(1);

    // Dupla-kattintás, amíg az első kérés még folyamatban van (nincs válasz) -
    // ugyanabban a JS-tickben, await nélkül, ahogy egy valódi gyors
    // egérdupla-kattintás is lefutna.
    store.unarchive(501);

    // A helyes viselkedés az lenne, hogy a második, átfedő hívás NEM indít
    // újabb kérést, amíg az első válasza meg nem érkezik - ez itt MEGBUKIK,
    // mert nincs ilyen guard.
    expect(serviceMock.unarchive).toHaveBeenCalledTimes(1);

    unarchiveSubject.next({});
    unarchiveSubject.complete();
  });
});
