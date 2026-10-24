import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AttemptReviewPanelComponent } from './attempt-review-panel.component';
import { ReportStore } from '../../services/report/report.store';
import { ReportService } from '../../services/report/report.service';
import { ConfirmService } from '../confirm/confirm.service';
import { ToastService } from '../toast/toast.service';
import { TeacherAttemptReviewDto } from '../../models/report.model';

function makeReview(overrides: Partial<TeacherAttemptReviewDto> = {}): TeacherAttemptReviewDto {
  return {
    attemptId: 101,
    taskId: 1,
    taskTitle: 'Első feladat',
    studentUserId: 1,
    studentDisplayName: 'Kiss Anna',
    earnedPoints: 6,
    aiEarnedPoints: 6,
    maxPoints: 10,
    scorePercent: 60,
    aiFeedback: 'Jó megoldás.',
    aiStrengths: null,
    aiWeaknesses: null,
    aiScoredAt: '2026-07-28T10:00:00Z',
    aiModel: 'm',
    studentCode: 'print("hello")',
    teacherFeedback: 'Mentett értékelés',
    reviewedAt: null,
    reviewedByTeacherName: null,
    isOverridden: false,
    timeSpentSeconds: 3725,
    visitCount: 4,
    solutionViewedAt: null,
    cheatsheetOpenCount: 2,
    runCount: 6,
    successfulRunCount: 4,
    failedRunCount: 2,
    ...overrides,
  };
}

@Component({
  imports: [AttemptReviewPanelComponent],
  template: `<app-attempt-review-panel [attemptId]="attemptId()" [taskSetId]="7"
    (closed)="events.push('closed')" (changed)="events.push('changed')" />`,
})
class HostComponent {
  readonly attemptId = signal(101);
  readonly events: string[] = [];
}

/**
 * Karakterizáló spec (SH): a panel viselkedését kívülről, a DOM-on és a store-hívásokon át rögzíti,
 * hogy a belső átalakítás (signal-piszkozat, alkomponensek) ne változtathasson rajta.
 */
describe('AttemptReviewPanelComponent', () => {
  let store: {
    attemptReview: ReturnType<typeof signal<TeacherAttemptReviewDto | null>>;
    reviewLoading: ReturnType<typeof signal<boolean>>;
    taskSetResultsLoading: ReturnType<typeof signal<boolean>>;
    reviewSaving: ReturnType<typeof signal<boolean>>;
    loadAttemptReview: ReturnType<typeof vi.fn>;
    clearAttemptReview: ReturnType<typeof vi.fn>;
    overrideScore: ReturnType<typeof vi.fn>;
    revertOverride: ReturnType<typeof vi.fn>;
  };
  let toast: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn> };
  let confirm: { ask: ReturnType<typeof vi.fn> };
  let reportService: { downloadAttemptFile: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    store = {
      attemptReview: signal<TeacherAttemptReviewDto | null>(null),
      reviewLoading: signal(false),
      taskSetResultsLoading: signal(false), reviewSaving: signal(false),
      loadAttemptReview: vi.fn(),
      clearAttemptReview: vi.fn(),
      overrideScore: vi.fn(),
      revertOverride: vi.fn(),
    };
    toast = { success: vi.fn(), warning: vi.fn(), danger: vi.fn() };
    confirm = { ask: vi.fn().mockResolvedValue(true) };
    reportService = { downloadAttemptFile: vi.fn(() => of(new Blob(['x']))) };
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        { provide: ReportStore, useValue: store },
        { provide: ReportService, useValue: reportService },
        { provide: ToastService, useValue: toast },
        { provide: ConfirmService, useValue: confirm },
      ],
    });
  });

  async function setup(review: TeacherAttemptReviewDto | null = makeReview()) {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    if (review) store.attemptReview.set(review);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, host: fixture.componentInstance, el };
  }

  const pointsInput = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[type="number"]');
  const feedbackArea = (el: HTMLElement) => el.querySelector<HTMLTextAreaElement>('textarea')!;
  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === text);

  function typePoints(el: HTMLElement, value: string) {
    const input = pointsInput(el)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function typeFeedback(el: HTMLElement, value: string) {
    const area = feedbackArea(el);
    area.value = value;
    area.dispatchEvent(new Event('input'));
  }

  it('megnyitáskor betölti a beadást; betöltés alatt spinner, másik beadás nézete nem jelenik meg', async () => {
    store.reviewLoading.set(true);
    const { fixture, el } = await setup(makeReview({ attemptId: 999 }));
    expect(store.loadAttemptReview).toHaveBeenCalledWith(101);
    expect(el.querySelector('app-local-spinner')).not.toBeNull();
    expect(el.textContent).not.toContain('Kiss Anna');

    store.reviewLoading.set(false);
    fixture.detectChanges();
    expect(el.textContent!.trim()).toBe('');
  });

  it('a nézet adatai: pontok, AI-értékelés, munkafolyamat, kód', async () => {
    const { el } = await setup(makeReview({ isOverridden: true, reviewedByTeacherName: 'Tanár Tamás', earnedPoints: 7 }));
    const text = el.textContent!;
    expect(text).toContain('Első feladat');
    expect(text).toContain('7 / 10');
    expect(text).toContain('6 / 10');
    expect(text).toContain('Tanár Tamás');
    expect(text).toContain('Jó megoldás.');
    expect(text).toContain('1 ó 2 p');
    expect(text).toContain('Megnyitások: 4');
    expect(text).toContain('Segédlet megnyitva: 2×');
    expect(text).toContain('print("hello")');
  });

  it('az eltöltött idő perc/másodperc alakban, ha nincs egész óra', async () => {
    const { el } = await setup(makeReview({ timeSpentSeconds: 65 }));
    expect(el.textContent).toContain('1 p 5 mp');
  });

  it('a piszkozat a nézetből töltődik fel, a karakterszámláló a szöveg hosszát mutatja', async () => {
    const { el } = await setup();
    expect(pointsInput(el)!.value).toBe('6');
    expect(feedbackArea(el).value).toBe('Mentett értékelés');
    expect(el.textContent).toContain('17/2000');
  });

  it('gépelés után a nézet frissülése (ugyanaz a beadás) nem írja felül a piszkozatot', async () => {
    const { fixture, el } = await setup();
    typePoints(el, '8');
    typeFeedback(el, 'Új szöveg');
    fixture.detectChanges();

    store.attemptReview.set(makeReview({ earnedPoints: 9, teacherFeedback: 'Más tanár szövege' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(pointsInput(el)!.value).toBe('8');
    expect(feedbackArea(el).value).toBe('Új szöveg');
  });

  it('másik beadásra váltáskor újratölt, és az új beadás nézetéből tölti a piszkozatot', async () => {
    const { fixture, host, el } = await setup();
    typeFeedback(el, 'Félkész szöveg');

    host.attemptId.set(102);
    store.loadAttemptReview.mockImplementation(() => store.attemptReview.set(null));
    fixture.detectChanges();
    expect(store.loadAttemptReview).toHaveBeenLastCalledWith(102);

    store.attemptReview.set(makeReview({ attemptId: 102, earnedPoints: 3, teacherFeedback: null }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(pointsInput(el)!.value).toBe('3');
    expect(feedbackArea(el).value).toBe('');
  });

  it('mentés: a beírt pontot és a vágott szöveget küldi, siker után toast és changed', async () => {
    const { fixture, host, el } = await setup();
    typePoints(el, '8');
    typeFeedback(el, '  Szép munka.  ');
    fixture.detectChanges();
    button(el, 'Mentés')!.click();

    expect(store.overrideScore).toHaveBeenCalledWith(
      7, 101, { earnedPoints: 8, teacherFeedback: 'Szép munka.', feedbackProvided: true }, expect.any(Function));
    (store.overrideScore.mock.calls[0][3] as () => void)();
    expect(toast.success).toHaveBeenCalledWith('Értékelés mentve.');
    expect(host.events).toEqual(['changed']);
  });

  it('csak pontszám módosításakor a szöveg nem számít megadottnak', async () => {
    const { fixture, el } = await setup();
    typePoints(el, '9');
    fixture.detectChanges();
    button(el, 'Mentés')!.click();
    expect(store.overrideScore).toHaveBeenCalledWith(
      7, 101, { earnedPoints: 9, teacherFeedback: 'Mentett értékelés', feedbackProvided: false }, expect.any(Function));
  });

  it('érvénytelen pontszámnál a hiba gépelés közben látszik, a mentés figyelmeztet és nem hív store-t', async () => {
    const { fixture, el } = await setup();
    typePoints(el, '11');
    fixture.detectChanges();
    expect(el.textContent).toContain('A pontszám nem lehet több a feladat maximumánál (10 pont).');
    button(el, 'Mentés')!.click();
    expect(toast.warning).toHaveBeenCalledWith('A pontszám nem lehet több a feladat maximumánál (10 pont).');

    typePoints(el, '-1');
    fixture.detectChanges();
    expect(el.textContent).toContain('A pontszám nem lehet negatív.');

    typePoints(el, '2.5');
    fixture.detectChanges();
    expect(el.textContent).toContain('A pontszám csak egész szám lehet.');
    expect(store.overrideScore).not.toHaveBeenCalled();
  });

  it('üres pontszám és érintetlen szöveg mellett figyelmeztet', async () => {
    const { fixture, el } = await setup(makeReview({ earnedPoints: null }));
    expect(pointsInput(el)!.value).toBe('');
    fixture.detectChanges();
    button(el, 'Mentés')!.click();
    expect(toast.warning).toHaveBeenCalledWith(
      'Adj meg pontszámot vagy szöveges értékelést. A felülbírálás visszavonásához használd a visszaállítást.');
    expect(store.overrideScore).not.toHaveBeenCalled();
  });

  it('túl hosszú szövegnél hibát mutat és nem ment', async () => {
    const { fixture, el } = await setup();
    expect(feedbackArea(el).getAttribute('maxlength')).toBe('2000');
    typeFeedback(el, 'x'.repeat(2001));
    fixture.detectChanges();
    expect(el.textContent).toContain('A szöveges értékelés legfeljebb 2000 karakter lehet.');
    expect(el.textContent).toContain('2001/2000');
    button(el, 'Mentés')!.click();
    expect(toast.warning).toHaveBeenCalledWith('A szöveges értékelés legfeljebb 2000 karakter lehet.');
    expect(store.overrideScore).not.toHaveBeenCalled();
  });

  it('folyamatban lévő mentés alatt a gombok tiltottak, és a mentés nem indul', async () => {
    store.taskSetResultsLoading.set(true);
    const { el } = await setup(makeReview({ isOverridden: true }));
    expect(button(el, 'Mentés')!.disabled).toBe(true);
    expect(button(el, 'Visszaállítás az AI pontjára')!.disabled).toBe(true);
  });

  it('visszaállítás megerősítés után: a piszkozat kiürül, és a frissülő nézet nem tölti vissza', async () => {
    const { fixture, host, el } = await setup(makeReview({ isOverridden: true, earnedPoints: 9 }));
    typeFeedback(el, 'Írtam valamit');
    fixture.detectChanges();
    button(el, 'Visszaállítás az AI pontjára')!.click();
    await fixture.whenStable();

    expect(confirm.ask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Visszaállítás az AI pontjára', confirmLabel: 'Visszaállítás', danger: true }));
    expect(store.revertOverride).toHaveBeenCalledWith(7, 101, expect.any(Function));
    store.attemptReview.set(makeReview({ isOverridden: false, earnedPoints: 6, teacherFeedback: null }));
    (store.revertOverride.mock.calls[0][2] as () => void)();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(toast.success).toHaveBeenCalledWith('Visszaállítva az AI pontjára.');
    expect(host.events).toEqual(['changed']);
    expect(pointsInput(el)!.value).toBe('');
    expect(feedbackArea(el).value).toBe('');

    // A visszaállítás az „érintett” jelzőt is törli: egy csak-pontos mentés nem küld szöveget.
    typePoints(el, '4');
    fixture.detectChanges();
    button(el, 'Mentés')!.click();
    expect(store.overrideScore).toHaveBeenCalledWith(
      7, 101, { earnedPoints: 4, teacherFeedback: null, feedbackProvided: false }, expect.any(Function));
  });

  it('AI-pont nélkül a gomb és a megerősítés a törlést mondja; elutasításkor nincs store-hívás', async () => {
    confirm.ask.mockResolvedValue(false);
    const { fixture, el } = await setup(makeReview({ isOverridden: true, aiEarnedPoints: null }));
    expect(button(el, 'Visszaállítás az AI pontjára')).toBeUndefined();
    button(el, 'Felülbírálás törlése')!.click();
    await fixture.whenStable();
    expect(confirm.ask).toHaveBeenCalledWith(expect.objectContaining({ title: 'Felülbírálás törlése', confirmLabel: 'Törlés' }));
    expect(store.revertOverride).not.toHaveBeenCalled();
  });

  it('felülbírálás nélkül nincs visszaállító gomb', async () => {
    const { el } = await setup();
    expect(button(el, 'Visszaállítás az AI pontjára')).toBeUndefined();
    expect(button(el, 'Felülbírálás törlése')).toBeUndefined();
  });

  it('kiértékeletlen beadásnál nincs pontmező és mentés, a szövegmező tiltott', async () => {
    const { el } = await setup(makeReview({ maxPoints: 0 }));
    expect(pointsInput(el)).toBeNull();
    expect(button(el, 'Mentés')).toBeUndefined();
    expect(feedbackArea(el).disabled).toBe(true);
    expect(el.textContent).toContain('a pontszám nem módosítható');
    expect(el.textContent).toContain('a szöveges értékelés sem menthető el');
  });

  it('kilépett diák dolgozata csak olvasható, a magyarázattal', async () => {
    const { el } = await setup(makeReview({ studentLeftGroup: true }));
    expect(pointsInput(el)).toBeNull();
    expect(feedbackArea(el).disabled).toBe(true);
    expect(el.textContent).toContain('A diák kilépett a csoportból – a tagként írt dolgozata csak olvasható.');
  });

  it('Bezárás: törli a store nézetét és closed eseményt küld', async () => {
    const { host, el } = await setup();
    button(el, 'Bezárás ▲')!.click();
    expect(store.clearAttemptReview).toHaveBeenCalled();
    expect(host.events).toEqual(['closed']);
  });

  it('beadott fájlok: KB-ban (legalább 1), a kód-blokk helyett; letöltési hiba toastot ad', async () => {
    reportService.downloadAttemptFile.mockReturnValue(throwError(() => new Error('x')));
    const { el } = await setup(makeReview({
      submissionFiles: [{ id: 'f1', name: 'a.docx', sizeBytes: 83007 }, { id: 'f2', name: 'b.txt', sizeBytes: 10 }],
    }));
    const files = el.querySelector('[data-testid="attempt-files"]')!;
    expect(files.textContent).toContain('a.docx (81 KB)');
    expect(files.textContent).toContain('b.txt (1 KB)');
    expect(el.textContent).not.toContain('A diák megoldása');
    files.querySelector('button')!.click();
    expect(reportService.downloadAttemptFile).toHaveBeenCalledWith(101, 'f1');
    expect(toast.danger).toHaveBeenCalledWith('A fájl nem tölthető le.');
  });

  it('szempontonkénti értékelés: pontok és állítások, a teljesültek halványan, vázlat-jelzés', async () => {
    const { el } = await setup(makeReview({
      rubricGrade: {
        gradeId: 1, draftRubric: true, rawPoints: 2, rawTotal: 4, files: [],
        items: [
          { itemId: 1, order: 1, section: null, text: 'Margó', kind: 'criterion', maxPoints: 2, points: 2, ok: null, reason: null, groupNo: null },
          { itemId: 2, order: 2, section: null, text: 'Cím', kind: 'statement', maxPoints: 0, points: 0, ok: false, reason: 'nincs középen', groupNo: null },
          { itemId: 3, order: 3, section: null, text: 'Lábléc', kind: 'criterion', maxPoints: 2, points: 0, ok: null, reason: null, groupNo: null },
        ],
      },
    }));
    const rubric = el.querySelector('[data-testid="attempt-rubric"]')!;
    expect(rubric.textContent).toContain('2/4 nyers pont');
    expect(rubric.textContent).toContain('vázlat-útmutató');
    expect(rubric.textContent).toContain('2 szempontnál veszett pont');
    const rows = rubric.querySelectorAll('li');
    expect(rows[0].textContent).toContain('2/2');
    expect(rows[0].classList).toContain('text-text-muted');
    expect(rows[1].textContent).toContain('✗');
    expect(rows[1].classList).not.toContain('text-text-muted');
    expect(rows[1].querySelector('[data-testid="attempt-rubric-reason"]')!.textContent).toContain('nincs középen');
    expect(rows[2].textContent).toContain('0/2');
  });
});
