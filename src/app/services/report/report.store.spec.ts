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

  it('loadGroupActivity: egy korábban indított, de KÉSŐBB megérkező hívás válasza nem írja felül egy közben elindított, MÁR megérkezett újabb csoport adatait', async () => {
    const groupAResponse = new Subject<StudentActivitySummaryDto[]>();
    const groupBResponse = new Subject<StudentActivitySummaryDto[]>();
    serviceMock.getGroupActivity.mockReturnValueOnce(groupAResponse).mockReturnValueOnce(groupBResponse);

    // A tanár megnyitja "A" csoport Eredmények fülét (lassú hálózat)...
    store.loadGroupActivity(1);
    // ...majd MIELŐTT a válasz megérkezne, átnavigál "B" csoport Eredmények fülére.
    store.loadGroupActivity(2);
    expect(serviceMock.getGroupActivity).toHaveBeenCalledTimes(2);

    // "B" gyors válasza előbb érkezik meg és helyesen megjelenik.
    const groupBResult = [makeSummary({ userId: 2, name: 'B csoport diákja' })];
    groupBResponse.next(groupBResult);
    groupBResponse.complete();
    await Promise.resolve();
    expect(store.groupActivity()).toEqual(groupBResult);

    // "A" elavult, KÉSŐN érkező válasza nem írhatja felül "B" már megjelenített adatait.
    const groupAResult = [makeSummary({ userId: 1, name: 'A csoport diákja' })];
    groupAResponse.next(groupAResult);
    groupAResponse.complete();
    await Promise.resolve();
    expect(store.groupActivity()).toEqual(groupBResult);
  });

  it('loadSchoolActivity: egy korábban indított, de KÉSŐBB megérkező hívás válasza nem írja felül egy közben elindított, MÁR megérkezett újabb intézmény adatait', async () => {
    const schoolAResponse = new Subject<StudentActivitySummaryDto[]>();
    const schoolBResponse = new Subject<StudentActivitySummaryDto[]>();
    serviceMock.getSchoolActivity.mockReturnValueOnce(schoolAResponse).mockReturnValueOnce(schoolBResponse);

    store.loadSchoolActivity(10);
    store.loadSchoolActivity(20);
    expect(serviceMock.getSchoolActivity).toHaveBeenCalledTimes(2);

    const schoolBResult = [makeSummary({ userId: 4, name: 'B intézmény diákja' })];
    schoolBResponse.next(schoolBResult);
    schoolBResponse.complete();
    await Promise.resolve();
    expect(store.schoolActivity()).toEqual(schoolBResult);

    const schoolAResult = [makeSummary({ userId: 3, name: 'A intézmény diákja' })];
    schoolAResponse.next(schoolAResult);
    schoolAResponse.complete();
    await Promise.resolve();
    expect(store.schoolActivity()).toEqual(schoolBResult);
  });

  it('clearError üríti a hibaüzenetet', async () => {
    serviceMock.getGroupActivity.mockReturnValue(throwError(() => ({ error: {} })));
    store.loadGroupActivity(10);
    await Promise.resolve();
    expect(store.error()).not.toBeNull();

    store.clearError();
    expect(store.error()).toBeNull();
  });

  // ── 7. fázis: dátum-tartomány szűrő ─────────────────────────
  //
  // A szűrő-váltás UGYANARRA az entitásra hívja újra a loadert, csak más
  // paraméterrel — tehát két kérés versenyezhet ugyanazon az id-n. Ez a
  // generáció-számláló eddig csak entitás-váltásra volt bizonyítva.

  it('loadGroupActivity: a szűrő-váltás átadja a from/to paramétereket a service-nek', () => {
    serviceMock.getGroupActivity.mockReturnValue(of([]));
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 5, 1);

    store.loadGroupActivity(7, from, to);

    expect(serviceMock.getGroupActivity).toHaveBeenCalledWith(7, from, to);
  });

  it('loadGroupActivity: UGYANAZON a csoporton szűrőt váltva a késve érkező RÉGI válasz nem írja felül az újat', async () => {
    const regiSzuro = new Subject<StudentActivitySummaryDto[]>();
    const ujSzuro = new Subject<StudentActivitySummaryDto[]>();
    serviceMock.getGroupActivity.mockReturnValueOnce(regiSzuro).mockReturnValueOnce(ujSzuro);

    // Ugyanaz a csoport (id=1), csak más időszak.
    store.loadGroupActivity(1, new Date(2026, 0, 1), new Date(2026, 1, 1));
    store.loadGroupActivity(1, new Date(2026, 3, 1), new Date(2026, 4, 1));

    const ujEredmeny = [makeSummary({ userId: 2, name: 'Új szűrő' })];
    ujSzuro.next(ujEredmeny);
    ujSzuro.complete();
    await Promise.resolve();
    expect(store.groupActivity()).toEqual(ujEredmeny);

    regiSzuro.next([makeSummary({ userId: 1, name: 'Régi szűrő' })]);
    regiSzuro.complete();
    await Promise.resolve();
    expect(store.groupActivity()).toEqual(ujEredmeny);
  });

  it('loadGroupActivity: UGYANAZON a csoporton szűrőt váltva a régi adat LÁTSZIK, amíg az új meg nem érkezik', () => {
    const elsoValasz = new Subject<StudentActivitySummaryDto[]>();
    serviceMock.getGroupActivity.mockReturnValueOnce(elsoValasz).mockReturnValueOnce(new Subject());

    store.loadGroupActivity(1);
    const elsoEredmeny = [makeSummary({ userId: 1, name: 'Első' })];
    elsoValasz.next(elsoEredmeny);
    elsoValasz.complete();
    expect(store.groupActivity()).toEqual(elsoEredmeny);

    // UI-TT-72 mintája: szűrő-váltás UGYANARRA a csoportra nem ürítheti ki a
    // táblát, különben minden váltásnál felvillanna a "Nincs adat." üres állapot.
    store.loadGroupActivity(1, new Date(2026, 0, 1));
    expect(store.groupActivity()).toEqual(elsoEredmeny);
  });

  it('loadGroupActivity: MÁSIK csoportra váltva viszont azonnal ürít', () => {
    const elsoValasz = new Subject<StudentActivitySummaryDto[]>();
    serviceMock.getGroupActivity.mockReturnValueOnce(elsoValasz).mockReturnValueOnce(new Subject());

    store.loadGroupActivity(1);
    elsoValasz.next([makeSummary({ userId: 1 })]);
    elsoValasz.complete();
    expect(store.groupActivity().length).toBe(1);

    store.loadGroupActivity(2);
    expect(store.groupActivity()).toEqual([]);
  });

  it('loadStudentActivity: szűrő-váltáskor a régi részletek LÁTSZANAK, nem villan spinner', () => {
    const elsoValasz = new Subject<StudentActivityDetailDto>();
    serviceMock.getStudentActivity.mockReturnValueOnce(elsoValasz).mockReturnValueOnce(new Subject());

    store.loadStudentActivity(5);
    const detail = makeDetail({ userId: 5 });
    elsoValasz.next(detail);
    elsoValasz.complete();
    expect(store.studentDetail()).toEqual(detail);

    store.loadStudentActivity(5, new Date(2026, 0, 1));
    expect(store.studentDetail()).toEqual(detail);
  });
});
