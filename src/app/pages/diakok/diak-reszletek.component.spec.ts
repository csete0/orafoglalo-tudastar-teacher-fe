import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { DiakReszletekComponent } from './diak-reszletek.component';
import { ReportStore } from '../../services/report/report.store';
import { StudentActivityDetailDto } from '../../models/report.model';

function makeDetail(overrides: Partial<StudentActivityDetailDto> = {}): StudentActivityDetailDto {
  return {
    userId: 1,
    name: 'Browserhunt Diák',
    completedExamsCount: 1,
    averageExamScorePercent: 80,
    totalExamTimeSpentSeconds: 600,
    completedQuizSessionsCount: 2,
    quizAccuracyPercent: 90,
    currentStreak: 3,
    longestStreak: 5,
    badgeCount: 1,
    recentQuizzes: [],
    groups: [],
    recentExams: [],
    ...overrides,
  };
}

describe('DiakReszletekComponent', () => {
  let reportStoreMock: {
    studentDetail: ReturnType<typeof signal<StudentActivityDetailDto | null>>;
    studentDetailLoading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadStudentActivity: ReturnType<typeof vi.fn>;
  };

  function configure(detail: StudentActivityDetailDto) {
    reportStoreMock = {
      studentDetail: signal(detail),
      studentDetailLoading: signal(false),
      error: signal(null),
      loadStudentActivity: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [DiakReszletekComponent],
      providers: [
        provideRouter([]),
        { provide: ReportStore, useValue: reportStoreMock },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
      ],
    });
  }

  // UI-TT-37 (mis-triage correction, 2026-07-23): a 2026-07-17-i triázs kizárólag a
  // stats() kártyák két mezőjét (averageExamScorePercent/quizAccuracyPercent)
  // ellenőrizte - a "Legutóbbi vizsgák" táblázat scorePercent oszlopa VÁLTOZATLANUL a
  // `{{ exam.scorePercent ?? '–' }}%` mintát használta, a `%` a `??` fallback-jén
  // KÍVÜL. A backend (StudentActivityAggregator.cs) `ScorePercent = TotalMax > 0 ? ... :
  // null`-t ad egy BEFEJEZETT (IsCompleted=true) vizsgára is, ha a feladatsor
  // TotalMax-ja 0 - ez a kombináció élesen elérhető, nem csak elméleti.
  it('a "Legutóbbi vizsgák" táblázatban egy befejezett, de null scorePercent-ű vizsga "–"-t mutatna, NEM "–%"-ot', () => {
    configure(
      makeDetail({
        recentExams: [
          {
            sessionId: 1,
            taskSetId: 10,
            taskSetTitle: 'Nulla pontos feladatsor',
            startedAt: new Date().toISOString(),
            isCompleted: true,
            scorePercent: undefined,
            timeSpentSeconds: 120,
          },
        ],
      }),
    );

    const fixture = TestBed.createComponent(DiakReszletekComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('–%');
  });

  it('kontroll: egy 0%-os (de nem null) befejezett vizsgánál helyesen "0%"-ot mutat', () => {
    configure(
      makeDetail({
        recentExams: [
          {
            sessionId: 2,
            taskSetId: 11,
            taskSetTitle: 'Nehéz feladatsor',
            startedAt: new Date().toISOString(),
            isCompleted: true,
            scorePercent: 0,
            timeSpentSeconds: 300,
          },
        ],
      }),
    );

    const fixture = TestBed.createComponent(DiakReszletekComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('0%');
  });

  // PATRICKS-GYAKORLO-ERTEKELES-TERV.md, 6. fázis: „Gyakorló értékelések” blokk.
  describe('Gyakorló értékelések', () => {
    function render(detail: StudentActivityDetailDto): HTMLElement {
      configure(detail);
      const fixture = TestBed.createComponent(DiakReszletekComponent);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('feladatonként mutatja a pontot és a javulást az előző értékeléshez képest', () => {
      const el = render(
        makeDetail({
          practiceGrades: [
            { taskTitle: 'Kamatos kamat', taskSetTitle: 'Python alapok', points: 12, max: 15, createdAt: '2026-10-09T10:00:00Z', previousPoints: 9 },
            { taskTitle: 'Lekérdezés', taskSetTitle: 'SQL', points: 5, max: 10, createdAt: '2026-10-08T10:00:00Z', previousPoints: 7 },
            { taskTitle: 'Első próba', taskSetTitle: 'SQL', points: 4, max: 10, createdAt: '2026-10-07T10:00:00Z' },
          ],
        }),
      );

      const block = el.querySelector('[data-testid="practice-grades"]')!;
      expect(block).not.toBeNull();
      const rows = block.querySelectorAll('tbody tr');
      expect(rows.length).toBe(3);
      expect(rows[0].textContent).toContain('Kamatos kamat');
      expect(rows[0].textContent).toContain('12 / 15');
      expect(rows[0].textContent).toContain('+3 (9 → 12)');
      expect(rows[0].querySelector('.text-success')).not.toBeNull();
      expect(rows[1].textContent).toContain('−2 (7 → 5)');
      expect(rows[1].querySelector('.text-danger')).not.toBeNull();
      // Az első értékelésnél nincs mihez mérni.
      expect(rows[2].textContent).not.toContain('→');
    });

    it('legfeljebb 20 sort mutat, akkor is, ha a BE többet ad', () => {
      const many = Array.from({ length: 25 }, (_, i) => ({
        taskTitle: `Feladat ${i}`, taskSetTitle: 'Sor', points: i, max: 30, createdAt: '2026-10-09T10:00:00Z',
      }));
      const el = render(makeDetail({ practiceGrades: many }));

      expect(el.querySelectorAll('[data-testid="practice-grades"] tbody tr').length).toBe(20);
    });

    it('még futó (pont nélküli) értékelésnél „–”-t mutat, nem „null / null”-t', () => {
      const el = render(
        makeDetail({
          practiceGrades: [{ taskTitle: 'Fut még', taskSetTitle: 'Sor', points: null, max: null, createdAt: '2026-10-09T10:00:00Z', previousPoints: 3 }],
        }),
      );

      const row = el.querySelector('[data-testid="practice-grades"] tbody tr')!;
      expect(row.textContent).not.toContain('null');
      expect(row.textContent).not.toContain('→');
    });

    it('üres listánál és ha a BE nem adja a mezőt, a blokk nem jelenik meg', () => {
      expect(render(makeDetail({ practiceGrades: [] })).textContent).not.toContain('Gyakorló értékelések');
      TestBed.resetTestingModule();
      expect(render(makeDetail()).textContent).not.toContain('Gyakorló értékelések');
    });
  });
});
