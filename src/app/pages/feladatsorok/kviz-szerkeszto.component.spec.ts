import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { QuizBankQuestionDto, TeacherQuizAssignmentDto, TeacherQuizDetailDto, TeacherQuizQuestionDto } from '../../models/teacher-quiz.model';
import { GroupDto } from '../../models/group.model';
import { GroupStore } from '../../services/group/group.store';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { TeacherQuizStore } from '../../services/teacher-quiz/teacher-quiz.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { KvizSzerkesztoComponent } from './kviz-szerkeszto.component';

function makeQuestion(overrides: Partial<TeacherQuizQuestionDto> = {}): TeacherQuizQuestionDto {
  return {
    id: 1,
    topicId: 1,
    topicName: 'SQL alapok',
    questionType: 'single',
    questionText: 'Melyik keres értéket?',
    options: ['XKERES', 'SZUM'],
    correctAnswers: ['XKERES'],
    explanation: null,
    difficulty: 'Medium',
    displayOrder: 1,
    secondsLimit: null,
    isApproved: true,
    isAiGenerated: false,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<GroupDto> = {}): GroupDto {
  return {
    id: 1,
    name: 'Teszt csoport',
    inviteCode: 'ABCD1234',
    isArchived: false,
    isJoinEnabled: true,
    createdAt: new Date().toISOString(),
    memberCount: 3,
    ...overrides,
  };
}

function makeAssignment(overrides: Partial<TeacherQuizAssignmentDto> = {}): TeacherQuizAssignmentDto {
  return {
    id: 1,
    groupId: 1,
    groupName: 'Teszt csoport',
    assignedAt: new Date().toISOString(),
    dueAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<TeacherQuizDetailDto> = {}): TeacherQuizDetailDto {
  return {
    id: 7,
    title: 'Teszt kvíz',
    description: null,
    isPublished: false,
    takedownAt: null,
    takedownReason: null,
    examLevel: null,
    questionCount: 0,
    pendingQuestionCount: 0,
    assignedGroupCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    feedbackMode: 'after',
    secondsPerQuestion: null,
    maxAttempts: null,
    shuffleQuestions: true,
    allowLateSubmission: true,
    questions: [],
    assignments: [],
    ...overrides,
  };
}

describe('KvizSzerkesztoComponent', () => {
  let storeMock: {
    selectedDetail: ReturnType<typeof signal<TeacherQuizDetailDto | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    generating: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    publishResult: ReturnType<typeof signal<unknown>>;
    bankResults: ReturnType<typeof signal<QuizBankQuestionDto[]>>;
    bankSearching: ReturnType<typeof signal<boolean>>;
    bankSearchError: ReturnType<typeof signal<string | null>>;
    loadDetail: ReturnType<typeof vi.fn>;
    addQuestion: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    clearPublishResult: ReturnType<typeof vi.fn>;
    searchBankQuestions: ReturnType<typeof vi.fn>;
    addExistingQuestion: ReturnType<typeof vi.fn>;
    clearBankResults: ReturnType<typeof vi.fn>;
  };

  function configure(detail: TeacherQuizDetailDto | null = makeDetail(), groups: GroupDto[] = []) {
    storeMock = {
      selectedDetail: signal(detail),
      loading: signal(false),
      generating: signal(false),
      error: signal(null),
      publishResult: signal(null),
      bankResults: signal([]),
      bankSearching: signal(false),
      bankSearchError: signal(null),
      loadDetail: vi.fn(),
      addQuestion: vi.fn(),
      publish: vi.fn(),
      clearPublishResult: vi.fn(),
      searchBankQuestions: vi.fn(),
      addExistingQuestion: vi.fn(),
      clearBankResults: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [KvizSzerkesztoComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } },
        { provide: TeacherQuizStore, useValue: storeMock },
        { provide: TeacherQuizService, useValue: { getTopics: () => of([]) } },
        { provide: GroupStore, useValue: { groups: signal(groups), loadMine: vi.fn() } },
      ],
    });

    return TestBed.createComponent(KvizSzerkesztoComponent);
  }

  afterEach(() => TestBed.resetTestingModule());

  /**
   * A store `providedIn: 'root'`, tehát navigáció után átmenetileg még az ELŐZŐ kvíz
   * adata ülhet benne. E nélkül az ellenőrzés nélkül a szerkesztő egy MÁSIK kvíz
   * tartalmát mutatná, miközben az URL az általunk megnyitottat - és minden mentés a
   * megjelenített (rossz) kvízre menne.
   */
  it('csak a SAJÁT id-jéhez tartozó kvízt jeleníti meg', () => {
    const fixture = configure(makeDetail({ id: 99, title: 'Másik kvíz' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.detail()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Másik kvíz');
  });

  it('a saját kvízt megjeleníti', () => {
    const fixture = configure(makeDetail({ id: 7, title: 'Saját kvíz' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.detail()?.id).toBe(7);
    expect(fixture.nativeElement.textContent).toContain('Saját kvíz');
  });

  // A kiértékelés szöveg-egyezésen alapul: egy olyan "helyes válasz", ami nem szerepel a
  // lehetőségek között, megoldhatatlan kérdést hozna létre. A felület ezért nem gépeltet,
  // hanem a megadott lehetőségek közül jelöltet - és nem enged menteni jelölés nélkül.
  it('nem enged menteni, amíg nincs kijelölve helyes válasz', () => {
    const fixture = configure();
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.questionForm.patchValue({
      questionType: 'single',
      questionText: 'Melyik keres értéket?',
      topicId: 1,
      optionsText: 'XKERES\nSZUM\nHA',
    });
    fixture.detectChanges();

    expect(component.parsedOptions()).toEqual(['XKERES', 'SZUM', 'HA']);
    expect(component.formWarning()).toBe('Jelöld ki a helyes választ.');

    component.toggleCorrect('XKERES');
    expect(component.formWarning()).toBeNull();
  });

  it('kevés vagy ismétlődő válaszlehetőségnél figyelmeztet', () => {
    const fixture = configure();
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.questionForm.patchValue({ questionText: 'k', topicId: 1, optionsText: 'Csak egy' });
    fixture.detectChanges();
    expect(component.formWarning()).toBe('Adj meg legalább két válaszlehetőséget.');

    component.questionForm.patchValue({ optionsText: 'XKERES\nxkeres' });
    fixture.detectChanges();
    expect(component.formWarning()).toBe('A válaszlehetőségek nem ismétlődhetnek.');
  });

  // Egyválasztósnál a jelölés RÁDIÓGOMB-szerű: egy új jelölés lecseréli a régit,
  // különben a tanár észrevétlenül két helyes választ adhatna meg.
  it('egyválasztósnál a jelölés lecserélődik, többválasztósnál gyűlik', () => {
    const fixture = configure();
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.questionForm.patchValue({ questionType: 'single', optionsText: 'A\nB\nC' });
    fixture.detectChanges();

    component.toggleCorrect('A');
    component.toggleCorrect('B');
    expect(component.isSelected('A')).toBe(false);
    expect(component.isSelected('B')).toBe(true);

    component.questionForm.patchValue({ questionType: 'multi' });
    fixture.detectChanges();

    component.toggleCorrect('C');
    expect(component.isSelected('B')).toBe(true);
    expect(component.isSelected('C')).toBe(true);
  });

  // Kihagyás-jelölés nélkül a diák nem látná, hova kell írnia a választ.
  it('hiányos kitöltésnél kéri a ___ jelölést és az elfogadott válaszokat', () => {
    const fixture = configure();
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.questionForm.patchValue({
      questionType: 'cloze',
      questionText: 'Melyik függvény keres értéket?',
      topicId: 1,
      acceptedText: '',
    });
    fixture.detectChanges();
    expect(component.formWarning()).toBe('Adj meg legalább egy elfogadott választ.');

    component.questionForm.patchValue({ acceptedText: 'XKERES\nXLOOKUP' });
    fixture.detectChanges();
    expect(component.formWarning()).toContain('___');

    component.questionForm.patchValue({ questionText: 'A ___ függvény keres értéket.' });
    fixture.detectChanges();
    expect(component.formWarning()).toBeNull();
  });

  it('hiányos kitöltésnél opciók nélkül, elfogadott alakokkal küldi be a kérdést', () => {
    const fixture = configure();
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.questionForm.patchValue({
      questionType: 'cloze',
      questionText: 'A ___ függvény keres értéket.',
      topicId: 3,
      acceptedText: 'XKERES\n XLOOKUP ',
      difficulty: 'Medium',
    });
    fixture.detectChanges();

    component.saveQuestion();

    expect(storeMock.addQuestion).toHaveBeenCalledTimes(1);
    const request = storeMock.addQuestion.mock.calls[0][1];
    expect(request.options).toEqual([]);
    expect(request.correctAnswers).toEqual(['XKERES', 'XLOOKUP']);
    expect(request.questionType).toBe('cloze');
  });

  /**
   * UI-TT-209: a gomb `[disabled]`-je korábban nem nézte a form `invalid` állapotát. A
   * `topicId` legördülő kezdőértéke `null` és kötelező - ha a tanár nem nyúlt hozzá
   * explicit, a gomb AKTÍVNAK látszott, a kattintás viszont némán, hálózati forgalom
   * nélkül visszatért. Se mentés, se hibaüzenet.
   */
  it('BUG UI-TT-209 javítva: hiányzó témakörnél a "Hozzáadás" gomb letiltva marad', () => {
    const fixture = configure();
    fixture.detectChanges();
    const component = fixture.componentInstance;

    // Minden ki van töltve, KIVÉVE a kötelező témakört.
    component.questionForm.patchValue({
      questionType: 'single',
      questionText: 'Melyik keres értéket?',
      optionsText: 'XKERES\nSZUM',
    });
    component.toggleCorrect('XKERES');
    fixture.detectChanges();

    // A saját tartalmi figyelmeztetés már nem szól - korábban ettől látszott aktívnak.
    expect(component.formWarning()).toBeNull();
    expect(component.questionForm.invalid).toBe(true);

    const addButton: HTMLButtonElement = fixture.nativeElement.querySelector(
      'form[novalidate] button[type="submit"], section button[type="submit"]',
    );
    expect(addButton?.disabled).toBe(true);
  });

  // Admin-takedown alatt a tartalom nem módosítható - a felületnek ezt jeleznie is kell,
  // nem csak a backendnek elutasítania.
  it('admin-visszavonásnál jelzi az okot és letiltja a publikálást', () => {
    const fixture = configure(
      makeDetail({ takedownAt: new Date().toISOString(), takedownReason: 'Tartalmi kifogás' }),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Tartalmi kifogás');
    const publishButton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="publish-btn"]');
    expect(publishButton.disabled).toBe(true);
  });

  // UI-TT-218: minden kérdés ugyanazt a questionForm-ot/editingId signalt osztja -
  // startEdit() korábban feltétel nélkül patchValue-olta a formot az újonnan kattintott
  // kérdés adataival, akkor is, ha a tanár épp egy MÁSIK kérdést módosított (de nem
  // mentett) - az el nem mentett szöveg figyelmeztetés nélkül, nyomtalanul elveszett.
  describe('startEdit() - el nem mentett módosítás védelme (UI-TT-218)', () => {
    const q1 = makeQuestion({ id: 1, questionText: 'Első kérdés' });
    const q2 = makeQuestion({ id: 2, questionText: 'Második kérdés' });

    it('BUG UI-TT-218 javítva: dirty formmal másik kérdésre váltva megerősítést kér, elutasításnál a form változatlan marad', async () => {
      const fixture = configure(makeDetail({ questions: [q1, q2] }));
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const confirmService = TestBed.inject(ConfirmService);

      component.startEdit(q1);
      fixture.detectChanges();
      component.questionForm.patchValue({ explanation: 'ÚJ, NEM MENTETT MAGYARÁZAT' });
      component.questionForm.controls.explanation.markAsDirty();
      fixture.detectChanges();

      const switchPromise = component.startEdit(q2);
      // Amíg a megerősítés függőben van, a form MÉG NEM váltott át q2-re.
      expect(confirmService.pending()).not.toBeNull();
      expect(component.editingId()).toBe(1);

      confirmService.resolve(false);
      await switchPromise;

      expect(component.editingId()).toBe(1);
      expect(component.questionForm.controls.explanation.value).toBe('ÚJ, NEM MENTETT MAGYARÁZAT');
    });

    it('megerősítés elfogadásánál a form áttölti a másik kérdés adataira', async () => {
      const fixture = configure(makeDetail({ questions: [q1, q2] }));
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const confirmService = TestBed.inject(ConfirmService);

      component.startEdit(q1);
      fixture.detectChanges();
      component.questionForm.patchValue({ explanation: 'ÚJ, NEM MENTETT MAGYARÁZAT' });
      component.questionForm.controls.explanation.markAsDirty();
      fixture.detectChanges();

      const switchPromise = component.startEdit(q2);
      confirmService.resolve(true);
      await switchPromise;

      expect(component.editingId()).toBe(2);
      expect(component.questionForm.controls.questionText.value).toBe('Második kérdés');
    });

    it('nem-dirty formnál (nincs el nem mentett módosítás) NEM kér megerősítést', async () => {
      const fixture = configure(makeDetail({ questions: [q1, q2] }));
      fixture.detectChanges();
      const component = fixture.componentInstance;
      const confirmService = TestBed.inject(ConfirmService);

      component.startEdit(q1);
      fixture.detectChanges();

      await component.startEdit(q2);

      expect(confirmService.pending()).toBeNull();
      expect(component.editingId()).toBe(2);
    });
  });

  // UI-TT-219: a StudentGroups.Name-en nincs unique constraint - élőben ténylegesen
  // előfordul, hogy egy tanárnak két, egyaránt aktív, azonos nevű csoportja van (élő
  // reprodukció: browserhunt-csoport-20260721, Id=1 és Id=12, két külön invite-kóddal).
  // A "Csoport" választó és a kiadás-lista korábban KIZÁRÓLAG a nevet mutatta - a tanár
  // nem tudta megmondani, melyik "Visszavonás" gomb melyik csoportot érinti.
  describe('groupLabel() - azonos nevű csoportok megkülönböztetése (UI-TT-219)', () => {
    it('BUG UI-TT-219 javítva: két azonos nevű csoportnál a kiadás-lista és a választó invite-kóddal egészíti ki a nevet', () => {
      const groupA = makeGroup({ id: 1, name: 'browserhunt-csoport-20260721', inviteCode: 'YGNEGXM7' });
      const groupB = makeGroup({ id: 12, name: 'browserhunt-csoport-20260721', inviteCode: '6QZ5RN6S' });
      const assignment = makeAssignment({ id: 2, groupId: 1, groupName: 'browserhunt-csoport-20260721' });

      const fixture = configure(
        makeDetail({ isPublished: true, assignments: [assignment] }),
        [groupA, groupB],
      );
      fixture.detectChanges();
      const component = fixture.componentInstance;

      // A kiadás-listában (groupId=1, a régi kiadás) a YGNEGXM7 kódnak kell megjelennie.
      expect(component.groupLabel(1, 'browserhunt-csoport-20260721')).toBe(
        'browserhunt-csoport-20260721 (kód: YGNEGXM7)',
      );
      // A választóban a MÉG NEM kiadott (groupId=12) csoportnak a MÁSIK kódot kell mutatnia -
      // a két sor emiatt megkülönböztethető, nem pixel-azonos.
      expect(component.groupLabel(12, 'browserhunt-csoport-20260721')).toBe(
        'browserhunt-csoport-20260721 (kód: 6QZ5RN6S)',
      );
      expect(component.groupLabel(1, 'browserhunt-csoport-20260721')).not.toBe(
        component.groupLabel(12, 'browserhunt-csoport-20260721'),
      );

      const assignmentText = (fixture.nativeElement as HTMLElement).querySelector('section:last-of-type li')
        ?.textContent;
      expect(assignmentText).toContain('YGNEGXM7');
    });

    it('kontroll: egyedi nevű csoportnál a felület változatlan marad, nincs invite-kód a névhez fűzve', () => {
      const group = makeGroup({ id: 1, name: 'Egyedi csoport', inviteCode: 'ZZZZ9999' });
      const fixture = configure(makeDetail({ isPublished: true, assignments: [] }), [group]);
      const component = fixture.componentInstance;

      expect(component.groupLabel(1, 'Egyedi csoport')).toBe('Egyedi csoport');
    });
  });
});

/**
 * UI-UX: "Meglévő kérdés hozzáadása a bankból" - keresés a közös, jóváhagyott
 * AI-kérdésbankban és a kiválasztott találat felvétele a kvízbe.
 */
describe('KvizSzerkesztoComponent - meglévő kérdés hozzáadása a bankból', () => {
  function makeBankQuestion(overrides: Partial<QuizBankQuestionDto> = {}): QuizBankQuestionDto {
    return {
      id: 42,
      topicId: 1,
      topicName: 'SQL alapok',
      questionType: 'single',
      questionText: 'Melyik függvény keres értéket egy táblázatban?',
      options: ['XKERES', 'SZUM'],
      correctAnswers: ['XKERES'],
      explanation: null,
      difficulty: 'Medium',
      ...overrides,
    };
  }

  function makeDetail(): TeacherQuizDetailDto {
    return {
      id: 7,
      title: 'Teszt kvíz',
      description: null,
      isPublished: false,
      takedownAt: null,
      takedownReason: null,
      examLevel: null,
      questionCount: 0,
      pendingQuestionCount: 0,
      assignedGroupCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      feedbackMode: 'after',
      secondsPerQuestion: null,
      maxAttempts: null,
      shuffleQuestions: true,
      allowLateSubmission: true,
      questions: [],
      assignments: [],
    };
  }

  let storeMock: {
    selectedDetail: ReturnType<typeof signal<TeacherQuizDetailDto | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    generating: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    publishResult: ReturnType<typeof signal<unknown>>;
    bankResults: ReturnType<typeof signal<QuizBankQuestionDto[]>>;
    bankSearching: ReturnType<typeof signal<boolean>>;
    bankSearchError: ReturnType<typeof signal<string | null>>;
    loadDetail: ReturnType<typeof vi.fn>;
    addQuestion: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    searchBankQuestions: ReturnType<typeof vi.fn>;
    addExistingQuestion: ReturnType<typeof vi.fn>;
    clearBankResults: ReturnType<typeof vi.fn>;
  };

  function configure() {
    storeMock = {
      selectedDetail: signal(makeDetail()),
      loading: signal(false),
      generating: signal(false),
      error: signal(null),
      publishResult: signal(null),
      bankResults: signal([]),
      bankSearching: signal(false),
      bankSearchError: signal(null),
      loadDetail: vi.fn(),
      addQuestion: vi.fn(),
      publish: vi.fn(),
      searchBankQuestions: vi.fn(),
      addExistingQuestion: vi.fn(),
      clearBankResults: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [KvizSzerkesztoComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } },
        { provide: TeacherQuizStore, useValue: storeMock },
        { provide: TeacherQuizService, useValue: { getTopics: () => of([]) } },
        { provide: GroupStore, useValue: { groups: signal([]), loadMine: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(KvizSzerkesztoComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('alapból összecsukva - a keresőmező nem látszik', () => {
    const fixture = configure();
    expect(fixture.nativeElement.querySelector('input[formcontrolname="search"]')).toBeFalsy();
  });

  it('kinyitva megjelenik a keresőforma, keresésre a store-t hívja a megadott szűrőkkel', () => {
    const fixture = configure();
    const component = fixture.componentInstance;

    component.toggleBankSearch();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[formcontrolname="search"]')).toBeTruthy();

    component.bankSearchForm.patchValue({ search: 'XKERES', topicId: 3, difficulty: 'Hard' });
    component.searchBank();

    expect(storeMock.searchBankQuestions).toHaveBeenCalledWith('XKERES', 3, 'Hard');
  });

  it('üres keresőszöveget null-ra normalizálja (nem küld whitespace-only stringet)', () => {
    const fixture = configure();
    const component = fixture.componentInstance;
    component.toggleBankSearch();
    fixture.detectChanges();

    component.bankSearchForm.patchValue({ search: '   ', topicId: null, difficulty: null });
    component.searchBank();

    expect(storeMock.searchBankQuestions).toHaveBeenCalledWith(null, null, null);
  });

  it('a találatok megjelennek, a "Hozzáadás" a kiválasztott kérdés id-jével hívja a store-t', () => {
    const fixture = configure();
    const component = fixture.componentInstance;
    component.toggleBankSearch();
    storeMock.bankResults.set([makeBankQuestion({ id: 99, questionText: 'XKERES kérdés' })]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('XKERES kérdés');

    const addButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      (b as HTMLElement).textContent?.includes('Hozzáadás a kvízhez'),
    ) as HTMLButtonElement;
    expect(addButton).toBeTruthy();

    addButton.click();
    expect(storeMock.addExistingQuestion).toHaveBeenCalledWith(7, 99, expect.any(Function));
  });

  it('keresés előtt nem mutatja a "Nincs találat" üzenetet, csak egy lezárult, üres keresés után', () => {
    const fixture = configure();
    const component = fixture.componentInstance;
    component.toggleBankSearch();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Nincs találat');

    component.searchBank();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nincs találat');
  });
});

/**
 * BUG UI-TT-228: a szekció-navigáció fülei korábban plain `<a [href]="'#'+id">` linkek voltak -
 * az `index.html` `<base href="/">` + az üres-path `/dashboard`-redirect route kombinációja
 * miatt a kattintás a TELJES szerkesztőt megsemmisítette (a `/dashboard`-ra navigálva), egy még
 * be nem küldött kérdés-piszkozattal együtt, figyelmeztetés nélkül.
 */
describe('KvizSzerkesztoComponent - szekció-navigáció (UI-TT-228)', () => {
  function configure() {
    const storeMock = {
      selectedDetail: signal<TeacherQuizDetailDto | null>({
        id: 7,
        title: 'Teszt kvíz',
        description: null,
        isPublished: false,
        takedownAt: null,
        takedownReason: null,
        examLevel: null,
        questionCount: 0,
        pendingQuestionCount: 0,
        assignedGroupCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        feedbackMode: 'after',
        secondsPerQuestion: null,
        maxAttempts: null,
        shuffleQuestions: true,
        allowLateSubmission: true,
        questions: [],
        assignments: [],
      }),
      loading: signal(false),
      generating: signal(false),
      error: signal(null),
      publishResult: signal(null),
      bankResults: signal([]),
      bankSearching: signal(false),
      bankSearchError: signal(null),
      loadDetail: vi.fn(),
      addQuestion: vi.fn(),
      publish: vi.fn(),
      searchBankQuestions: vi.fn(),
      addExistingQuestion: vi.fn(),
      clearBankResults: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [KvizSzerkesztoComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } } },
        { provide: TeacherQuizStore, useValue: storeMock },
        { provide: TeacherQuizService, useValue: { getTopics: () => of([]) } },
        { provide: GroupStore, useValue: { groups: signal([]), loadMine: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(KvizSzerkesztoComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('a szekció-fülek NEM natív <a href="#..."> linkek - nincs href, ami a <base href> ellenében feloldódhatna', () => {
    const fixture = configure();
    const nav = fixture.nativeElement.querySelector('nav[aria-label="Szekciók"]');
    expect(nav).toBeTruthy();

    const links = nav.querySelectorAll('a[href]');
    expect(links.length).toBe(0);

    const buttons = nav.querySelectorAll('button');
    expect(buttons.length).toBe(6);
  });

  it('egy fülre kattintva a megfelelő szekcióhoz görget, navigáció NÉLKÜL', () => {
    const fixture = configure();
    const component = fixture.componentInstance;
    const scrollSpy = vi.fn();
    const target = document.createElement('div');
    target.id = 'ai';
    target.scrollIntoView = scrollSpy;
    vi.spyOn(document, 'getElementById').mockReturnValue(target);

    component.scrollToSection('ai');

    expect(document.getElementById).toHaveBeenCalledWith('ai');
    expect(scrollSpy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
  });

  it('a fülre kattintás ténylegesen a component metódusát hívja meg (nem csak a href-navigációt)', () => {
    const fixture = configure();
    const component = fixture.componentInstance;
    const scrollToSectionSpy = vi.spyOn(component, 'scrollToSection').mockImplementation(() => {});

    const nav = fixture.nativeElement.querySelector('nav[aria-label="Szekciók"]');
    const buttons: HTMLButtonElement[] = Array.from(nav.querySelectorAll('button'));
    const kerdesekButton = buttons.find((b) => b.textContent?.trim() === 'Kérdések')!;
    expect(kerdesekButton).toBeTruthy();

    kerdesekButton.click();

    expect(scrollToSectionSpy).toHaveBeenCalledWith('kerdesek');
  });
});
