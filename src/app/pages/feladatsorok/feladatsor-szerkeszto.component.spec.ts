import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { FeladatsorSzerkesztoComponent } from './feladatsor-szerkeszto.component';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { SchoolStore } from '../../services/school/school.store';
import { AuthorizedFileService } from '../../services/file/authorized-file.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { TeacherTaskSetDetailDto } from '../../models/teacher-content.model';

function makeDetail(overrides: Partial<TeacherTaskSetDetailDto> = {}): TeacherTaskSetDetailDto {
  return {
    id: 1,
    title: 'Teszt feladatsor',
    slug: 'teszt-feladatsor',
    description: 'd',
    levelId: 2,
    isPublished: false,
    createdAt: new Date().toISOString(),
    taskCount: 0,
    tasks: [],
    files: [],
    ...overrides,
  };
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
    addSolution: ReturnType<typeof vi.fn>;
  };
  let schoolStoreMock: {
    schools: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    loadMine: ReturnType<typeof vi.fn>;
  };
  let authorizedFileServiceMock: { resolveUrl: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn>; pending: ReturnType<typeof signal<null>>; resolve: ReturnType<typeof vi.fn> };

  function configure(detail: TeacherTaskSetDetailDto | null) {
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
      addSolution: vi.fn(),
    };
    schoolStoreMock = { schools: signal([]), loading: signal(false), loadMine: vi.fn() };
    authorizedFileServiceMock = {
      resolveUrl: vi.fn((url: string) => of(`blob:resolved-${url}`)),
      revoke: vi.fn(),
    };
    confirmServiceMock = { ask: vi.fn().mockResolvedValue(false), pending: signal(null), resolve: vi.fn() };

    TestBed.configureTestingModule({
      imports: [FeladatsorSzerkesztoComponent],
      providers: [
        { provide: TeacherTaskSetStore, useValue: taskSetStoreMock },
        { provide: SchoolStore, useValue: schoolStoreMock },
        { provide: AuthorizedFileService, useValue: authorizedFileServiceMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => '1' } } },
        },
      ],
    });
  }

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
            solutions: [
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

    const warning = fixture.nativeElement.querySelector('.text-warning');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toContain('kötelező');
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
            solutions: [
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

    const warning = fixture.nativeElement.querySelector('.text-warning');
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
            solutions: [
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
            solutions: [{ id: 1, description: 'd', snippets: [{ programmingLanguageId: 2, code: 'print(1)' }] }],
          },
        ],
        files: [],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    // A "create_lite.sql" felirat a fájl-feltöltő panelen mindig ott van
    // (statikus címke) — a figyelmeztető sáv jelenlétét kell ellenőrizni.
    expect(fixture.nativeElement.querySelector('.text-warning')).toBeNull();
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

  it('egy független sikeres mentés/hozzáadás utáni újratöltés NEM dobja el egy másik, még el nem mentett kódrészlet-piszkozatot (UI-TT-40)', () => {
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
            solutions: [
              { id: 101, description: 'A', snippets: [] },
              { id: 102, description: 'B', snippets: [] },
            ],
          },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.setDraftCode(101, 2, "def sort_items(items): return sorted(items)");
    expect(component.draftCode(101, 2)).toContain('sort_items');

    // Egy FÜGGETLEN, sikeres mutáció (pl. egy harmadik, #103 solution hozzáadása) miatt a
    // store ÚJ selectedDetail referenciát ad (mint egy loadDetail() reload után) — a
    // #101/#102-t VÁLTOZATLANUL hagyva.
    taskSetStoreMock.selectedDetail.set(
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
            solutions: [
              { id: 101, description: 'A', snippets: [] },
              { id: 102, description: 'B', snippets: [] },
              { id: 103, description: 'C', snippets: [] },
            ],
          },
        ],
      }),
    );
    fixture.detectChanges();

    expect(component.draftCode(101, 2)).toContain('sort_items');
  });

  it('a "Új részfeladat szövege" piszkozat feladatonként elkülönített, task-váltáskor nem szivárog át (UI-TT-66)', () => {
    configure(
      makeDetail({
        tasks: [
          { id: 501, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [], completeSolutionSnippets: [], solutions: [] },
          { id: 502, title: 'F2', description: 'd', maxPoints: 10, taskOrder: 2, taskTypeIds: [], completeSolutionSnippets: [], solutions: [] },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.setNewSolutionDescription(501, 'A-hoz szánt piszkozat szöveg');
    component.setNewSolutionPoints(501, 7);

    expect(component.newSolutionDraft(502).description).toBe('');
    expect(component.newSolutionDraft(502).points).toBe(5);
    expect(component.newSolutionDraft(501).description).toBe('A-hoz szánt piszkozat szöveg');
    expect(component.newSolutionDraft(501).points).toBe(7);
  });

  it('a feladat-kártya címe truncate-elt, hogy a Törlés gomb sose kerüljön a kártya overflow-hidden határa mögé (UI-TT-55)', () => {
    const longTitle = 'X'.repeat(160);
    configure(
      makeDetail({
        tasks: [
          { id: 1, title: longTitle, description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [], completeSolutionSnippets: [], solutions: [] },
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

  it('a részfeladat-kártya solutionText/description mezőin truncate/break-words védelem van (UI-TT-56)', () => {
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
            solutions: [{ id: 101, description: longDescription, solutionText: longSolutionText, snippets: [] }],
          },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    fixture.componentInstance.toggleTask(1);
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

  it('a "Megnyitás" link a bearer tokennel lekért blob URL-re mutat, nem a nyers (401-et adó) API URL-re', () => {
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

  describe('"Új feladat hozzáadása" draft-kezelés (UI-TT-25 / UI-TT-61)', () => {
    it('BUG UI-TT-25 javítva: sikertelen/folyamatban lévő mentésnél NEM törli a beírt cím/leírás/pont draftot, mielőtt a válasz megérkezne', () => {
      configure(makeDetail({ tasks: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.newTaskDrafts[6] = { title: 'Hosszan kigondolt feladatcím', description: 'Részletes leírás', maxPoints: 7 };
      // A mock addTask() alapból NEM hívja meg onSuccess-t — folyamatban lévő/sikertelen kérést szimulál.
      component.addTask(1, 6);

      expect(component.newTaskDrafts[6]).toEqual({
        title: 'Hosszan kigondolt feladatcím',
        description: 'Részletes leírás',
        maxPoints: 7,
      });
    });

    it('sikeres mentés (onSuccess meghívása) UTÁN üríti a draftot', () => {
      configure(makeDetail({ tasks: [] }));
      taskSetStoreMock.addTask.mockImplementation(
        (_taskSetId: number, _request: unknown, onSuccess?: () => void) => onSuccess?.(),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.newTaskDrafts[6] = { title: 'Hosszan kigondolt feladatcím', description: 'Részletes leírás', maxPoints: 7 };
      component.addTask(1, 6);

      expect(component.newTaskDrafts[6]).toEqual({ title: '', description: '', maxPoints: 10 });
    });

    it('whitespace-only cím esetén addTask() csendben visszatér, a store-t nem hívja meg', () => {
      configure(makeDetail({ tasks: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.newTaskDrafts[6] = { title: '   ', description: '', maxPoints: 10 };
      component.addTask(1, 6);

      expect(taskSetStoreMock.addTask).not.toHaveBeenCalled();
    });

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

    it('valódi (nem-whitespace) cím esetén a "Hozzáadás" gomb aktív', () => {
      configure(makeDetail({ tasks: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();

      const titleInput: HTMLInputElement = fixture.nativeElement.querySelector('input[name="newTaskTitle-6"]');
      titleInput.value = 'Valódi feladatcím';
      titleInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const form = titleInput.closest('form') as HTMLFormElement;
      const submitButton: HTMLButtonElement = form.querySelector('button[type="submit"]')!;
      expect(submitButton.disabled).toBe(false);
    });

    it('addSolution() sikertelen/folyamatban lévő mentésnél is megőrzi a beírt leírás/pont draftot', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], solutions: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.setNewSolutionDescription(1, 'Beírt részfeladat-leírás');
      component.setNewSolutionPoints(1, 8);
      // A mock addSolution() alapból NEM hívja meg onSuccess-t.
      component.addSolution(1, 1);

      expect(component.newSolutionDraft(1)).toEqual({ description: 'Beírt részfeladat-leírás', points: 8 });
    });
  });
});
