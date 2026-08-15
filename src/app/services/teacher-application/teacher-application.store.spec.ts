import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { TeacherApplicationStore } from './teacher-application.store';
import { TeacherApplicationService } from './teacher-application.service';
import { TeacherApplicationDto } from '../../models/teacher-application.model';
import { NotificationStore } from '../notification/notification.store';

function makeApplication(overrides: Partial<TeacherApplicationDto> = {}): TeacherApplicationDto {
  return {
    id: 1,
    status: 'Pending',
    motivation: 'Szeretném felkészíteni a diákjaimat.',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('TeacherApplicationStore', () => {
  let serviceMock: { apply: ReturnType<typeof vi.fn>; getMine: ReturnType<typeof vi.fn> };
  let notificationStoreMock: { load: ReturnType<typeof vi.fn> };

  function configure() {
    serviceMock = { apply: vi.fn(), getMine: vi.fn() };
    notificationStoreMock = { load: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        TeacherApplicationStore,
        { provide: TeacherApplicationService, useValue: serviceMock },
        { provide: NotificationStore, useValue: notificationStoreMock },
      ],
    });
  }

  beforeEach(() => configure());

  it('loadMine siker: application beállítva, checked=true, isPending igaz', async () => {
    serviceMock.getMine.mockReturnValue(of(makeApplication()));

    const store = TestBed.inject(TeacherApplicationStore);
    store.loadMine();
    await Promise.resolve();

    expect(store.checked()).toBe(true);
    expect(store.isPending()).toBe(true);
    expect(store.status()).toBe('Pending');
  });

  it('loadMine 404 (nincs jelentkezés): application null, de checked=true és nincs hiba', async () => {
    serviceMock.getMine.mockReturnValue(throwError(() => ({ status: 404 })));

    const store = TestBed.inject(TeacherApplicationStore);
    store.loadMine();
    await Promise.resolve();

    expect(store.checked()).toBe(true);
    expect(store.application()).toBeNull();
    expect(store.error()).toBeNull();
  });

  it('loadMine egyéb hiba esetén error-t állít', async () => {
    serviceMock.getMine.mockReturnValue(
      throwError(() => ({ status: 500, error: { errorMessage: 'Szerverhiba' } })),
    );

    const store = TestBed.inject(TeacherApplicationStore);
    store.loadMine();
    await Promise.resolve();

    expect(store.error()).toBe('Szerverhiba');
  });

  it('apply siker: application frissül és onSuccess meghívódik', async () => {
    serviceMock.apply.mockReturnValue(of(makeApplication({ institutionName: 'Petőfi Gimnázium' })));

    const store = TestBed.inject(TeacherApplicationStore);
    const onSuccess = vi.fn();
    store.apply({ motivation: 'x' }, onSuccess);
    await Promise.resolve();

    expect(store.application()?.institutionName).toBe('Petőfi Gimnázium');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('apply hiba: error beállítva, application változatlan marad', async () => {
    serviceMock.apply.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Már van elbírálásra váró jelentkezésed.' } })),
    );

    const store = TestBed.inject(TeacherApplicationStore);
    store.apply({ motivation: 'x' });
    await Promise.resolve();

    expect(store.error()).toBe('Már van elbírálásra váró jelentkezésed.');
    expect(store.application()).toBeNull();
  });

  // JelentkezesComponent 5 másodpercenként pollozza loadMine()-t, amíg isPending() igaz -
  // korábban semmi nem védte a válaszok kiérkezésének sorrendjét: ha egy KORÁBBAN indított
  // (de lassabb) hívás válasza egy KÉSŐBB indított (de gyorsabb) hívás válasza UTÁN
  // érkezett meg, a régi ("Pending") adat csendben felülírta volna a már megérkezett friss
  // ("Approved") állapotot.
  it('BUG-fix: két átfedő loadMine()-hívás közül a KÉSŐBB indított (de hamarabb megérkező) válasza nyer, a KORÁBBAN indított, de KÉSŐBB megérkező elavult válasz nem írja felül', async () => {
    const firstResponse = new Subject<TeacherApplicationDto>();
    const secondResponse = new Subject<TeacherApplicationDto>();
    serviceMock.getMine
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse);

    const store = TestBed.inject(TeacherApplicationStore);

    // Első (pollozási) hívás elindul...
    store.loadMine();
    // ...majd MIELŐTT visszaérne, egy második (a következő 5mp-es poll-tick) is elindul.
    store.loadMine();
    expect(serviceMock.getMine).toHaveBeenCalledTimes(2);

    // A hálózaton a válaszok FORDÍTOTT sorrendben érkeznek: előbb a KÉSŐBB indított
    // hívás (friss "Approved" állapot)...
    secondResponse.next(makeApplication({ status: 'Approved' }));
    secondResponse.complete();
    await Promise.resolve();

    expect(store.status()).toBe('Approved');

    // ...majd UTÁNA érkezik meg a KORÁBBAN indított, de már elavult hívás válasza
    // (stale "Pending" állapot).
    firstResponse.next(makeApplication({ status: 'Pending' }));
    firstResponse.complete();
    await Promise.resolve();

    // A JAVÍTOTT viselkedés: az elavult, később megérkező válasz NEM írja felül a
    // ténylegesen legutóbb indított híváséból már beállított "Approved" állapotot.
    expect(store.status()).toBe('Approved');
    expect(store.loading()).toBe(false);
    expect(store.checked()).toBe(true);
  });

  it('isApproved/isRejected computed helyesen tükrözi a státuszt', async () => {
    serviceMock.getMine.mockReturnValue(of(makeApplication({ status: 'Approved' })));

    const store = TestBed.inject(TeacherApplicationStore);
    store.loadMine();
    await Promise.resolve();

    expect(store.isApproved()).toBe(true);
    expect(store.isPending()).toBe(false);
    expect(store.isRejected()).toBe(false);
  });

  // UI-TT-183: élőben reprodukálva 2026-08-14-én (hétvégi böngészős kör, ui-tudastar-teacher
  // slice) két friss, egyértelműen jelölt eldobható diák-fiókkal (userId=1179/1180), valódi
  // (nem forge-olt) admin-jóváhagyással. Ugyanaz a hibacsalád, mint a diák-fe már JAVÍTOTT
  // NOTIFICATIONBELL-STALE-AFTER-BADGE-EARNED tétele (ld. tudastar.md): a `NotificationBellComponent`
  // az `AppComponent` fejlécében EGYSZER mountolva, `ngOnInit()`-ben hívja a
  // `NotificationStore.load()`-ot, és SEMMILYEN downstream store nem hívja újra ezt élő
  // munkameneten belül. A "22. ma" (2026-08-13) kör ugyanezt az irányt megvizsgálta és
  // ELVETETTE azzal az indoklással, hogy "a bug family strukturálisan nem ismétlődhet meg a
  // teacher-fe-n, mert minden BE notify-trigger MÁSIK usert céloz" - ez a feltevés téves erre az
  // egy konkrét ágra: a `/jelentkezes` oldal SAJÁT munkamenetén belül pollozza a jóváhagyás
  // státuszát (`TeacherApplicationStore.loadMine()`), és az admin jóváhagyása UGYANAZON usernek
  // (magának a live böngésző-munkamenetnek) generál egy Notification-sort. Élőben: a poll
  // helyesen "Elfogadva" állapotra váltott 5mp-en belül, a "Belépés tanárként" gomb helyesen
  // tanári dashboardra navigált - DE a harang a teljes hátralévő munkamenetben "Nincs
  // értesítésed"-et mutatott, holott egy MÁSIK, friss (teljes oldal-újratöltéses) böngésző-fülön
  // ugyanaz a user ugyanabban a pillanatban helyesen látta a "Tanári jelentkezésed elfogadva"
  // értesítést "1 perce" időbélyeggel. Javasolt fix-irány: pontosan a diák-fe fix mintája -
  // `loadMine()` ÚJ "Approved" állapot ÉSZLELÉSEKOR (előző állapothoz képesti átmenetkor) hívja
  // meg a `NotificationStore.load()`-ot is.
  it('BUG (ÚJ, UI-TT-183): loadMine() Pending → Approved átmenet ÉSZLELÉSEKOR nem frissíti a NotificationStore-t, holott a jóváhagyás új Notification-sort hoz létre ugyanannak a live munkamenetnek', async () => {
    serviceMock.getMine
      .mockReturnValueOnce(of(makeApplication({ status: 'Pending' })))
      .mockReturnValueOnce(of(makeApplication({ status: 'Approved' })));

    const store = TestBed.inject(TeacherApplicationStore);

    // Első poll-tick: még "Pending" - helyesen nem indokolt értesítés-frissítés.
    store.loadMine();
    await Promise.resolve();
    expect(store.isPending()).toBe(true);

    // Második poll-tick (5mp múlva): a backend időközben jóváhagyta - a harangnak
    // ITT kellene tudomást szereznie az admin jóváhagyás által létrehozott Notification-ról.
    store.loadMine();
    await Promise.resolve();
    expect(store.isApproved()).toBe(true);

    // Bukó elvárás: élőben a harang ezen a ponton még mindig "Nincs értesítésed"-et mutat,
    // mert semmi nem hívja meg a NotificationStore.load()-ot ezen az átmeneten.
    expect(notificationStoreMock.load).toHaveBeenCalled();
  });
});
