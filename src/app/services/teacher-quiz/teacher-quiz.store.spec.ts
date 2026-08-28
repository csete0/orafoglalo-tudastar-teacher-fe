import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { TeacherQuizDetailDto } from '../../models/teacher-quiz.model';
import { TeacherQuizService } from './teacher-quiz.service';
import { TeacherQuizStore } from './teacher-quiz.store';

function makeDetail(overrides: Partial<TeacherQuizDetailDto> = {}): TeacherQuizDetailDto {
  return {
    id: 1,
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

describe('TeacherQuizStore', () => {
  let serviceMock: {
    getMine: ReturnType<typeof vi.fn>;
    getDetail: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    addQuestion: ReturnType<typeof vi.fn>;
    generateQuestions: ReturnType<typeof vi.fn>;
    reorderQuestion: ReturnType<typeof vi.fn>;
  };
  let store: TeacherQuizStore;

  function configure() {
    serviceMock = {
      getMine: vi.fn(),
      getDetail: vi.fn(),
      publish: vi.fn(),
      addQuestion: vi.fn(),
      generateQuestions: vi.fn(),
      reorderQuestion: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: TeacherQuizService, useValue: serviceMock }],
    });

    store = TestBed.inject(TeacherQuizStore);
  }

  afterEach(() => TestBed.resetTestingModule());

  // A store `providedIn: 'root'`: a lista oldalról a szerkesztőbe navigálva a korábbi,
  // immár irreleváns lista-válasz idő előtt lezárná a szerkesztő MÉG futó betöltését, ha
  // közös jelzőn osztoznának (a TeacherTaskSetStore UI-TT-166 tanulsága).
  it('a lista és a részlet FÜGGETLEN betöltés-jelzőt használ', () => {
    configure();

    const mine$ = new Subject<never[]>();
    const detail$ = new Subject<TeacherQuizDetailDto>();
    serviceMock.getMine.mockReturnValue(mine$);
    serviceMock.getDetail.mockReturnValue(detail$);

    store.loadMine();
    store.loadDetail(1);

    expect(store.mineLoading()).toBe(true);
    expect(store.loading()).toBe(true);

    // A lista válasza megérkezik - a részlet betöltése MÉG fut.
    mine$.next([]);
    mine$.complete();

    expect(store.mineLoading()).toBe(false);
    expect(store.loading()).toBe(true);
  });

  // A generáció-számláló önmagában nem elég: egy elhagyott kvíz mutációja indulna
  // utoljára, tehát ő kapná a legmagasabb generációt, és felülírná a közben megnyitott
  // másik kvíz nézetét (a TeacherTaskSetStore UI-TT-156 tanulsága).
  it('egy elhagyott kvíz mutációja nem tölt újra egy MÁSIK kvíz nézetébe', () => {
    configure();

    serviceMock.getDetail.mockImplementation((id: number) => of(makeDetail({ id, title: `Kvíz ${id}` })));

    // Az 1-es kvízen indul egy mutáció, ami csak KÉSŐBB válaszol.
    const mutation$ = new Subject<unknown>();
    serviceMock.addQuestion.mockReturnValue(mutation$);
    store.loadDetail(1);
    store.addQuestion(1, {
      topicId: 1,
      questionType: 'single',
      questionText: 'k',
      options: ['a', 'b'],
      correctAnswers: ['a'],
      difficulty: 'Medium',
    });

    // A tanár közben a 2-es kvízre navigál.
    store.loadDetail(2);
    expect(store.selectedDetail()?.id).toBe(2);

    serviceMock.getDetail.mockClear();

    // Az elhagyott mutáció most fut be.
    mutation$.next({});
    mutation$.complete();

    // Nem indíthatott újratöltést, és a megjelenített kvíz továbbra is a 2-es.
    expect(serviceMock.getDetail).not.toHaveBeenCalled();
    expect(store.selectedDetail()?.id).toBe(2);
  });

  it('egy elavult részlet-válasz nem írja felül a frissebbet', () => {
    configure();

    const first$ = new Subject<TeacherQuizDetailDto>();
    const second$ = new Subject<TeacherQuizDetailDto>();
    serviceMock.getDetail.mockReturnValueOnce(first$).mockReturnValueOnce(second$);

    store.loadDetail(1);
    store.loadDetail(2);

    // A MÁSODIK válaszol előbb...
    second$.next(makeDetail({ id: 2 }));
    expect(store.selectedDetail()?.id).toBe(2);

    // ...majd befut a régebbi, immár túlhaladott válasz.
    first$.next(makeDetail({ id: 1 }));
    expect(store.selectedDetail()?.id).toBe(2);
  });

  // Sikertelen publikálásnál a hibalistának meg kell jelennie, és a spinner nem
  // ragadhat bent - siker esetén viszont a loading szándékosan true marad az
  // újratöltés végéig, különben a jelvény átmenetileg "nem publikált"-at mutatna.
  it('sikertelen publikálásnál kiadja a hibalistát és lezárja a betöltést', () => {
    configure();

    serviceMock.getDetail.mockReturnValue(of(makeDetail()));
    store.loadDetail(1);

    serviceMock.publish.mockReturnValue(
      of({ success: false, errors: ['3 kérdés még jóváhagyásra vár - ezeket nézd át, mielőtt kiadod.'] }),
    );

    store.publish(1);

    expect(store.publishResult()?.success).toBe(false);
    expect(store.publishResult()?.errors).toHaveLength(1);
    expect(store.loading()).toBe(false);
  });

  // Az AI-generálás saját jelzőt kap: hosszabb művelet, és a SAJÁT gombját tiltja le -
  // nem szabad a mentés-gombokat is bénítania.
  it('a generálás külön jelzőt használ, és nem indítható kétszer', () => {
    configure();

    serviceMock.getDetail.mockReturnValue(of(makeDetail()));
    store.loadDetail(1);

    const generate$ = new Subject<never[]>();
    serviceMock.generateQuestions.mockReturnValue(generate$);

    store.generateQuestions(1, { topicId: 1, count: 5, difficulty: 'Medium' });
    expect(store.generating()).toBe(true);
    expect(store.loading()).toBe(false);

    store.generateQuestions(1, { topicId: 1, count: 5, difficulty: 'Medium' });
    expect(serviceMock.generateQuestions).toHaveBeenCalledTimes(1);

    generate$.next([]);
    generate$.complete();
    expect(store.generating()).toBe(false);
  });

  // UI-TT-213: a reorderQuestion() a dedikált, atomi BE-végpontot hívja (egyetlen
  // hívás, nem a régi két-updateQuestion-mintát) - siker esetén újratölti a részletet,
  // hiba esetén (a mutateAndReload általános szerződése szerint) NEM tölt újra és a
  // hibát az error()-ban teszi elérhetővé, tehát nem maradhat olyan köztes állapot, ahol
  // a felület egy félig végrehajtott csere eredményét mutatná sikeres jelzés nélkül.
  it('reorderQuestion() siker esetén újratölti a részletet, hiba esetén nem és a hibát jelzi', () => {
    configure();

    serviceMock.getDetail.mockReturnValue(of(makeDetail({ id: 1 })));
    store.loadDetail(1);

    const reorder$ = new Subject<unknown>();
    serviceMock.reorderQuestion.mockReturnValue(reorder$);

    store.reorderQuestion(1, 10, 20);
    expect(serviceMock.reorderQuestion).toHaveBeenCalledWith(10, 20);

    serviceMock.getDetail.mockClear();
    serviceMock.getDetail.mockReturnValue(of(makeDetail({ id: 1, title: 'Cserélt sorrend' })));
    reorder$.next({});
    reorder$.complete();

    expect(serviceMock.getDetail).toHaveBeenCalledTimes(1);
    expect(store.selectedDetail()?.title).toBe('Cserélt sorrend');
    expect(store.error()).toBeNull();

    // Egy MÁSODIK, sikertelen csere - sem újratöltés, sem csendes állapot: a hibát
    // az error() jelzi.
    const failingReorder$ = new Subject<unknown>();
    serviceMock.reorderQuestion.mockReturnValue(failingReorder$);
    serviceMock.getDetail.mockClear();

    store.reorderQuestion(1, 20, 10);
    failingReorder$.error({ error: { errorMessage: 'Hálózati hiba.' } });

    expect(serviceMock.getDetail).not.toHaveBeenCalled();
    expect(store.error()).toBe('Hálózati hiba.');
  });
});
