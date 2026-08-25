import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { GroupSeatStore } from './group-seat.store';
import { GroupSeatService } from './group-seat.service';
import { GroupSeatOverviewDto } from '../../models/group-seat.model';

function makeOverview(overrides: Partial<GroupSeatOverviewDto> = {}): GroupSeatOverviewDto {
  return {
    groupId: 1,
    groupName: 'Osztály',
    licenseId: 10,
    tier: 'premium',
    capacity: 5,
    usedSeatsOnLicense: 2,
    holders: [],
    withoutSeat: [],
    ...overrides,
  };
}

describe('GroupSeatStore', () => {
  let serviceMock: {
    getOverview: ReturnType<typeof vi.fn>;
    releaseSeat: ReturnType<typeof vi.fn>;
    releaseAll: ReturnType<typeof vi.fn>;
  };

  function configure() {
    TestBed.configureTestingModule({
      providers: [GroupSeatStore, { provide: GroupSeatService, useValue: serviceMock }],
    });
    return TestBed.inject(GroupSeatStore);
  }

  beforeEach(() => {
    serviceMock = {
      getOverview: vi.fn().mockReturnValue(of(makeOverview())),
      releaseSeat: vi.fn().mockReturnValue(of(void 0)),
      releaseAll: vi.fn().mockReturnValue(of({ releasedCount: 2, skippedInProgress: [] })),
    };
  });

  it('betölti az áttekintést', async () => {
    const store = configure();
    store.load(1);
    await Promise.resolve();

    expect(store.overview()?.licenseId).toBe(10);
    expect(store.hasLicense()).toBe(true);
    expect(store.loading()).toBe(false);
  });

  it('licenc nélküli csoportnál a hasLicense false', async () => {
    serviceMock.getOverview.mockReturnValue(of(makeOverview({ licenseId: null, tier: null, capacity: 0 })));
    const store = configure();
    store.load(1);
    await Promise.resolve();

    expect(store.hasLicense()).toBe(false);
  });

  // Egy next-only subscribe esetén hiba után a store némán üres állapotot mutatna,
  // és egy kezeletlen HttpErrorResponse is landolna (ld. UI-TT-65).
  it('hibánál beállítja az error signalt, nem némán nyel', async () => {
    serviceMock.getOverview.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Ehhez a csoporthoz nincs jogosultságod.' } })),
    );
    const store = configure();
    store.load(1);
    await Promise.resolve();

    expect(store.error()).toBe('Ehhez a csoporthoz nincs jogosultságod.');
    expect(store.loading()).toBe(false);
  });

  it('"óra vége" után eltárolja az eredményt és újratölt', async () => {
    serviceMock.releaseAll.mockReturnValue(of({ releasedCount: 3, skippedInProgress: ['Kiss Anna'] }));
    const store = configure();
    store.releaseAll(1);
    await Promise.resolve();

    expect(store.lastReleaseResult()?.releasedCount).toBe(3);
    expect(store.lastReleaseResult()?.skippedInProgress).toEqual(['Kiss Anna']);
    expect(serviceMock.getOverview).toHaveBeenCalledWith(1);
  });

  it('folyamatban lévő művelet alatt nem indít másodikat', () => {
    const pending = new Subject<void>();
    serviceMock.releaseSeat.mockReturnValue(pending);
    const store = configure();

    store.releaseSeat(1, 42);
    store.releaseSeat(1, 43);

    expect(serviceMock.releaseSeat).toHaveBeenCalledTimes(1);
  });
});
