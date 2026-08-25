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
      revoke: vi.fn().mockReturnValue(of(void 0)),
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
});
