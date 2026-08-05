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
    // Rögzített időbélyeg, NEM `new Date().toISOString()` - két hívás (a teszt-adat
    // felépítése és egy `toEqual`-asszertáció elvárt értéke) között eltelt akár 1 ms is
    // időszakosan elbuktatta a tesztet egy jelentéktelen, a teszt tárgyához nem tartozó
    // időbélyeg-eltérés miatt.
    joinedAt: '2026-01-01T00:00:00.000Z',
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
    archive: ReturnType<typeof vi.fn>;
  };
  let store: GroupStore;

  function configure() {
    serviceMock = {
      getMine: vi.fn(),
      unarchive: vi.fn(),
      create: vi.fn(),
      getMembers: vi.fn(),
      removeMember: vi.fn(),
      archive: vi.fn(),
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

  // BUG UI-TT-158 (UI-TT-157 testvér-hibája, `SchoolStore.removeMember()`-ben): a
  // `removeMember()` a `mutate()` helperen fut, aminek `takeUntilDestroyed(this.destroyRef)`-je
  // a STORE saját, gyakorlatilag örökké élő DestroyRef-jéhez kötött (`providedIn: 'root'`) —
  // ugyanaz a szerkezeti hiba, mint a `TeacherTaskSetStore.mutateAndReload()`-nál (UI-TT-156).
  // A sikeres onSuccess (`_members.update(list => list.filter(m => m.userId !== memberUserId))`)
  // SEMMILYEN groupId-/generáció-ellenőrzést nem kap — szemben a SAJÁT loadMembers()-ével, amit
  // a UI-TT-107 fix már generáció-számlálóval védett. Egy diák gyakran tagja TÖBB csoportnak
  // (más-más tanárnál/tantárgynál) — ha a tanár A csoportból eltávolítja a diákot, majd — a
  // válasz megérkezése ELŐTT — átnavigál B csoport "Tagok" nézetére (ahol a diák szintén tag),
  // a `_members` signal ekkor már B listáját tartalmazza. Amikor A elavult törlésének válasza
  // megérkezik, a filter B AKTUÁLIS listájára fut le — a diák csendben eltűnik B renderelt
  // tag-listájáról is, holott a szerveren B-beli tagsága változatlan marad.
  it('BUG UI-TT-158: A csoportból induló removeMember válasza a B csoport megtekintése közben csendben eltávolítja a (B-ben is tag) diákot B renderelt listájáról', async () => {
    const sharedMember = makeMember({ userId: 77, name: 'Közös Diák' });

    serviceMock.getMembers.mockReturnValueOnce(of([sharedMember])).mockReturnValueOnce(of([sharedMember]));
    const removeSubject = new Subject<unknown>();
    serviceMock.removeMember.mockReturnValue(removeSubject.asObservable());

    // Tanár az A csoport "Tagok" fülén elindítja a közös diák eltávolítását - a válasz
    // (removeSubject) még nem érkezett meg.
    store.loadMembers(1);
    store.removeMember(1, 77);

    // A tanár - a válasz megérkezése ELŐTT - átnavigál B csoport "Tagok" fülére; ott a
    // közös diák helyesen, valós tagként jelenik meg.
    store.loadMembers(2);
    await Promise.resolve();
    expect(store.members()).toEqual([sharedMember]);

    // Most érkezik meg A elavult (B megtekintése közben induló) törlésének válasza.
    removeSubject.next({});
    removeSubject.complete();
    await Promise.resolve();

    // A HELYES viselkedés: B renderelt listája változatlan marad (a törlés A-ra vonatkozott,
    // B-n a diák tagsága nem változott) - ez itt MEGBUKIK, mert a `mutate()` feltétel nélkül
    // B AKTUÁLIS listájából szűri ki a diákot.
    expect(store.members()).toEqual([sharedMember]);
  });

  // UI-TT-139: a UI-TT-119 fix `unarchive()`-nak a store-szintű, MINDEN
  // metódus között megosztott `_loading` jelet adta guard-ként (`if
  // (this._loading()) return;`), UGYANAZT, amit `loadMine()`/`loadMembers()`
  // és a közös `mutate()` helperen át MINDEN más mutáló metódus
  // (create/update/regenerateInvite/removeMember/archive/setJoinEnabled) is
  // állít. Ez pontosan a testvér `SchoolStore` `regenerateInvite()`-nél már
  // megtalált (UI-TT-138) "megosztott _loading guard" hibacsalád (ld. még
  // UI-TS-151-155/196/198/199-201, UI-TT-136/137) egy újabb, a SAJÁT
  // UI-TT-119 fixétől SZÁRMAZÓ előfordulása: `unarchive()` az EGYETLEN
  // metódus, ami explicit ellenőrzi ezt a közös jelet, ezért BÁRMELY másik,
  // ÉPPEN FOLYAMATBAN LÉVŐ, teljesen független store-művelet (pl. a
  // `csoport-reszletek.component.ts` ngOnInit-jében induló `loadMembers()`)
  // csendben meghiúsítja a "Visszaállítás" gomb kattintását - a tanár nem kap
  // hibaüzenetet, egyszerűen nem történik semmi.
  it('UI-TT-139 javítva: loadMembers() folyamatban léte alatt egy FÜGGETLEN unarchive() hívás NEM no-op-ol - saját guard-Set', () => {
    serviceMock.getMine.mockReturnValue(of([makeGroup({ id: 501, isArchived: true })]));
    const membersSubject = new Subject<unknown>();
    serviceMock.getMembers.mockReturnValue(membersSubject.asObservable());
    serviceMock.unarchive.mockReturnValue(of({}));

    store.loadMine();
    store.select(501);

    // A csoport-részletek oldal betöltésekor elindul a tagok listájának
    // lekérése - a válasz még nem érkezett meg.
    store.loadMembers(501);
    expect(store.loading()).toBe(true);

    // A tanár - MIELŐTT a tagok betöltődnének - a teljesen FÜGGETLEN
    // "Visszaállítás" gombra kattint.
    store.unarchive(501);

    // HELYES viselkedés: az unarchive() saját, entitásonkénti guard-Set-en
    // fut, a loadMembers() folyamatban léte nem blokkolja - a hívás azonnal
    // elindul, és a csoport állapota frissül.
    expect(serviceMock.unarchive).toHaveBeenCalledTimes(1);
    expect(store.selectedGroup()?.isArchived).toBe(false);

    membersSubject.next([]);
    membersSubject.complete();
  });

  // UI-TT-169: a közös `mutate()` helper (amin archive/update/create/regenerateInvite/
  // setJoinEnabled/removeMember fut) semmilyen generáció-védelmet nem kapott, szemben a
  // `_members`-szel (UI-TT-107). Egy elhagyott mutáció KÉSVE érkező válasza beszennyezte
  // a közben megnyitott MÁSIK csoport már sikeresen betöltött oldalát.
  it('UI-TT-169: A csoport elhagyott archive()-jának KÉSVE érkező hibája NEM szennyezi be a már sikeresen megnyitott B csoport oldalát', async () => {
    serviceMock.getMembers.mockReturnValueOnce(of([])).mockReturnValueOnce(of([]));
    const archiveSubject = new Subject<unknown>();
    serviceMock.archive.mockReturnValue(archiveSubject.asObservable());

    // Tanár elindítja A csoport archiválását - a válasz még nem érkezett meg.
    store.select(1);
    store.loadMembers(1);
    store.archive(1);
    await Promise.resolve();

    // A válasz megérkezése ELŐTT átnavigál B csoport oldalára, ahol a tagok
    // betöltése sikeresen, hiba nélkül lezárul.
    store.select(2);
    store.loadMembers(2);
    await Promise.resolve();
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();

    // Most érkezik meg A elavult, hibás archiválás-válasza.
    archiveSubject.error({ error: { errorMessage: 'Az archiválás sikertelen.' } });
    await Promise.resolve();

    // HELYES viselkedés: B már tiszta, sikeresen betöltött oldala változatlan marad -
    // A elavult mutációja nem írhatja felül a _loading/_error állapotot.
    expect(store.error()).toBeNull();
    expect(store.loading()).toBe(false);
  });
});
