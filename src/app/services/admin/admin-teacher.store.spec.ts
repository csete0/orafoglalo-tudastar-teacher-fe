import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
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
  };

  function configure() {
    serviceMock = {
      getTeachers: vi.fn(),
      setActive: vi.fn(),
      setQuota: vi.fn(),
      getTaskSets: vi.fn(),
      takedownTaskSet: vi.fn(),
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
      throwError(() => ({ error: { error: 'Szerverhiba' } })),
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
  });
});
