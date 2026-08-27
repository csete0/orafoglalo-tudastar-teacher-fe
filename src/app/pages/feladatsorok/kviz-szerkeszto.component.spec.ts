import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TeacherQuizDetailDto } from '../../models/teacher-quiz.model';
import { GroupStore } from '../../services/group/group.store';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { TeacherQuizStore } from '../../services/teacher-quiz/teacher-quiz.store';
import { KvizSzerkesztoComponent } from './kviz-szerkeszto.component';

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
    loadDetail: ReturnType<typeof vi.fn>;
    addQuestion: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    clearPublishResult: ReturnType<typeof vi.fn>;
  };

  function configure(detail: TeacherQuizDetailDto | null = makeDetail()) {
    storeMock = {
      selectedDetail: signal(detail),
      loading: signal(false),
      generating: signal(false),
      error: signal(null),
      publishResult: signal(null),
      loadDetail: vi.fn(),
      addQuestion: vi.fn(),
      publish: vi.fn(),
      clearPublishResult: vi.fn(),
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
    const publishButton: HTMLButtonElement = fixture.nativeElement.querySelector('section button.btn-primary');
    expect(publishButton.disabled).toBe(true);
  });
});
