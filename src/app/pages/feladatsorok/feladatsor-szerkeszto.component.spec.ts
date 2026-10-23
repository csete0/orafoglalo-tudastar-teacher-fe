import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { By } from '@angular/platform-browser';
import { of, Subject } from 'rxjs';
import { FeladatsorSzerkesztoComponent } from './feladatsor-szerkeszto.component';
import { AutomatikusJavitasComponent } from './automatikus-javitas.component';
import { MiSegitoPanelComponent } from './mi-segito-panel.component';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { SchoolStore } from '../../services/school/school.store';
import { AuthorizedFileService } from '../../services/file/authorized-file.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { GradingQualityDto, TeacherFileDto, TeacherTaskDto, TeacherTaskSetDetailDto } from '../../models/teacher-content.model';
import { ToastService } from '../../shared/toast/toast.service';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { TeacherAiCodeTaskService } from '../../services/teacher-ai-code-task/teacher-ai-code-task.service';
import { TeacherOfficeTaskService } from '../../services/teacher-office-task/teacher-office-task.service';
import { TeacherDesktopTaskService } from '../../services/teacher-desktop-task/teacher-desktop-task.service';
import { ReportService } from '../../services/report/report.service';
import { TaskEditState } from './feladatsor-szerkeszto/task-edit.state';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { TaskSetAssignmentDto } from '../../models/teacher-content.model';

function makeDetail(overrides: Partial<TeacherTaskSetDetailDto> = {}): TeacherTaskSetDetailDto {
  return {
    id: 1,
    title: 'Teszt feladatsor',
    slug: 'teszt-feladatsor',
    description: 'd',
    levelId: 2,
    isPublished: false,
    takedownAt: null,
    // Alapértelmezésben nincs rajta vizsga, tehát törölhető. A tiltott esetet a
    // törlés-tesztek állítják be külön.
    hasExamSessions: false,
    createdAt: new Date().toISOString(),
    taskCount: 0,
    tasks: [],
    files: [],
    requiredSkillIds: [],
    ...overrides,
  };
}

function helperQuota() {
  return { month: '2026-10', premium: true, quizSource: { used: 0, limit: 1 }, testFeedback: { used: 0, limit: 1 }, codeComments: { used: 0, limit: 1 },
    officeTask: { used: 0, limit: 20 }, desktopTask: { used: 0, limit: 20 } };
}

describe('FeladatsorSzerkesztoComponent', () => {
  let taskSetStoreMock: {
    selectedDetail: ReturnType<typeof signal<TeacherTaskSetDetailDto | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    publishResult: ReturnType<typeof signal<null>>;
    loadDetail: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    addTask: ReturnType<typeof vi.fn>;
    addSubTask: ReturnType<typeof vi.fn>;
    updateSubTask: ReturnType<typeof vi.fn>;
    updateTask: ReturnType<typeof vi.fn>;
    uploadFile: ReturnType<typeof vi.fn>;
    uploadFiles: ReturnType<typeof vi.fn>;
    deleteTask: ReturnType<typeof vi.fn>;
    deleteSubTask: ReturnType<typeof vi.fn>;
    deleteFile: ReturnType<typeof vi.fn>;
    updateTaskSet: ReturnType<typeof vi.fn>;
  };
  let schoolStoreMock: {
    schools: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
  };
  let authorizedFileServiceMock: { resolveUrl: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn>; pending: ReturnType<typeof signal<null>>; resolve: ReturnType<typeof vi.fn> };
  // Alapból minden feladat automatikus javítása „zöld” - a publikálási figyelmeztetés-tesztek írják felül.
  let rubricServiceMock: {
    getGradingQuality: ReturnType<typeof vi.fn>;
    getRubric: ReturnType<typeof vi.fn>;
    getRubricQuota: ReturnType<typeof vi.fn>;
    getRunInput: ReturnType<typeof vi.fn>;
    saveRunInput: ReturnType<typeof vi.fn>;
  };

  function configure(detail: TeacherTaskSetDetailDto | null) {
    // A vázlat-kijelölés / panel görget - a jsdom-ban nincs scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    taskSetStoreMock = {
      selectedDetail: signal(detail),
      loading: signal(false),
      error: signal(null),
      publishResult: signal(null),
      loadDetail: vi.fn(),
      publish: vi.fn(),
      // Alapból NEM hívja meg onSuccess-t (folyamatban lévő/sikertelen kérést szimulál) —
      // az egyes tesztek explicit mockImplementation-nel írhatják felül, ha a sikeres ágat
      // akarják bizonyítani (UI-TT-25).
      addTask: vi.fn(),
      addSubTask: vi.fn(),
      // Alapból NEM hívja meg az onSuccess callback-et (folyamatban lévő kérést szimulál),
      // ugyanaz a konvenció, mint addTask/addSubTask mockjánál.
      updateSubTask: vi.fn(),
      // UI-TT-214: ugyanaz a konvenció, mint updateSubTask mockjánál - alapból NEM hívja
      // meg az onSuccess callback-et.
      updateTask: vi.fn(),
      uploadFile: vi.fn(),
      uploadFiles: vi.fn(),
      deleteTask: vi.fn(),
      deleteSubTask: vi.fn(),
      deleteFile: vi.fn(),
      updateTaskSet: vi.fn(),
    };
    schoolStoreMock = { schools: signal([]), loading: signal(false), error: signal(null), loadMine: vi.fn() };
    authorizedFileServiceMock = {
      resolveUrl: vi.fn((url: string) => of(`blob:resolved-${url}`)),
      revoke: vi.fn(),
    };
    confirmServiceMock = { ask: vi.fn().mockResolvedValue(false), pending: signal(null), resolve: vi.fn() };
    rubricServiceMock = {
      getGradingQuality: vi.fn(() =>
        of({ kind: 'code', level: 'green', checks: [], rubric: { status: 'approved', itemCount: 1, machineCount: 0 } } as GradingQualityDto),
      ),
      getRubric: vi.fn(() => of(null)),
      getRubricQuota: vi.fn(() => of({ used: 0, limit: 30, month: '2026-10' })),
      getRunInput: vi.fn(() => of({ stdin: null, isRandom: false })),
      saveRunInput: vi.fn((_: number, __: number, input: { stdin: string | null; isRandom: boolean }) => of(input)),
    };

    TestBed.configureTestingModule({
      imports: [FeladatsorSzerkesztoComponent],
      providers: [
        { provide: TeacherTaskSetStore, useValue: taskSetStoreMock },
        { provide: SchoolStore, useValue: schoolStoreMock },
        { provide: AuthorizedFileService, useValue: authorizedFileServiceMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
        { provide: TeacherRubricService, useValue: rubricServiceMock },
        // A MI-segítő panel keret-hívásai (a tesztek felülírhatják).
        { provide: ReportService, useValue: { getAiHelperQuota: () => of(helperQuota()) } },
        { provide: TeacherAiCodeTaskService, useValue: { getQuota: () => of({ used: 1, limit: 30, month: '2026-10', isPremium: true }), getActiveJob: () => of(null) } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => '1' } } },
        },
      ],
    });
  }

  it('dolgozatként kiadva kötelező az időablak, 5–240 perc, és az ablak legalább az időkorlát', () => {
    configure(null);
    const form = TestBed.createComponent(FeladatsorSzerkesztoComponent).componentInstance.assignForm;

    form.setValue({ groupId: 3, opensAt: '', dueAt: '', isTest: false, timeLimitMinutes: 45 });
    expect(form.valid).toBe(true); // sima kiadásnál az ablak nem kötelező

    form.patchValue({ isTest: true });
    expect(form.errors?.['testWindowRequired']).toBe(true);

    form.patchValue({ opensAt: '2020-10-05T10:00', dueAt: '2020-10-05T11:00' });
    expect(form.errors?.['testDueInPast']).toBe(true); // múltbeli határidőt a szerver is elutasítaná

    form.patchValue({ opensAt: '2099-10-05T10:00', dueAt: '2099-10-05T10:30' });
    expect(form.errors?.['testWindowTooShort']).toBe(true);

    form.patchValue({ timeLimitMinutes: 300 });
    expect(form.errors?.['testTimeLimit']).toBe(true);

    form.patchValue({ timeLimitMinutes: 30 });
    expect(form.valid).toBe(true);
  });

  it('SQL kódrészlet esetén create.sql/create_lite.sql nélkül figyelmeztetést mutat', () => {
    configure(
      makeDetail({
        tasks: [
          {
            id: 1,
            title: 'F1',
            description: 'd',
            maxPoints: 10,
            taskOrder: 1,
            taskTypeIds: [],
            completeSolutionSnippets: [],
            subTasks: [
              {
                id: 1,
                description: 'd',
                snippets: [{ programmingLanguageId: 6, code: 'SELECT 1;' }],
              },
            ],
          },
        ],
        files: [],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const warning = fixture.nativeElement.querySelector('[data-testid="sql-files-warning"]');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toContain('kötelező');
  });

  it('SQL-feladatnál felkínálja a hiányzó SQL-fájl elkészítését, a gomb a párbeszédablakot nyitja', () => {
    configure(
      makeDetail({
        tasks: [{ id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [5], completeSolutionSnippets: [], subTasks: [] }],
        files: [],
      }),
    );
    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="sql-generation-dialog"]')).toBeNull();
    (fixture.nativeElement.querySelector('[data-testid="ai-panel"] [data-testid="ai-sql-files-open"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="sql-generation-dialog"]')).not.toBeNull();
  });

  it('visszavont (takedown) feladatsoron a hiányzó SQL-fájl elkészítése le van tiltva', () => {
    configure(
      makeDetail({
        takedownAt: '2026-10-01T00:00:00Z',
        tasks: [{ id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [5], completeSolutionSnippets: [],
          subTasks: [{ id: 1, description: 'd', snippets: [{ programmingLanguageId: 6, code: 'SELECT 1;' }] }] }],
        files: [],
      }),
    );
    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('[data-testid="sql-files-warning-generate"]') as HTMLButtonElement).disabled).toBe(true);
    expect((fixture.nativeElement.querySelector('[data-testid="ai-sql-files-open"]') as HTMLButtonElement).disabled).toBe(true);
  });

  describe('MI-segítő panel belépési pontjai', () => {
    const tasks = () => [
      { id: 1, title: 'Prog', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], aiAssisted: true,
        subTasks: [{ id: 11, description: 'a', points: 10, snippets: [] }] },
      { id: 2, title: 'SQL', description: 'd', maxPoints: 10, taskOrder: 2, taskTypeIds: [5], completeSolutionSnippets: [], subTasks: [] },
    ];
    const officeServiceMock = { useValue: { getQuota: () => of(helperQuota()), getActiveJob: () => of(null), getLastSaved: () => of(null) } };
    const click = (el: HTMLElement, testId: string) => (el.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();

    it('a szerkesztőben nincs több szétszórt MI-gomb: minden belépési pont egyszer, a panelen van', () => {
      configure(makeDetail({ tasks: tasks() }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.selectTask(1);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      for (const id of ['ai-new-open', 'ai-complete-open', 'office-task-open', 'desktop-task-open', 'ai-rubric-open', 'ai-sql-files-open']) {
        expect(el.querySelectorAll(`[data-testid="${id}"]`).length, id).toBe(1);
        expect(el.querySelector(`[data-testid="ai-panel"] [data-testid="${id}"]`), id).not.toBeNull();
      }
      expect(el.querySelector('[data-testid="ai-complete-entry"]')).toBeNull();
      expect(el.querySelector('[data-testid="ai-catalog-link"]')!.getAttribute('href')).toBe('/feladatsorok?katalogus=1');
    });

    it('csak kijelölt programozási feladatnál kínálja a hiányzó részek pótlását, és a feladattal nyitja az ablakot; az AI-val készültet jelöli', () => {
      configure(makeDetail({ tasks: tasks() }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      expect(el.querySelectorAll('[data-testid="task-ai-assisted"]').length).toBe(1);
      fixture.componentInstance.selectTask(2);
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="ai-complete-open"]')).toBeNull();

      fixture.componentInstance.selectTask(1);
      fixture.detectChanges();
      click(el, 'ai-complete-open');
      fixture.detectChanges();
      expect(fixture.componentInstance.aiTaskDialog()).toEqual({ mode: 'complete', task: expect.objectContaining({ id: 1 }) });
      expect(el.querySelector('[data-testid="ai-task-dialog"]')!.textContent).toContain('Feladat kiegészítése AI-val');
    });

    it('új programozási feladat a panelről; mentés után újratölt és kinyitja az új feladatot', () => {
      configure(makeDetail({ tasks: tasks() }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      click(el, 'ai-new-open');
      fixture.detectChanges();
      expect(fixture.componentInstance.aiTaskDialog()).toEqual({ mode: 'new', task: null });
      expect(el.querySelector('[data-testid="ai-task-dialog"]')!.textContent).toContain('Új programozási feladat AI-val');

      fixture.componentInstance.onAiTaskSaved(1, 456);
      expect(taskSetStoreMock.loadDetail).toHaveBeenCalledWith(1);
      expect(fixture.componentInstance.tasks.expandedTaskId()).toBe(456);
    });

    it('az irodai ablak a panel típusválasztójával nyílik (alapból Excel, átállítva Word)', () => {
      configure(makeDetail({ tasks: tasks() }));
      TestBed.overrideProvider(TeacherOfficeTaskService, officeServiceMock);
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      click(el, 'office-task-open');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="io-dialog"]')!.textContent).toContain('Irodai feladat a megoldott fájlból (Excel)');
      click(el, 'io-close');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="io-dialog"]')).toBeNull();

      const select = el.querySelector('[data-testid="office-task-kind"]') as HTMLSelectElement;
      select.value = select.options[1].value;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      click(el, 'office-task-open');
      fixture.detectChanges();
      expect(fixture.componentInstance.officeTaskDialog()).toBe('word');
      expect(el.querySelector('[data-testid="io-dialog"]')!.textContent).toContain('Irodai feladat a megoldott fájlból (Word)');
    });

    it('irodai mentés után újranyitva az ablak jelzi a mentett feladatot; az „Ugrás a feladathoz” bezár és kinyitja a feladatot', () => {
      configure(makeDetail({ tasks: tasks() }));
      TestBed.overrideProvider(TeacherOfficeTaskService, officeServiceMock);
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const c = fixture.componentInstance;
      const el: HTMLElement = fixture.nativeElement;
      c.lastOfficeSave.set({ taskSetId: 1, taskId: 456, title: 'Kupa' });
      c.officeTaskDialog.set('excel');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="io-last-saved"]')!.textContent).toContain('Az előző generálás mentve: Kupa');
      click(el, 'io-last-saved-open');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="io-dialog"]')).toBeNull();
      expect(c.tasks.expandedTaskId()).toBe(456);
      // Másik feladatsor mentése nem látszik ezen.
      c.lastOfficeSave.set({ taskSetId: 99, taskId: 1, title: 'Más' });
      c.officeTaskDialog.set('excel');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="io-last-saved"]')).toBeNull();
    });

    it('az „Asztali feladatsor témából” ablak a panelről nyílik', () => {
      configure(makeDetail({ tasks: tasks() }));
      TestBed.overrideProvider(TeacherDesktopTaskService, { useValue: { getActiveJob: () => of(null) } });
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;

      click(el, 'desktop-task-open');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="dt-dialog"]')!.textContent).toContain('Asztali feladatsor témából');
      click(el, 'dt-close');
      fixture.detectChanges();
      expect(el.querySelector('[data-testid="dt-dialog"]')).toBeNull();
    });

    it('a panel „Hiányzó SQL-fájl elkészítése” gombja a generátort nyitja', () => {
      configure(makeDetail({ tasks: tasks() }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      click(fixture.nativeElement, 'ai-sql-files-open');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="sql-generation-dialog"]')).not.toBeNull();
    });

    it('a szempontlista-vázlat kijelölés nélkül tiltott; kijelölve a feladat szempontlista-blokkjához görget', () => {
      vi.useFakeTimers();
      try {
        configure(makeDetail({ tasks: tasks() }));
        const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
        fixture.detectChanges();
        const el: HTMLElement = fixture.nativeElement;
        expect((el.querySelector('[data-testid="ai-rubric-open"]') as HTMLButtonElement).disabled).toBe(true);
        expect(el.querySelector('[data-testid="ai-panel-no-selection"]')).not.toBeNull();

        fixture.componentInstance.selectTask(2);
        fixture.detectChanges();
        vi.runAllTimers();
        const rubricHost = el.querySelector('#task-2 app-szempontlista') as HTMLElement;
        rubricHost.scrollIntoView = vi.fn();
        click(el, 'ai-rubric-open');
        vi.runAllTimers();
        expect(rubricHost.scrollIntoView).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('a szempontlista változásakor (inline MI-vázlat) a panel újratölti a kereteket', () => {
      configure(makeDetail({ tasks: tasks() }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.selectTask(2);
      fixture.detectChanges();
      const reload = vi.spyOn(fixture.debugElement.query(By.directive(MiSegitoPanelComponent)).componentInstance as MiSegitoPanelComponent, 'reload');
      (fixture.debugElement.query(By.directive(AutomatikusJavitasComponent)).componentInstance as AutomatikusJavitasComponent).rubricChanged.emit();
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('visszavont (takedown) feladatsoron minden MI-gomb tiltott', () => {
      configure(makeDetail({ takedownAt: '2026-10-01T00:00:00Z', tasks: tasks() }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.selectTask(1);
      fixture.detectChanges();
      const buttons = fixture.nativeElement.querySelectorAll('[data-testid="ai-panel"] button:not([data-testid="task-outline-toggle"])') as NodeListOf<HTMLButtonElement>;
      expect(buttons.length).toBeGreaterThanOrEqual(6);
      buttons.forEach((b) => expect(b.disabled, b.dataset['testid']).toBe(true));
    });

    it('a vázlat kijelölése kinyitja az összecsukott típus-blokkot és a feladatot; a „+ Új feladat” a blokk űrlapjának címére fókuszál', () => {
      vi.useFakeTimers();
      try {
        configure(makeDetail({ tasks: tasks() }));
        const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
        const c = fixture.componentInstance;
        fixture.detectChanges();
        const el: HTMLElement = fixture.nativeElement;
        c.tasks.toggleSection(6);
        fixture.detectChanges();
        expect(c.tasks.isSectionExpanded(6)).toBe(false);

        click(el, 'outline-task-1');
        fixture.detectChanges();
        expect(c.tasks.isSectionExpanded(6)).toBe(true);
        expect(c.tasks.expandedTaskId()).toBe(1);
        expect(el.querySelector('[data-testid="outline-task-1"]')!.getAttribute('aria-current')).toBe('true');

        // Üres irodai blokk alapból zárva - a „+ Új feladat” kinyitja és a cím-mezőre fókuszál.
        expect(c.tasks.isSectionExpanded(2)).toBe(false);
        click(el, 'outline-add-2');
        fixture.detectChanges();
        vi.runAllTimers();
        expect(c.tasks.isSectionExpanded(2)).toBe(true);
        expect(document.activeElement?.id).toBe('new-task-title-2');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('SQL nélküli feladatsoron nem kínálja a hiányzó SQL-fájl elkészítését', () => {
    configure(makeDetail({ tasks: [], files: [] }));
    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="ai-sql-files-open"]')).toBeNull();
  });

  // UI-TT-30: az "Összevont megoldás" mező a részfeladatonkénti kódrészletektől teljesen
  // különálló - ha az SQL-kód kizárólag ide kerül, a régi usesSql-detektálás ezt sosem látta,
  // ezért a figyelmeztető banner sem jelent meg.
  it('SQL kód kizárólag az Összevont megoldásban esetén is figyelmeztetést mutat', () => {
    configure(
      makeDetail({
        tasks: [
          {
            id: 1,
            title: 'F1',
            description: 'd',
            maxPoints: 10,
            taskOrder: 1,
            taskTypeIds: [],
            completeSolutionSnippets: [{ programmingLanguageId: 6, code: 'SELECT 1;' }],
            subTasks: [
              {
                id: 1,
                description: 'd',
                snippets: [{ programmingLanguageId: 2, code: "print('nem SQL')" }],
              },
            ],
          },
        ],
        files: [],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const warning = fixture.nativeElement.querySelector('[data-testid="sql-files-warning"]');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toContain('kötelező');
  });

  it('SQL kódrészlethez mindkét fájl feltöltve esetén nincs figyelmeztetés', () => {
    configure(
      makeDetail({
        tasks: [
          {
            id: 1,
            title: 'F1',
            description: 'd',
            maxPoints: 10,
            taskOrder: 1,
            taskTypeIds: [],
            completeSolutionSnippets: [],
            subTasks: [
              { id: 1, description: 'd', snippets: [{ programmingLanguageId: 6, code: 'SELECT 1;' }] },
            ],
          },
        ],
        files: [
          { id: 'a', kind: 'CreateSql', originalFileName: 'create.sql', contentType: 'application/sql', sizeBytes: 10, createdAt: '', url: '/x' },
          { id: 'b', kind: 'CreateLiteSql', originalFileName: 'create_lite.sql', contentType: 'application/sql', sizeBytes: 10, createdAt: '', url: '/y' },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('kötelező');
  });

  it('nem-SQL feladatsornál nincs SQL-figyelmeztetés', () => {
    configure(
      makeDetail({
        tasks: [
          {
            id: 1,
            title: 'F1',
            description: 'd',
            maxPoints: 10,
            taskOrder: 1,
            taskTypeIds: [],
            completeSolutionSnippets: [],
            subTasks: [{ id: 1, description: 'd', snippets: [{ programmingLanguageId: 2, code: 'print(1)' }] }],
          },
        ],
        files: [],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    // A "create_lite.sql" felirat a fájl-feltöltő panelen mindig ott van
    // (statikus címke) — a figyelmeztető sáv jelenlétét kell ellenőrizni.
    expect(fixture.nativeElement.querySelector('[data-testid="sql-files-warning"]')).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // A publikálás eddig EGYIRÁNYÚ utca volt: visszavonni nem lehetett, és mivel publikált
  // feladatsort törölni sem, a tanár a saját tartalmát sem tudta eltávolítani - a
  // felületen ráadásul törlés-gomb sem volt, hiába létezett a végpont.
  //
  // A törlés két tiltó esetét ITT mutatjuk meg, nem egy elutasított kérés hibaüzenetében.
  // ---------------------------------------------------------------------------
  const gomb = (f: { nativeElement: HTMLElement }, azonosito: string) =>
    f.nativeElement.querySelector(`[data-testid="${azonosito}"]`);

  function renderel(detail: ReturnType<typeof makeDetail>) {
    configure(detail);
    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    return fixture;
  }

  // 2026-09-28 dolgozat E2E: a szerkesztő „10 pont”-ot mutatott, a dolgozat-áttekintő 5-öt - beadáskor a
  // részfeladatok pontösszege számít, a feladat maxPoints-ja csak felső korlát.
  it('a feladat sorában a ténylegesen kiosztott (részfeladat) pontot mutatja, és jelzi a pontozhatatlan feladatot', () => {
    const task = (id: number, solutions: { id: number; points?: number }[]) => ({
      id, title: `F${id}`, description: 'd', maxPoints: 10, taskOrder: id, taskTypeIds: [], completeSolutionSnippets: [],
      subTasks: solutions.map((s) => ({ ...s, description: 'd', snippets: [] })),
    });
    configure(makeDetail({ tasks: [task(1, [{ id: 1, points: 5 }]), task(2, []), task(3, [{ id: 2, points: 4 }, { id: 3, points: 6 }])], files: [] }));
    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const lines = [...fixture.nativeElement.querySelectorAll('[data-testid="task-points-summary"]')].map((e: Element) => e.textContent!.trim());
    expect(lines[0]).toContain('5 / 10 pont kiosztva');
    expect(lines[1]).toContain('nincs részfeladat - beadáskor nem pontozható');
    expect(lines[2]).toBe('10 pont · 2 részfeladat');
  });

  // Platform-teszt D (2026-10-08): 375 px-en a nem törő, shrink-0 gombsor a címet teljesen kiszorította. A jsdom nem mér
  // elrendezést - a tördelés feltételeit ellenőrizzük; a tényleges 375 px-es képet a böngészős platform-teszt adja.
  it('a fejléc mobilon tördel: a gombsor nem shrink-0, a címblokk kitöltheti a teljes sort', () => {
    const fixture = renderel(makeDetail({ isPublished: true, hasExamSessions: true }));
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-testid="taskset-header"]')!.classList).toContain('flex-wrap');
    const actions = el.querySelector('[data-testid="taskset-actions"]')!;
    expect(actions.classList).toContain('flex-wrap');
    expect(actions.classList).not.toContain('shrink-0');
    expect(el.querySelector('[data-testid="taskset-title"]')!.parentElement!.parentElement!.className).toContain('flex-[1_1_16rem]');
  });

  // Platform-teszt (2026-10-08): 375 px-en a csukott feladatkártya „Törlés” linkje kilógott, mert a cím-gomb
  // flex-elemként nem zsugorodhatott a cím szélessége alá (min-width: auto), így a truncate nem rövidített.
  it('a csukott feladatkártya cím-gombja zsugorodhat (min-w-0), a hosszú cím rövidül, a gombsor nem zsugorodik', () => {
    const hosszuCim = 'Nagyon hosszú feladatcím, amely mobilon biztosan nem fér ki egy sorban a gombok mellett';
    const fixture = renderel(makeDetail({
      tasks: [{ id: 1, title: hosszuCim, description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [], completeSolutionSnippets: [], subTasks: [] }],
    }));
    const toggle: HTMLElement = fixture.nativeElement.querySelector('[data-testid="task-toggle"]');

    expect(toggle.classList).toContain('flex-1');
    expect(toggle.classList).toContain('min-w-0');
    expect(toggle.querySelector('p.truncate')!.textContent).toContain(hosszuCim);
    expect(toggle.nextElementSibling!.classList).toContain('shrink-0');
  });

  // TANARI-SZOVEG-ESCAPE: a leírás sima szöveg - a „<név>” helyőrző szó szerint látszik és nyersen kerül a
  // szerkesztőbe, a HTML-nek látszó szövegből pedig nem lesz DOM-elem (interpoláció, nem innerHTML).
  it('a részfeladat szövegében a <név> és a HTML-nek látszó szöveg szó szerint látszik, nyersen szerkeszthető és menthető', async () => {
    const szoveg = 'Köszöntsd: „Szia, <név>!” <img src=x onerror="window.__xss=1"> List<int> & a < b';
    const fixture = renderel(makeDetail({
      tasks: [{
        id: 1, title: 'F1', description: szoveg, maxPoints: 10, taskOrder: 1, taskTypeIds: [], completeSolutionSnippets: [],
        subTasks: [{ id: 7, description: szoveg, points: 10, label: '1. feladat', snippets: [], rowVersion: 'rv' }],
      }],
    }));
    const component = fixture.componentInstance;
    component.tasks.toggleTask(1);
    fixture.detectChanges();

    const leiras: HTMLElement = fixture.nativeElement.querySelector('p.break-words');
    expect(leiras.textContent!.trim()).toBe(szoveg);
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();

    const edit = fixture.debugElement.injector.get(TaskEditState);
    edit.startEditSolution(component.store.selectedDetail()!.tasks[0].subTasks[0]);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const ertekek = [...fixture.nativeElement.querySelectorAll('textarea')].map((t) => (t as HTMLTextAreaElement).value);
    expect(ertekek).toContain(szoveg);

    edit.saveEditSolution(1, component.store.selectedDetail()!.tasks[0].subTasks[0]);
    expect(taskSetStoreMock.updateSubTask).toHaveBeenCalledWith(1, 7, expect.objectContaining({ description: szoveg }), expect.any(Function));
  });

  it('publikált feladatsornál MEGJELENIK a visszavonás gomb', () => {
    const fixture = renderel(makeDetail({ isPublished: true }));

    expect(gomb(fixture, 'unpublish-button')).not.toBeNull();
  });

  it('piszkozatnál NINCS visszavonás gomb - nincs mit visszavonni', () => {
    const fixture = renderel(makeDetail({ isPublished: false }));

    expect(gomb(fixture, 'unpublish-button')).toBeNull();
  });

  it('admin-takedown alatt NINCS visszavonás gomb - azt csak admin oldhatja fel', () => {
    // A szerver is elutasítaná; a gomb elrejtése azért kell, hogy a tanár ne egy
    // hibaüzenetből tudja meg, hogy ez az állapot nem az övé.
    const fixture = renderel(makeDetail({ isPublished: false, takedownAt: new Date().toISOString() }));

    expect(gomb(fixture, 'unpublish-button')).toBeNull();
  });

  it('piszkozatnál, vizsga nélkül MEGJELENIK a törlés gomb', () => {
    const fixture = renderel(makeDetail({ isPublished: false, hasExamSessions: false }));

    expect(gomb(fixture, 'delete-taskset-button')).not.toBeNull();
  });

  it('publikált feladatsornál NINCS törlés gomb - előbb vissza kell vonni', () => {
    const fixture = renderel(makeDetail({ isPublished: true, hasExamSessions: false }));

    expect(gomb(fixture, 'delete-taskset-button')).toBeNull();
  });

  it('vizsga-munkamenettel NINCS törlés gomb, hanem MAGYARÁZAT - a statisztikák miatt', () => {
    // Ez a legfontosabb eset: ilyet SOHA nem törlünk, mert a diákok eredményei és
    // statisztikái a feladatsorhoz kötődnek. A tanárnak látnia kell, hogy MIÉRT nem.
    const fixture = renderel(makeDetail({ isPublished: false, hasExamSessions: true }));

    expect(gomb(fixture, 'delete-taskset-button')).toBeNull();
    expect(gomb(fixture, 'delete-blocked-exam')?.textContent).toContain('Vizsga készült rajta');
  });

  it('publikált feladatsornál a publikálás gomb letiltva, "Publikálva" felirattal', () => {
    configure(makeDetail({ isPublished: true }));

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="publish-button"]');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Publikálva');
  });

  it('piszkozat feladatsornál a publikálás gomb aktív', () => {
    configure(makeDetail({ isPublished: false }));

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="publish-button"]');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Publikálás');
  });

  // UI-TT-172: a takedownAt-tal rendelkező feladatsor korábban ugyanazt a "Piszkozat"
  // jelvényt kapta, mint egy sosem publikált feladatsor, és a "Publikálás" gomb aktív
  // maradt - a kattintás egy megerősítő dialógus UTÁN, egy garantáltan sikertelen
  // szerver-hívással bukott volna.
  it('BUG UI-TT-172 javítva: admin által visszavont feladatsornál "Admin visszavonta" jelvény, letiltott Publikálás gomb és magyarázó szöveg', () => {
    configure(makeDetail({ isPublished: false, takedownAt: '2026-08-05T10:33:33Z' }));

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const badge: HTMLElement = fixture.nativeElement.querySelector('.badge');
    expect(badge.textContent).toContain('Admin visszavonta');

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="publish-button"]');
    expect(button.disabled).toBe(true);

    expect(fixture.nativeElement.textContent).toContain('a platform-admin adminisztratív okból visszavonta');
  });

  it('BUG UI-TT-172 javítva: a publish() a takedownAt-tal rendelkező feladatsornál védekezésből sem hívja a store-t', async () => {
    configure(makeDetail({ isPublished: false, takedownAt: '2026-08-05T10:33:33Z' }));
    schoolStoreMock.schools.set([{ id: 1 }]);

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    await component.publish(1);

    expect(confirmServiceMock.ask).not.toHaveBeenCalled();
    expect(taskSetStoreMock.publish).not.toHaveBeenCalled();
  });

  it('publish hívás előtt intézményi tagságnál megerősítést kér (ConfirmService)', async () => {
    configure(makeDetail({ isPublished: false }));
    schoolStoreMock.schools.set([{ id: 1 }]);

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    await component.publish(1);

    expect(confirmServiceMock.ask).toHaveBeenCalled();
    expect(taskSetStoreMock.publish).not.toHaveBeenCalled();
  });

  describe('publikálás hiányos automatikus javítással', () => {
    const task = (id: number, title: string) => ({
      id, title, description: 'd', maxPoints: 10, taskOrder: id, taskTypeIds: [6], subTasks: [], completeSolutionSnippets: [],
    });

    it('ha egy feladat sárga/piros, megerősítő ablak sorolja fel a hiányokat; elutasításkor nem publikál', async () => {
      configure(makeDetail({ tasks: [task(1, 'Rendben'), task(2, 'Hiányos')] }));
      rubricServiceMock.getGradingQuality.mockImplementation((_: number, taskId: number) =>
        of(
          taskId === 2
            ? ({
                kind: 'code',
                level: 'red',
                checks: [{ key: 'reference', ok: false, label: 'Nincs referencia', hint: 'Add meg a teljes referencia-megoldást.' }],
                rubric: { status: 'none', itemCount: 0, machineCount: 0 },
              } as GradingQualityDto)
            : ({ kind: 'code', level: 'green', checks: [], rubric: { status: 'approved', itemCount: 1, machineCount: 0 } } as GradingQualityDto),
        ),
      );
      const component = TestBed.createComponent(FeladatsorSzerkesztoComponent).componentInstance;

      await component.publish(1);

      expect(confirmServiceMock.ask).toHaveBeenCalledTimes(1);
      const message: string = confirmServiceMock.ask.mock.calls[0][0].message;
      expect(message).toContain('2. Hiányos');
      expect(message).toContain('Add meg a teljes referencia-megoldást.');
      expect(message).not.toContain('Rendben');
      expect(taskSetStoreMock.publish).not.toHaveBeenCalled();
    });

    it('a figyelmeztetés nem tiltás: megerősítés után publikál', async () => {
      configure(makeDetail({ tasks: [task(1, 'Hiányos')] }));
      rubricServiceMock.getGradingQuality.mockReturnValue(
        of({ kind: 'code', level: 'yellow', checks: [], rubric: { status: 'none', itemCount: 0, machineCount: 0 } } as GradingQualityDto),
      );
      confirmServiceMock.ask.mockResolvedValue(true);
      const component = TestBed.createComponent(FeladatsorSzerkesztoComponent).componentInstance;

      await component.publish(1);

      expect(taskSetStoreMock.publish).toHaveBeenCalledTimes(1);
    });

    it('ha minden feladat zöld, nem kérdez rá', async () => {
      configure(makeDetail({ tasks: [task(1, 'Rendben')] }));
      const component = TestBed.createComponent(FeladatsorSzerkesztoComponent).componentInstance;

      await component.publish(1);

      expect(confirmServiceMock.ask).not.toHaveBeenCalled();
      expect(taskSetStoreMock.publish).toHaveBeenCalledTimes(1);
    });
  });

  it('publish() megvárja a schoolStore.loading() lezárását race esetén, mielőtt eldönti, kell-e megerősítés (UI-TT-47)', async () => {
    configure(makeDetail({ isPublished: false }));
    // A schools() még üres és a store még "loading" — pontosan az az időablak, amikor a
    // taskset-detail válasza HAMARABB érkezett meg, mint az intézmény-lista.
    schoolStoreMock.loading.set(true);
    schoolStoreMock.schools.set([]);

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const publishPromise = component.publish(1);

    // Az intézmény-lista később, de MÉG a publish() döntése előtt megérkezik — a tanár
    // TÉNYLEGESEN tagja egy intézménynek.
    schoolStoreMock.schools.set([{ id: 1 }]);
    schoolStoreMock.loading.set(false);
    fixture.detectChanges();

    await publishPromise;

    expect(confirmServiceMock.ask).toHaveBeenCalled();
    expect(taskSetStoreMock.publish).not.toHaveBeenCalled();
  });

  // UI-TT-110: a UI-TT-47 fix csak a schoolStore.loading() race-t kezeli - azt, hogy a
  // schoolStore.loadMine() ténylegesen HIBÁVAL fusson le (pl. hálózati hiba/500), sosem
  // vizsgálja. Egy sikertelen betöltés is loading()=false-ra és schools()=[]-re fut ki -
  // ez a komponens szemszögéből MEGKÜLÖNBÖZTETHETETLEN attól, hogy a tanár ténylegesen
  // nem tagja egyetlen intézménynek sem. A `schoolStore.error()`-t a komponens SEHOL nem
  // olvassa (`grep -n "schoolStore.error" feladatsor-szerkeszto.component.ts` -> 0 találat),
  // ezért egy TÉNYLEGESEN intézményi tagságú tanár egy átmeneti hiba esetén megerősítés
  // ÉS bármilyen hibajelzés NÉLKÜL azonnal publikál - pont az a helyzet, amit a UI-TT-47
  // fix meg akart előzni.
  it('BUG UI-TT-110 javítva: ha a schoolStore.loadMine() HIBÁVAL fut le (nem csak lassan), a publish() NEM publikál némán - hibaüzenetet jelenít meg és nem hívja a store.publish()-t', async () => {
    configure(makeDetail({ isPublished: false }));
    // A schoolStore.loadMine() elbukott: a finalize() miatt loading() lezárult, de a
    // schools() SOSEM töltődött fel - ugyanaz a jel-állapot, mint egy ténylegesen
    // intézmény nélküli tanárnál, csak itt egy hiba miatt maradt üres.
    schoolStoreMock.loading.set(false);
    schoolStoreMock.schools.set([]);
    schoolStoreMock.error.set('Az intézmények betöltése sikertelen.');

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    await component.publish(1);
    fixture.detectChanges();

    // Elvárás: a tanár lássa, hogy az intézményi-tagság ellenőrzése sikertelen volt.
    expect(fixture.nativeElement.textContent).toContain('Az intézmények betöltése sikertelen.');
    // Elvárás: amíg nem tudjuk eldönteni, kell-e megerősítés, a store.publish() NE
    // fusson le automatikusan, megerősítés-kérés nélkül.
    expect(taskSetStoreMock.publish).not.toHaveBeenCalled();
  });

  // UI-TT-118: a UI-TT-117 (admin-tanarok kvóta-Mentés) testvér-hiánya, de itt a
  // ConfirmService-t magát kerüli meg a kód, nem csak hiányzik a hívása. A publish()
  // KIZÁRÓLAG akkor kér megerősítést a ConfirmService-en keresztül, ha
  // `schoolStore.schools().length > 0` (ld. feladatsor-szerkeszto.component.ts:669-676) —
  // egy intézményhez NEM kötött tanárnál ez az ág teljesen ki van hagyva, a kód egyenesen
  // a `this.store.publish()`-ra fut. Ez azt jelenti, hogy ennél a tanár-szegmensnél a
  // ConfirmService "véletlen" dupla-kattintás elleni védelme (amit a UI-TT-117 ledger-bejegyzés
  // a Felfüggesztés/Aktiválás/Takedown gomboknál élőben igazolt — a resolveFn null-ozása miatt
  // egy második egyidejű ask()-hívás az elsőt automatikusan elutasítottként zárja) SOHA nem lép
  // életbe, mert az ask() magát sosem hívjuk meg. Az EGYETLEN védelem a "Publikálás" gomb
  // `[disabled]="detail.isPublished || store.loading()"` kötése — ez viszont csak akkor
  // működik, ha Angular change detection lefut a két kattintás ESEMÉNYE közt, hogy a
  // `disabled` attribútum ténylegesen frissüljön a DOM-ban. A `TeacherTaskSetStore.publish()`
  // maga sem ellenőriz "folyamatban lévő kérés" jelet induláskor (`teacher-taskset.store.ts:
  // 147-148`: `this._loading.set(true)` feltétel nélkül, nincs előtte `if (this._loading())
  // return;` — szemben pl. az `AdminApplicationStore.approve()`-jal, UI-TT-11 óta). Egy
  // ugyanabban a JS-tickben lezajló szinkron dupla-hívás (amit egy natív dupla-kattintás két
  // click-eseménye produkál, ha azok Angular CD-ciklus nélkül, egymás után futnak le — ugyanaz
  // a jelenség, amit egy korábbi kör a "Mentés" gombon `browser_evaluate`-tel élőben
  // bizonyított) ezért VALÓDI két `store.publish()`-hívást, azaz két külön hálózati kérést
  // eredményez.
  it('BUG UI-TT-118 javítva: publish() intézmény nélküli tanárnál (schools()===[]) kihagyja ugyan a ConfirmService-t, de egy szinkron dupla-hívás CSAK EGY store.publish() hívást indít - a store maga véd a "folyamatban lévő kérés" ellen', () => {
    configure(makeDetail({ isPublished: false }));
    schoolStoreMock.loading.set(false);
    schoolStoreMock.schools.set([]); // nincs intézményi tagság -> a confirm-ág teljesen ki van hagyva

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    // Szinkron dupla-hívás - a publish() ebben az ágban (schools()===[], schoolStore nem
    // "loading") elejétől végig szinkron fut (nincs `await`, amíg el nem éri a
    // `this.store.publish()`-t), ezért két egymás utáni, NEM await-elt hívás pontosan azt
    // szimulálja, amikor egy natív dupla-kattintás két click-eseménye ugyanabban a JS-tickben
    // fut le, mielőtt az Angular change detection frissítené a [disabled] DOM-attribútumot.
    component.publish(1);
    component.publish(1);

    expect(confirmServiceMock.ask).not.toHaveBeenCalled();
    // Elvárás: legfeljebb EGY store.publish()-hívás fusson le dupla-kattintásra. A jelenlegi
    // kód (nincs guard sem a komponensben, sem a store.publish()-ban) mindkét hívást átengedi,
    // ezért ez az assert jelenleg BUKIK (2 hívás 1 helyett).
    expect(taskSetStoreMock.publish).toHaveBeenCalledTimes(1);
  });

  it('a feladat-kártya címe truncate-elt, hogy a Törlés gomb sose kerüljön a kártya overflow-hidden határa mögé (UI-TT-55)', () => {
    const longTitle = 'X'.repeat(160);
    configure(
      makeDetail({
        tasks: [
          { id: 1, title: longTitle, description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [], completeSolutionSnippets: [], subTasks: [] },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const titleEl = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('p')).find((p) =>
      p.textContent?.includes(longTitle),
    );
    expect(titleEl).toBeDefined();
    expect(titleEl!.className).toContain('truncate');
  });

  it('a részfeladat-kártya label/description mezőin truncate/break-words védelem van (UI-TT-56)', () => {
    const longSolutionText = 'S'.repeat(160);
    const longDescription = 'D'.repeat(200);
    configure(
      makeDetail({
        tasks: [
          {
            id: 1,
            title: 'F1',
            description: 'd',
            maxPoints: 10,
            taskOrder: 1,
            taskTypeIds: [],
            completeSolutionSnippets: [],
            subTasks: [{ id: 101, description: longDescription, label: longSolutionText, snippets: [] }],
          },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    fixture.componentInstance.tasks.toggleTask(1);
    fixture.detectChanges();

    const paragraphs = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('p'));
    const solutionTextEl = paragraphs.find((p) => p.textContent?.includes(longSolutionText));
    const descriptionEl = paragraphs.find((p) => p.textContent === longDescription);

    expect(solutionTextEl).toBeDefined();
    expect(solutionTextEl!.className).toContain('truncate');
    expect(descriptionEl).toBeDefined();
    expect(descriptionEl!.className).toContain('break-words');
  });

  it('az oldal saját <h1> feladatsor-címe truncate-elt (UI-TT-57)', () => {
    const longTitle = 'T'.repeat(150);
    configure(makeDetail({ title: longTitle }));

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const h1: HTMLElement = fixture.nativeElement.querySelector('h1');
    expect(h1.textContent).toBe(longTitle);
    expect(h1.className).toContain('truncate');
  });

  it('a letöltő link a bearer tokennel lekért blob URL-re mutat, nem a nyers (401-et adó) API URL-re', () => {
    configure(
      makeDetail({
        files: [
          { id: 'f1', kind: 'SolutionPdf', originalFileName: 'solution.pdf', contentType: 'application/pdf', sizeBytes: 10, createdAt: '', url: '/api/teacher-files/f1' },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const expectedApiUrl = fixture.componentInstance.apiOrigin + '/api/teacher-files/f1';
    expect(authorizedFileServiceMock.resolveUrl).toHaveBeenCalledWith(expectedApiUrl);

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a.text-primary');
    expect(link.getAttribute('href')).toBe(`blob:resolved-${expectedApiUrl}`);
  });

  it('a letöltő link az eredeti fájlnéven ment, nem a blob GUID-ján', () => {
    // A blob URL-nek nincs fájlneve (a BE Content-Disposition fejléce a blobbal elvész, és cross-origin amúgy sem
    // olvasható) - név nélküli letöltésnél a böngésző a blob azonosítóját adná névnek.
    configure(
      makeDetail({
        files: [
          { id: 'f1', kind: 'OfficeSource', originalFileName: 'Árvíztűrő forrás.xlsx', contentType: 'application/octet-stream', sizeBytes: 10, createdAt: '', url: '/api/teacher-files/f1' },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a.text-primary');
    expect(link.getAttribute('download')).toBe('Árvíztűrő forrás.xlsx');
    expect(link.textContent?.trim()).toBe('Letöltés');
  });

  it('a PDF új lapon nyílik meg (előnézet), nem töltődik le', () => {
    configure(
      makeDetail({
        files: [
          { id: 'f1', kind: 'SolutionPdf', originalFileName: 'feladatlap.pdf', contentType: 'application/pdf', sizeBytes: 10, createdAt: '', url: '/api/teacher-files/f1' },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a.text-primary');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.hasAttribute('download')).toBe(false);
    expect(link.textContent?.trim()).toBe('Megnyitás');
  });

  it('UI-TT-163 javítva: nem hívja meg kétszer a resolveUrl()-t ugyanarra a (még fel nem oldott) fájlra, ha a detail két gyors, egymástól FÜGGETLEN mentés miatt kétszer újratöltődik, mielőtt az első blob-letöltés válasza megérkezne — nincs vesztes, sosem revoke-olt blob URL', () => {
    const file = {
      id: 'f1',
      kind: 'SolutionPdf' as const,
      originalFileName: 'solution.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
      createdAt: '',
      url: '/api/teacher-files/f1',
    };

    // Két KÜLÖN, kontrollált blob-letöltés — egyik sem old fel azonnal (mint egy valódi,
    // nagyobb PDF HTTP-válasza), hogy a köztük lévő versenyhelyzet megfigyelhető legyen.
    const pendingCalls: Subject<string>[] = [];
    configure(makeDetail({ files: [file] }));
    authorizedFileServiceMock.resolveUrl = vi.fn(() => {
      const subject = new Subject<string>();
      pendingCalls.push(subject);
      return subject.asObservable();
    });

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    expect(authorizedFileServiceMock.resolveUrl).toHaveBeenCalledTimes(1);

    // Egy FÜGGETLEN, sikeres mentés (pl. egy másik feladat hozzáadása) újratölti a detailt —
    // a store egy ÚJ `files` tömb-referenciát ad ugyanarra az f1 fájlra, MIELŐTT az első
    // resolveUrl() HTTP-válasza megérkezne.
    taskSetStoreMock.selectedDetail.set(makeDetail({ files: [{ ...file }] }));
    fixture.detectChanges();

    // Helyes viselkedés: az f1-re már folyamatban van egy feloldás, nem kellene újat indítani.
    expect(authorizedFileServiceMock.resolveUrl).toHaveBeenCalledTimes(1);

    // A dedupe miatt SOSEM indult el egy második HTTP-hívás (pendingCalls[1] nem is
    // létezik) - az egyetlen, ténylegesen elindult letöltés most megérkezik.
    expect(pendingCalls.length).toBe(1);
    pendingCalls[0].next('blob:first');
    pendingCalls[0].complete();
    fixture.detectChanges();

    // Nincs "vesztes" blob URL, tehát nincs mit revoke-olni sem - a dedupe magát a
    // versenyhelyzetet előzi meg, nem csak a tünetét takarítja el utólag.
    expect(authorizedFileServiceMock.revoke).not.toHaveBeenCalled();
    expect(fixture.componentInstance.downloadHref(file)).toBe('blob:first');
  });

  describe('"Új feladat hozzáadása" draft-kezelés (UI-TT-25 / UI-TT-61)', () => {
    it('BUG UI-TT-61 javítva: whitespace-only cím esetén a "Hozzáadás" gomb letiltva marad (nem csendben no-op)', () => {
      configure(makeDetail({ tasks: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();

      const titleInput: HTMLInputElement = fixture.nativeElement.querySelector('input[name="newTaskTitle-6"]');
      titleInput.value = '   ';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const form = titleInput.closest('form') as HTMLFormElement;
      const submitButton: HTMLButtonElement = form.querySelector('button[type="submit"]')!;
      expect(submitButton.disabled).toBe(true);
    });

    it('valódi (nem-whitespace) cím ÉS leírás esetén a "Hozzáadás" gomb aktív', () => {
      configure(makeDetail({ tasks: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();

      const titleInput: HTMLInputElement = fixture.nativeElement.querySelector('input[name="newTaskTitle-6"]');
      titleInput.value = 'Valódi feladatcím';
      titleInput.dispatchEvent(new Event('input'));
      const descriptionInput: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea[name="newTaskDescription-6"]');
      descriptionInput.value = 'Valódi leírás';
      descriptionInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const form = titleInput.closest('form') as HTMLFormElement;
      const submitButton: HTMLButtonElement = form.querySelector('button[type="submit"]')!;
      expect(submitButton.disabled).toBe(false);
    });

    // UI-TT-90: a backend CreateTeacherTaskRequest.Description mezője [Required] - a "Hozzáadás"
    // gomb korábban kizárólag a címet ellenőrizte, így üres leírás mellett is aktív maradt, és a
    // tanár csak a beküldés utáni 400-as válaszból tudta meg, hogy a leírás is kötelező.
    it('BUG UI-TT-90 javítva: valódi cím mellett whitespace-only leírás esetén a "Hozzáadás" gomb letiltva marad', () => {
      configure(makeDetail({ tasks: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();

      const titleInput: HTMLInputElement = fixture.nativeElement.querySelector('input[name="newTaskTitle-6"]');
      titleInput.value = 'Valódi feladatcím';
      titleInput.dispatchEvent(new Event('input'));
      const descriptionInput: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea[name="newTaskDescription-6"]');
      descriptionInput.value = '   ';
      descriptionInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const form = titleInput.closest('form') as HTMLFormElement;
      const submitButton: HTMLButtonElement = form.querySelector('button[type="submit"]')!;
      expect(submitButton.disabled).toBe(true);
    });

    it('BUG UI-TT-81 javítva: whitespace-only leírás esetén a részfeladat "Hozzáadás" gombja (addSubTask) is letiltva marad', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], subTasks: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.tasks.toggleTask(1); // a részfeladat-lista/hozzáadás form csak kibontott feladatnál renderelődik
      fixture.componentInstance.tasks.setNewSolutionDescription(1, '   ');
      fixture.detectChanges();

      const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('input[name="newSolutionDescription"]')
        .closest('form').querySelector('button[type="submit"]');
      expect(submitButton.disabled).toBe(true);
    });

    it('valódi (nem-whitespace) részfeladat-leírás esetén a "Hozzáadás" (addSubTask) gomb aktív', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], subTasks: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.tasks.toggleTask(1);
      fixture.componentInstance.tasks.setNewSolutionDescription(1, 'Valódi részfeladat-leírás');
      fixture.detectChanges();

      const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('input[name="newSolutionDescription"]')
        .closest('form').querySelector('button[type="submit"]');
      expect(submitButton.disabled).toBe(false);
    });
  });

  // UI-TT-193: egy MEGLÉVŐ részfeladat pontszámának/leírásának eddig NEM volt UI-
  // belépési pontja - kizárólag "Törlés" gomb volt, a teljesen kiépített és guardolt
  // backend UpdateSolutionAsync-ot semelyik komponens nem hívta. Ez a describe blokk
  // az újonnan bevezetett inline szerkesztő (Szerkesztés gomb -> leírás/pont mező +
  // Mentés/Mégsem) viselkedését fedi le.
  describe('meglévő részfeladat inline szerkesztése (UI-TT-193)', () => {
    function configureWithSolution() {
      configure(
        makeDetail({
          tasks: [
            {
              id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6],
              completeSolutionSnippets: [],
              subTasks: [{ id: 5, description: 'Eredeti leírás', points: 5, label: 'Rész1', snippets: [] }],
            },
          ],
        }),
      );
    }

    it('"Szerkesztés" gombra kattintva megjelenik az inline szerkesztő, a JELENLEGI leírással/ponttal előtöltve', () => {
      configureWithSolution();
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      component.tasks.toggleTask(1);
      fixture.detectChanges();

      // UI-TT-214 óta a feladat-kártyának IS van saját "Szerkesztés" gombja (a
      // task-fejlécben, a kiterjesztett tartalmon KÍVÜL, tehát DOM-sorrendben előbb) -
      // ez a teszt a MÁSODIK találatot keresi, ami a részfeladat saját gombja.
      const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      const editButtons = buttons.filter((b) => b.textContent?.trim() === 'Szerkesztés');
      const editButton = editButtons[1];
      expect(editButton).toBeTruthy();
      editButton.click();
      fixture.detectChanges();

      // A component-szintű állapotot ellenőrizzük (a draftCode()-hoz hasonló
      // meglévő tesztek is így tesznek ebben a fájlban) - az ngModel-kötött
      // textarea/input élő DOM `.value`-jának szinkron kiolvasása ebben a
      // teszt-harnessben nem megbízható.
      const edit = fixture.debugElement.injector.get(TaskEditState);
      expect(edit.editingSolutionId()).toBe(5);
      expect(edit.editSolutionDraft({ id: 5, description: 'Eredeti leírás', points: 5, snippets: [] }))
        .toEqual({ description: 'Eredeti leírás', points: 5 });
      const labels: HTMLLabelElement[] = Array.from(fixture.nativeElement.querySelectorAll('label'));
      expect(labels.some((l) => l.textContent?.trim() === 'Leírás')).toBe(true);
      expect(labels.some((l) => l.textContent?.trim() === 'Pont')).toBe(true);
    });
  });

  // A feladat/részfeladat hozzáadás és törlés testvér-tesztjei a feladatsor-szerkeszto/task-section.state.spec.ts-ben vannak.
  describe('dupla-kattintás / idempotencia védelem hiánya (ÚJ LELET, még nincs ledger-ID)', () => {
    // BE-FELADATSORSZERKESZTO-DELETE-NO-LOADING-GUARD: a megerősítő dialógus alatt egy másik mutáció elindulhat, és a
    // mögöttes mutateAndReload() nem idempotens.
    it('JAVÍTVA: deleteFile() nem hívja meg a store.deleteFile()-t, ha egy másik mutáció már folyamatban van (store.loading()===true)', async () => {
      configure(makeDetail({ files: [{ id: 'f1', kind: 'CreateSql', originalFileName: 'create.sql', contentType: 'application/sql', sizeBytes: 10, createdAt: '', url: '/x' }] }));
      confirmServiceMock.ask.mockResolvedValue(true);
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      taskSetStoreMock.loading.set(true);
      await component.deleteFile(1, 'f1', 'create.sql');

      expect(taskSetStoreMock.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('UI-TT-123: uploadFile() nem védett a store.loading()-guarddal, szemben az addTask()/addSubTask() UI-TT-115 fixével', () => {
    // uploadFile() (feladatsor-szerkeszto.component.ts) — az addTask()/addSubTask() UI-TT-115
    // fixétől eltérően — sem a metódus elején nem néz `if (this.store.loading()) return;`-t,
    // sem a "Fájlok" szekció fájl-inputjai nincsenek `[disabled]="store.loading()"`-hoz kötve
    // (feladatsor-szerkeszto.component.ts .html, a négy `<input type="file">`). Egy lassú
    // hálózaton egy türelmetlen tanár, aki a rossz fájlt választotta ki, VAGY egy megszokásból
    // kétszer megnyitott fájl-választó ablakot használva ugyanahhoz a `kind`-hoz gyorsan
    // egymás után két fájlt tölt fel, MIELŐTT az első kérés visszatérne — a store.uploadFile()
    // ekkor kétszer hívódik meg egyidejűleg. A backend UI-TT-63 fixe (SERIALIZABLE tranzakció)
    // ugyan megakadályozza a duplikált DB-sort/kvóta-túllépést, DE a VÉGSŐ, ténylegesen
    // megmaradó fájl ilyenkor attól függ, melyik HTTP-válasz ér célba UTOLJÁRA a szerveren —
    // nem attól, melyik feltöltést a tanár ténylegesen "utolsónak/helyesnek" szánta. Emiatt egy
    // félreklikkelt, majd gyorsan javított feltöltésnél a tanár a HELYES fájlhoz tartozó
    // "Fájl feltöltve." sikertoastot láthatja, miközben végül mégis a HIBÁS (korábban
    // véletlenül kiválasztott) fájl marad tárolva — pont azt a fajta versenyhelyzetet, amit a
    // guard a testvér addTask()/addSubTask() formoknál (UI-TT-115) már kizár azzal, hogy a
    // második kattintást/eseményt csendben, no-opként eldobja.
    it('UI-TT-123 JAVÍTVA: egy második file-input "change" esemény, MÍG az első feltöltés még folyamatban van (store.loading()===true), CSAK EGYSZER hívja meg a store.uploadFile()-t ugyanahhoz a fájl-típushoz', () => {
      configure(makeDetail({ tasks: [], files: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      const wrongFile = new File(['create table x'], 'wrong.sql', { type: 'application/sql' });
      const correctFile = new File(['create table y'], 'correct.sql', { type: 'application/sql' });

      // Első fájlválasztás (a tanár véletlenül a rossz fájlt választja) — a mock uploadFile()
      // alapból NEM hívja meg onSuccess-t, tehát a kérés "folyamatban van". A VALÓS store-ban ez
      // szinkron módon már true-ra állítaná a `loading` jelet (mutateAndReload) — ezt itt
      // explicit szimuláljuk, mielőtt a második, javító fájlválasztás megtörténne.
      component.uploadFile(1, 'CreateSql', {
        target: { files: [wrongFile], value: '' } as unknown as HTMLInputElement,
      } as unknown as Event);
      taskSetStoreMock.loading.set(true);

      // Második, gyors egymás-utáni fájlválasztás UGYANAHHOZ a `kind`-hoz, MÍG az első kérés
      // még folyamatban van (a tanár rájön, hogy rossz fájlt választott, és azonnal javít).
      // Egy idempotencia-védett file-inputnak ekkor csendben no-op-nak kellene lennie
      // (ugyanúgy, mint az addTask()/addSubTask() UI-TT-115 fixe után) — ehelyett mindkét
      // feltöltés ténylegesen elindul.
      component.uploadFile(1, 'CreateSql', {
        target: { files: [correctFile], value: '' } as unknown as HTMLInputElement,
      } as unknown as Event);

      expect(taskSetStoreMock.uploadFile).toHaveBeenCalledTimes(1);
    });
  });

  // UI-TT-114: a UI-TS-117/118/119/120 hibacsalád ("8 támogatott Judge0-nyelv, de nem minden
  // felszínen van végigvezetve") ötödik, teacher-fe-oldali előfordulása. A student-fe
  // `LanguageMapperService.judge0ToBackendLanguageId` térképe szerint a C nyelvnek van érvényes,
  // működő backend nyelv-id-je (12 — ld. `48: 12, 49: 12, 50: 12, 75: 12` és a fordított
  // `12: 50, // C` bejegyzés a `language-mapper.service.ts`-ben), tehát a C ugyanolyan
  // "elsőosztályú" választható nyelv, mint C#/C++/Java/JavaScript/Python/SQL. Ennek ellenére
  // ez a komponens (`feladatsor-szerkeszto.component.ts` 16-23. sor) saját, hardcode-olt
  // `LANGUAGES` tömbje (`readonly languages`) KIHAGYJA a C-t (backend id 12) - csak 6 nyelvet
  // sorol fel (Python=2, C#=5, JavaScript=7, C++=8, Java=10, SQL=6). Gyakorlati hatás: a tanár
  // a részfeladat/összevont-megoldás kódrészlet-szerkesztőben SOSEM tud C-nyelvű referencia-kódot
  // megadni egyetlen feladathoz sem - a nyelvenkénti textarea-rács egyszerűen nem jelenít meg C
  // mezőt -, miközben a diák-oldali szerkesztő a C-t a többi 7 nyelvvel egyenrangúan kínálja.
  describe('nyelvenkénti kódrészlet-szerkesztő nyelvlistája (UI-TT-114)', () => {
    it('BUG UI-TT-114: a részfeladat kódrészlet-rácsban nincs C-nyelvű textarea-mező, miközben Python/C#/JavaScript/C++/Java/SQL mind megjelenik', () => {
      configure(
        makeDetail({
          tasks: [
            {
              id: 1,
              title: 'F1',
              description: 'd',
              maxPoints: 10,
              taskOrder: 1,
              taskTypeIds: [6],
              completeSolutionSnippets: [],
              subTasks: [{ id: 101, description: 'd', snippets: [] }],
            },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.tasks.toggleTask(1);
      fixture.detectChanges();

      const labels = Array.from<HTMLLabelElement>(fixture.nativeElement.querySelectorAll('label')).map(
        (el) => el.textContent?.trim(),
      );

      expect(labels).toContain('Python');
      expect(labels).toContain('C#');
      expect(labels).toContain('JavaScript');
      expect(labels).toContain('C++');
      expect(labels).toContain('Java');
      expect(labels).toContain('SQL');
      // A tényleges (hibás) állapot szerint 'C' NINCS a listában - ez a bukó elvárás.
      expect(labels).toContain('C');
    });
  });

  // UI-TT-129: a UI-TS-179-nél (student-fe) már azonosított "aria-expanded hiánya" harmonika-
  // altípus első teacher-fe előfordulása. A "Feladatok" blokk két, egymástól független szintjén
  // (típusonkénti szekció-fejléc ÉS az azon belüli feladat-sor fejléce) is ugyanaz a minta: a
  // fejléc egy <button (click)> ami egy boolean-jellegű signalt (expandedSections/expandedTaskId)
  // billent, a hozzá tartozó chevron ikon [class.-rotate-90]-nel el is forog az állapot szerint -
  // de a gombon magán SOSEM jelenik meg [attr.aria-expanded], ezért egy screen reader-felhasználó
  // egyik állapotában sem tudja megállapítani, hogy az adott szekció/feladat éppen nyitva vagy
  // csukva van-e.
  describe('szekció-/feladat-fejléc lenyitó gombjain hiányzó aria-expanded (UI-TT-129)', () => {
    it('BUG (ÚJ, UI-TT-129): a típus-szekció fejléc gombján (toggleSection, 102. sor) nincs aria-expanded, csak a chevron-ikon forog [class.-rotate-90]-nel', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], subTasks: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      const sectionToggleButton = buttons.find((b) => b.textContent?.includes('Programozás'));
      expect(sectionToggleButton).toBeDefined();
      // Alapból nyitva van a Programozás szekció (isSectionExpanded(6) === true) - a komponens
      // állapota szerint a gombnak aria-expanded="true"-t kellene hordoznia.
      expect(component.tasks.isSectionExpanded(6)).toBe(true);

      // Bukó elvárás: a valós DOM-ban a gombon NINCS jelen az aria-expanded attribútum, holott a
      // fenti belső állapot szerint jelen kellene lennie, "true" értékkel.
      expect(sectionToggleButton!.getAttribute('aria-expanded')).toBe('true');
    });

    it('BUG (ÚJ, UI-TT-129): a feladat-sor fejléc gombján (toggleTask, 121. sor) sincs aria-expanded, holott az expandedTaskId signal a chevron-forgatás ÉS a részfeladatok megjelenítése mögött is ugyanaz', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], subTasks: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.tasks.toggleTask(1);
      fixture.detectChanges();

      expect(fixture.componentInstance.tasks.expandedTaskId()).toBe(1);

      const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      const taskToggleButton = buttons.find((b) => b.dataset['testid'] === 'task-toggle' && b.textContent?.includes('F1'));
      expect(taskToggleButton).toBeDefined();

      // Bukó elvárás: toggleTask(1) után a feladat nyitva van (expandedTaskId()===1, a részfeladatok
      // ténylegesen renderelve is vannak), de a gombon NINCS aria-expanded="true".
      expect(taskToggleButton!.getAttribute('aria-expanded')).toBe('true');
    });
  });

  // UI-TT-141: a store `upsertSubTaskSnippets()`/`upsertCompleteSolutionSnippets()`-je a
  // UI-TT-121 fix óta korai-return-nel véd a MINDEN mutáló metódus által megosztott
  // `_loading` jelzőn. A testvér `addTask`/`addSubTask`/`uploadFile` gombok HELYESEN
  // kötik a `[disabled]`-jüket `store.loading()`-hoz, e kettő viszont NEM — így ha a tanár
  // épp egy MÁSIK feladatot/megoldást töröl, és közben a kódrészlet mentésére kattint, a
  // hívás csendben elakad a guardon: nincs hálózati kérés, nincs toast, és a gomb
  // vizuálisan sem tűnik letiltottnak. A tanár azt hiheti, hogy mentett.
  describe('kódrészlet-mentő gombok letiltása folyamatban lévő művelet alatt (UI-TT-141)', () => {
    function configureWithSolution() {
      configure(
        makeDetail({
          tasks: [
            {
              id: 1,
              title: 'F1',
              description: 'd',
              maxPoints: 10,
              taskOrder: 1,
              taskTypeIds: [6],
              completeSolutionSnippets: [],
              subTasks: [{ id: 11, description: 'r1', snippets: [] }],
            },
          ],
        }),
      );
    }

    function snippetButtons(fixture: { nativeElement: HTMLElement }) {
      const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      return {
        kodreszletek: buttons.find((b) => b.textContent?.includes('Kódrészletek mentése')),
        osszevont: buttons.find((b) => b.textContent?.includes('Összevont megoldás mentése')),
      };
    }

    it('BUG UI-TT-141 javítva: folyamatban lévő művelet alatt MINDKÉT kódrészlet-mentő gomb letiltott', () => {
      configureWithSolution();
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.tasks.toggleTask(1);
      fixture.detectChanges();

      // Egy MÁSIK művelet (pl. feladat-törlés) van folyamatban.
      taskSetStoreMock.loading.set(true);
      fixture.detectChanges();

      const { kodreszletek, osszevont } = snippetButtons(fixture);
      expect(kodreszletek).toBeDefined();
      expect(osszevont).toBeDefined();
      expect(kodreszletek!.disabled).toBe(true);
      expect(osszevont!.disabled).toBe(true);
    });

    it('nyugalmi állapotban mindkét kódrészlet-mentő gomb használható marad', () => {
      configureWithSolution();
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.tasks.toggleTask(1);
      fixture.detectChanges();

      const { kodreszletek, osszevont } = snippetButtons(fixture);
      expect(kodreszletek!.disabled).toBe(false);
      expect(osszevont!.disabled).toBe(false);
    });
  });

  it('JAVÍTVA UI-TT-214: a feladat-kártyán ELÉRHETŐ egy "Szerkesztés" vezérlő (cím/leírás/pont javítására, a testvér "Új részfeladat" - store.updateSubTask() - szerkesztő mintáját követve)', () => {
    configure(
      makeDetail({
        tasks: [
          { id: 1, title: 'reorder-task-A', description: 'first task', maxPoints: 10, taskOrder: 1, taskTypeIds: [], completeSolutionSnippets: [], subTasks: [] },
          { id: 2, title: 'reorder-task-B', description: 'second task', maxPoints: 10, taskOrder: 2, taskTypeIds: [], completeSolutionSnippets: [], subTasks: [] },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    // A testvér funkció (részfeladat-szerkesztés, UI-TT-193) "Szerkesztés" feliratú gombbal ér
    // el egy store.updateSubTask()-höz kötött inline formot - a feladat (task) szintjén ennek
    // a UI-TT-214 fix óta van megfelelője (store.updateTask()-hoz kötve, taskOrder mezővel
    // kiegészítve).
    const editButtons = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim() === 'Szerkesztés',
    );
    expect(editButtons.length).toBeGreaterThan(0);
  });

  // ── A4: feladatsor-metadata szerkesztő ───────────────────────────────────

  describe('A4: feladatsor-metadata szerkesztő (updateMetadata)', () => {
    it('form kitöltés → store.updateTaskSet() hívódik a helyes payloaddal (a betöltött konkurencia-tokennel)', () => {
      configure(makeDetail({ title: 'Eredeti cím', description: 'Eredeti leírás', levelId: 2, rowVersion: 'AQAAAA==', requiredSkillIds: [4] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.metadataDraft()?.requiredSkillIds).toEqual([4]);

      component.metadataDraft.set({
        title: 'Módosított cím',
        description: 'Módosított leírás',
        levelId: 3,
        subjectCategoryId: 5,
        requiredSkillIds: [4, 7],
      });

      component.updateMetadata(1);

      expect(taskSetStoreMock.updateTaskSet).toHaveBeenCalledWith(
        1,
        {
          title: 'Módosított cím',
          description: 'Módosított leírás',
          levelId: 3,
          subjectCategoryId: 5,
          requiredSkillIds: [4, 7],
          rowVersion: 'AQAAAA==',
        },
        expect.any(Function),
      );
    });

    it('whitespace-only cím esetén updateMetadata() csendben visszatér, a store-t nem hívja meg', () => {
      configure(makeDetail());
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.metadataDraft.set({
        title: '   ',
        description: 'Leírás',
        levelId: 2,
        subjectCategoryId: null,
        requiredSkillIds: [],
      });

      component.updateMetadata(1);

      expect(taskSetStoreMock.updateTaskSet).not.toHaveBeenCalled();
    });
  });

  describe('F: irodai feladatok', () => {
    const officeTask = (overrides: Partial<TeacherTaskDto> = {}): TeacherTaskDto => ({
      id: 7,
      title: 'Meghívó',
      description: 'd',
      maxPoints: 10,
      taskOrder: 1,
      taskTypeIds: [1],
      subTasks: [{ id: 70, label: 'a)', description: 'Cím formázása', points: 10, snippets: [] }],
      completeSolutionSnippets: [],
      ...overrides,
    });
    const file = (overrides: Partial<TeacherFileDto>): TeacherFileDto => ({
      id: 'f1',
      kind: 'OfficeSource',
      originalFileName: 'nyers.txt',
      contentType: 'text/plain',
      sizeBytes: 10,
      createdAt: '2026-10-07T10:00:00Z',
      url: '/api/teacher-files/f1',
      taskId: 7,
      ...overrides,
    });
    const fileEvent = (files: File[]) => {
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', { value: files });
      return { target: input } as unknown as Event;
    };

    it('irodai feladatnál nincs kódrészlet- és összevont-megoldás-szerkesztő, helyette a Fájlok részre utal', () => {
      configure(makeDetail({ tasks: [officeTask()] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.tasks.toggleTask(7);
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent as string;

      expect(text).not.toContain('Kódrészletek mentése');
      expect(text).not.toContain('Összevont megoldás');
      expect(fixture.nativeElement.querySelector('[data-testid="office-files-hint"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('app-automatikus-javitas')).not.toBeNull();
    });

    it('a Fájlok részen feladatonként „Forrásfájlok” és „Megoldásod”; a feladathoz kötött fájl ott jelenik meg, nem a feladatsor-szintű listában', () => {
      configure(
        makeDetail({
          tasks: [officeTask()],
          files: [file({}), file({ id: 'f2', kind: 'CreateSql', originalFileName: 'create.sql', taskId: null })],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const block: HTMLElement = fixture.nativeElement.querySelector('[data-testid="office-files-7"]');

      expect(block.querySelector('[data-testid="office-slot-OfficeSource"]')!.textContent).toContain('nyers.txt');
      expect(block.textContent).toContain('Megoldásod');
      expect(block.querySelector('[data-testid="office-solution-missing"]')!.textContent).toContain(
        'Töltsd fel a saját megoldásodat – ebből készül a szempontlista.',
      );
      expect(fixture.componentInstance.taskSetFiles().map((f) => f.id)).toEqual(['f2']);
    });

    it('feltöltéskor a nem elfogadott típusú vagy 20 MB fölötti fájlt kihagyja és megnevezi, a többit a feladathoz tölti fel', () => {
      configure(makeDetail({ tasks: [officeTask()] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const toast = TestBed.inject(ToastService);
      const warning = vi.spyOn(toast, 'warning');
      const ok = new File(['x'], 'megoldas.DOCX');
      const bad = new File(['x'], 'virus.exe');
      const big = new File(['x'], 'nagy.png');
      Object.defineProperty(big, 'size', { value: 21 * 1024 * 1024 });

      fixture.componentInstance.uploadOfficeFiles(1, 7, 'OfficeSolution', fileEvent([ok, bad, big]));

      expect(warning).toHaveBeenCalledWith(expect.stringContaining('virus.exe, nagy.png'), 6000);
      expect(taskSetStoreMock.uploadFiles).toHaveBeenCalledWith(1, 'OfficeSolution', [ok], 7, expect.any(Function));
    });
  });

  describe('Tesztbemenet (tárolt billentyűzetes bemenet)', () => {
    const codeTask = (taskTypeIds: number[], code = 'x = input()\nprint(x)') => ({
      id: 9, title: 'Beolvasás', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds, subTasks: [],
      completeSolutionSnippets: [{ programmingLanguageId: 2, code }],
    });

    it('kód-feladatnál az Összevont megoldás alatt megjelenik, SQL-feladatnál nem', () => {
      configure(makeDetail({ tasks: [codeTask([6])] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.tasks.toggleTask(9);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('app-tesztbemenet')).not.toBeNull();
      expect(rubricServiceMock.getRunInput).toHaveBeenCalledWith(1, 9);
      TestBed.resetTestingModule();

      configure(makeDetail({ tasks: [codeTask([5], 'SELECT 1;')] }));
      const sql = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      sql.componentInstance.tasks.toggleTask(9);
      sql.detectChanges();
      expect(sql.nativeElement.querySelector('app-tesztbemenet')).toBeNull();
    });

    it('mentés után az Automatikus javítás blokk újratölti az állapotot', () => {
      configure(makeDetail({ tasks: [codeTask([6])] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.tasks.toggleTask(9);
      fixture.detectChanges();
      const before = rubricServiceMock.getGradingQuality.mock.calls.length;

      const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('[data-testid="run-input-stdin"]');
      textarea.value = '5';
      textarea.dispatchEvent(new Event('input'));
      (fixture.nativeElement.querySelector('[data-testid="run-input-save"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(rubricServiceMock.saveRunInput).toHaveBeenCalledWith(1, 9, { stdin: '5', isRandom: false });
      expect(rubricServiceMock.getGradingQuality.mock.calls.length).toBe(before + 1);
    });

    it('a „stdin” teendő gombja kinyitja a Tesztbemenet részt és odagörget', async () => {
      configure(makeDetail({ tasks: [codeTask([6], 'print(1)')] }));
      rubricServiceMock.getGradingQuality.mockReturnValue(
        of({
          kind: 'code',
          level: 'yellow',
          checks: [{ key: 'stdin', ok: false, label: 'A billentyűzetes bemenethez van tárolt bemenet', hint: 'Add meg.' }],
          rubric: { status: 'none', itemCount: 0, machineCount: 0 },
        } as GradingQualityDto),
      );
      const scroll = vi.fn();
      const original = HTMLElement.prototype.scrollIntoView;
      HTMLElement.prototype.scrollIntoView = scroll;
      onTestFinished(() => {
        HTMLElement.prototype.scrollIntoView = original;
      });
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.tasks.toggleTask(9);
      fixture.detectChanges();
      // A megoldás nem olvas a billentyűzetről: a rész csukva indul.
      expect(fixture.nativeElement.querySelector('[data-testid="run-input-stdin"]')).toBeNull();

      (fixture.nativeElement.querySelector('[data-testid="auto-grading-stdin-link"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r));

      expect(fixture.nativeElement.querySelector('[data-testid="run-input-stdin"]')).not.toBeNull();
      expect(scroll).toHaveBeenCalled();
    });
  });

  describe('SQL megoldó lekérdezések MI-vel', () => {
    const sqlTask = (overrides: Partial<TeacherTaskDto> = {}): TeacherTaskDto => ({
      id: 7, title: 'Települések', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [5], completeSolutionSnippets: [],
      subTasks: [{ id: 70, label: '2.', description: 'd', snippets: [] }], ...overrides,
    });
    const liteFile = (taskId: number | null): TeacherFileDto => ({
      id: 'l', kind: 'CreateLiteSql', originalFileName: 'create_lite.sql', contentType: 'application/sql', sizeBytes: 10,
      createdAt: '2026-10-15T10:00:00Z', url: '/api/teacher-files/l', taskId,
    });

    it('csak kijelölt SQL-feladatnál kínálja a panel, és a feladat párbeszédablakát nyitja', () => {
      configure(makeDetail({ tasks: [sqlTask(), sqlTask({ id: 8, taskTypeIds: [6] })], files: [liteFile(null)] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.selectTask(8);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="sql-queries-open"]')).toBeNull();

      fixture.componentInstance.selectTask(7);
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('[data-testid="sql-queries-open"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="sql-queries-dialog"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="sql-q-no-lite"]')).toBeNull();
    });

    it('create_lite.sql nélkül az ablak az SQL-fájl generálóhoz irányít', () => {
      configure(makeDetail({ tasks: [sqlTask()], files: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.tasks.toggleTask(7);
      fixture.componentInstance.tasks.sqlQueriesTaskId.set(7);
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('[data-testid="sql-q-open-sql-files"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="sql-queries-dialog"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('[data-testid="sql-generation-dialog"]')).not.toBeNull();
    });
  });

  describe('katalógus-másolat hozzáférése', () => {
    it('fizetős forrás másolatánál a fizetős hozzáférést jelzi', () => {
      configure(makeDetail({ copiedFromTaskSetId: 15, isFree: false, isPremiumOnly: false }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="copied-access"]').textContent)
        .toContain('Fizetős – a diákjaidnak előfizetés vagy iskolai licenc kell hozzá; dolgozatban mindenki elérheti');
    });

    it('ingyenes forrás másolatánál az ingyenes hozzáférést jelzi', () => {
      configure(makeDetail({ copiedFromTaskSetId: 15, isFree: true, isPremiumOnly: false }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="copied-access"]').textContent).toContain('Ingyenes – minden diákod eléri.');
    });

    it('saját (nem másolt) feladatsornál nincs hozzáférés-sáv', () => {
      configure(makeDetail());
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="copied-access"]')).toBeNull();
    });
  });

  describe('feladatonkénti SQL-séma (katalógus-másolat két SQL-feladattal)', () => {
    const sql = (id: number, order: number): TeacherTaskDto => ({
      id, title: 'SQL ' + order, description: 'd', maxPoints: 10, taskOrder: order, taskTypeIds: [5], completeSolutionSnippets: [], subTasks: [],
    });
    const schema = (id: string, kind: 'CreateSql' | 'CreateLiteSql', taskId: number | null): TeacherFileDto => ({
      id, kind, originalFileName: id + '.sql', contentType: 'application/sql', sizeBytes: 10, createdAt: '2026-10-15T10:00:00Z',
      url: '/api/teacher-files/' + id, taskId,
    });
    const pick = (fixture: { nativeElement: HTMLElement }, inputId: string) => {
      const input = fixture.nativeElement.querySelector(`[data-testid="${inputId}"]`) as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [new File(['x'], 'create_lite.sql')], configurable: true });
      input.dispatchEvent(new Event('change'));
    };

    it('egy sémás feladatsoron nincs feladatválasztó, a feltöltés feladatsor-szintű (változatlan)', () => {
      configure(makeDetail({ tasks: [sql(7, 1), sql(8, 2)], files: [schema('l', 'CreateLiteSql', null)] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="schema-task-CreateLiteSql"]')).toBeNull();
      pick(fixture, 'file-input-CreateLiteSql');
      expect(taskSetStoreMock.uploadFile.mock.calls[0][3]).toBeUndefined();
    });

    it('feladathoz kötött sémánál „Melyik feladathoz?” választó; választásig tiltott, utána a feladatra tölt fel', () => {
      configure(makeDetail({ tasks: [sql(7, 1), sql(8, 2)], files: [schema('a', 'CreateLiteSql', 7), schema('b', 'CreateLiteSql', 8)] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="schema-task-CreateLiteSql"]')).not.toBeNull();
      expect((fixture.nativeElement.querySelector('[data-testid="file-input-CreateLiteSql"]') as HTMLInputElement).disabled).toBe(true);
      // A nem SQL fajták változatlanok.
      expect(fixture.nativeElement.querySelector('[data-testid="schema-task-InputTxt"]')).toBeNull();

      fixture.componentInstance.schemaTaskChoice.set(8);
      fixture.detectChanges();
      expect((fixture.nativeElement.querySelector('[data-testid="file-input-CreateLiteSql"]') as HTMLInputElement).disabled).toBe(false);
      pick(fixture, 'file-input-CreateLiteSql');
      expect(taskSetStoreMock.uploadFile).toHaveBeenCalledWith(1, 'CreateLiteSql', expect.any(File), 8, expect.any(Function));
    });

    it('a feladathoz kötött sémák a fájllistában a feladat jelölésével látszanak', () => {
      configure(makeDetail({ tasks: [sql(7, 1), sql(8, 2)], files: [schema('a', 'CreateLiteSql', 7), schema('b', 'CreateLiteSql', 8)] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="file-row-a"]').textContent).toContain('1. feladat');
      expect(fixture.nativeElement.querySelector('[data-testid="file-row-b"]').textContent).toContain('2. feladat');
    });

    it('a generátor több SQL-feladatnál választás után nyílik, és a célfeladat fájljait kapja', () => {
      configure(makeDetail({ tasks: [sql(7, 1), sql(8, 2)], files: [schema('a', 'CreateSql', 7), schema('b', 'CreateLiteSql', 8)] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      // Választás nélkül a panel gombja nem nyit, csak figyelmeztet.
      const warning = vi.spyOn(TestBed.inject(ToastService), 'warning');
      (fixture.nativeElement.querySelector('[data-testid="ai-sql-files-open"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(warning).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[data-testid="sql-generation-dialog"]')).toBeNull();

      fixture.componentInstance.schemaTaskChoice.set(7);
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('[data-testid="ai-sql-files-open"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.sqlGenerationTaskId()).toBe(7);
      expect(fixture.componentInstance.sqlGenerationFiles().map((f) => f.id)).toEqual(['a']);
      expect(fixture.nativeElement.querySelector('[data-testid="sql-generation-dialog"]')).not.toBeNull();
    });

    it('a vázlatban kijelölt SQL-feladattal a panel gombja annak a feladatnak nyitja a generátort', () => {
      configure(makeDetail({ tasks: [sql(7, 1), sql(8, 2)], files: [schema('a', 'CreateSql', 7), schema('b', 'CreateLiteSql', 8)] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.componentInstance.selectTask(8);
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('[data-testid="ai-sql-files-open"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.sqlGenerationTaskId()).toBe(8);
      expect(fixture.nativeElement.querySelector('[data-testid="sql-generation-dialog"]')).not.toBeNull();
    });

    it('feladatból (SQL-lekérdezések ablakából) nyitva annak a feladatnak készül; egy sémásnál feladat nélkül', () => {
      configure(makeDetail({ tasks: [sql(7, 1), sql(8, 2)], files: [schema('a', 'CreateSql', 7)] }));
      const component = TestBed.createComponent(FeladatsorSzerkesztoComponent).componentInstance;
      component.openSqlGeneration(8);
      expect(component.sqlGenerationTaskId()).toBe(8);

      taskSetStoreMock.selectedDetail.set(makeDetail({ tasks: [sql(7, 1)], files: [schema('a', 'CreateSql', null)] }));
      component.openSqlGeneration(7);
      expect(component.sqlGenerationTaskId()).toBeNull();
    });
  });
  describe('UI-TT-238: mentetlen módosítás elhagyáskor', () => {
    const task = (): TeacherTaskDto => ({
      id: 4, title: 'F1', description: 'Eredeti leírás', maxPoints: 10, taskOrder: 1, taskTypeIds: [1], completeSolutionSnippets: [], subTasks: [],
    });

    let edit: TaskEditState;

    function create() {
      configure(makeDetail({ tasks: [task()] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      edit = fixture.debugElement.injector.get(TaskEditState);
      return fixture.componentInstance;
    }

    it('módosítás nélkül megerősítés nélkül elhagyható', () => {
      const c = create();
      expect(c.canLeave()).toBe(true);
      expect(confirmServiceMock.ask).not.toHaveBeenCalled();
    });

    it('mentetlen Alapadatok: megerősítést kér, „Maradok”-ra nem enged el', async () => {
      const c = create();
      c.metadataDraft.update((d) => d && { ...d, description: 'd - UNSAVED-EDIT' });
      expect(await c.canLeave()).toBe(false);
      expect(confirmServiceMock.ask).toHaveBeenCalledTimes(1);
      const unload = { preventDefault: vi.fn(), returnValue: undefined as unknown } as unknown as BeforeUnloadEvent;
      c.onBeforeUnload(unload);
      expect(unload.preventDefault).toHaveBeenCalled();
    });

    it('nyitott feladat-szerkesztés módosított leírással: megerősítést kér, „Elvetem”-re elenged', async () => {
      const c = create();
      edit.startEditTask(task());
      expect(c.canLeave()).toBe(true); // csak megnyitva, változtatás nélkül nem kérdez
      edit.setEditTaskDescription(4, 'Eredeti leírás - UNSAVED-TASKEDIT');
      confirmServiceMock.ask.mockResolvedValue(true);
      expect(await c.canLeave()).toBe(true);
      expect(confirmServiceMock.ask).toHaveBeenCalledTimes(1);
    });

    it('kitöltött „Új feladat” űrlap is mentetlen módosításnak számít', async () => {
      const c = create();
      c.tasks.patchNewTaskDraft(1, { title: 'UNSAVED-QUICKADD' });
      expect(await c.canLeave()).toBe(false);
    });
  });

  // A kiadás/visszavonás írás: az oldal elhagyása után is végig kell futnia, és a toastnak
  // meg kell jelennie (siker vagy hiba) - különben a tanár nem tudja meg, hogy elment-e.
  describe('kiadás-mutációk az oldal elhagyása után', () => {
    it('assign(): a komponens megszűnése után érkező válasz is megjeleníti a sikeres toastot', () => {
      configure(makeDetail());
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      const response = new Subject<TaskSetAssignmentDto>();
      vi.spyOn(TestBed.inject(TeacherTaskSetService), 'assignToGroup').mockReturnValue(response);
      const success = vi.spyOn(TestBed.inject(ToastService), 'success');
      const c = fixture.componentInstance;
      c.assignForm.setValue({ groupId: 3, opensAt: '', dueAt: '', isTest: false, timeLimitMinutes: 45 });

      c.assign(1);
      fixture.destroy();
      response.next({ id: 5, groupId: 3, groupName: 'A', assignedAt: new Date().toISOString(), isTest: false });

      expect(success).toHaveBeenCalledWith('Feladatsor kiadva.');
    });

    it('revokeAssignment(): a komponens megszűnése után érkező hiba is megjelenik toastként', async () => {
      configure(makeDetail());
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      const response = new Subject<unknown>();
      vi.spyOn(TestBed.inject(TeacherTaskSetService), 'revokeAssignment').mockReturnValue(response);
      const danger = vi.spyOn(TestBed.inject(ToastService), 'danger');
      confirmServiceMock.ask.mockResolvedValue(true);

      await fixture.componentInstance.revokeAssignment(5);
      fixture.destroy();
      response.error(new Error('hálózati hiba'));

      expect(danger).toHaveBeenCalledTimes(1);
    });
  });
});
