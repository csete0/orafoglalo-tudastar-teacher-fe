import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
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
});
