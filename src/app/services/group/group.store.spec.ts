import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { GroupStore } from './group.store';
import { GroupService } from './group.service';
import { GroupDto, GroupMemberDto } from '../../models/group.model';

function makeMember(overrides: Partial<GroupMemberDto> = {}): GroupMemberDto {
  return {
    userId: 1,
    name: 'Teszt Diák',
    email: 'diak@example.com',
    joinedAt: new Date().toISOString(),
    ...overrides,
  };
}

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
    create: ReturnType<typeof vi.fn>;
    getMembers: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
  };
  let store: GroupStore;

  function configure() {
    serviceMock = {
      getMine: vi.fn(),
      unarchive: vi.fn(),
      create: vi.fn(),
      getMembers: vi.fn(),
      removeMember: vi.fn(),
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
  it('BUG UI-TT-119 javítva: unarchive()-nál egy átfedő második hívás (dupla-kattintás) NEM indít második HTTP-kérést, a "loading" guard megfogja', () => {
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

  // UI-TT-146: a backend egy 255 karakternél hosszabb csoportnévre sztenderd ASP.NET
  // `ValidationProblemDetails`-t ad vissza (`{ errors: { Name: [...] } }`), nem
  // `{ errorMessage }`-et — a mutate()-nak korábban csak az utóbbi alakot ismerte fel,
  // ezért a valódi backend-indok helyett mindig a generikus "A művelet sikertelen."
  // üzenetre esett vissza.
  it('BUG UI-TT-146 javítva: create() ValidationProblemDetails hibaválasz esetén a mezőszintű üzenetet mutatja, nem a generikus fallbacket', () => {
    serviceMock.getMine.mockReturnValue(of([]));
    serviceMock.create.mockReturnValue(
      throwError(() => ({ error: { errors: { Name: ['A Name mező legfeljebb 255 karakter hosszú lehet.'] } } })),
    );

    store.create({ name: 'a'.repeat(256) });

    expect(store.error()).toBe('A Name mező legfeljebb 255 karakter hosszú lehet.');
    expect(store.error()).not.toContain('sikertelen.');
  });

  // UI-TT-107: két gyors egymás utáni csoport-megnyitásnál a KORÁBBAN indított
  // tagnévsor-lekérdezés válasza — ha később ér célba — csendben felülírta a MÁR
  // megjelenített, ÚJABB csoport tagjait: a tanár B csoport oldalán A csoport
  // diákjait látta.
  it('BUG UI-TT-107 javítva: loadMembers — a késve érkező RÉGI csoport tagnévsora nem írja felül az újabbat', async () => {
    const aValasz = new Subject<GroupMemberDto[]>();
    const bValasz = new Subject<GroupMemberDto[]>();
    serviceMock.getMembers.mockReturnValueOnce(aValasz).mockReturnValueOnce(bValasz);

    store.loadMembers(1);
    store.loadMembers(2);
    expect(serviceMock.getMembers).toHaveBeenCalledTimes(2);

    const bTagok = [makeMember({ userId: 20, name: 'B csoport diákja' })];
    bValasz.next(bTagok);
    bValasz.complete();
    await Promise.resolve();
    expect(store.members()).toEqual(bTagok);

    // "A" elavult, KÉSŐN érkező válasza nem írhatja felül "B" már megjelenített tagjait.
    aValasz.next([makeMember({ userId: 10, name: 'A csoport diákja' })]);
    aValasz.complete();
    await Promise.resolve();
    expect(store.members()).toEqual(bTagok);
  });

  // Ugyanez a hibaág: egy elavult kérés HIBÁJA sem üthet be egy közben már
  // sikeresen betöltött, újabb csoport nézetébe.
  it('BUG UI-TT-107 javítva: loadMembers — a késve érkező RÉGI kérés hibája nem jelenik meg az újabb csoportnál', async () => {
    const aValasz = new Subject<GroupMemberDto[]>();
    const bValasz = new Subject<GroupMemberDto[]>();
    serviceMock.getMembers.mockReturnValueOnce(aValasz).mockReturnValueOnce(bValasz);

    store.loadMembers(1);
    store.loadMembers(2);

    bValasz.next([makeMember({ userId: 20 })]);
    bValasz.complete();
    await Promise.resolve();

    aValasz.error({ error: { errorMessage: 'A csoport nem található.' } });
    await Promise.resolve();

    expect(store.error()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  // BE-GROUPSTORE-REMOVEMEMBER-STALE-COUNT: minden MÁS mutáció ebben a store-ban
  // (archive/unarchive/setJoinEnabled/regenerateInvite/update) patch-eli a `_groups`
  // listát is - a `removeMember()` korábban csak a `_members`-t frissítette, a
  // `csoportok-lista.component.ts`-ben megjelenő `group.memberCount` így elavult
  // (eggyel magasabb, mint a valós taglétszám) maradt egy tag eltávolítása után,
  // amíg egy külön `loadMine()` újra le nem töltötte a listát.
  it('BUG BE-GROUPSTORE-REMOVEMEMBER-STALE-COUNT javítva: removeMember() a _groups memberCount-ját is csökkenti', () => {
    serviceMock.getMine.mockReturnValue(of([makeGroup({ id: 501, memberCount: 3 })]));
    serviceMock.getMembers.mockReturnValue(
      of([makeMember({ userId: 10 }), makeMember({ userId: 20 })]),
    );
    serviceMock.removeMember.mockReturnValue(of({}));

    store.loadMine();
    store.loadMembers(501);
    store.removeMember(501, 10);

    expect(store.members()).toEqual([makeMember({ userId: 20 })]);
    expect(store.groups().find((g) => g.id === 501)?.memberCount).toBe(2);
  });
});
