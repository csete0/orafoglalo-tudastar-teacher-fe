import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { FeladatsorEredmenyekComponent } from './feladatsor-eredmenyek.component';
import { ReportStore } from '../../services/report/report.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ResultsCsvExportService } from '../../services/export/results-csv-export.service';
import { TeacherAttemptReviewDto, TeacherTaskSetResultsDto } from '../../models/report.model';

function makeResults(): TeacherTaskSetResultsDto {
  return {
    taskSetId: 1,
    title: 'Teszt feladatsor',
    tasks: [
      { taskId: 1, title: 'Első feladat', maxPoints: 10, taskOrder: 1 },
      { taskId: 2, title: 'Második feladat', maxPoints: 5, taskOrder: 2 },
    ],
    students: [
      {
        userId: 1,
        name: 'Kiss Anna',
        hasSession: true,
        isCompleted: true,
        totalEarnedPoints: 12,
        totalMaxPoints: 15,
        taskResults: [
          { taskId: 1, attemptId: 101, isCompleted: true, earnedPoints: 10, maxPoints: 10, isOverridden: false },
          { taskId: 2, attemptId: 102, isCompleted: true, earnedPoints: 2, maxPoints: 5, isOverridden: true },
        ],
      },
      {
        userId: 2,
        name: 'Nagy Béla',
        hasSession: false,
        isCompleted: false,
        taskResults: [
          { taskId: 1, isCompleted: false, isOverridden: false },
          { taskId: 2, isCompleted: false, isOverridden: false },
        ],
      },
    ],
  };
}

function makeReview(overrides: Partial<TeacherAttemptReviewDto> = {}): TeacherAttemptReviewDto {
  return {
    attemptId: 101,
    taskId: 1,
    taskTitle: 'Első feladat',
    studentUserId: 1,
    studentDisplayName: 'Kiss Anna',
    earnedPoints: 10,
    aiEarnedPoints: 10,
    maxPoints: 10,
    scorePercent: 100,
    aiFeedback: 'Jó megoldás.',
    aiStrengths: 'Tiszta szerkezet.',
    aiWeaknesses: null,
    aiScoredAt: '2026-07-28T10:00:00Z',
    aiModel: 'gpt-4o',
    studentCode: 'print("hello")',
    teacherFeedback: null,
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

describe('FeladatsorEredmenyekComponent', () => {
  let reportStoreMock: {
    taskSetResults: ReturnType<typeof signal<TeacherTaskSetResultsDto | null>>;
    attemptReview: ReturnType<typeof signal<TeacherAttemptReviewDto | null>>;
    taskSetResultsLoading: ReturnType<typeof signal<boolean>>;
    reviewLoading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadTaskSetResults: ReturnType<typeof vi.fn>;
    loadAttemptReview: ReturnType<typeof vi.fn>;
    clearAttemptReview: ReturnType<typeof vi.fn>;
    overrideScore: ReturnType<typeof vi.fn>;
    revertOverride: ReturnType<typeof vi.fn>;
  };
  let toastMock: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn> };
  let confirmMock: { ask: ReturnType<typeof vi.fn> };

  function configure(results: TeacherTaskSetResultsDto | null) {
    reportStoreMock = {
      taskSetResults: signal(results),
      attemptReview: signal<TeacherAttemptReviewDto | null>(null),
      taskSetResultsLoading: signal(false),
      reviewLoading: signal(false),
      error: signal(null),
      loadTaskSetResults: vi.fn(),
      loadAttemptReview: vi.fn(),
      clearAttemptReview: vi.fn(),
      overrideScore: vi.fn(),
      revertOverride: vi.fn(),
    };
    toastMock = { success: vi.fn(), warning: vi.fn(), danger: vi.fn() };
    confirmMock = { ask: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [FeladatsorEredmenyekComponent],
      providers: [
        provideRouter([]),
        { provide: ReportStore, useValue: reportStoreMock },
        { provide: ToastService, useValue: toastMock },
        { provide: ConfirmService, useValue: confirmMock },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
      ],
    });
  }

  /** Megnyitja az első diák első cellájának panelját, és beállítja a nézetét. */
  function openFirstCell(fixture: ReturnType<typeof TestBed.createComponent<FeladatsorEredmenyekComponent>>,
                         review = makeReview()) {
    const cellButton = fixture.nativeElement.querySelectorAll('tbody button')[0] as HTMLButtonElement;
    cellButton.click();
    reportStoreMock.attemptReview.set(review);
    fixture.detectChanges();
  }

  it('betöltéskor meghívja a loadTaskSetResults-t a route id-vel', () => {
    configure(null);
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    expect(reportStoreMock.loadTaskSetResults).toHaveBeenCalledWith(1);
  });

  it('a feladat-oszlopok és diák-sorok helyesen jelennek meg', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Első feladat');
    expect(text).toContain('Második feladat');
    expect(text).toContain('Kiss Anna');
    expect(text).toContain('Nagy Béla');
    expect(text).toContain('12 / 15');
  });

  it('nem-kezdett diáknál "nem kezdte el" jelenik meg, nem pontszám', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    const nagyRow = Array.from(rows).find((r) => (r as HTMLElement).textContent?.includes('Nagy Béla')) as HTMLElement;

    expect(nagyRow.textContent).toContain('nem kezdte el');
    expect(nagyRow.className).toContain('opacity-50');
  });

  // ── Tanári értékelő panel (2. fázis + 6. fázis munkafolyamat-blokk) ──────────

  it('cellára kattintva a helyes attemptId-vel tölti be az értékelő nézetet', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const cellButton = fixture.nativeElement.querySelectorAll('tbody button')[0] as HTMLButtonElement;
    cellButton.click();

    expect(reportStoreMock.loadAttemptReview).toHaveBeenCalledWith(101);
  });

  it('beadás nélküli cellához nem rajzol gombot', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    const nagyRow = Array.from(rows).find((r) => (r as HTMLElement).textContent?.includes('Nagy Béla')) as HTMLElement;

    expect(nagyRow.querySelectorAll('button').length).toBe(0);
  });

  it('a panel megjeleníti az AI-értékelést és a munkafolyamat-adatokat', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Jó megoldás.');
    expect(text).toContain('Tiszta szerkezet.');
    expect(text).toContain('Munkafolyamat');
    expect(text).toContain('1 ó 2 p');
    expect(text).toContain('Segédlet megnyitva:');
  });

  // UI-TT-176: a UI-TT-174 fixe (`w-0 min-w-full`) élőben hatástalan maradt egy `td colspan`
  // auto-layout táblázatban - jsdom nem végez valódi CSS layout-számítást, ezért a tényleges
  // szélesség-blowoutot ez a teszt nem tudja közvetlenül reprodukálni (ld. ledger). Ez a teszt
  // csak azt őrzi, hogy a wrapper a helyes, nem-körkörös osztálykombinációt (`max-w-[90vw]` +
  // `overflow-x-auto`) használja, és a bizonyítottan hatástalan `w-0`/`min-w-full` NEM tér vissza
  // egy jövőbeli, jóhiszemű "letisztításnál".
  it('BUG UI-TT-176 javítva: a panel wrapper max-w-[90vw]+overflow-x-auto osztályokat kap, nem a hatástalan w-0/min-w-full mintát', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture);

    const wrapper = fixture.nativeElement.querySelector('.border-l-2.border-primary') as HTMLElement;
    expect(wrapper).toBeTruthy();
    expect(wrapper.className).toContain('max-w-[90vw]');
    expect(wrapper.className).toContain('overflow-x-auto');
    expect(wrapper.className).not.toContain('w-0');
    expect(wrapper.className).not.toContain('min-w-full');
  });

  // A munkafolyamat-blokk NYERS adat, nem bizonyíték: egy "gyanús" címke téves
  // vádhoz vezethet egy valós diák ellen. Ezt a tesztet szándékosan a
  // megfogalmazásra írjuk, nem csak a számokra.
  it('a munkafolyamat-blokk nem címkéz és nem sugall csalást', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture, makeReview({ solutionViewedAt: '2026-07-28T10:05:00Z', cheatsheetOpenCount: 9 }));

    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('gyanú');
    expect(text).not.toContain('gyanús');
    expect(text).not.toContain('csalás');
    // az adat viszont ott van, következtetés nélkül
    expect(text).toContain('mintamegoldást megnézte: igen');
  });

  it('nem értékelt beadásnál nem 0-t, hanem "Nem értékelt"-et mutat', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture, makeReview({ earnedPoints: null, aiEarnedPoints: null, scorePercent: null }));

    expect(fixture.nativeElement.textContent).toContain('Nem értékelt');
  });

  it('max feletti pontszámnál figyelmeztet és nem küld kérést', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture);

    const component = fixture.componentInstance;
    component.draftPoints = 11; // maxPoints = 10
    component.save(makeReview());

    expect(reportStoreMock.overrideScore).not.toHaveBeenCalled();
    expect(toastMock.warning).toHaveBeenCalled();
  });

  it('negatív pontszámnál figyelmeztet és nem küld kérést', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture);

    const component = fixture.componentInstance;
    component.draftPoints = -1;
    component.save(makeReview());

    expect(reportStoreMock.overrideScore).not.toHaveBeenCalled();
    expect(toastMock.warning).toHaveBeenCalled();
  });

  it('érvényes pontszámot elment, és a mátrix frissítéséhez a taskSetId-t is átadja', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture);

    const component = fixture.componentInstance;
    component.draftPoints = 8;
    component.draftFeedback = 'Szép munka.';
    component.feedbackTouched = true;
    component.save(makeReview());

    expect(reportStoreMock.overrideScore).toHaveBeenCalledWith(
      1,
      101,
      { earnedPoints: 8, teacherFeedback: 'Szép munka.', feedbackProvided: true },
      expect.any(Function),
    );
  });

  it('csak szöveges értékelés is menthető, pontszám megadása nélkül', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture);

    const component = fixture.componentInstance;
    component.draftPoints = null;
    component.draftFeedback = 'Egyetértek az AI pontjával, de figyelj a névválasztásra.';
    component.feedbackTouched = true;
    component.save(makeReview());

    expect(reportStoreMock.overrideScore).toHaveBeenCalledWith(
      1,
      101,
      { earnedPoints: null, teacherFeedback: 'Egyetértek az AI pontjával, de figyelj a névválasztásra.', feedbackProvided: true },
      expect.any(Function),
    );
  });

  // BE-TEACHERATTEMPTREVIEW-OVERRIDE-FEEDBACK-LOST-UPDATE: ha a tanár a MEGLÉVŐ
  // értékeléshez hozzá sem nyúlt, és csak a pontszámot módosítja, a mentésnek
  // `feedbackProvided: false`-t kell küldenie — enélkül a backend a `teacherFeedback`
  // (jelen esetben a betöltött, de nem szerkesztett) értékét alkalmazná, ami egy
  // MÁSIK, konkurens tanár időközbeni írását nullázhatná le.
  it('csak pontszám módosításnál (értékelés-mező érintetlen) feedbackProvided false-t küld', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture);

    const component = fixture.componentInstance;
    component.draftPoints = 9;
    // component.draftFeedback marad a betöltéskori érték - a tanár nem szerkesztette,
    // ezért component.feedbackTouched is false marad (nincs (input) esemény szimulálva).
    component.save(makeReview());

    expect(reportStoreMock.overrideScore).toHaveBeenCalledWith(
      1,
      101,
      expect.objectContaining({ earnedPoints: 9, feedbackProvided: false }),
      expect.any(Function),
    );
  });

  it('a (input) esemény beállítja a feedbackTouched jelzőt', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.feedbackTouched).toBe(false);

    const textarea: HTMLTextAreaElement | null = fixture.nativeElement.querySelector('textarea');
    expect(textarea).toBeTruthy();
    textarea!.value = 'Módosított értékelés.';
    textarea!.dispatchEvent(new Event('input'));

    expect(component.feedbackTouched).toBe(true);
  });

  it('üres pontszám ÉS üres szöveg esetén figyelmeztet, nem küld üres kérést', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture);

    const component = fixture.componentInstance;
    component.draftPoints = null;
    component.draftFeedback = '   ';
    component.save(makeReview());

    expect(reportStoreMock.overrideScore).not.toHaveBeenCalled();
    expect(toastMock.warning).toHaveBeenCalled();
  });

  it('a visszaállítás megerősítést kér, és elutasításkor nem hív store-t', async () => {
    configure(makeResults());
    confirmMock.ask.mockResolvedValue(false);
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture, makeReview({ isOverridden: true }));

    await fixture.componentInstance.revert(makeReview({ isOverridden: true }));

    expect(confirmMock.ask).toHaveBeenCalled();
    expect(reportStoreMock.revertOverride).not.toHaveBeenCalled();
  });

  it('megerősített visszaállítás meghívja a store-t', async () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture, makeReview({ isOverridden: true }));

    await fixture.componentInstance.revert(makeReview({ isOverridden: true }));

    expect(reportStoreMock.revertOverride).toHaveBeenCalledWith(1, 101, expect.any(Function));
  });

  // BE-TEACHERATTEMPTREVIEW-OVERRIDE-FEEDBACK-LOST-UPDATE testvér-rés a visszaállítás
  // útvonalon: a `revert()` a draftPoints/draftFeedback mezőket nullázza a siker-callbackben,
  // de a `feedbackTouched` jelzőt NEM — ha a tanár a visszaállítás ELŐTT hozzáért az
  // értékelés-mezőhöz (aztán meggondolta magát és inkább visszaállított), a jelző stale
  // `true` marad. Egy ezt követő, csak-pontszámot-módosító mentés emiatt téves
  // `feedbackProvided: true`-t küld `teacherFeedback: null`-lal — élőben (192.168.1.77:9443,
  // taskSetId 1378, attemptId 2339) reprodukálva, a valós PUT-kérés törzse pontosan
  // `{"earnedPoints":4,"teacherFeedback":null,"feedbackProvided":true}` volt egy ilyen
  // szekvencia után. Ha eközben egy MÁSIK tanár épp beírt egy szöveges értékelést, ez a
  // mentés némán lenullázza azt — pontosan az eredeti hiba, csak a visszaállítás útvonalán
  // keresztül újranyitva.
  it('BUG: visszaállítás után egy csak-pontszámot-módosító mentés a visszaállítás ELŐTTI feedbackTouched jelzőt küldi el, nem false-t', async () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();
    openFirstCell(fixture, makeReview({ isOverridden: true, teacherFeedback: 'Régi értékelés' }));

    const component = fixture.componentInstance;
    // A tanár hozzáért az értékelés-mezőhöz, majd meggondolta magát és visszaállított.
    component.feedbackTouched = true;

    await component.revert(makeReview({ isOverridden: true, teacherFeedback: 'Régi értékelés' }));
    const onRevertSuccess = reportStoreMock.revertOverride.mock.calls[0][2] as () => void;
    onRevertSuccess();

    expect(component.feedbackTouched).toBe(false);

    component.draftPoints = 4;
    component.save(makeReview({ attemptId: 101, isOverridden: false, teacherFeedback: null }));

    expect(reportStoreMock.overrideScore).toHaveBeenCalledWith(
      1,
      101,
      expect.objectContaining({ feedbackProvided: false }),
      expect.any(Function),
    );
  });

  it('a felülbírált cella "tanári" jelzést kap a mátrixban', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('tbody button');
    // A 2. cella (taskId 2) isOverridden: true
    expect((buttons[1] as HTMLElement).textContent).toContain('tanári');
    expect((buttons[0] as HTMLElement).textContent).not.toContain('tanári');
  });

  it('másik cella panelját nem tölti fel egy korábbi cella válasza', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    // A 2. cellát nyitjuk meg (attemptId 102), de a store-ba a RÉGI (101) válasz érkezik.
    const buttons = fixture.nativeElement.querySelectorAll('tbody button');
    (buttons[1] as HTMLButtonElement).click();
    reportStoreMock.attemptReview.set(makeReview({ attemptId: 101, taskTitle: 'Első feladat' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.review()).toBeNull();
  });

  it('a CSV-export gomb a betöltött mátrixot adja át az export-szolgáltatásnak', () => {
    configure(makeResults());
    const exportSpy = vi.spyOn(
      TestBed.inject(ResultsCsvExportService),
      'exportTaskSetResults',
    ).mockImplementation(() => {});
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const exportButton = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLElement).textContent?.includes('Exportálás CSV-be'),
    ) as HTMLButtonElement;
    exportButton.click();

    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ taskSetId: 1, title: 'Teszt feladatsor' }),
    );
  });

  it('üres mátrixnál figyelmeztet és nem indít exportot (nem néma no-op)', () => {
    configure({ ...makeResults(), students: [] });
    const exportSpy = vi.spyOn(
      TestBed.inject(ResultsCsvExportService),
      'exportTaskSetResults',
    ).mockImplementation(() => {});
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const exportButton = [...fixture.nativeElement.querySelectorAll('button')].find((b) =>
      (b as HTMLElement).textContent?.includes('Exportálás CSV-be'),
    ) as HTMLButtonElement;
    exportButton.click();

    expect(exportSpy).not.toHaveBeenCalled();
    expect(toastMock.warning).toHaveBeenCalled();
  });

  // 5. fázis — gyengepont-elemzés. A számítás egységtesztjei a
  // `shared/task-analysis/task-weakness.spec.ts`-ben vannak; itt csak a
  // megjelenítés/elrejtés viselkedését rögzítjük.

  it('a gyengepont-blokk a leggyengébb feladatot mutatja a küszöb alatti számmal', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Leggyengébben teljesített feladatok');
    // A 2. feladat 2/5 = 40%, az 1. feladat 10/10 = 100% → a 2. a leggyengébb.
    expect(fixture.componentInstance.weakest()[0].title).toBe('Második feladat');
    expect(text).toContain('átlag 40%');
    expect(text).toContain('1 / 1 diák 50% alatt');
  });

  it('beadás nélküli feladatsornál a blokk NEM jelenik meg (nem mutat 0%-ot)', () => {
    const results = makeResults();
    // Egyetlen diák sem kezdte el: minden cella befejezetlen, pontszám nélkül.
    results.students = results.students.map((s) => ({
      ...s,
      hasSession: false,
      isCompleted: false,
      taskResults: s.taskResults.map((c) => ({
        ...c,
        isCompleted: false,
        earnedPoints: undefined,
      })),
    }));
    configure(results);
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.weakest()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('Leggyengébben teljesített feladatok');
  });

  it('a leggyengébb feladat oszlopa kiemelést kap a mátrix fejlécében', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const headers = [...fixture.nativeElement.querySelectorAll('thead th')] as HTMLElement[];
    const weakestHeader = headers.find((h) => h.textContent?.includes('Második feladat'));
    const strongestHeader = headers.find((h) => h.textContent?.includes('Első feladat'));

    expect(weakestHeader?.classList.contains('text-warning')).toBe(true);
    expect(strongestHeader?.classList.contains('text-warning')).toBe(false);
  });
});
