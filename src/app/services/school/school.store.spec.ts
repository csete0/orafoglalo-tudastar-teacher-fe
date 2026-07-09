import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
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
  };

  function configure() {
    serviceMock = {
      getMine: vi.fn(),
      create: vi.fn(),
      join: vi.fn(),
      delete: vi.fn(),
      getMembers: vi.fn(),
      getSchoolGroups: vi.fn(),
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
    serviceMock.getMembers.mockReturnValue(throwError(() => ({ error: { error: 'Nincs jogosultságod.' } })));

    const store = TestBed.inject(SchoolStore);
    store.loadMembers(1);
    await Promise.resolve();

    expect(store.error()).toBe('Nincs jogosultságod.');
  });
});
