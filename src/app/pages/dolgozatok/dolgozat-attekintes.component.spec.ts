import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { DolgozatAttekintesComponent } from './dolgozat-attekintes.component';
import { ClassTestService } from '../../services/class-test/class-test.service';
import { ClassTestOverview } from '../../models/class-test.model';
import { ReportStore } from '../../services/report/report.store';
import { ResultsCsvExportService } from '../../services/export/results-csv-export.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';

function makeOverview(overrides: Partial<ClassTestOverview> = {}): ClassTestOverview {
  return {
    assignmentId: 7, taskSetId: 44, taskSetTitle: 'Tömbök', groupId: 3, groupName: '11.B',
    opensAt: '2026-10-05T08:00:00Z', dueAt: '2026-10-05T08:50:00Z', timeLimitSeconds: 2700,
    resultsPublishedAt: null, serverNow: '2026-10-05T09:30:00Z', canPublish: true,
    tasks: [{ taskId: 1, title: 'Prog', maxPoints: 10 }, { taskId: 2, title: 'SQL', maxPoints: 10 }],
    students: [
      {
        userId: 1, name: 'Kiss Anna', status: 'submitted', examSessionId: 90, startedAt: null, submittedAt: null,
        remainingSeconds: null, timeLimitReached: false, earnedPoints: 14, maxPoints: 20, needsManualGrading: false,
        tasks: [
          { taskId: 1, attemptId: 101, earnedPoints: 7, maxPoints: 10, isOverridden: false },
          { taskId: 2, attemptId: 102, earnedPoints: 7, maxPoints: 10, isOverridden: true },
        ],
        focusLossCount: 3, pasteCount: 2, pastedChars: 150,
      },
      {
        userId: 2, name: 'Nagy Béla', status: 'in_progress', examSessionId: 91, startedAt: null, submittedAt: null,
        remainingSeconds: 125, timeLimitReached: false, earnedPoints: null, maxPoints: null, needsManualGrading: false,
        tasks: [
          { taskId: 1, attemptId: 201, earnedPoints: null, maxPoints: 10, isOverridden: false },
          { taskId: 2, attemptId: 202, earnedPoints: null, maxPoints: 10, isOverridden: false },
        ],
        focusLossCount: 0, pasteCount: 0, pastedChars: 0,
      },
    ],
    stats: {
      notStarted: 0, inProgress: 1, submitted: 1, averagePercent: 70, medianPercent: 70,
      gradeDistribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 0 },
      taskAverages: [{ taskId: 1, averagePercent: 70 }, { taskId: 2, averagePercent: 70 }],
    },
    aiGradedThisMonth: 12, aiMonthlyLimit: 300,
    ...overrides,
  };
}

describe('DolgozatAttekintesComponent', () => {
  function setup(overview = makeOverview()) {
    const classTests = { getOverview: vi.fn().mockReturnValue(of(overview)), publish: vi.fn().mockReturnValue(of(undefined)) };
    const confirm = { ask: vi.fn().mockResolvedValue(true) };
    const toast = { success: vi.fn(), warning: vi.fn(), danger: vi.fn() };
    TestBed.configureTestingModule({
      imports: [DolgozatAttekintesComponent],
      providers: [
        provideRouter([]),
        { provide: ClassTestService, useValue: classTests },
        { provide: ConfirmService, useValue: confirm },
        { provide: ToastService, useValue: toast },
        {
          provide: ReportStore,
          useValue: { attemptReview: signal(null), reviewLoading: signal(false), taskSetResultsLoading: signal(false), loadAttemptReview: vi.fn(), clearAttemptReview: vi.fn() },
        },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '7' } } } },
      ],
    });
    const fixture = TestBed.createComponent(DolgozatAttekintesComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, classTests, confirm, toast, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('a névsort állapottal, hátralévő idővel, pontokkal és integritás-jelzéssel mutatja', () => {
    const { el, classTests } = setup();

    expect(classTests.getOverview).toHaveBeenCalledWith(7);
    expect(el.textContent).toContain('Kiss Anna');
    expect(el.textContent).toContain('14 / 20');
    expect(el.textContent).toContain('(70%)');
    expect(el.textContent).toContain('írja');
    expect(el.textContent).toContain('2:05');
    expect(el.textContent).toContain('3 / 2');
    expect(el.textContent).toContain('(tanári)');
    expect(el.textContent).not.toMatch(/gyanú|csalás/i);
  });

  it('közzététel megerősítéssel; a határidő előtt a gomb tiltott', async () => {
    const { component, classTests, confirm, toast } = setup();
    await component.publish(component.overview()!);
    expect(confirm.ask).toHaveBeenCalled();
    expect(classTests.publish).toHaveBeenCalledWith(7);
    expect(toast.success).toHaveBeenCalledWith('Eredmények közzétéve.');

    TestBed.resetTestingModule();
    const early = setup(makeOverview({ canPublish: false }));
    const button = [...early.el.querySelectorAll('button')].find((b) => b.textContent?.includes('Eredmények közzététele')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(early.el.textContent).toContain('a megírási idő lejárta után');
  });

  it('közzététel után a gomb helyett "Közzétéve" jelvény', () => {
    const { el } = setup(makeOverview({ resultsPublishedAt: '2026-10-05T10:00:00Z' }));
    expect(el.textContent).toContain('Közzétéve');
    expect([...el.querySelectorAll('button')].some((b) => b.textContent?.includes('Eredmények közzététele'))).toBe(false);
  });

  it('pontra kattintva megnyitja az értékelő panelt az adott beadásra', () => {
    const { fixture, el } = setup();
    (el.querySelector('tbody button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('app-attempt-review-panel')).not.toBeNull();
    expect(TestBed.inject(ReportStore).loadAttemptReview).toHaveBeenCalledWith(101);
  });

  it('a CSV-export a meglévő exportálót kapja a dolgozat adataival', () => {
    const { component } = setup();
    const exportSpy = vi.spyOn(TestBed.inject(ResultsCsvExportService), 'exportTaskSetResults').mockImplementation(() => {});

    component.exportCsv(component.overview()!);

    expect(exportSpy).toHaveBeenCalledWith(expect.objectContaining({
      taskSetId: 44,
      title: 'Tömbök - dolgozat',
      students: expect.arrayContaining([expect.objectContaining({ name: 'Kiss Anna', isCompleted: true, totalEarnedPoints: 14 })]),
    }));
  });
});
