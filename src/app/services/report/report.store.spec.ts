import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { ReportStore } from './report.store';
import { ReportService } from './report.service';
import {
  StudentActivityDetailDto,
  StudentActivitySummaryDto,
  TeacherTaskSetResultsDto,
} from '../../models/report.model';

function makeSummary(overrides: Partial<StudentActivitySummaryDto> = {}): StudentActivitySummaryDto {
  return {
    userId: 1,
    name: 'Teszt Diák',
    completedExamsCount: 3,
    totalExamTimeSpentSeconds: 1200,
    completedQuizSessionsCount: 5,
    currentStreak: 2,
    longestStreak: 4,
    badgeCount: 1,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<StudentActivityDetailDto> = {}): StudentActivityDetailDto {
  return { ...makeSummary(), recentExams: [], ...overrides };
}

function makeTaskSetResults(overrides: Partial<TeacherTaskSetResultsDto> = {}): TeacherTaskSetResultsDto {
  return { taskSetId: 1, title: 'Teszt feladatsor', tasks: [], students: [], ...overrides };
}

describe('ReportStore', () => {
  let serviceMock: {
    getGroupActivity: ReturnType<typeof vi.fn>;
    getSchoolActivity: ReturnType<typeof vi.fn>;
    getStudentActivity: ReturnType<typeof vi.fn>;
    getTaskSetResults: ReturnType<typeof vi.fn>;
  };
  let store: ReportStore;

  function configure() {
    serviceMock = {
      getGroupActivity: vi.fn(),
      getSchoolActivity: vi.fn(),
      getStudentActivity: vi.fn(),
      getTaskSetResults: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: ReportService, useValue: serviceMock }],
    });
    store = TestBed.inject(ReportStore);
  }

  beforeEach(() => configure());

  it('loadGroupActivity siker: groupActivity beállítva, loading()=false', async () => {
    serviceMock.getGroupActivity.mockReturnValue(of([makeSummary()]));

    store.loadGroupActivity(10);
    await Promise.resolve();

    expect(store.groupActivity()).toEqual([makeSummary()]);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('loadGroupActivity hiba: error beállítva, groupActivity üres marad', async () => {
    serviceMock.getGroupActivity.mockReturnValue(throwError(() => ({ error: { errorMessage: 'Nincs jogosultság.' } })));

    store.loadGroupActivity(10);
    await Promise.resolve();

    expect(store.error()).toBe('Nincs jogosultság.');
    expect(store.groupActivity()).toEqual([]);
  });

  it('loadSchoolActivity siker: schoolActivity beállítva', async () => {
    serviceMock.getSchoolActivity.mockReturnValue(of([makeSummary({ userId: 2 })]));

    store.loadSchoolActivity(20);
    await Promise.resolve();

    expect(store.schoolActivity()).toEqual([makeSummary({ userId: 2 })]);
  });

  it('loadSchoolActivity hiba esetén a dedikált "intézmény-admin szerep kell" üzenetet állítja', async () => {
    serviceMock.getSchoolActivity.mockReturnValue(throwError(() => ({ error: {} })));

    store.loadSchoolActivity(20);
    await Promise.resolve();

    expect(store.error()).toBe('Ehhez a riporthoz intézmény-admin szerep kell.');
  });

  it('loadStudentActivity siker: studentDetail beállítva', async () => {
    const detail = makeDetail({ recentExams: [{ sessionId: 1, taskSetId: 1, taskSetTitle: 't', startedAt: new Date().toISOString(), isCompleted: true, timeSpentSeconds: 300 }] });
    serviceMock.getStudentActivity.mockReturnValue(of(detail));

    store.loadStudentActivity(1);
    await Promise.resolve();

    expect(store.studentDetail()).toEqual(detail);
  });

  it('loadStudentActivity hiba esetén error-t állít, studentDetail null marad', async () => {
    serviceMock.getStudentActivity.mockReturnValue(throwError(() => ({ error: { errorMessage: 'A diák nem tagja egyik csoportodnak sem.' } })));

    store.loadStudentActivity(1);
    await Promise.resolve();

    expect(store.error()).toBe('A diák nem tagja egyik csoportodnak sem.');
    expect(store.studentDetail()).toBeNull();
  });

  it('loadTaskSetResults siker: taskSetResults beállítva', async () => {
    serviceMock.getTaskSetResults.mockReturnValue(of(makeTaskSetResults()));

    store.loadTaskSetResults(1);
    await Promise.resolve();

    expect(store.taskSetResults()).toEqual(makeTaskSetResults());
  });

  it('loadTaskSetResults hiba esetén error-t állít, taskSetResults null marad', async () => {
    serviceMock.getTaskSetResults.mockReturnValue(throwError(() => ({ error: {} })));

    store.loadTaskSetResults(1);
    await Promise.resolve();

    expect(store.error()).toBe('Az eredmény-mátrix betöltése sikertelen.');
    expect(store.taskSetResults()).toBeNull();
  });

  // Mindegyik load* metódus a HÍVÁS ELEJÉN, szinkron módon üríti a saját
  // szeletét (üres tömb/null), mielőtt a válasz megérkezne - enélkül egy
  // MÁSIK diák/csoport/feladatsor adatlapjára navigálva átmenetileg a
  // KORÁBBAN megtekintett entitás adatai látszanának az ÚJ oldalon.
  it('loadStudentActivity induláskor azonnal töröl egy korábban betöltött studentDetail-t', () => {
    serviceMock.getStudentActivity.mockReturnValueOnce(of(makeDetail({ userId: 1 })));
    store.loadStudentActivity(1);
    expect(store.studentDetail()?.userId).toBe(1);

    const pending$ = new Subject<StudentActivityDetailDto>();
    serviceMock.getStudentActivity.mockReturnValueOnce(pending$);
    store.loadStudentActivity(2);

    expect(store.studentDetail()).toBeNull();
  });

  it('clearError üríti a hibaüzenetet', async () => {
    serviceMock.getGroupActivity.mockReturnValue(throwError(() => ({ error: {} })));
    store.loadGroupActivity(10);
    await Promise.resolve();
    expect(store.error()).not.toBeNull();

    store.clearError();
    expect(store.error()).toBeNull();
  });
});
