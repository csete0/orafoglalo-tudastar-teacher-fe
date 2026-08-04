import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AdminApplicationStore } from './admin-application.store';
import { AdminApplicationService } from './admin-application.service';
import { TeacherApplicationAdminDto } from '../../models/teacher-application.model';

function makeApplication(overrides: Partial<TeacherApplicationAdminDto> = {}): TeacherApplicationAdminDto {
  return {
    id: 1,
    userId: 10,
    applicantName: 'Teszt Tanár',
    applicantEmail: 'teszt@example.com',
    motivation: 'Szeretnék tanítani.',
    status: 'Pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AdminApplicationStore', () => {
  let serviceMock: {
    getApplications: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    reject: ReturnType<typeof vi.fn>;
  };

  function configure() {
    serviceMock = {
      getApplications: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        AdminApplicationStore,
        { provide: AdminApplicationService, useValue: serviceMock },
      ],
    });
  }

  beforeEach(() => configure());

  it('approve siker esetén eltávolítja a listából és meghívja az onSuccess-t', async () => {
    serviceMock.getApplications.mockReturnValue(of([makeApplication()]));
    serviceMock.approve.mockReturnValue(of({}));

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    const onSuccess = vi.fn();
    store.approve(1, onSuccess);
    await Promise.resolve();

    expect(store.applications().length).toBe(0);
    expect(onSuccess).toHaveBeenCalled();
    expect(store.loading()).toBe(false);
  });

  // UI-TT-11: dupla-kattintás (átfedő approve() hívás) ne indítson második,
  // valós hálózati kérést, amíg az első még folyamatban van.
  it('loading true az approve kérés alatt, és egy átfedő approve() hívás nem indít második kérést', async () => {
    serviceMock.getApplications.mockReturnValue(of([makeApplication()]));
    const approveSubject = new Subject<unknown>();
    serviceMock.approve.mockReturnValue(approveSubject.asObservable());

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    store.approve(1);
    expect(store.loading()).toBe(true);
    expect(serviceMock.approve).toHaveBeenCalledTimes(1);

    // dupla-kattintás, amíg az első hívás még folyamatban van
    store.approve(1);
    expect(serviceMock.approve).toHaveBeenCalledTimes(1);

    approveSubject.next({});
    approveSubject.complete();
    await Promise.resolve();

    expect(store.loading()).toBe(false);
  });

  it('loading true a reject kérés alatt, és egy átfedő reject() hívás nem indít második kérést', async () => {
    serviceMock.getApplications.mockReturnValue(of([makeApplication()]));
    const rejectSubject = new Subject<unknown>();
    serviceMock.reject.mockReturnValue(rejectSubject.asObservable());

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    store.reject(1, {});
    expect(store.loading()).toBe(true);
    expect(serviceMock.reject).toHaveBeenCalledTimes(1);

    store.reject(1, {});
    expect(serviceMock.reject).toHaveBeenCalledTimes(1);

    rejectSubject.next({});
    rejectSubject.complete();
    await Promise.resolve();

    expect(store.loading()).toBe(false);
  });

  it('approve hiba esetén beállítja az error jelet, és NEM távolítja el az elemet a listából', async () => {
    serviceMock.getApplications.mockReturnValue(of([makeApplication()]));
    serviceMock.approve.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Csak elbírálásra váró jelentkezés hagyható jóvá.' } })),
    );

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    store.approve(1);
    await Promise.resolve();

    expect(store.error()).toBe('Csak elbírálásra váró jelentkezés hagyható jóvá.');
    expect(store.applications().length).toBe(1);
    expect(store.loading()).toBe(false);
  });

  // UI-TT-124: a `load()` metódusnak - a testvér `approve()`/`reject()`-től
  // eltérően (ld. fenti UI-TT-11 tesztek) - EGYÁLTALÁN NINCS `loading`-őre, a
  // `setStatusFilter()` pedig feltétel nélkül meghívja `load()`-ot minden
  // kattintásnál (admin-jelentkezesek.component.html: a "Elfogadva"/
  // "Elutasítva"/"Függőben"/"Összes" fül-gombok közvetlenül
  // `store.setStatusFilter(option.value)`-t hívják). Ha az admin gyorsan
  // egymás után két KÜLÖNBÖZŐ szűrőt választ (pl. "Elfogadva" majd
  // "Elutasítva"), MINDKÉT `getApplications()` hívás ténylegesen elindul (nincs
  // guard, ami blokkolná) - a végeredmény attól függ, MELYIK válasz érkezik
  // meg UTOLJÁRA a hálózaton, NEM attól, melyik szűrőt választotta utoljára a
  // felhasználó. Ha a KORÁBBAN elindított "Elfogadva" kérés válasza érkezik meg
  // KÉSŐBB, a store `applications()` jele "Elfogadva" státuszú sorokat mutat,
  // miközben a `statusFilter()` jel (és a UI aktív fül-kiemelése) "Elutasítva"-t
  // állít - a lista tartalma és a kiválasztott fül ellentmond egymásnak.
  it('BUG UI-TT-124: gyors szűrő-váltás (Elfogadva -> Elutasítva) esetén, ha az Elfogadva-kérés válasza érkezik meg később, a lista Elfogadva-adatokat mutat "Elutasítva" szűrő mellett', async () => {
    const approvedResponse = new Subject<TeacherApplicationAdminDto[]>();
    const rejectedResponse = new Subject<TeacherApplicationAdminDto[]>();
    serviceMock.getApplications
      .mockReturnValueOnce(of([])) // kezdeti "pending" load() a konstruktor-szerű beállítás miatt nem kell itt
      .mockReturnValueOnce(approvedResponse)
      .mockReturnValueOnce(rejectedResponse);

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    // Az admin az "Elfogadva" fülre kattint - a load() FELTÉTEL NÉLKÜL elindul,
    // nincs `if (this._loading()) return` guard, mint approve()/reject()-nél
    store.setStatusFilter('approved');
    expect(store.statusFilter()).toBe('approved');
    expect(serviceMock.getApplications).toHaveBeenCalledWith('approved');

    // MIELŐTT az "Elfogadva" válasza megérkezne, az admin átvált az
    // "Elutasítva" fülre - a store NEM blokkolja ezt a második hívást sem
    store.setStatusFilter('rejected');
    expect(store.statusFilter()).toBe('rejected');
    expect(serviceMock.getApplications).toHaveBeenCalledWith('rejected');
    expect(serviceMock.getApplications).toHaveBeenCalledTimes(3);

    // A hálózaton a válaszok FORDÍTOTT sorrendben érkeznek: előbb az
    // "Elutasítva" (később indított, de gyorsabb) kérés válasza...
    rejectedResponse.next([makeApplication({ id: 2, status: 'Rejected' })]);
    rejectedResponse.complete();
    await Promise.resolve();

    expect(store.statusFilter()).toBe('rejected');
    expect(store.applications().map((a) => a.status)).toEqual(['Rejected']);

    // ...majd UTÁNA érkezik meg a KORÁBBAN elindított, de már elavult
    // "Elfogadva" kérés válasza
    approvedResponse.next([makeApplication({ id: 1, status: 'Approved' })]);
    approvedResponse.complete();
    await Promise.resolve();

    // A JAVÍTOTT viselkedés: a UI aktív fülkiemelése "Elutasítva"-t mutat...
    expect(store.statusFilter()).toBe('rejected');
    // ...ÉS a generációs-számláló miatt a KÉSŐBB beérkező, de már ELAVULT
    // ("Elfogadva" szűrésű) válasz NEM írja felül a ténylegesen legutóbb
    // kiválasztott "Elutasítva" szűrő listáját - a lista helyesen "Elutasítva"
    // jelentkezéseket mutat, a fül-kiemeléssel összhangban.
    expect(store.applications().map((a) => a.status)).toEqual(['Rejected']);
  });

  // UI-TT-137: az `approve()`/`reject()` (UI-TT-11 óta) UGYANAZT az egyetlen,
  // store-szintű `_loading` jelet használja őrfeltételként, amit MINDEN
  // jelentkezésre, MINDKÉT művelet-típusra megosztanak. Ez pontosan a
  // kampányban sokszor megtalált "megosztott _loading guard" hibacsalád
  // (UI-TS-151-155/196/198/199/200/201, UI-TT-136) egy testvér-előfordulása:
  // a guard célja a UGYANAZON jelentkezésen indított dupla-kattintás
  // megakadályozása lenne (ld. UI-TT-11), DE mivel a jel entitás-független, egy
  // FÜGGETLEN jelentkezésen (más `id`-vel) indított "Elfogadás"/"Elutasítás"
  // is csendben no-op-ol, amíg egy MÁSIK jelentkezés elbírálása folyamatban
  // van - egy admin, aki egy hosszú listán gyorsan egymás után több
  // jelentkezést bírál el, minden második/harmadik kattintását elveszítheti
  // anélkül, hogy erről bármilyen jelzést kapna.
  it('UI-TT-137 javítva: approve(jelentkezés A) folyamatban léte alatt egy FÜGGETLEN reject(jelentkezés B) hívás NEM no-op-ol - entitásonkénti guard', async () => {
    serviceMock.getApplications.mockReturnValue(
      of([makeApplication({ id: 1 }), makeApplication({ id: 2 })]),
    );
    const approveSubject = new Subject<unknown>();
    serviceMock.approve.mockReturnValue(approveSubject.asObservable());
    serviceMock.reject.mockReturnValue(of({}));

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    expect(store.applications().length).toBe(2);

    // Az admin elfogadja az 1-es jelentkezést - a kérés még nem tért vissza.
    store.approve(1);
    expect(serviceMock.approve).toHaveBeenCalledTimes(1);
    expect(store.loading()).toBe(true);

    // MIELŐTT az 1-es elbírálása visszatérne, az admin a listában lejjebb egy
    // TELJESEN FÜGGETLEN, másik jelentkezést (2-es) próbál elutasítani.
    store.reject(2, { reason: 'Hiányos önéletrajz' });

    // HELYES viselkedés: a reject() saját ("reject:2") kulcson fut, az
    // approve("approve:1") folyamatban léte nem blokkolja - a hívás azonnal
    // elindul, a 2-es jelentkezés kikerül a listából.
    expect(serviceMock.reject).toHaveBeenCalledTimes(1);
    expect(store.applications().some((a) => a.id === 2)).toBe(false);

    approveSubject.next({});
    approveSubject.complete();
    await Promise.resolve();
  });

  // UI-TT-167: a UI-TT-137 fix az `_inFlight`-ot entitásonkénti kulcsra bontotta, de az
  // `_error` VÁLTOZATLANUL egyetlen, minden jelentkezés között MEGOSZTOTT signal maradt -
  // egy sikeresen lezáruló, FÜGGETLEN jelentkezés-döntés nem törölte egy MÁSIK, korábban
  // hibázó jelentkezés hibaüzenetét.
  it('UI-TT-167: approve(A) hibája után egy KÉSŐBB sikeresen lezáruló, FÜGGETLEN reject(B) törli a régi hibaüzenetet', async () => {
    serviceMock.getApplications.mockReturnValue(
      of([makeApplication({ id: 1 }), makeApplication({ id: 2 })]),
    );
    serviceMock.approve.mockReturnValue(throwError(() => ({ error: { errorMessage: 'A jóváhagyás sikertelen.' } })));
    serviceMock.reject.mockReturnValue(of({}));

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    store.approve(1);
    await Promise.resolve();
    expect(store.error()).toBe('A jóváhagyás sikertelen.');

    store.reject(2, { reason: 'Hiányos önéletrajz' });
    await Promise.resolve();

    expect(store.error()).toBeNull();
  });
});
