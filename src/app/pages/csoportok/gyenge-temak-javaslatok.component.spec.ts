import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { accessLabel, assignErrorMessage, GyengeTemakJavaslatokComponent } from './gyenge-temak-javaslatok.component';
import { ReportService } from '../../services/report/report.service';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { ToastService } from '../../shared/toast/toast.service';
import { WeakTopicSuggestionDto, WeakTopicSummaryDto } from '../../models/report.model';

function suggestion(overrides: Partial<WeakTopicSuggestionDto>): WeakTopicSuggestionDto {
  return {
    kind: 'taskSet', source: 'own', id: 1, title: 'Sor', itemCount: 4, isPaid: false, requiredTier: 'none',
    action: 'assign', assignTaskSetId: 1, canCopy: false, ...overrides,
  };
}

const OWN = suggestion({ id: 11, title: 'Saját SQL gyakorló', assignTaskSetId: 11 });
const CATALOG = suggestion({ id: 501, source: 'catalog', title: 'SQL érettségi 2024', isPaid: true, requiredTier: 'subscription', action: 'copyAssign', assignTaskSetId: null, canCopy: true });
const PREMIUM_BLOCKED = suggestion({ id: 502, source: 'catalog', title: 'Prémium sor', isPaid: true, requiredTier: 'premium', action: 'none', assignTaskSetId: null });
const ASSIGNED = suggestion({ id: 12, title: 'Már kiadott', action: 'assigned' });
const QUIZ = suggestion({ kind: 'quiz', id: 33, title: 'SQL kvíz', itemCount: 6, action: 'assign', assignTaskSetId: null });

function summary(overrides: Partial<WeakTopicSummaryDto> = {}): WeakTopicSummaryDto {
  return {
    groupId: 5, groupName: '9.A', threshold: 50, canAssign: true,
    sentences: ['A 9.A csoport 3 leggyengébb kvíz-témaköre: „SQL alapok” (10%).', 'A fizetős feladatsorokhoz a diákoknak előfizetés vagy intézményi licenc kell.'],
    topics: [{
      topicId: 14, topicName: 'SQL alapok', topicColor: null, topicIcon: null, successRate: 11.5, studentCount: 3, weakStudentCount: 3,
      trend: { direction: 'improving', recentPercent: 60, previousPercent: 20, recentAnswers: 10, previousAnswers: 10 },
      matchedTaskTypes: ['sql'], sentences: [],
      taskSets: [OWN, CATALOG, PREMIUM_BLOCKED, ASSIGNED], quizzes: [QUIZ],
    }],
    ...overrides,
  };
}

describe('GyengeTemakJavaslatokComponent', () => {
  let reports: { getGroupWeakTopicSummary: ReturnType<typeof vi.fn> };
  let taskSets: { assignToGroup: ReturnType<typeof vi.fn>; catalogAssign: ReturnType<typeof vi.fn> };
  let quizzes: { assignToGroup: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

  function create(response: unknown = of(summary())) {
    reports = { getGroupWeakTopicSummary: vi.fn(() => response) };
    taskSets = {
      assignToGroup: vi.fn(() => of({ id: 1 })),
      catalogAssign: vi.fn(() => of({ taskSetId: 777, copied: true, published: true, assignment: { id: 9 }, warnings: [] })),
    };
    quizzes = { assignToGroup: vi.fn(() => of({ id: 2 })) };
    toast = { success: vi.fn(), warning: vi.fn() };
    TestBed.configureTestingModule({
      imports: [GyengeTemakJavaslatokComponent],
      providers: [
        { provide: ReportService, useValue: reports },
        { provide: TeacherTaskSetService, useValue: taskSets },
        { provide: TeacherQuizService, useValue: quizzes },
        { provide: ToastService, useValue: toast },
      ],
    });
    const fixture = TestBed.createComponent(GyengeTemakJavaslatokComponent);
    fixture.componentRef.setInput('groupId', 5);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance };
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  afterEach(() => TestBed.resetTestingModule());

  it('az összefoglaló mondatai és a témakör-kártya a javaslatokkal (típus, forrás, fizetős jelzés)', () => {
    const { fixture } = create();
    expect(reports.getGroupWeakTopicSummary).toHaveBeenCalledWith(5);
    expect(q(fixture, 'weak-summary-sentences')!.textContent).toContain('3 leggyengébb kvíz-témaköre');

    const card = q(fixture, 'weak-topic-14')!;
    expect(card.textContent).toContain('Gyakorlás: SQL alapok');
    // Az összefoglaló mondataival egyezően lefelé kerekítve (11.5 → 11%).
    expect(card.textContent).toContain('11% helyes');
    expect(card.textContent).not.toContain('11.5');
    expect(card.textContent).toContain('2 hét alatt javul (20% → 60%)');

    const catalog = q(fixture, 'weak-suggestion-taskSet-501')!;
    expect(catalog.textContent).toContain('Hivatalos');
    expect(q(fixture, 'weak-access-taskSet-501')!.textContent).toContain('Fizetős');
    expect(q(fixture, 'weak-paid-taskSet-501')!.textContent).toContain('diákjaidnak előfizetés vagy iskolai licenc kell');

    expect(q(fixture, 'weak-suggestion-taskSet-11')!.textContent).toContain('Saját');
    expect(q(fixture, 'weak-access-taskSet-11')!.textContent).toContain('Ingyenes');
    expect(q(fixture, 'weak-paid-taskSet-11')).toBeNull();
    expect(q(fixture, 'weak-suggestion-quiz-33')!.textContent).toContain('6 kérdés a témakörből');
  });

  it('állapotok: már kiadott → „Kiadva”; nem másolható → tiltott gomb az okkal', () => {
    const { fixture } = create();
    expect(q(fixture, 'weak-assigned-taskSet-12')!.textContent).toContain('Kiadva');
    expect(q(fixture, 'weak-assign-taskSet-12')).toBeNull();
    expect(q(fixture, 'weak-blocked-taskSet-502')!.textContent).toContain('Prémium előfizetés kell');
    const button = q(fixture, 'weak-assign-taskSet-502') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe('weak-blocked-taskSet-502');
  });

  it('„none” a szerver okával (visszavont másolat)', () => {
    const takenDown = suggestion({ id: 503, source: 'catalog', title: 'Visszavont', action: 'none', assignTaskSetId: null,
      reason: 'A korábbi másolatodat a platform-admin visszavonta - ez a feladatsor így nem adható ki.' });
    const base = summary();
    const { fixture } = create(of(summary({ topics: [{ ...base.topics[0], taskSets: [takenDown], quizzes: [] }] })));
    expect(q(fixture, 'weak-blocked-taskSet-503')!.textContent).toContain('platform-admin visszavonta');
    expect((q(fixture, 'weak-assign-taskSet-503') as HTMLButtonElement).disabled).toBe(true);
  });

  it('folyamatban lévő másolás (CopyInProgress): érthető toast, nincs tartós hiba, újra kattintható', () => {
    const { fixture, c } = create();
    taskSets.catalogAssign.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { errorType: 'CopyInProgress', errorMessage: 'x' } })));
    c.act(CATALOG);
    c.confirmCatalog();
    fixture.detectChanges();
    expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining('folyamatban'));
    expect(q(fixture, 'weak-catalog-error')).toBeNull();
    expect(c.busyKey()).toBeNull();
  });

  it('témakör nélküli összefoglalónál nem mutat mondatot', () => {
    const { fixture } = create(of(summary({ topics: [] })));
    expect(q(fixture, 'weak-summary-sentences')).toBeNull();
  });

  it('saját feladatsor: egy kattintás → a meglévő kiadási API az assignTaskSetId-val, utána „Kiadva”', () => {
    const { fixture } = create();
    q(fixture, 'weak-assign-taskSet-11')!.click();
    fixture.detectChanges();
    expect(taskSets.assignToGroup).toHaveBeenCalledWith(11, { groupId: 5 });
    expect(q(fixture, 'weak-assigned-taskSet-11')).not.toBeNull();
    expect(toast.success).toHaveBeenCalled();
  });

  it('saját kvíz: a kvíz-kiadás API az id-val', () => {
    const { fixture } = create();
    q(fixture, 'weak-assign-quiz-33')!.click();
    fixture.detectChanges();
    expect(quizzes.assignToGroup).toHaveBeenCalledWith(33, { groupId: 5 });
    expect(q(fixture, 'weak-assigned-quiz-33')).not.toBeNull();
  });

  it('hivatalos sor: megerősítő ablak (másolat + fizetős szöveg), dátumokkal catalog-assign, utána „Kiadva”', () => {
    const { fixture, c } = create();
    q(fixture, 'weak-assign-taskSet-501')!.click();
    fixture.detectChanges();
    expect(taskSets.catalogAssign).not.toHaveBeenCalled();
    const dialog = q(fixture, 'weak-catalog-dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.textContent).toContain('másolata a saját feladatsoraid közé kerül');
    expect(q(fixture, 'weak-catalog-access')!.textContent).toContain('előfizetés vagy iskolai licenc kell');

    c.opensAt.set('2026-10-20T08:00');
    c.dueAt.set('2026-10-19T08:00');
    fixture.detectChanges();
    expect(q(fixture, 'weak-catalog-dates-error')).not.toBeNull();
    expect((q(fixture, 'weak-catalog-confirm') as HTMLButtonElement).disabled).toBe(true);

    c.dueAt.set('2026-10-27T08:00');
    fixture.detectChanges();
    q(fixture, 'weak-catalog-confirm')!.click();
    fixture.detectChanges();
    expect(taskSets.catalogAssign).toHaveBeenCalledWith(5, {
      catalogTaskSetId: 501,
      opensAt: new Date('2026-10-20T08:00').toISOString(),
      dueAt: new Date('2026-10-27T08:00').toISOString(),
    });
    expect(q(fixture, 'weak-catalog-dialog')).toBeNull();
    expect(q(fixture, 'weak-assigned-taskSet-501')).not.toBeNull();
    expect(toast.success.mock.calls[0][0]).toContain('a másolat a saját feladatsoraid közé került');
  });

  it('hivatalos sor dátum nélkül null-t küld; Mégse nem hív', () => {
    const { fixture, c } = create();
    c.act(CATALOG);
    fixture.detectChanges();
    c.closeCatalog();
    fixture.detectChanges();
    expect(q(fixture, 'weak-catalog-dialog')).toBeNull();
    expect(taskSets.catalogAssign).not.toHaveBeenCalled();

    c.act(CATALOG);
    c.confirmCatalog();
    expect(taskSets.catalogAssign).toHaveBeenCalledWith(5, { catalogTaskSetId: 501, opensAt: null, dueAt: null });
  });

  it('hivatalos sor hibája az ablakban marad; futás közben nem zárható és más gomb sem indít', () => {
    const pending = new Subject<unknown>();
    const { fixture, c } = create();
    taskSets.catalogAssign.mockReturnValue(pending);
    c.act(CATALOG);
    c.confirmCatalog();
    fixture.detectChanges();
    expect(c.busyKey()).toBe('taskSet-501');
    c.closeCatalog();
    expect(c.pendingCatalog()).not.toBeNull();
    c.act(OWN);
    expect(taskSets.assignToGroup).not.toHaveBeenCalled();

    pending.error(new HttpErrorResponse({ status: 400, error: { errorMessage: 'A feladatsor nem publikálható: hiányzik a megoldás.' } }));
    fixture.detectChanges();
    expect(q(fixture, 'weak-catalog-error')!.textContent).toContain('nem publikálható');
    expect(q(fixture, 'weak-assigned-taskSet-501')).toBeNull();
  });

  it('figyelmeztetéssel visszatérő kiadás figyelmeztető toastot ad', () => {
    const { c } = create();
    taskSets.catalogAssign.mockReturnValue(of({ taskSetId: 777, copied: false, published: false, assignment: {}, warnings: ['Egy fájl nem másolódott.'] }));
    c.act(CATALOG);
    c.confirmCatalog();
    expect(toast.warning.mock.calls[0][0]).toContain('Egy fájl nem másolódott.');
  });

  it('archivált csoport (canAssign=false): nincs Kiadás gomb, magyarázat', () => {
    const { fixture } = create(of(summary({ canAssign: false })));
    expect(q(fixture, 'weak-assign-taskSet-11')).toBeNull();
    expect(q(fixture, 'weak-summary-archived')).not.toBeNull();
  });

  it('betöltési hiba: üzenet és „Újra”; az újratöltés friss állapottal indul', () => {
    const { fixture, c } = create(throwError(() => new HttpErrorResponse({ status: 500 })));
    expect(q(fixture, 'weak-summary-error')!.textContent).toContain('nem sikerült');
    reports.getGroupWeakTopicSummary.mockReturnValue(of(summary()));
    c.load();
    fixture.detectChanges();
    expect(q(fixture, 'weak-summary-error')).toBeNull();
    expect(q(fixture, 'weak-topic-14')).not.toBeNull();
  });

  it('segédfüggvények: hozzáférés-szöveg és 429-es hiba', () => {
    expect(accessLabel(PREMIUM_BLOCKED)).toContain('Prémium előfizetés vagy iskolai licenc');
    expect(accessLabel(OWN)).toBe('Ingyenes');
    expect(assignErrorMessage({ status: 429 })).toContain('túl sok');
  });
});
