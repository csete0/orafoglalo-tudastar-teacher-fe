import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { QuizTestOverviewDto, QuizTestReviewDto, QuizTestStudentDto } from '../../models/teacher-quiz.model';
import { TeacherQuizTestService } from '../../services/teacher-quiz/teacher-quiz-test.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { parseUtc } from '../../shared/utc-date.util';

const STATUS_LABELS: Record<QuizTestStudentDto['status'], string> = {
  not_started: 'nem kezdte el',
  in_progress: 'írja',
  submitted: 'beadta',
};

const THEORY_LABELS: Record<string, string> = {
  szakmai: 'Technikumi elméleti dolgozat (szakmai, KKK)',
  alapvizsga: 'Technikumi elméleti dolgozat (ágazati alapvizsga)',
  topic: 'Technikumi elméleti dolgozat (témakör)',
};

/** Élő frissítés gyakorisága, amíg van író diák. */
const LIVE_REFRESH_MS = 15_000;

/**
 * Kvíz-dolgozat áttekintő (dolgozatként kiadott kvíz vagy technikumi elméleti dolgozat): névsor állapottal és ponttal, diákonként a
 * válaszok a megoldással, és az eredmények közzététele - a feladatsor-dolgozat áttekintőjének mintájára.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kviz-dolgozat',
  imports: [RouterLink, DatePipe, LocalSpinnerComponent],
  template: `
    <div class="page-wide">
      @if (overview(); as o) {
        <a [routerLink]="['/csoportok', o.groupId]" class="text-sm text-primary hover:underline">← {{ o.groupName }}</a>
        <div class="flex items-start justify-between gap-4 flex-wrap mt-2 mb-5">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-warning">
              {{ theoryLabel(o) }} · {{ o.timeLimitSeconds / 60 }} perc · {{ o.questionCount }} kérdés
            </p>
            <h1 class="text-2xl font-bold">{{ o.title }}</h1>
            <p class="text-sm text-text-muted">
              Megírható: {{ o.opensAt | date: 'yyyy.MM.dd. HH:mm' }} – {{ o.dueAt | date: 'yyyy.MM.dd. HH:mm' }}
              @if (o.isKkk) { · KKK-pontozás (kérdésenként 0–2 pont, 40% a megfelelt-határ) }
            </p>
          </div>
          @if (o.resultsPublishedAt) {
            <span class="badge badge-success" data-testid="quiz-test-published">Közzétéve: {{ o.resultsPublishedAt | date: 'MM.dd. HH:mm' }}</span>
          } @else {
            <button type="button" class="btn btn-primary" data-testid="quiz-test-publish" [disabled]="!o.canPublish || publishing()" (click)="publish(o)">
              {{ publishing() ? 'Közzététel…' : 'Eredmények közzététele' }}
            </button>
          }
        </div>

        @if (!o.resultsPublishedAt && !o.canPublish) {
          <p class="text-sm text-text-muted mb-4" data-testid="quiz-test-publish-wait">
            Akkor teheted közzé, ha minden diák beadta, vagy a megírható időszak véget ért - addig a diákok csak annyit látnak: „Beadva”.
          </p>
        }

        <div class="grid gap-3 grid-cols-2 md:grid-cols-3 mb-5">
          <div class="card p-4">
            <p class="text-xs text-text-muted uppercase tracking-wide">Beadta</p>
            <p class="text-2xl font-bold tabular-nums">{{ submittedCount() }} <span class="text-sm text-text-muted font-normal">/ {{ o.students.length }}</span></p>
          </div>
          <div class="card p-4">
            <p class="text-xs text-text-muted uppercase tracking-wide">Átlag</p>
            <p class="text-2xl font-bold tabular-nums">{{ averagePercent() ?? '–' }}{{ averagePercent() != null ? '%' : '' }}</p>
          </div>
        </div>

        <div class="card overflow-hidden">
          <div class="data-table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="sticky-col">Diák</th>
                  <th>Állapot</th>
                  <th>Pont</th>
                  <th>Beadva</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (row of o.students; track row.userId) {
                  <tr [class.opacity-50]="row.status === 'not_started'">
                    <td class="sticky-col whitespace-nowrap">
                      {{ row.name }}
                      @if (row.leftGroup) { <span class="badge badge-neutral !text-[10px] !px-1.5 !py-0.5">kilépett a csoportból</span> }
                    </td>
                    <td class="whitespace-nowrap">
                      {{ statusLabels[row.status] }}
                      @if (row.status === 'in_progress') { <span class="text-xs text-text-muted">({{ row.answeredCount }}/{{ row.totalQuestions }})</span> }
                    </td>
                    <td class="num whitespace-nowrap">
                      @if (row.points != null) {
                        {{ row.points }} / {{ row.maxPoints }}
                        @if (row.passed === true) { <span class="badge badge-success ml-1">megfelelt</span> }
                        @if (row.passed === false) { <span class="badge badge-danger ml-1">nem felelt meg</span> }
                      } @else { – }
                    </td>
                    <td class="whitespace-nowrap">{{ row.submittedAt ? (utc(row.submittedAt) | date: 'MM.dd. HH:mm') : '–' }}</td>
                    <td>
                      @if (row.sessionId != null && row.status !== 'not_started') {
                        <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" [attr.aria-expanded]="openSessionId() === row.sessionId"
                                [attr.data-testid]="'quiz-test-answers-' + row.userId" (click)="toggleAnswers(row.sessionId)">
                          {{ openSessionId() === row.sessionId ? 'Bezárás' : 'Válaszok' }}
                        </button>
                      }
                    </td>
                  </tr>
                  @if (openSessionId() === row.sessionId && row.sessionId != null) {
                    <tr>
                      <td colspan="5" class="!px-4 !pb-4">
                        @if (review(); as r) {
                          <ol class="space-y-2 text-sm" data-testid="quiz-test-review">
                            @for (item of r.items; track item.questionId) {
                              <li class="border border-border-default rounded p-3">
                                <p class="font-semibold">{{ item.order + 1 }}. {{ item.questionText }}</p>
                                <p [class.text-success]="item.isCorrect" [class.text-danger]="!item.isCorrect">
                                  Válasza: {{ item.userAnswers.length ? item.userAnswers.join(', ') : '(nem válaszolt)' }}
                                  @if (item.examPoints != null) { · {{ item.examPoints }} pont }
                                </p>
                                @if (!item.isCorrect) {
                                  <p class="text-text-muted">Helyes: {{ item.correctAnswers.join(', ') }}</p>
                                }
                              </li>
                            }
                          </ol>
                        } @else if (reviewError(); as err) {
                          <p class="text-danger text-sm">{{ err }}</p>
                        } @else {
                          <app-local-spinner />
                        }
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        </div>
      } @else if (error()) {
        <p class="text-danger">{{ error() }}</p>
      } @else {
        <app-local-spinner />
      }
    </div>
  `,
})
export class KvizDolgozatComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(TeacherQuizTestService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly overview = signal<QuizTestOverviewDto | null>(null);
  readonly error = signal<string | null>(null);
  readonly publishing = signal(false);
  readonly openSessionId = signal<number | null>(null);
  readonly review = signal<QuizTestReviewDto | null>(null);
  readonly reviewError = signal<string | null>(null);
  readonly statusLabels = STATUS_LABELS;
  readonly utc = parseUtc;

  readonly submittedCount = computed(() => (this.overview()?.students ?? []).filter((s) => s.status === 'submitted').length);
  readonly averagePercent = computed(() => {
    const scored = (this.overview()?.students ?? []).filter((s) => s.points != null && s.maxPoints);
    if (!scored.length) return null;
    return Math.round(scored.reduce((sum, s) => sum + (100 * s.points!) / s.maxPoints!, 0) / scored.length);
  });

  private assignmentId = 0;

  ngOnInit(): void {
    this.assignmentId = Number(this.route.snapshot.paramMap.get('assignmentId'));
    this.load();
    const timer = setInterval(() => {
      if (this.openSessionId() === null && this.overview()?.students.some((s) => s.status === 'in_progress')) this.load();
    }, LIVE_REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  theoryLabel(o: QuizTestOverviewDto): string {
    return (o.technikumTheoryKind && THEORY_LABELS[o.technikumTheoryKind]) || 'Kvíz-dolgozat';
  }

  load(): void {
    this.api.getOverview(this.assignmentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (o) => this.overview.set(o),
      error: (err) => this.error.set(extractErrorMessage(err, 'A dolgozat betöltése nem sikerült.')),
    });
  }

  toggleAnswers(sessionId: number): void {
    if (this.openSessionId() === sessionId) {
      this.openSessionId.set(null);
      return;
    }
    this.openSessionId.set(sessionId);
    this.review.set(null);
    this.reviewError.set(null);
    this.api.getStudentReview(this.assignmentId, sessionId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (r) => this.review.set(r),
      error: (err) => this.reviewError.set(extractErrorMessage(err, 'A válaszok betöltése nem sikerült.')),
    });
  }

  async publish(o: QuizTestOverviewDto): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Eredmények közzététele',
      message: `A(z) „${o.title}” dolgozat pontjait és megoldásait a diákok a Dolgozataim oldalon látják, és értesítést kapnak. A még nyitott, lejárt kitöltéseket a rendszer beadja.`,
      confirmLabel: 'Közzététel',
      cancelLabel: 'Mégsem',
    });
    if (!confirmed) return;
    this.publishing.set(true);
    this.api.publish(o.assignmentId).subscribe({
      next: () => {
        this.publishing.set(false);
        this.toastService.success('Eredmények közzétéve.');
        this.load();
      },
      error: (err) => {
        this.publishing.set(false);
        this.toastService.danger(extractErrorMessage(err, 'A közzététel nem sikerült.'));
      },
    });
  }
}
