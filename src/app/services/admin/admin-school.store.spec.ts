import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AdminSchoolStore } from './admin-school.store';
import { AdminSchoolService } from './admin-school.service';
import { SchoolAdminDto, SchoolMergeResultDto } from '../../models/teacher-moderation.model';

function makeSchool(overrides: Partial<SchoolAdminDto> = {}): SchoolAdminDto {
  return {
    id: 1,
    name: 'Forrás Suli',
    createdAt: new Date().toISOString(),
    teacherCount: 1,
    groupCount: 2,
    adminDisplayNames: ['Teszt Tanár'],
    ...overrides,
  };
}

function makeMergeResult(overrides: Partial<SchoolMergeResultDto> = {}): SchoolMergeResultDto {
  return {
    movedGroups: 2,
    movedMemberships: 1,
    mergedDuplicateMemberships: 0,
    ...overrides,
  };
}

describe('AdminSchoolStore', () => {
  let serviceMock: {
    getSchools: ReturnType<typeof vi.fn>;
    merge: ReturnType<typeof vi.fn>;
  };

  function configure() {
    serviceMock = {
      getSchools: vi.fn(),
      merge: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        AdminSchoolStore,
        { provide: AdminSchoolService, useValue: serviceMock },
      ],
    });
  }

  beforeEach(() => configure());

  it('load betölti az intézmény-listát', async () => {
    serviceMock.getSchools.mockReturnValue(of([makeSchool()]));

    const store = TestBed.inject(AdminSchoolStore);
    store.load();
    await Promise.resolve();

    expect(store.schools().length).toBe(1);
    expect(store.loading()).toBe(false);
  });

  // UI-TT-65: load() korábban egy sima next-only callbackkel subscribe-olt -
  // hiba esetén az error()-je sosem állt be, ÉS egy kezeletlen RxJS-kivétel is
  // landolt (a "ERROR HttpErrorResponse" konzol-tünet).
  it('BUG UI-TT-65 javítva: load() hiba esetén beállítja az error jelzőt, nem dob kezeletlen kivételt', async () => {
    serviceMock.getSchools.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Nincs jogosultság.' } })),
    );

    const store = TestBed.inject(AdminSchoolStore);
    store.load();
    await Promise.resolve();

    expect(store.error()).toBe('Nincs jogosultság.');
    expect(store.loading()).toBe(false);
  });

  it('merge siker esetén elmenti az eredményt és újratölti a listát', async () => {
    serviceMock.getSchools.mockReturnValue(of([makeSchool({ id: 2, name: 'Cél Suli' })]));
    serviceMock.merge.mockReturnValue(of(makeMergeResult()));

    const store = TestBed.inject(AdminSchoolStore);
    store.merge(1, 2);
    await Promise.resolve();

    expect(serviceMock.merge).toHaveBeenCalledWith(1, 2);
    expect(store.lastMergeResult()).toEqual(makeMergeResult());
    // az egyesítés után a lista is újratöltődik
    expect(serviceMock.getSchools).toHaveBeenCalled();
    expect(store.schools()[0].name).toBe('Cél Suli');
  });

  it('clearLastMergeResult törli az eredményt', async () => {
    serviceMock.getSchools.mockReturnValue(of([]));
    serviceMock.merge.mockReturnValue(of(makeMergeResult()));

    const store = TestBed.inject(AdminSchoolStore);
    store.merge(1, 2);
    await Promise.resolve();
    expect(store.lastMergeResult()).not.toBeNull();

    store.clearLastMergeResult();
    expect(store.lastMergeResult()).toBeNull();
  });

  // UI-TT-10: egy sikertelen egyesítés ne hagyjon se kezeletlen hibát, se
  // egy ellentmondó, korábbi sikeres eredményt a képernyőn.
  it('merge hiba esetén beállítja az error jelet, és törli a korábbi (immár félrevezető) sikeres eredményt', async () => {
    serviceMock.getSchools.mockReturnValue(of([makeSchool()]));
    serviceMock.merge.mockReturnValueOnce(of(makeMergeResult()));

    const store = TestBed.inject(AdminSchoolStore);
    store.merge(1, 2);
    await Promise.resolve();
    expect(store.lastMergeResult()).not.toBeNull();

    serviceMock.merge.mockReturnValueOnce(
      throwError(() => ({ error: { errorMessage: 'A forrás intézmény már nem létezik.' } })),
    );
    store.merge(1, 3);
    await Promise.resolve();

    expect(store.error()).toBe('A forrás intézmény már nem létezik.');
    expect(store.lastMergeResult()).toBeNull();
    expect(store.loading()).toBe(false);
  });

  // UI-TT-23: egy még folyamatban lévő egyesítés alatt egy második merge()
  // hívás nem indíthat el egy átfedő kérést.
  it('loading true a merge kérés alatt, és egy átfedő merge() hívás nem indít második kérést', async () => {
    serviceMock.getSchools.mockReturnValue(of([]));
    const mergeSubject = new Subject<SchoolMergeResultDto>();
    serviceMock.merge.mockReturnValue(mergeSubject.asObservable());

    const store = TestBed.inject(AdminSchoolStore);
    store.merge(1, 2);

    expect(store.loading()).toBe(true);
    expect(serviceMock.merge).toHaveBeenCalledTimes(1);

    // átfedő hívás, amíg az első még folyamatban van
    store.merge(1, 3);
    expect(serviceMock.merge).toHaveBeenCalledTimes(1);

    mergeSubject.next(makeMergeResult());
    mergeSubject.complete();
    await Promise.resolve();

    expect(store.loading()).toBe(false);
  });
});
