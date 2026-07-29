import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AdminTeacherStore } from './admin-teacher.store';
import { AdminTeacherService } from './admin-teacher.service';
import { AdminTaskSetDto, TeacherProfileAdminDto } from '../../models/teacher-moderation.model';

function makeTeacher(overrides: Partial<TeacherProfileAdminDto> = {}): TeacherProfileAdminDto {
  return {
    id: 1,
    userId: 10,
    displayName: 'Teszt Tanár',
    email: 'tanar@example.com',
    isActive: true,
    createdAt: new Date().toISOString(),
    taskSetCount: 2,
    groupCount: 1,
    storageUsedBytes: 0,
    maxTaskSets: null,
    maxStorageBytes: null,
    ...overrides,
  };
}

function makeTaskSet(overrides: Partial<AdminTaskSetDto> = {}): AdminTaskSetDto {
  return {
    id: 100,
    title: 'Feladatsor',
    slug: 'tanari-feladatsor',
    description: 'Leírás',
    levelId: 2,
    isPublished: true,
    takedownAt: null,
    createdAt: new Date().toISOString(),
    taskCount: 3,
    ...overrides,
  };
}

describe('AdminTeacherStore', () => {
  let serviceMock: {
    getTeachers: ReturnType<typeof vi.fn>;
    setActive: ReturnType<typeof vi.fn>;
    setQuota: ReturnType<typeof vi.fn>;
    getTaskSets: ReturnType<typeof vi.fn>;
    takedownTaskSet: ReturnType<typeof vi.fn>;
    reinstateTaskSet: ReturnType<typeof vi.fn>;
  };

  function configure() {
    serviceMock = {
      getTeachers: vi.fn(),
      setActive: vi.fn(),
      setQuota: vi.fn(),
      getTaskSets: vi.fn(),
      takedownTaskSet: vi.fn(),
      reinstateTaskSet: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        AdminTeacherStore,
        { provide: AdminTeacherService, useValue: serviceMock },
      ],
    });
  }

  beforeEach(() => configure());

  it('load siker: teachers feltöltve', async () => {
    serviceMock.getTeachers.mockReturnValue(of([makeTeacher()]));

    const store = TestBed.inject(AdminTeacherStore);
    store.load();
    await Promise.resolve();

    expect(store.teachers().length).toBe(1);
    expect(store.loading()).toBe(false);
  });

  it('load hiba esetén error-t állít', async () => {
    serviceMock.getTeachers.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Szerverhiba' } })),
    );

    const store = TestBed.inject(AdminTeacherStore);
    store.load();
    await Promise.resolve();

    expect(store.error()).toBe('Szerverhiba');
  });

  it('setActive siker esetén helyben frissíti a tanár isActive mezőjét', async () => {
    serviceMock.getTeachers.mockReturnValue(of([makeTeacher({ isActive: true })]));
    serviceMock.setActive.mockReturnValue(of({}));

    const store = TestBed.inject(AdminTeacherStore);
    store.load();
    await Promise.resolve();

    store.setActive(1, false);
    await Promise.resolve();

    expect(store.teachers()[0].isActive).toBe(false);
    expect(serviceMock.setActive).toHaveBeenCalledWith(1, false);
  });

  it('selectTeacher betölti a feladatsorokat, majd újra hívva összecsukja', async () => {
    serviceMock.getTaskSets.mockReturnValue(of([makeTaskSet()]));

    const store = TestBed.inject(AdminTeacherStore);
    store.selectTeacher(1);
    await Promise.resolve();

    expect(store.selectedTeacherId()).toBe(1);
    expect(store.taskSets().length).toBe(1);

    store.selectTeacher(1);

    expect(store.selectedTeacherId()).toBeNull();
    expect(store.taskSets().length).toBe(0);
  });

  it('setQuota siker esetén helyben frissíti a kvóta-mezőket', async () => {
    serviceMock.getTeachers.mockReturnValue(of([makeTeacher()]));
    serviceMock.setQuota.mockReturnValue(of({}));

    const store = TestBed.inject(AdminTeacherStore);
    store.load();
    await Promise.resolve();

    store.setQuota(1, 5, 10485760);
    await Promise.resolve();

    expect(store.teachers()[0].maxTaskSets).toBe(5);
    expect(store.teachers()[0].maxStorageBytes).toBe(10485760);
    expect(serviceMock.setQuota).toHaveBeenCalledWith(1, 5, 10485760);
  });

  it('setQuota null értékekkel korlátlanra állít', async () => {
    serviceMock.getTeachers.mockReturnValue(of([makeTeacher({ maxTaskSets: 5, maxStorageBytes: 1000 })]));
    serviceMock.setQuota.mockReturnValue(of({}));

    const store = TestBed.inject(AdminTeacherStore);
    store.load();
    await Promise.resolve();

    store.setQuota(1, null, null);
    await Promise.resolve();

    expect(store.teachers()[0].maxTaskSets).toBeNull();
    expect(store.teachers()[0].maxStorageBytes).toBeNull();
  });

  it('takedownTaskSet siker esetén isPublished=false-ra állítja a listában', async () => {
    serviceMock.getTaskSets.mockReturnValue(of([makeTaskSet({ id: 100, isPublished: true })]));
    serviceMock.takedownTaskSet.mockReturnValue(of({}));

    const store = TestBed.inject(AdminTeacherStore);
    store.selectTeacher(1);
    await Promise.resolve();

    store.takedownTaskSet(100);
    await Promise.resolve();

    expect(store.taskSets()[0].isPublished).toBe(false);
    // A takedownAt jelöli meg, hogy ez ADMIN-döntés volt (nem a tanár piszkozata) -
    // erre épül a feloldó gomb megjelenítése és a szerveroldali publish-tiltás.
    expect(store.taskSets()[0].takedownAt).not.toBeNull();
  });

  it('reinstateTaskSet siker esetén feloldja a takedownt (isPublished=true, takedownAt=null)', async () => {
    serviceMock.getTaskSets.mockReturnValue(
      of([makeTaskSet({ id: 100, isPublished: false, takedownAt: '2026-07-29T10:00:00Z' })]),
    );
    serviceMock.reinstateTaskSet.mockReturnValue(of({}));

    const store = TestBed.inject(AdminTeacherStore);
    store.selectTeacher(1);
    await Promise.resolve();

    store.reinstateTaskSet(100);
    await Promise.resolve();

    expect(serviceMock.reinstateTaskSet).toHaveBeenCalledWith(100);
    expect(store.taskSets()[0].isPublished).toBe(true);
    expect(store.taskSets()[0].takedownAt).toBeNull();
  });

  // UI-TT-117: az AdminApplicationStore.approve()/reject()-től eltérően (ld.
  // admin-application.store.spec.ts "loading true ... egy átfedő ... hívás nem
  // indít második kérést" tesztjeit, UI-TT-11 óta) az AdminTeacherStore
  // setActive()/setQuota()/takedownTaskSet() metódusai SOSEM ellenőriznek
  // semmilyen "már folyamatban van egy kérés" jelet, mielőtt új HTTP-hívást
  // indítanának — egy átfedő második hívás (pl. dupla-kattintás a "Mentés"/
  // "Aktiválás" gombon, amit a admin-tanarok.component.ts sem véd
  // [disabled]-lel) VALÓDI második hálózati kérést indít. Élőben,
  // browser_evaluate-tel egy JS-ticken belüli natív dupla .click()-kel a
  // "Mentés" (kvóta) gombon bizonyítva: KÉT külön POST /api/admin/teachers/
  // {id}/quota ment ki, mindkettő 200 OK-t kapott (staging, tt_staging DB,
  // 2026-07-25). Ez a teszt ugyanezt a mintát reprodukálja a store szintjén,
  // Subject-tel szimulálva egy még-nem-lezárt első kérést.
  it('BUG UI-TT-117 javítva: setQuota()-nál egy átfedő második hívás (dupla-kattintás) NEM indít második HTTP-kérést, a "loading" guard megfogja', async () => {
    serviceMock.getTeachers.mockReturnValue(of([makeTeacher()]));
    const quotaSubject = new Subject<unknown>();
    serviceMock.setQuota.mockReturnValue(quotaSubject.asObservable());

    const store = TestBed.inject(AdminTeacherStore);
    store.load();
    await Promise.resolve();

    store.setQuota(1, 7, null);
    expect(serviceMock.setQuota).toHaveBeenCalledTimes(1);

    // dupla-kattintás, amíg az első kérés még folyamatban van (nincs válasz)
    store.setQuota(1, 7, null);

    // A helyes viselkedés (mint az AdminApplicationStore.approve()-nál) az
    // lenne, hogy a második, átfedő hívás NEM indít újabb kérést, amíg az első
    // válasza meg nem érkezik — ez itt MEGBUKIK, mert nincs ilyen guard.
    expect(serviceMock.setQuota).toHaveBeenCalledTimes(1);

    quotaSubject.next({});
    quotaSubject.complete();
    await Promise.resolve();
  });

  // UI-TT-108: két gyors egymás utáni tanár-kiválasztásnál a KORÁBBAN indított
  // `getTaskSets()` válasza — ha később ér célba — felülírta a MÁR megjelenített,
  // újabb tanár listáját. A `selectedTeacherId()` közben B-t mutatta, tehát egy
  // innen indított `takedownTaskSet()` A tanár tartalmát vonta volna vissza.
  it('BUG UI-TT-108 javítva: selectTeacher — a késve érkező RÉGI tanár feladatsorai nem írják felül az újabbat', async () => {
    const aValasz = new Subject<AdminTaskSetDto[]>();
    const bValasz = new Subject<AdminTaskSetDto[]>();
    serviceMock.getTaskSets.mockReturnValueOnce(aValasz).mockReturnValueOnce(bValasz);

    const store = TestBed.inject(AdminTeacherStore);
    store.selectTeacher(1);
    store.selectTeacher(2);
    expect(serviceMock.getTaskSets).toHaveBeenCalledTimes(2);

    const bFeladatsorok = [makeTaskSet({ id: 200, title: 'B tanár feladatsora' })];
    bValasz.next(bFeladatsorok);
    bValasz.complete();
    await Promise.resolve();
    expect(store.taskSets()).toEqual(bFeladatsorok);

    aValasz.next([makeTaskSet({ id: 100, title: 'A tanár feladatsora' })]);
    aValasz.complete();
    await Promise.resolve();

    // A megjelenített lista és a kiválasztott tanár mostantól garantáltan egyezik —
    // ez az, ami a rossz célpontú `takedownTaskSet()`-et kizárja.
    expect(store.taskSets()).toEqual(bFeladatsorok);
    expect(store.selectedTeacherId()).toBe(2);
  });

  // A bezáró (deszelektáló) ág is léptet generációt: enélkül egy még folyamatban
  // lévő lekérdezés késve érkező válasza visszatöltötte volna a listát egy már
  // becsukott sorhoz.
  it('BUG UI-TT-108 javítva: a sor becsukása után késve érkező válasz nem tölti vissza a listát', async () => {
    const aValasz = new Subject<AdminTaskSetDto[]>();
    serviceMock.getTaskSets.mockReturnValueOnce(aValasz);

    const store = TestBed.inject(AdminTeacherStore);
    store.selectTeacher(1);
    store.selectTeacher(1); // ugyanaz az id → deszelektál

    expect(store.selectedTeacherId()).toBeNull();

    aValasz.next([makeTaskSet({ id: 100 })]);
    aValasz.complete();
    await Promise.resolve();

    expect(store.taskSets()).toEqual([]);
    expect(store.taskSetsLoading()).toBe(false);
  });
});
