import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, of, switchMap } from 'rxjs';
import { KahootGameSummaryDto } from '../../models/kahoot-host.model';
import {
  QUIZ_QUESTION_TYPE_LABELS,
  QuizResultsMode,
  TeacherQuizQuestionStatDto,
  TeacherQuizResultsDto,
} from '../../models/teacher-quiz.model';
import { KahootHostService } from '../../services/kahoot-host/kahoot-host.service';
import { ResultsCsvExportService } from '../../services/export/results-csv-export.service';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { SortState } from '../../shared/sort-header/sort-header.component';
import { KvizDiakTablaComponent } from './kviz-eredmenyek/kviz-diak-tabla.component';

/**
 * Egy kiadott kvíz eredményei.
 *
 * A KÉRDÉSENKÉNTI bontás áll elöl, nem a diák-lista: az mondja meg a tanárnak, mit kell
 * újra elmagyaráznia. Egy 20%-os kérdés nem a diákokról szól, hanem a tananyagról - és a
 * leggyakoribb hibás válasz azt is elárulja, milyen tévhit él a csoportban.
 *
 * KAHOOT: az eredmények két forrásból születhetnek - élő (tanár-vezérelt) menetből és
 * önálló kitöltésből. A forrás-szűrő (Mind / Élő / Önálló) és a konkrét játékra szűkítés
 * a session-halmazra megy a backenden; a kérdésenkénti bontás és a diák-lista így mindig
 * UGYANARRÓL a populációról beszél.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kviz-eredmenyek',
  standalone: true,
  imports: [RouterLink, DatePipe, KvizDiakTablaComponent],
  template: `
    <div class="page-wide">
      <a [routerLink]="['/feladatsorok', 'kvizek', quizId, 'szerkesztes']"
         class="text-sm text-text-muted hover:underline">← Vissza a szerkesztőhöz</a>

      @if (results(); as r) {
        <div class="flex items-start justify-between gap-4 flex-wrap mt-3">
          <div class="min-w-0">
            <h1 class="page-title truncate">{{ r.title }}</h1>
            <p class="text-sm text-text-muted mt-1">Eredmények</p>
          </div>
          <!-- UI-UX-T5: a feladatsor-eredmények oldala már tud CSV-t - a tanár a
               kvíznél ugyanazt a naplózási munkát végzi. -->
          <button type="button" (click)="exportCsv(r)" class="btn shrink-0"
            title="Az eredmények letöltése CSV-ben, osztálynaplóba importálható formában.">
            Exportálás CSV-be
          </button>
        </div>
        <div class="hairline"></div>

        <!-- Forrás-szűrő -->
        <div class="flex flex-wrap items-center gap-2 mb-6">
          @for (option of modeOptions; track option.value) {
            <button type="button"
                    class="btn"
                    [class.btn-primary]="isModeActive(option.value)"
                    [class.btn-ghost]="!isModeActive(option.value)"
                    (click)="setMode(option.value)">
              {{ option.label }}
            </button>
          }
          @if (selectedGame(); as game) {
            <span class="badge badge-primary">
              Játék: {{ game.createdAt | date: 'MM.dd. HH:mm' }} · {{ game.groupName }}
              <button type="button" class="ml-1 font-bold" (click)="clearGame()"
                      aria-label="Játék-szűrő törlése">×</button>
            </span>
          }
        </div>

        <!-- Összesítő -->
        <section class="card p-5 mb-6 grid grid-cols-3 gap-4 text-center">
          <div>
            <p class="text-2xl font-bold">{{ r.completedStudentCount }} / {{ r.assignedStudentCount }}</p>
            <p class="text-xs text-text-muted">megírta</p>
          </div>
          <div>
            <p class="text-2xl font-bold">
              {{ r.averageScorePercent != null ? r.averageScorePercent + '%' : '–' }}
            </p>
            <p class="text-xs text-text-muted">átlag</p>
          </div>
          <div>
            <p class="text-2xl font-bold">{{ r.questionCount }}</p>
            <p class="text-xs text-text-muted">kérdés</p>
          </div>
        </section>

        <!-- Élő játékok -->
        @if (games().length) {
          <section class="card p-5 mb-6">
            <h2 class="font-bold">Élő játékok</h2>
            <p class="text-sm text-text-muted mb-3">
              Egy játékra kattintva az eredmények arra a menetre szűkülnek.
            </p>
            <ul class="space-y-2">
              @for (game of games(); track game.kahootSessionId) {
                <li class="flex items-center gap-2">
                  <button type="button"
                          class="min-w-0 flex-1 text-left flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 hover:bg-bg-element"
                          [class.bg-primary-subtle]="selectedGameId() === game.kahootSessionId"
                          (click)="selectGame(game.kahootSessionId)">
                    <span class="min-w-0 flex-1">
                      <span class="block font-medium">
                        {{ game.createdAt | date: 'yyyy.MM.dd. HH:mm' }} · {{ game.groupName }}
                      </span>
                      <span class="text-xs text-text-muted">
                        {{ game.participantCount }} résztvevő
                        @if (game.podium.length) {
                          · 🏆 {{ game.podium[0].name }} ({{ game.podium[0].totalPoints }} pont)
                        }
                      </span>
                    </span>
                    <span class="badge shrink-0" [class]="gameBadgeClass(game)">
                      {{ gameBadgeLabel(game) }}
                    </span>
                  </button>
                  <!-- UI-TT-222: egy beragadt/félbeszakadt (böngésző-összeomlás, tab-bezárás)
                       élő szoba véglegesen letiltotta új élő játék indítását ugyanarra a
                       (kvíz, csoport) párra, és a tanárnak SEHOL nem volt felfedezhető
                       útja megtalálni/lezárni - ez a lista csak szűrt, nem navigált. A
                       vezérlő route (/elo/:kahootSessionId) maga már működött, csak nem
                       volt hozzá link. Bármely MÉG NEM lezárult (finished) játékhoz
                       közvetlen út a vezérlő nézetre, ahonnan a "Játék befejezése" gomb
                       feloldja a beragadást. -->
                  @if (game.status !== 'finished') {
                    <a [routerLink]="['/feladatsorok', 'kvizek', quizId, 'elo', game.kahootSessionId]"
                       class="btn btn-ghost shrink-0 !px-2 !py-1 !text-xs"
                       title="Vezérlés / lezárás">
                      Vezérlés
                    </a>
                  }
                </li>
              }
            </ul>
          </section>
        }

        <!-- Kérdésenkénti bontás -->
        <section class="card p-5 mb-6">
          <h2 class="font-bold">Kérdésenként</h2>
          <p class="text-sm text-text-muted mb-3">
            A gyengén sikerült kérdések azt mutatják, mit érdemes újra átvenni.
          </p>

          <ul class="space-y-3">
            @for (q of sortedQuestions(); track q.questionId) {
              <li class="border border-border-default rounded p-3">
                <div class="flex items-start gap-3">
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-semibold">{{ q.questionText }}</span>
                    <span class="text-xs text-text-muted">
                      {{ typeLabel(q) }} · {{ q.answerCount }} válasz
                    </span>
                  </span>
                  <span class="badge shrink-0" [class]="percentBadgeClass(q)">
                    {{ q.correctPercent != null ? q.correctPercent + '%' : 'nincs adat' }}
                  </span>
                </div>

                @if (q.mostCommonWrongAnswer) {
                  <p class="text-xs mt-2 text-text-muted">
                    Leggyakoribb hibás válasz:
                    <strong>{{ q.mostCommonWrongAnswer }}</strong>
                    ({{ q.mostCommonWrongAnswerCount }}×)
                  </p>
                }
              </li>
            } @empty {
              <li class="text-sm text-text-muted">Ehhez a kvízhez még nincs kérdés.</li>
            }
          </ul>
        </section>

        <!-- Diákonként: kompakt, oszloponként rendezhető tábla (UI-UX-T5). -->
        <app-kviz-diak-tabla [students]="r.students" [(sort)]="studentSort" />
      } @else {
        <div class="space-y-2 mt-6">
          <div class="skeleton h-24"></div>
          <div class="skeleton h-48"></div>
        </div>
      }
    </div>
  `,
})
export class KvizEredmenyekComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(TeacherQuizService);
  private readonly kahootHostService = inject(KahootHostService);
  private readonly csvExport = inject(ResultsCsvExportService);

  readonly quizId = Number(this.route.snapshot.paramMap.get('id'));

  readonly modeOptions: { value: QuizResultsMode; label: string }[] = [
    { value: 'all', label: 'Mind' },
    { value: 'live', label: 'Élő játék' },
    { value: 'solo', label: 'Önálló' },
  ];

  readonly mode = signal<QuizResultsMode>('all');
  // UI-UX-T10: a host-képernyő "Eredmények megnyitása" gombja query-parammal egyből
  // az imént lejátszott menetre szűr - érvénytelen érték csendben "nincs szűrő".
  readonly selectedGameId = signal<number | null>(
    (() => {
      // A spec-ek route-stubja csak paramMap-et ad - a queryParamMap hiánya
      // (és bármi más anomália) csendben "nincs szűrő"-t jelentsen.
      const raw = Number(this.route.snapshot.queryParamMap?.get('kahootSessionId'));
      return Number.isFinite(raw) && raw > 0 ? raw : null;
    })(),
  );

  // catchError a switchMap-en BELÜL: enélkül egy hibás lekérés a teljes szűrő-streamet
  // lezárná, és a következő szűrő-váltás már semmit nem töltene (UI-TT-133 elve).
  readonly results = toSignal(
    combineLatest([toObservable(this.mode), toObservable(this.selectedGameId)]).pipe(
      switchMap(([mode, gameId]) =>
        this.service
          .getResults(this.quizId, mode, gameId)
          .pipe(catchError(() => of(null as TeacherQuizResultsDto | null))),
      ),
    ),
    { initialValue: null as TeacherQuizResultsDto | null },
  );

  readonly games = toSignal(
    this.kahootHostService
      .getGames(this.quizId)
      .pipe(catchError(() => of([] as KahootGameSummaryDto[]))),
    { initialValue: [] as KahootGameSummaryDto[] },
  );

  readonly selectedGame = computed(() => {
    const id = this.selectedGameId();
    return id == null ? null : (this.games().find((g) => g.kahootSessionId === id) ?? null);
  });

  /**
   * A leggyengébb kérdések elöl - a tanár azokkal akar kezdeni. A még meg nem válaszolt
   * kérdések a lista végére kerülnek, mert róluk nincs mit mondani.
   */
  readonly sortedQuestions = computed(() =>
    [...(this.results()?.questions ?? [])].sort(
      (a, b) => (a.correctPercent ?? 101) - (b.correctPercent ?? 101),
    ),
  );

  /** A „Diákonként” tábla rendezése - itt él, hogy egy hibás szűrő-lekérés után se vesszen el. */
  readonly studentSort = signal<SortState | null>({ key: 'name', dir: 'asc' });

  /** UI-UX-T5: az aktuálisan SZŰRT nézet megy a CSV-be - amit a tanár lát, azt kapja. */
  exportCsv(r: TeacherQuizResultsDto): void {
    const game = this.selectedGame();
    const suffix = game
      ? `elo-jatek-${game.kahootSessionId}`
      : this.mode() === 'all' ? 'mind' : this.mode() === 'live' ? 'elo' : 'onallo';
    this.csvExport.exportQuizResults(r, suffix);
  }

  /** Játék-szűrésnél a mód-gombok a játékra vonatkoznak - az "Élő játék" az aktív. */
  isModeActive(mode: QuizResultsMode): boolean {
    if (this.selectedGameId() != null) return mode === 'live';
    return this.mode() === mode;
  }

  setMode(mode: QuizResultsMode): void {
    this.selectedGameId.set(null);
    this.mode.set(mode);
  }

  selectGame(kahootSessionId: number): void {
    // A konkrét játék definíció szerint élő menet - a mode itt már nem szűkít tovább.
    this.mode.set('all');
    this.selectedGameId.set(kahootSessionId);
  }

  clearGame(): void {
    this.selectedGameId.set(null);
  }

  gameBadgeLabel(game: KahootGameSummaryDto): string {
    if (game.status === 'finished') return 'Lezárult';
    if (game.status === 'cancelled') return 'Megszakadt';
    return 'Fut';
  }

  gameBadgeClass(game: KahootGameSummaryDto): string {
    if (game.status === 'finished') return 'badge-success';
    if (game.status === 'cancelled') return 'badge-danger';
    return 'badge-warning';
  }

  typeLabel(q: TeacherQuizQuestionStatDto): string {
    return QUIZ_QUESTION_TYPE_LABELS[q.questionType] ?? q.questionType;
  }

  percentBadgeClass(q: TeacherQuizQuestionStatDto): string {
    if (q.correctPercent == null) return '';
    if (q.correctPercent < 50) return 'badge-danger';
    if (q.correctPercent < 80) return 'badge-warning';
    return 'badge-success';
  }
}
