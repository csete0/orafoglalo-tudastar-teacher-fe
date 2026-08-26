import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { AdminLicenseStore } from './admin-license.store';
import { AdminLicenseService } from './admin-license.service';
import { InstitutionalLicenseDto } from '../../models/institutional-license.model';

function makeLicense(overrides: Partial<InstitutionalLicenseDto> = {}): InstitutionalLicenseDto {
  return {
    id: 10,
    schoolId: 1,
    teacherProfileId: null,
    ownerName: 'E2E Gimnázium',
    tier: 'premium',
    capacity: 30,
    usedSeats: 12,
    heldSeats: 14,
    validFrom: '2026-08-25',
    validTo: '2027-08-25',
    idleWindowMinutes: 20,
    revokedAt: null,
    billingNote: null,
    createdAt: '2026-08-25T00:00:00Z',
    isActive: true,
    skippedDueToActiveSessionCount: 0,
    ...overrides,
  };
}

describe('AdminLicenseStore', () => {
  let serviceMock: {
    getLicenses: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    getSeats: ReturnType<typeof vi.fn>;
    releaseSeat: ReturnType<typeof vi.fn>;
    getUsage: ReturnType<typeof vi.fn>;
  };

  function configure() {
    TestBed.configureTestingModule({
      providers: [AdminLicenseStore, { provide: AdminLicenseService, useValue: serviceMock }],
    });
    return TestBed.inject(AdminLicenseStore);
  }

  beforeEach(() => {
    serviceMock = {
      getLicenses: vi.fn().mockReturnValue(of([makeLicense()])),
      create: vi.fn().mockReturnValue(of(makeLicense())),
      update: vi.fn().mockReturnValue(of(makeLicense())),
      revoke: vi.fn().mockReturnValue(of({ releasedCount: 0, skippedDueToActiveSessionCount: 0 })),
      getSeats: vi.fn().mockReturnValue(of([])),
      releaseSeat: vi.fn().mockReturnValue(of(void 0)),
      getUsage: vi.fn().mockReturnValue(
        of({
          licenseId: 10,
          capacity: 30,
          rangeDays: 30,
          totalDenied: 3,
          totalReclaimed: 1,
          peakSeatsInUse: 30,
          daysAtCapacity: 2,
          daily: [],
        }),
      ),
    };
  });

  it('betölti a licenceket', async () => {
    const store = configure();
    store.load();
    await Promise.resolve();

    expect(store.licenses().length).toBe(1);
    expect(store.loading()).toBe(false);
  });

  it('intézményre szűr', async () => {
    serviceMock.getLicenses.mockReturnValue(
      of([makeLicense({ id: 1, schoolId: 1 }), makeLicense({ id: 2, schoolId: 2 })]),
    );
    const store = configure();
    store.load();
    await Promise.resolve();

    expect(store.licensesForSchool(2).map((l) => l.id)).toEqual([2]);
  });

  // Egy next-only subscribe esetén a store némán üres listát mutatna, és egy
  // kezeletlen HttpErrorResponse is landolna (ld. UI-TT-65).
  it('hibánál beállítja az error signalt', async () => {
    serviceMock.getLicenses.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Nincs jogosultságod.' } })),
    );
    const store = configure();
    store.load();
    await Promise.resolve();

    expect(store.error()).toBe('Nincs jogosultságod.');
    expect(store.loading()).toBe(false);
  });

  it('létrehozás után újratölti a listát', async () => {
    const store = configure();
    store.create({ schoolId: 1, tier: 'premium', capacity: 30, validFrom: '2026-08-25', validTo: '2027-08-25' });
    await Promise.resolve();

    expect(serviceMock.create).toHaveBeenCalled();
    expect(serviceMock.getLicenses).toHaveBeenCalled();
  });

  it('visszavonás hibájánál kikapcsolja a loading jelzőt', async () => {
    serviceMock.revoke.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'A licenc már vissza van vonva.' } })),
    );
    const store = configure();
    store.revoke(10);
    await Promise.resolve();

    expect(store.error()).toBe('A licenc már vissza van vonva.');
    expect(store.loading()).toBe(false);
  });

  // UI-TT-199: az `AdminTeacherStore.setQuota()` mintáját követve `update()` is fogad egy
  // opcionális `onSuccess` callback-et - a hívó (`admin-intezmenyek.component.ts`
  // `saveLicenseEdit()`) KIZÁRÓLAG ebből zárja a szerkesztő formot. Korábban egyáltalán nem
  // volt callback-paraméter, ezért a komponens feltétel nélkül, a HTTP-válasz előtt zárt.
  it('update() sikeres válasz esetén meghívja az onSuccess callback-et a frissített licenccel', async () => {
    serviceMock.update.mockReturnValue(of(makeLicense({ id: 10, capacity: 50 })));
    const store = configure();
    const onSuccess = vi.fn();

    store.update(10, { capacity: 50, validFrom: '2026-08-25', validTo: '2027-08-25' }, onSuccess);
    await Promise.resolve();

    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 10, capacity: 50 }));
  });

  it('update() hiba esetén NEM hívja meg az onSuccess callback-et - a hívó formja nyitva maradhat', async () => {
    serviceMock.update.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Az érvényesség vége nem lehet korábbi a kezdeténél.' } })),
    );
    const store = configure();
    const onSuccess = vi.fn();

    store.update(10, { capacity: 50, validFrom: '2027-08-25', validTo: '2026-08-25' }, onSuccess);
    await Promise.resolve();

    expect(onSuccess).not.toHaveBeenCalled();
    expect(store.error()).toBe('Az érvényesség vége nem lehet korábbi a kezdeténél.');
  });

  // UI-TT-200: a backend (BE-LICENSEREVOKE-BULK-SILENT-FALSE-SUCCESS, ma reggel javítva) a
  // visszavonás válaszában pontosan megmondja, hány helyet hagyott ki aktív vizsga/kvíz
  // miatt. Korábban `revoke()` `Observable<void>`-ra volt tipizálva és nem fogadott
  // callback-et - ez az információ sosem jutott el a felületig. Az onSuccess-nek átadott
  // válasz-DTO-ból a hívó (`confirmRevoke()`) tud toast-ot mutatni.
  it('revoke() sikeres válasz esetén az onSuccess callback-nek átadja a skippedDueToActiveSessionCount-ot', async () => {
    serviceMock.revoke.mockReturnValue(of({ releasedCount: 3, skippedDueToActiveSessionCount: 2 }));
    const store = configure();
    const onSuccess = vi.fn();

    store.revoke(10, onSuccess);
    await Promise.resolve();

    expect(onSuccess).toHaveBeenCalledWith({ releasedCount: 3, skippedDueToActiveSessionCount: 2 });
  });

  it('licencenként tárolja a kihasználtsági kimutatást', async () => {
    const store = configure();
    store.loadUsage(10);
    await Promise.resolve();

    expect(store.usage()[10]?.totalDenied).toBe(3);
    expect(store.usage()[10]?.peakSeatsInUse).toBe(30);
    expect(serviceMock.getUsage).toHaveBeenCalledWith(10);
  });

  it('kimutatás-hibánál is beállítja az error signalt', async () => {
    serviceMock.getUsage.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'A licenc nem található.' } })),
    );
    const store = configure();
    store.loadUsage(10);
    await Promise.resolve();

    expect(store.error()).toBe('A licenc nem található.');
  });

  it('folyamatban lévő művelet alatt nem indít másodikat', () => {
    const pending = new Subject<void>();
    serviceMock.revoke.mockReturnValue(pending);
    const store = configure();

    store.revoke(10);
    store.revoke(11);

    expect(serviceMock.revoke).toHaveBeenCalledTimes(1);
  });

  // BUG UI-TT-197: revoke()/update()/releaseSeat() mind csak a licenc-listát
  // (load()) töltik újra sikeres válasz után - a licenc-specifikus, kulcsolt
  // _seats/_usage cache-t SOHA nem érvénytelenítik és nem töltik újra. Ha az
  // admin a "Helyek megtekintése" panelt már nyitva tartotta egy licencnél,
  // egy visszavonás/felszabadítás UTÁN is a REVOKE ELŐTTI hely-listát látja
  // tovább - a "Felszabadítás" gomb rajta marad egy már felszabadult helyen,
  // aminek megnyomása a backendtől 400-at kap ("nem tartozik aktív hely").
  it('visszavonás után a már nyitva tartott hely-lista NEM frissül - stale cache marad', async () => {
    const store = configure();

    // Admin korábban megnyitotta a "Helyek megtekintése" panelt: 1 aktív hely.
    serviceMock.getSeats.mockReturnValue(
      of([
        {
          userId: 99,
          displayName: 'Teszt Diák',
          email: 'teszt@example.com',
          seatIndex: 0,
          claimedAt: '2026-08-20T00:00:00Z',
          lastActivityAt: '2026-08-26T00:00:00Z',
          isFresh: true,
        },
      ]),
    );
    store.loadSeats(10);
    await Promise.resolve();
    expect(store.seats()[10]?.length).toBe(1);

    // A visszavonás a backenden felszabadítja az ÖSSZES helyet - egy ezutáni
    // valódi getSeats hívás már üres listát adna vissza.
    serviceMock.getSeats.mockReturnValue(of([]));
    store.revoke(10);
    await Promise.resolve();

    // Elvárt helyes viselkedés: a nyitva tartott hely-lista a visszavonás
    // után frissüljön (vagy legalább ürüljön ki), hogy az admin ne lásson
    // már felszabadult, "Felszabadítás"-ra kattintható helyeket.
    expect(store.seats()[10]?.length).toBe(0);
  });
});
