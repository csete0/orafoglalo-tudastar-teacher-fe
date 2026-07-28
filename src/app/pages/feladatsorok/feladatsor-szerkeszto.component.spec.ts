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
    uploadFile: ReturnType<typeof vi.fn>;
  };
  let schoolStoreMock: {
    schools: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
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
      // Alapból NEM hívja meg az onSuccess callback-et (folyamatban lévő kérést szimulál),
      // ugyanaz a konvenció, mint addTask/addSolution mockjánál.
      uploadFile: vi.fn(),
    };
    schoolStoreMock = { schools: signal([]), loading: signal(false), error: signal(null), loadMine: vi.fn() };
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

  // UI-TT-110: a UI-TT-47 fix csak a schoolStore.loading() race-t kezeli - azt, hogy a
  // schoolStore.loadMine() ténylegesen HIBÁVAL fusson le (pl. hálózati hiba/500), sosem
  // vizsgálja. Egy sikertelen betöltés is loading()=false-ra és schools()=[]-re fut ki -
  // ez a komponens szemszögéből MEGKÜLÖNBÖZTETHETETLEN attól, hogy a tanár ténylegesen
  // nem tagja egyetlen intézménynek sem. A `schoolStore.error()`-t a komponens SEHOL nem
  // olvassa (`grep -n "schoolStore.error" feladatsor-szerkeszto.component.ts` -> 0 találat),
  // ezért egy TÉNYLEGESEN intézményi tagságú tanár egy átmeneti hiba esetén megerősítés
  // ÉS bármilyen hibajelzés NÉLKÜL azonnal publikál - pont az a helyzet, amit a UI-TT-47
  // fix meg akart előzni.
  it('BUG UI-TT-110: ha a schoolStore.loadMine() HIBÁVAL fut le (nem csak lassan), a publish() ezt "nincs intézményi tagság"-ként kezeli, és megerősítés/hibajelzés NÉLKÜL azonnal publikál', async () => {
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
  it('BUG UI-TT-118: publish() intézmény nélküli tanárnál (schools()===[]) teljesen kihagyja a ConfirmService-t, ezért egy szinkron dupla-hívás VALÓDI két store.publish() hívást indít - a [disabled] gomb-őr csak a két kattintás közti change-detection ciklusra támaszkodik, a store.publish() maga nem véd "folyamatban lévő kérés" ellen', () => {
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

    it('BUG UI-TT-81 javítva: whitespace-only leírás esetén a részfeladat "Hozzáadás" gombja (addSolution) is letiltva marad', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], solutions: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.toggleTask(1); // a részfeladat-lista/hozzáadás form csak kibontott feladatnál renderelődik
      fixture.componentInstance.setNewSolutionDescription(1, '   ');
      fixture.detectChanges();

      const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('input[name="newSolutionDescription"]')
        .closest('form').querySelector('button[type="submit"]');
      expect(submitButton.disabled).toBe(true);
    });

    it('valódi (nem-whitespace) részfeladat-leírás esetén a "Hozzáadás" (addSolution) gomb aktív', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], solutions: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.toggleTask(1);
      fixture.componentInstance.setNewSolutionDescription(1, 'Valódi részfeladat-leírás');
      fixture.detectChanges();

      const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('input[name="newSolutionDescription"]')
        .closest('form').querySelector('button[type="submit"]');
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

  describe('dupla-kattintás / idempotencia védelem hiánya (ÚJ LELET, még nincs ledger-ID)', () => {
    // Kontraszt: a publish() gomb helyesen [disabled]="detail.isPublished || store.loading()"
    // (feladatsor-szerkeszto.component.html:62), a csoport/feladatsor/intézmény-létrehozó
    // formok és a regenerateInvite()/setJoinEnabled() mind szinkron `if (store.loading())
    // return;` guard-dal védettek. Az addTask()/addSolution() párnak ez a mintája HIÁNYZIK:
    // sem a komponens-metódus nem néz store.loading()-ot, sem a "Hozzáadás" submit-gomb
    // [disabled]-je nincs hozzá kötve (.html:173, :218 — csak a draft üresség-ellenőrzést
    // nézik, ld. isTaskDraftTitleBlank()/isSolutionDraftDescriptionBlank()). A mögöttes
    // TeacherTaskSetStore.addTask()/addSolution() a mutateAndReload()-on át egy NEM
    // idempotens POST-ot indít (teacher-taskset.service.ts addTask()/addSolution() —
    // mindegyik hívás új sort szúr be), és maga a mutateAndReload() sem védekezik
    // újrabelépés ellen (teacher-taskset.store.ts:238-257 — nincs "if (this._loading())
    // return" az elején, csak feltétel nélkül true-ra állítja).
    it('BUG (ÚJ): dupla-kattintás/gyors kettős Enter az "Új feladat hozzáadása" formon KÉTSZER hívja meg a store.addTask()-ot, miközben az első kérés még folyamatban van (duplikált feladat-sor a backenden)', () => {
      configure(makeDetail({ tasks: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      component.newTaskDrafts[6] = { title: 'Duplikált feladat', description: 'Duplikált leírás', maxPoints: 10 };

      // Első kattintás/Enter (a form submitja) — a mock addTask() alapból NEM hívja meg
      // onSuccess-t, tehát a kérés "folyamatban van". A VALÓS store-ban ez a hívás szinkron
      // módon már true-ra állítaná a `loading` jelet (mutateAndReload, store.ts:239) —
      // ezt itt explicit szimuláljuk, mielőtt a második kattintás megtörténne.
      component.addTask(1, 6);
      taskSetStoreMock.loading.set(true);

      // Második, gyors egymás-utáni kattintás/Enter, MÍG az első kérés még folyamatban van
      // (pl. lassú hálózat miatt türelmetlen tanár). Egy idempotencia-védett gombnak ekkor
      // csendben no-op-nak kellene lennie.
      component.addTask(1, 6);

      expect(taskSetStoreMock.addTask).toHaveBeenCalledTimes(1);
    });

    it('BUG (ÚJ): dupla-kattintás/gyors kettős Enter az "Új részfeladat" (addSolution) formon KÉTSZER hívja meg a store.addSolution()-t, miközben az első kérés még folyamatban van (duplikált részfeladat-sor a backenden)', () => {
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

      component.setNewSolutionDescription(1, 'Duplikált részfeladat-leírás');
      component.setNewSolutionPoints(1, 8);

      // Első kattintás/Enter — a mock addSolution() alapból NEM hívja meg onSuccess-t
      // (folyamatban lévő kérést szimulál). A valós store ilyenkor már szinkron true-ra
      // állítaná a `loading` jelet (mutateAndReload, store.ts:239).
      component.addSolution(1, 1);
      taskSetStoreMock.loading.set(true);

      // Második, gyors egymás-utáni kattintás/Enter, MÍG az első kérés még folyamatban van.
      component.addSolution(1, 1);

      expect(taskSetStoreMock.addSolution).toHaveBeenCalledTimes(1);
    });
  });

  describe('UI-TT-123: uploadFile() nem védett a store.loading()-guarddal, szemben az addTask()/addSolution() UI-TT-115 fixével', () => {
    // uploadFile() (feladatsor-szerkeszto.component.ts) — az addTask()/addSolution() UI-TT-115
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
    // guard a testvér addTask()/addSolution() formoknál (UI-TT-115) már kizár azzal, hogy a
    // második kattintást/eseményt csendben, no-opként eldobja.
    it('BUG (ÚJ, UI-TT-123): egy második file-input "change" esemény, MÍG az első feltöltés még folyamatban van (store.loading()===true), KÉTSZER hívja meg a store.uploadFile()-t ugyanahhoz a fájl-típushoz', () => {
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
      // (ugyanúgy, mint az addTask()/addSolution() UI-TT-115 fixe után) — ehelyett mindkét
      // feltöltés ténylegesen elindul.
      component.uploadFile(1, 'CreateSql', {
        target: { files: [correctFile], value: '' } as unknown as HTMLInputElement,
      } as unknown as Event);

      expect(taskSetStoreMock.uploadFile).toHaveBeenCalledTimes(1);
    });
  });

  // UI-TT-3: a checkbox→radio átállás előtt (9bf10a7 előtt) egy feladat KÉT típussal
  // (SQL+Programozás) is menthető volt — a régi .includes()-alapú szűrés emiatt mindkét
  // típus-blokkban megjelenítette ugyanazt a feladatot.
  describe('typeSections() — kettős típusú feladatok (UI-TT-3)', () => {
    it('BUG UI-TT-3 javítva: egy [5,6] taskTypeIds-ű feladat NEM jelenik meg sem a Programozás, sem az SQL blokkban, hanem az Egyébben', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'Kettős típusú feladat', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [5, 6], completeSolutionSnippets: [], solutions: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      const sections = component.typeSections();
      const programozas = sections.find((s) => s.id === 6);
      const sql = sections.find((s) => s.id === 5);
      const egyeb = sections.find((s) => s.isOther);

      expect(programozas?.tasks.some((t) => t.id === 1)).toBe(false);
      expect(sql?.tasks.some((t) => t.id === 1)).toBe(false);
      expect(egyeb?.tasks.some((t) => t.id === 1)).toBe(true);
    });

    it('egyetlen típussal rendelkező feladat a saját típus-blokkjában jelenik meg, duplikáció nélkül', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'Programozás feladat', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], solutions: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      const sections = component.typeSections();
      const totalOccurrences = sections.reduce((sum, s) => sum + s.tasks.filter((t) => t.id === 1).length, 0);

      expect(totalOccurrences).toBe(1);
      expect(sections.find((s) => s.id === 6)?.tasks.some((t) => t.id === 1)).toBe(true);
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
    it('BUG UI-TT-114: a "languages" lista nem tartalmazza a C nyelvet (érvényes backend id: 12), pedig a többi 6 érvényes Judge0-nyelv (Python/C#/JavaScript/C++/Java/SQL) mind szerepel benne', () => {
      configure(makeDetail({ tasks: [] }));
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;

      const cEntry = component.languages.find((l) => l.id === 12);
      expect(cEntry).toBeDefined();
    });

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
              solutions: [{ id: 101, description: 'd', snippets: [] }],
            },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.toggleTask(1);
      fixture.detectChanges();

      const labels: string[] = Array.from(fixture.nativeElement.querySelectorAll('label')).map(
        (el: any) => el.textContent?.trim(),
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
            { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], solutions: [] },
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
      expect(component.isSectionExpanded(6)).toBe(true);

      // Bukó elvárás: a valós DOM-ban a gombon NINCS jelen az aria-expanded attribútum, holott a
      // fenti belső állapot szerint jelen kellene lennie, "true" értékkel.
      expect(sectionToggleButton!.getAttribute('aria-expanded')).toBe('true');
    });

    it('BUG (ÚJ, UI-TT-129): a feladat-sor fejléc gombján (toggleTask, 121. sor) sincs aria-expanded, holott az expandedTaskId signal a chevron-forgatás ÉS a részfeladatok megjelenítése mögött is ugyanaz', () => {
      configure(
        makeDetail({
          tasks: [
            { id: 1, title: 'F1', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], completeSolutionSnippets: [], solutions: [] },
          ],
        }),
      );
      const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
      fixture.detectChanges();
      fixture.componentInstance.toggleTask(1);
      fixture.detectChanges();

      expect(fixture.componentInstance.expandedTaskId()).toBe(1);

      const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
      const taskToggleButton = buttons.find((b) => b.textContent?.includes('F1'));
      expect(taskToggleButton).toBeDefined();

      // Bukó elvárás: toggleTask(1) után a feladat nyitva van (expandedTaskId()===1, a részfeladatok
      // ténylegesen renderelve is vannak), de a gombon NINCS aria-expanded="true".
      expect(taskToggleButton!.getAttribute('aria-expanded')).toBe('true');
    });
  });

  // UI-TT-141: a store `upsertSolutionSnippets()`/`upsertCompleteSolutionSnippets()`-je a
  // UI-TT-121 fix óta korai-return-nel véd a MINDEN mutáló metódus által megosztott
  // `_loading` jelzőn. A testvér `addTask`/`addSolution`/`uploadFile` gombok HELYESEN
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
              solutions: [{ id: 11, description: 'r1', snippets: [] }],
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
      fixture.componentInstance.toggleTask(1);
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
      fixture.componentInstance.toggleTask(1);
      fixture.detectChanges();

      const { kodreszletek, osszevont } = snippetButtons(fixture);
      expect(kodreszletek!.disabled).toBe(false);
      expect(osszevont!.disabled).toBe(false);
    });
  });
});
