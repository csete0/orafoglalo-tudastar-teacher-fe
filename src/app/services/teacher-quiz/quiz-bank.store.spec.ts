import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { QuizBankStore } from './quiz-bank.store';
import { TeacherQuizService } from './teacher-quiz.service';
import { TeacherQuizStore } from './teacher-quiz.store';

/** UI-UX: közös bank keresés ("meglévő kérdés hozzáadása") - a `TeacherQuizStore`-ból kiemelve. */
describe('QuizBankStore', () => {
  let serviceMock: { searchBankQuestions: ReturnType<typeof vi.fn> };
  let bank: QuizBankStore;
  let quizStore: TeacherQuizStore;

  function configure() {
    serviceMock = { searchBankQuestions: vi.fn() };

    TestBed.configureTestingModule({
      providers: [{ provide: TeacherQuizService, useValue: serviceMock }],
    });

    bank = TestBed.inject(QuizBankStore);
    quizStore = TestBed.inject(TeacherQuizStore);
  }

  afterEach(() => TestBed.resetTestingModule());

  it('searchBankQuestions() a service-t hívja, a találatokat bankResults()-ba írja, saját (nem a fő) betöltés-jelzőt használ', () => {
    configure();
    const search$ = new Subject<unknown>();
    serviceMock.searchBankQuestions.mockReturnValue(search$);

    bank.search('XKERES', 3, 'Hard', 'teacher');

    expect(serviceMock.searchBankQuestions).toHaveBeenCalledWith('XKERES', 3, 'Hard', 'teacher');
    expect(bank.searching()).toBe(true);
    // A keresés NEM a fő loading()-ot állítja - a szerkesztő többi része eközben
    // is használható marad.
    expect(quizStore.loading()).toBe(false);

    search$.next([{ id: 1, questionText: 'XKERES kérdés' }]);
    search$.complete();

    expect(bank.searching()).toBe(false);
    expect(bank.results()).toEqual([{ id: 1, questionText: 'XKERES kérdés' }]);
  });

  it('a keresés a megadott scope gyökerével megy (platform-kvíz szerkesztőben admin)', () => {
    configure();
    serviceMock.searchBankQuestions.mockReturnValue(new Subject<unknown>());

    bank.search(null, null, null, 'admin');

    expect(serviceMock.searchBankQuestions).toHaveBeenCalledWith(null, null, null, 'admin');
  });

  it('BUG: két egymást átfedő keresés közül a KÉSŐBB INDULÓ, de HAMARABB VÁLASZOLÓ nyer - egy lassú, korábbi keresés válasza felülírhatja egy újabb szűréssel indított, gyorsabb keresés találatait', () => {
    // BE-QUIZAUTHORING-BANKSEARCH-STALE-RESPONSE-RACE: searchBankQuestions() minden
    // hívása egy ÚJ, független subscribe-ot indít (nincs switchMap/generation-guard, ellentétben
    // a mutateAndReload()-ban használt _detailQuizId cél-ellenőrzéssel). A tanár beír egy
    // tág keresést (sok találat, lassabb backend-lekérdezés a Topic-join miatt), majd MIELŐTT
    // az visszaérne, tovább szűkíti témakörrel/nehézséggel és újra keres (kevesebb sor, gyorabb
    // válasz). Ha a második, gyorsabb válasz előbb érkezik, az elsőnek látszó - majd a lassabb,
    // ELSŐ keresés válasza NÉMÁN felülírja: a felületen a szűkített szűrők mellett a tág keresés
    // találatai maradnak, a tanár a rossz kérdéseket látja "hozzáadás"-ra kínálva.
    configure();
    const wideSearch$ = new Subject<unknown>();
    const narrowSearch$ = new Subject<unknown>();
    serviceMock.searchBankQuestions
      .mockReturnValueOnce(wideSearch$)
      .mockReturnValueOnce(narrowSearch$);

    // 1. keresés: tág szűrő nélkül indul.
    bank.search(null, null, null, 'teacher');
    // 2. keresés: a tanár közben témakörre szűkít, ÚJRA keres - a régi kérés még folyamatban.
    bank.search(null, 3, null, 'teacher');

    // A GYORSABB, MÁSODIK (szűkített) keresés válasza előbb érkezik meg.
    narrowSearch$.next([{ id: 2, questionText: 'Szűkített találat' }]);
    narrowSearch$.complete();
    expect(bank.results()).toEqual([{ id: 2, questionText: 'Szűkített találat' }]);

    // Az ELSŐ (tág) keresés válasza KÉSVE érkezik meg - ez már elavult, hiszen a felület
    // szűrői időközben megváltoztak, a tanár a szűkített találatokat várja.
    wideSearch$.next([{ id: 1, questionText: 'Tág (elavult) találat' }]);
    wideSearch$.complete();

    // ELVÁRT: a felületen a szűrőknek megfelelő, szűkített találat maradjon. TÉNYLEGES: a
    // késve érkező, elavult tág keresés válasza csendben felülírja.
    expect(bank.results()).toEqual([{ id: 2, questionText: 'Szűkített találat' }]);
  });

  it('searchBankQuestions() hibáját bankSearchError()-ban jelzi, a fő error()-t nem érinti', () => {
    configure();
    const search$ = new Subject<unknown>();
    serviceMock.searchBankQuestions.mockReturnValue(search$);

    bank.search(null, null, null, 'teacher');
    search$.error({ error: { errorMessage: 'A keresés sikertelen.' } });

    expect(bank.error()).toBe('A keresés sikertelen.');
    expect(quizStore.error()).toBeNull();
  });
});
