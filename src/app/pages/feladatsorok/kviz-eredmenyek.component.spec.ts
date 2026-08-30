import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { KvizEredmenyekComponent } from './kviz-eredmenyek.component';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { KahootHostService } from '../../services/kahoot-host/kahoot-host.service';
import { KahootGameSummaryDto } from '../../models/kahoot-host.model';
import { TeacherQuizResultsDto } from '../../models/teacher-quiz.model';

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
