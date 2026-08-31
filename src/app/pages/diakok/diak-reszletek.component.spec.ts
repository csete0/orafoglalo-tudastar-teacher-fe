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
});
