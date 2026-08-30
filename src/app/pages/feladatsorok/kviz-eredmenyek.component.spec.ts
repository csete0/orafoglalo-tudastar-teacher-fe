import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { KvizEredmenyekComponent } from './kviz-eredmenyek.component';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { KahootHostService } from '../../services/kahoot-host/kahoot-host.service';
import { KahootGameSummaryDto } from '../../models/kahoot-host.model';
import { TeacherQuizResultsDto, TeacherQuizStudentResultDto } from '../../models/teacher-quiz.model';

function makeResults(overrides: Partial<TeacherQuizResultsDto> = {}): TeacherQuizResultsDto {
  return {
    quizId: 7,
    title: 'Teszt kvíz',
    questionCount: 1,
    assignedStudentCount: 1,
    completedStudentCount: 1,
    averageScorePercent: 100,
    students: [],
    questions: [],
    ...overrides,
  };
}

function makeStudent(overrides: Partial<TeacherQuizStudentResultDto> = {}): TeacherQuizStudentResultDto {
  return {
    userId: 1,
    name: 'Teszt Diák',
    groupName: '9.a',
    attemptCount: 1,
    bestScore: 3,
    totalQuestions: 3,
    hasInProgress: false,
    completedLate: false,
    liveAttemptCount: 0,
    bestScoreMode: 'solo',
    bestLivePoints: null,
    bestLiveCorrectAnswers: null,
    bestLiveTotalQuestions: null,
    ...overrides,
  };
}

function makeGame(overrides: Partial<KahootGameSummaryDto> = {}): KahootGameSummaryDto {
  return {
    kahootSessionId: 42,
    status: 'lobby',
    groupName: '9.a',
    createdAt: new Date().toISOString(),
    finishedAt: null,
    participantCount: 3,
    podium: [],
    ...overrides,
  };
}

// UI-TT-222: egy beragadt/félbeszakadt (böngésző-összeomlás, tab-bezárás) élő szoba
// véglegesen letiltotta új élő játék indítását ugyanarra a (kvíz, csoport) párra, és a
// tanárnak SEHOL a felületen nem volt felfedezhető útja megtalálni/lezárni azt - az
// Eredmények oldal "Élő játékok" listája csak szűrt (selectGame), nem navigált. A vezérlő
// route (/elo/:kahootSessionId) maga már működött ("Játék befejezése" gomb), csak nem
// volt hozzá link.
describe('KvizEredmenyekComponent - "Vezérlés" link a beragadt élő szoba megtalálásához (UI-TT-222)', () => {
  function configure(games: KahootGameSummaryDto[], results: TeacherQuizResultsDto | null = makeResults()) {
    TestBed.configureTestingModule({
      imports: [KvizEredmenyekComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } },
        },
        { provide: TeacherQuizService, useValue: { getResults: () => of(results) } },
        { provide: KahootHostService, useValue: { getGames: () => of(games) } },
      ],
    });

    const fixture = TestBed.createComponent(KvizEredmenyekComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('BUG UI-TT-222 javítva: egy MÉG NEM lezárult (beragadt vagy ténylegesen futó) játéknál megjelenik a "Vezérlés" link, a helyes /elo/:kahootSessionId route-ra mutatva', () => {
    const fixture = configure([makeGame({ kahootSessionId: 42, status: 'lobby' })]);

    const link: HTMLAnchorElement | null = fixture.nativeElement.querySelector('a[title="Vezérlés / lezárás"]');
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('/feladatsorok/kvizek/7/elo/42');
  });

  it('kontroll: egy MÁR LEZÁRULT (finished) játéknál NEM jelenik meg a "Vezérlés" link (nincs mit vezérelni)', () => {
    const fixture = configure([makeGame({ kahootSessionId: 43, status: 'finished' })]);

    const link = fixture.nativeElement.querySelector('a[title="Vezérlés / lezárás"]');
    expect(link).toBeFalsy();
  });

  it('vegyes lista: csak a nem-finished játékoknál jelenik meg a link', () => {
    const fixture = configure([
      makeGame({ kahootSessionId: 42, status: 'question' }),
      makeGame({ kahootSessionId: 43, status: 'finished' }),
    ]);

    const links: HTMLAnchorElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('a[title="Vezérlés / lezárás"]'),
    );
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/feladatsorok/kvizek/7/elo/42');
  });
});

// UI-TT-223: ha a diáknak van egy GYENGE arányú (de sok pontot érő) élő próbálkozása és egy
// JOBB arányú önálló próbálkozása, a "Diákonként" sor korábban feltétel nélkül a fő
// bestScore/totalQuestions arány MELLÉ írta ki a "⚡ N pont"-ot, egy sosem megtörtént
// kombinációt sugallva - hiszen a kiírt arány és a kiírt pont két KÜLÖNBÖZŐ próbálkozásból
// jött. A pont csak akkor mehet a fő sorba, ha ugyanabból a session-ből jön (bestScoreMode
// === 'live'); egyébként külön, egyértelműen jelölt sorban jelenik meg.
describe('KvizEredmenyekComponent - "Diákonként" lista élő/önálló pontszám-keverése (UI-TT-223)', () => {
  function configure(students: TeacherQuizStudentResultDto[]) {
    TestBed.configureTestingModule({
      imports: [KvizEredmenyekComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: '7' }) } },
        },
        { provide: TeacherQuizService, useValue: { getResults: () => of(makeResults({ students })) } },
        { provide: KahootHostService, useValue: { getGames: () => of([]) } },
      ],
    });

    const fixture = TestBed.createComponent(KvizEredmenyekComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => TestBed.resetTestingModule());

  it('BUG UI-TT-223 javítva: a legjobb ÉLŐ pontszám NEM a fő (más session-ből jövő) arány mellé íródik ki, ha a beszámított legjobb nem élő', () => {
    const fixture = configure([
      makeStudent({
        bestScore: 3,
        totalQuestions: 3,
        bestScoreMode: 'solo',
        liveAttemptCount: 1,
        attemptCount: 2,
        bestLivePoints: 2760,
        bestLiveCorrectAnswers: 3,
        bestLiveTotalQuestions: 8,
      }),
    ]);

    const text: string = fixture.nativeElement.textContent;
    // A fő sorban (a "3 / 3" mellett) nem jelenhet meg a "⚡ 2760 pont" - azt egy külön,
    // "Legjobb élő menet" feliratú sor mutatja, a HOZZÁ tartozó 3/8 aránnyal.
    expect(text).toContain('Legjobb élő menet: 3 / 8');
    expect(text).toContain('⚡ 2760 pont');
    // Az "Élő" jelvény sem jelenhet meg, mert a beszámított legjobb NEM élő.
    expect(fixture.nativeElement.querySelector('.badge-primary')).toBeFalsy();
  });

  it('kontroll: ha a beszámított legjobb próbálkozás MAGA élő, a pont a fő sorban marad, külön sor nélkül', () => {
    const fixture = configure([
      makeStudent({
        bestScore: 3,
        totalQuestions: 8,
        bestScoreMode: 'live',
        liveAttemptCount: 1,
        bestLivePoints: 2718,
        bestLiveCorrectAnswers: 3,
        bestLiveTotalQuestions: 8,
      }),
    ]);

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('⚡ 2718 pont');
    expect(text).not.toContain('Legjobb élő menet');
    expect(fixture.nativeElement.querySelector('.badge-primary')).toBeTruthy();
  });
});
