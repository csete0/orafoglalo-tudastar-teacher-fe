import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { SchoolStore } from './school.store';
import { SchoolService } from './school.service';
import { SchoolDto } from '../../models/school.model';

function makeSchool(overrides: Partial<SchoolDto> = {}): SchoolDto {
  return {
    id: 1,
    name: 'Teszt Iskola',
    slug: 'teszt-iskola-abc123',
    createdAt: new Date().toISOString(),
    groupCount: 0,
    myRole: 'Teacher',
    teacherCount: 1,
    ...overrides,
  };
}

describe('SchoolStore — MyRole-vezérelt állapot', () => {
  let serviceMock: {
    getMine: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    join: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    getMembers: ReturnType<typeof vi.fn>;
    getSchoolGroups: ReturnType<typeof vi.fn>;
    changeMemberRole: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
    regenerateTeacherInvite: ReturnType<typeof vi.fn>;
  };

  function configure() {
    serviceMock = {
      getMine: vi.fn(),
      create: vi.fn(),
      join: vi.fn(),
      delete: vi.fn(),
      getMembers: vi.fn(),
      getSchoolGroups: vi.fn(),
      changeMemberRole: vi.fn(),
      removeMember: vi.fn(),
      regenerateTeacherInvite: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [SchoolStore, { provide: SchoolService, useValue: serviceMock }],
    });
  }

  beforeEach(() => configure());

  it('a kiválasztott intézmény MyRole="Admin" mezőjéből isSelectedAdmin=true', async () => {
    serviceMock.getMine.mockReturnValue(of([makeSchool({ id: 1, myRole: 'Admin', teacherInviteCode: 'ABCD1234' })]));

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(1);

    expect(store.isSelectedAdmin()).toBe(true);
    expect(store.selectedSchool()?.teacherInviteCode).toBe('ABCD1234');
  });

  it('sima tag (MyRole="Teacher") esetén isSelectedAdmin=false, nincs meghívó kód', async () => {
    serviceMock.getMine.mockReturnValue(of([makeSchool({ id: 2, myRole: 'Teacher', teacherInviteCode: undefined })]));

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(2);

    expect(store.isSelectedAdmin()).toBe(false);
    expect(store.selectedSchool()?.teacherInviteCode).toBeUndefined();
  });

  it('egy tanár EGYSZERRE lehet igazgató az egyik és sima tag a másik intézményben', async () => {
    serviceMock.getMine.mockReturnValue(
      of([
        makeSchool({ id: 1, name: 'Saját suli', myRole: 'Admin' }),
        makeSchool({ id: 2, name: 'Kollégáé', myRole: 'Teacher' }),
      ]),
    );

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();

    store.select(1);
    expect(store.isSelectedAdmin()).toBe(true);

    store.select(2);
    expect(store.isSelectedAdmin()).toBe(false);
  });

  it('nincs kiválasztott intézmény → isSelectedAdmin=false (nem dob hibát)', () => {
    const store = TestBed.inject(SchoolStore);

    expect(store.selectedSchool()).toBeNull();
    expect(store.isSelectedAdmin()).toBe(false);
  });

  it('join után az új intézmény bekerül a listába a szerverből kapott MyRole-lal', async () => {
    serviceMock.getMine.mockReturnValue(of([]));
    serviceMock.join.mockReturnValue(of(makeSchool({ id: 5, myRole: 'Teacher' })));

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();

    const onSuccess = vi.fn();
    store.join({ code: 'INVITE01' }, onSuccess);
    await Promise.resolve();

    expect(store.schools()).toHaveLength(1);
    expect(store.schools()[0].myRole).toBe('Teacher');
    expect(onSuccess).toHaveBeenCalled();
  });

  // UI-TT-146: a backend egy 255 karakternél hosszabb intézménynévre sztenderd ASP.NET
  // `ValidationProblemDetails`-t ad vissza (`{ errors: { Name: [...] } }`), nem
  // `{ errorMessage }`-et — a mutate()-nak korábban csak az utóbbi alakot ismerte fel,
  // ezért a valódi backend-indok helyett mindig a generikus "A művelet sikertelen."
  // üzenetre esett vissza.
  it('BUG UI-TT-146 javítva: create() ValidationProblemDetails hibaválasz esetén a mezőszintű üzenetet mutatja, nem a generikus fallbacket', async () => {
    serviceMock.getMine.mockReturnValue(of([]));
    serviceMock.create.mockReturnValue(
      throwError(() => ({ error: { errors: { Name: ['A Name mező legfeljebb 255 karakter hosszú lehet.'] } } })),
    );

    const store = TestBed.inject(SchoolStore);
    store.create({ name: 'a'.repeat(256) });
    await Promise.resolve();

    expect(store.error()).toBe('A Name mező legfeljebb 255 karakter hosszú lehet.');
    expect(store.error()).not.toContain('sikertelen.');
  });

  it('delete után az intézmény kikerül a listából és a kiválasztás törlődik', async () => {
    serviceMock.getMine.mockReturnValue(of([makeSchool({ id: 1 })]));
    serviceMock.delete.mockReturnValue(of({}));

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(1);

    store.delete(1);
    await Promise.resolve();

    expect(store.schools()).toHaveLength(0);
    expect(store.selectedSchool()).toBeNull();
  });

  it('getMembers hiba esetén error signal beállítva', async () => {
    serviceMock.getMembers.mockReturnValue(throwError(() => ({ error: { errorMessage: 'Nincs jogosultságod.' } })));

    const store = TestBed.inject(SchoolStore);
    store.loadMembers(1);
    await Promise.resolve();

    expect(store.error()).toBe('Nincs jogosultságod.');
  });

  // BUG UI-TT-9: loadMembers()/loadSchoolGroups() sosem törölte az előző mutáció hibáját indításkor.
  it('egy sikertelen mutáció után egy KÉSŐBBI, SIKERES loadMembers() törli a régi hibaüzenetet', async () => {
    serviceMock.getMine.mockReturnValue(of([makeSchool({ id: 1 })]));
    serviceMock.delete.mockReturnValue(throwError(() => ({ error: { errorMessage: 'A törlés sikertelen.' } })));
    serviceMock.getMembers.mockReturnValue(of([]));

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(1);

    store.delete(1);
    await Promise.resolve();
    expect(store.error()).toBe('A törlés sikertelen.');

    store.loadMembers(1);
    await Promise.resolve();

    expect(store.error()).toBeNull();
  });

  it('egy sikertelen mutáció után egy KÉSŐBBI, SIKERES loadSchoolGroups() törli a régi hibaüzenetet', async () => {
    serviceMock.getMine.mockReturnValue(of([makeSchool({ id: 1 })]));
    serviceMock.delete.mockReturnValue(throwError(() => ({ error: { errorMessage: 'A törlés sikertelen.' } })));
    serviceMock.getSchoolGroups.mockReturnValue(of([]));

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(1);

    store.delete(1);
    await Promise.resolve();
    expect(store.error()).toBe('A törlés sikertelen.');

    store.loadSchoolGroups(1);
    await Promise.resolve();

    expect(store.error()).toBeNull();
  });

  // BUG UI-TT-46: saját szerepkör lefokozása a tag-listán át nem frissítette a SchoolDto.myRole-t/isSelectedAdmin-t.
  it('saját szerepkör sikeres lefokozása után a _schools (myRole/isSelectedAdmin) újratöltődik', async () => {
    serviceMock.getMine
      .mockReturnValueOnce(of([makeSchool({ id: 1, myRole: 'Admin' })]))
      .mockReturnValueOnce(of([makeSchool({ id: 1, myRole: 'Teacher' })]));
    serviceMock.changeMemberRole.mockReturnValue(of({}));

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(1);
    expect(store.isSelectedAdmin()).toBe(true);

    store.changeMemberRole(1, 42, { role: 'Teacher' });
    await Promise.resolve();

    expect(serviceMock.getMine).toHaveBeenCalledTimes(2);
    expect(store.isSelectedAdmin()).toBe(false);
    expect(store.selectedSchool()?.myRole).toBe('Teacher');
  });

  it('saját eltávolítás után (removeMember) a _schools szintén újratöltődik', async () => {
    serviceMock.getMine
      .mockReturnValueOnce(of([makeSchool({ id: 1, myRole: 'Admin' })]))
      .mockReturnValueOnce(of([]));
    serviceMock.removeMember.mockReturnValue(of({}));

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(1);

    store.removeMember(1, 42);
    await Promise.resolve();

    expect(serviceMock.getMine).toHaveBeenCalledTimes(2);
    expect(store.schools()).toHaveLength(0);
  });

  // UI-TT-120: az intézményi tanári meghívó-kód regenerálása
  // (`IntezmenyReszletekComponent.regenerateInvite()`,
  // intezmeny-reszletek.component.ts:358-360, "Új kód generálása" gomb,
  // intezmeny-reszletek.component.ts:73) a testvér `GroupStore.regenerateInvite()`
  // (csoport-reszletek.component.ts) UI-TT-6-ban talált és 2026-07-17-ben
  // [disabled]="store.loading()"-tal kijavított mintájával ellentétben ITT
  // SEMMILYEN védelmet nem kapott: sem a gomb (nincs `[disabled]` binding),
  // sem a komponens (nincs `if (this.school.loading()) return;` guard),
  // sem maga a `SchoolStore.regenerateInvite()` (a közös `mutate()` helperen
  // át fut, ami sosem ellenőriz semmilyen "már folyamatban van egy kérés"
  // jelet). Egy dupla-kattintás KÉT külön valódi
  // POST /api/schools/{id}/regenerate-teacher-invite kérést indít - a
  // korábban már megosztott/kimásolt kód csendben, figyelmeztetés nélkül
  // érvénytelenné válik.
  it('BUG UI-TT-120: regenerateInvite()-nál egy átfedő második hívás (dupla-kattintás) MÁSODIK valódi HTTP-kérést indít, mert nincs "loading" guard', async () => {
    serviceMock.getMine.mockReturnValue(of([makeSchool({ id: 1, teacherInviteCode: 'OLD1234' })]));
    const regenSubject = new Subject<SchoolDto>();
    serviceMock.regenerateTeacherInvite.mockReturnValue(regenSubject.asObservable());

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(1);

    // Első kattintás az "Új kód generálása" gombon.
    store.regenerateInvite(1);
    expect(serviceMock.regenerateTeacherInvite).toHaveBeenCalledTimes(1);

    // Dupla-kattintás, amíg az első kérés még folyamatban van (nincs válasz) -
    // ugyanabban a JS-tickben, await nélkül.
    store.regenerateInvite(1);

    // A helyes viselkedés az lenne, hogy a második, átfedő hívás NEM indít
    // újabb kérést, amíg az első válasza meg nem érkezik - ez itt MEGBUKIK,
    // mert nincs ilyen guard.
    expect(serviceMock.regenerateTeacherInvite).toHaveBeenCalledTimes(1);

    regenSubject.next(makeSchool({ id: 1, teacherInviteCode: 'NEW5678' }));
    regenSubject.complete();
    await Promise.resolve();
  });

  // BUG UI-TT-126: a kliens az `isSelectedAdmin` (SchoolDto.myRole-ból számított) jelet
  // úgy kezeli, mintha szerver-ellenőrzött igazság lenne, miközben csak a legutóbbi
  // sikeres `loadMine()` válaszának pillanatfelvétele. A backend
  // (`SchoolService.RequireMembershipAsync`, `adminOnly: true`) MINDEN egyes
  // admin-műveletnél frissen, helyesen újraellenőrzi a hívó tényleges szerepét, és
  // egy, időközben (pl. egy másik admin által, egy másik eszközön/lapon) Teacher-re
  // lefokozott tanár kérését friss, érthető hibával utasítja el - tehát ez NEM egy
  // biztonsági rés, a backend a valódi kapu. A hiba a kliens UX-ében van: a
  // `mutate()` helper hiba-ága csak `this._error.set(...)`-et hívott, SOHA nem
  // hívta meg `loadMine()`-t - szemben a SIKERES `changeMemberRole`/`removeMember`
  // onSuccess-ével, ami pont egy ilyen "a myRole időközben megváltozott" eset
  // kezelésére frissíti a `_schools`-t. Emiatt egy demotált admin munkamenetében az
  // `isSelectedAdmin()` (és a rá épülő admin-only UI) HIBÁSAN admin-állapotban
  // maradt a backend kifejezett elutasítása UTÁN is, a teljes oldal-újratöltésig.
  it('BUG UI-TT-126: egy "már nem vagy admin" backend-elutasítás után a store újratölti a myRole-t, isSelectedAdmin() false-ra vált', async () => {
    serviceMock.getMine
      .mockReturnValueOnce(of([makeSchool({ id: 1, myRole: 'Admin' })]))
      .mockReturnValueOnce(of([makeSchool({ id: 1, myRole: 'Teacher' })]));
    serviceMock.changeMemberRole.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Ehhez a művelethez intézmény-admin (igazgató) szerep kell.' } })),
    );

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(1);
    expect(store.isSelectedAdmin()).toBe(true);

    // Időközben (egy másik lapon/eszközön) egy MÁSIK admin lefokozta ezt a tanárt -
    // a kliens ezt nem tudhatja, amíg meg nem próbál egy admin-műveletet, és a
    // backend ténylegesen vissza nem utasítja.
    store.changeMemberRole(1, 42, { role: 'Teacher' });
    await Promise.resolve();

    expect(store.error()).toBe('Ehhez a művelethez intézmény-admin (igazgató) szerep kell.');
    expect(serviceMock.getMine).toHaveBeenCalledTimes(2);
    expect(store.isSelectedAdmin()).toBe(false);
  });

  // BUG UI-TT-147: a közös `mutate()` helper KÜLSŐ `finalize()`-a a
  // `removeMember()`/`changeMemberRole()` SIKER-ágából szinkron módon indított
  // beágyazott `loadMine()` által frissen true-ra állított `_loading`-ot
  // AZONNAL vissza állította false-ra, MIELŐTT a beágyazott GET ténylegesen
  // befejeződött volna (az RxJS a `next`/`error` callbacket a `finalize()`
  // ELŐTT futtatja le) - ugyanaz a hibaosztály, mint amit a
  // `TeacherTaskSetStore.mutateAndReload()` és az `AdminSchoolStore.merge()`
  // már korábban explicit módon elkerült (lásd azok "Nincs finalize() itt"
  // megjegyzését). Emiatt a `regenerateInvite()` saját
  // `if (this._loading()) return;` guardja (UI-TT-120 fix) ebben a rövid
  // ablakban hatástalan volt.
  it('BUG UI-TT-147: removeMember() sikere utáni beágyazott loadMine() alatt a loading() true marad (nem áll vissza korán false-ra)', async () => {
    serviceMock.getMine.mockReturnValueOnce(of([makeSchool({ id: 1, myRole: 'Admin' })]));
    const removeSubject = new Subject<unknown>();
    serviceMock.removeMember.mockReturnValue(removeSubject.asObservable());
    const reloadSubject = new Subject<SchoolDto[]>();

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();
    store.select(1);

    store.removeMember(1, 42);
    expect(store.loading()).toBe(true);

    // A removeMember() válasza megérkezik - ez szinkron módon elindítja a
    // beágyazott loadMine()-t (getMine második hívása), aminek a válasza még
    // NEM érkezett meg.
    serviceMock.getMine.mockReturnValueOnce(reloadSubject.asObservable());
    removeSubject.next({});
    removeSubject.complete();

    // A HELYES viselkedés: loading() MÉG true, mert a beágyazott reload még
    // folyamatban van - ez a hibás verzióban itt false-ra váltott volna.
    expect(store.loading()).toBe(true);
    expect(serviceMock.getMine).toHaveBeenCalledTimes(2);

    // Amíg a beágyazott reload folyamatban van, egy "Új kód generálása"
    // kattintás guardjának (UI-TT-120) is blokkolnia kell - ez a hibás
    // verzióban ÁTMENT volna, mert a loading() időközben tévesen false volt.
    store.regenerateInvite(1);
    expect(serviceMock.regenerateTeacherInvite).not.toHaveBeenCalled();

    reloadSubject.next([makeSchool({ id: 1, myRole: 'Admin' })]);
    reloadSubject.complete();
    await Promise.resolve();

    expect(store.loading()).toBe(false);
  });

  it('create() sikere után loading() false-ra vált (nincs beágyazott reload, a hívó saját magát állítja vissza)', async () => {
    serviceMock.getMine.mockReturnValue(of([]));
    const createSubject = new Subject<SchoolDto>();
    serviceMock.create.mockReturnValue(createSubject.asObservable());

    const store = TestBed.inject(SchoolStore);
    store.loadMine();
    await Promise.resolve();

    store.create({ name: 'Új Iskola' } as never);
    expect(store.loading()).toBe(true);

    createSubject.next(makeSchool({ id: 2, name: 'Új Iskola' }));
    createSubject.complete();
    await Promise.resolve();

    expect(store.loading()).toBe(false);
    expect(store.schools().some((s) => s.id === 2)).toBe(true);
  });
});
