import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AdminAiKoltesComponent } from './admin-ai-koltes.component';
import { AdminAiSpendingService } from '../../services/admin/admin-ai-spending.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { AiSpendingOverviewDto, QuizMaintenanceDecisionDto } from '../../models/ai-spending.model';

function makeOverview(overrides: Partial<AiSpendingOverviewDto> = {}): AiSpendingOverviewDto {
  return {
    dailyBySource: [
      { date: '2026-09-20', bySource: { chat: 1.2, maint: 0.5 } },
      { date: '2026-09-21', bySource: { chat: 0.8, studyplan: 4.1 } },
    ],
    monthTotalsBySource: [
      { source: 'chat', totalUsd: 12.5 },
      { source: 'maint', totalUsd: 3.2 },
    ],
    todayTotalUsd: 4.9,
    monthTotalUsd: 15.7,
    myOwnMonthUsd: 1.1,
    automationMonthUsd: 3.7,
    ...overrides,
  };
}

function makeDecision(overrides: Partial<QuizMaintenanceDecisionDto> = {}): QuizMaintenanceDecisionDto {
  return {
    questionId: 1,
    action: 'NoAction',
    oldQuestionText: 'Mi Magyarország fővárosa?',
    newQuestionText: null,
    oldCorrectAnswer: null,
    newCorrectAnswer: null,
    reasoning: null,
    isTeacherOwned: false,
    teacherName: null,
    ...overrides,
  };
}

describe('AdminAiKoltesComponent - AI-KOLTES-PULT', () => {
  let svcMock: Record<string, ReturnType<typeof vi.fn>>;
  let toastMock: { success: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn> };
  let confirmMock: { ask: ReturnType<typeof vi.fn> };

  function configure() {
    svcMock = {
      getOverview: vi.fn().mockReturnValue(of(makeOverview())),
      getTopSpenders: vi.fn().mockReturnValue(of([{ userId: 1, userName: 'Teszt Elek', requestCount: 5, totalUsd: 1.2 }])),
      getRequestLog: vi.fn().mockReturnValue(of({ items: [], totalCount: 0 })),
      getMaintenanceRuns: vi.fn().mockReturnValue(of({ items: [], totalCount: 0 })),
      getAutomationStatus: vi.fn().mockReturnValue(of([])),
      estimateMaintenanceRun: vi.fn().mockReturnValue(of({ candidateCount: 10, estimatedCostUsd: 0.04 })),
      runMaintenance: vi.fn().mockReturnValue(of({ runId: 'abc-123', candidatesReviewed: 10, dryRun: true })),
      getRunDecisions: vi.fn().mockReturnValue(of([makeDecision({ questionId: 1 }), makeDecision({ questionId: 2 })])),
      deactivateQuestion: vi.fn().mockReturnValue(of(undefined)),
      mergeQuestions: vi.fn().mockReturnValue(of({ teacherNotified: false })),
      triggerStudyPlan: vi.fn().mockReturnValue(of({ message: 'ok' })),
      triggerDailyChallenge: vi.fn().mockReturnValue(of({ message: 'ok' })),
    };
    toastMock = { success: vi.fn(), danger: vi.fn() };
    confirmMock = { ask: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [AdminAiKoltesComponent],
      providers: [
        { provide: AdminAiSpendingService, useValue: svcMock },
        { provide: ToastService, useValue: toastMock },
        { provide: ConfirmService, useValue: confirmMock },
      ],
    });
  }

  function createFixture() {
    const fixture = TestBed.createComponent(AdminAiKoltesComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('induláskor betölti az áttekintést és a legtöbbet költőket', () => {
    configure();
    const fixture = createFixture();
    const component = fixture.componentInstance;

    expect(svcMock['getOverview']).toHaveBeenCalledWith(30);
    expect(svcMock['getTopSpenders']).toHaveBeenCalledWith(30, 10);
    expect(component.overview()?.monthTotalUsd).toBe(15.7);
    expect(component.topSpenders().length).toBe(1);
  });

  it('a Kérésnapló fülre váltás betölti a kérésnaplót (lustán, csak első alkalommal)', () => {
    configure();
    const fixture = createFixture();
    const component = fixture.componentInstance;

    component.setTab('naplo');
    expect(svcMock['getRequestLog']).toHaveBeenCalledTimes(1);

    component.setTab('attekintes');
    component.setTab('naplo');
    // Másodszorra már nem tölt újra, mert logItems() nem üres - ez a lusta betöltés lényege.
    expect(svcMock['getRequestLog']).toHaveBeenCalledTimes(1);
  });

  it('szűrés-változtatás visszaállítja az 1. oldalra és újratölti a naplót', () => {
    configure();
    const fixture = createFixture();
    const component = fixture.componentInstance;
    component.logPage.set(3);

    component.logFilter.source = 'chat';
    component.onFilterChange();

    expect(component.logPage()).toBe(1);
    expect(svcMock['getRequestLog']).toHaveBeenLastCalledWith(component.logFilter, 1, 20);
  });

  it('összevonáshoz legfeljebb 2 kérdés jelölhető ki', () => {
    configure();
    const fixture = createFixture();
    const component = fixture.componentInstance;

    component.toggleMergeSelection(1);
    component.toggleMergeSelection(2);
    component.toggleMergeSelection(3);

    expect(component.selectedForMerge().size).toBe(2);
    expect(component.selectedForMerge().has(3)).toBe(false);
  });

  it('a futtatás indítása előtt megerősítést kér, és a törzsben átadja a form adatait', async () => {
    configure();
    const fixture = createFixture();
    const component = fixture.componentInstance;
    component.maintenanceForm = { rangeStartId: 500, rangeEndId: 600, model: 'openai/gpt-4o-mini', dryRun: false };

    await component.runMaintenance();

    expect(confirmMock.ask).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(svcMock['runMaintenance']).toHaveBeenCalledWith({
      rangeStartId: 500,
      rangeEndId: 600,
      model: 'openai/gpt-4o-mini',
      dryRun: false,
    });
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('összevonáskor a megtartott/duplikátum kérdés helyesen kerül szétválasztásra', () => {
    configure();
    const fixture = createFixture();
    const component = fixture.componentInstance;
    component.decisions.set([makeDecision({ questionId: 1 }), makeDecision({ questionId: 2 })]);
    component.selectedForMerge.set(new Set([1, 2]));
    component.mergeKeepId.set(1);

    component.confirmMerge();

    expect(svcMock['mergeQuestions']).toHaveBeenCalledWith({ keepQuestionId: 1, duplicateQuestionId: 2 });
  });
});
