import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import {
  QUIZ_QUESTION_TYPE_LABELS,
  TeacherQuizQuestionStatDto,
  TeacherQuizResultsDto,
} from '../../models/teacher-quiz.model';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';

/**
 * Egy kiadott kvíz eredményei.
 *
 * A KÉRDÉSENKÉNTI bontás áll elöl, nem a diák-lista: az mondja meg a tanárnak, mit kell
 * újra elmagyaráznia. Egy 20%-os kérdés nem a diákokról szól, hanem a tananyagról - és a
 * leggyakoribb hibás válasz azt is elárulja, milyen tévhit él a csoportban.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kviz-eredmenyek',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <a [routerLink]="['/feladatsorok', 'kvizek', quizId, 'szerkesztes']"
         class="text-sm text-text-muted hover:underline">← Vissza a szerkesztőhöz</a>

      @if (results(); as r) {
        <h1 class="page-title mt-3">{{ r.title }}</h1>
        <p class="text-sm text-text-muted mt-1">Eredmények</p>
        <div class="hairline"></div>

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

        <!-- Kérdésenkénti bontás -->
        <section class="card p-5 mb-6">
          <h2 class="font-bold">Kérdésenként</h2>
          <p class="text-sm text-text-muted mb-3">
            A gyengén sikerült kérdések azt mutatják, mit érdemes újra átvenni.
          </p>

          <ul class="space-y-3">
            @for (q of sortedQuestions(); track q.questionId) {
              <li class="border border-border rounded p-3">
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

        <!-- Diákonként -->
        <section class="card p-5">
          <h2 class="font-bold mb-3">Diákonként</h2>

          <ul class="space-y-2">
            @for (s of r.students; track s.userId) {
              <li class="flex items-center gap-3 text-sm border-b border-border pb-2 last:border-0">
                <span class="min-w-0 flex-1">
                  <span class="block font-medium truncate">{{ s.name }}</span>
                  <span class="text-xs text-text-muted">
                    {{ s.groupName }}
                    @if (s.lastCompletedAt) {
                      · {{ s.lastCompletedAt | date: 'yyyy.MM.dd. HH:mm' }}
                    }
                    @if (s.attemptCount > 1) {
                      · {{ s.attemptCount }} kitöltés
                    }
                  </span>
                </span>

                @if (s.completedLate) {
                  <span class="badge badge-warning shrink-0">Késett</span>
                }
                @if (s.hasInProgress) {
                  <span class="badge shrink-0">Folyamatban</span>
                }
                <span class="shrink-0 font-bold">
                  {{ s.bestScore != null ? s.bestScore + ' / ' + s.totalQuestions : '–' }}
                </span>
              </li>
            } @empty {
              <li class="text-sm text-text-muted">Még nincs kinek eredményt mutatni.</li>
            }
          </ul>
        </section>
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

  readonly quizId = Number(this.route.snapshot.paramMap.get('id'));

  // catchError nélkül a toSignal() minden KÖVETKEZŐ olvasáskor újra-dobná a hibát, és
  // mivel a sablon feltétel nélkül olvassa, egy hibás lekérés a teljes oldal renderelését
  // döntené el (UI-TT-133 tanulsága).
  readonly results = toSignal(
    this.service.getResults(this.quizId).pipe(catchError(() => of(null as TeacherQuizResultsDto | null))),
    { initialValue: null as TeacherQuizResultsDto | null },
  );

  /**
   * A leggyengébb kérdések elöl - a tanár azokkal akar kezdeni. A még meg nem válaszolt
   * kérdések a lista végére kerülnek, mert róluk nincs mit mondani.
   */
  readonly sortedQuestions = computed(() =>
    [...(this.results()?.questions ?? [])].sort(
      (a, b) => (a.correctPercent ?? 101) - (b.correctPercent ?? 101),
    ),
  );

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
