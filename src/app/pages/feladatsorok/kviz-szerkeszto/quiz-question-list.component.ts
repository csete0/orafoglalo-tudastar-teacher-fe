import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { TeacherQuizQuestionDto } from '../../../models/teacher-quiz.model';
import { TeacherQuizService } from '../../../services/teacher-quiz/teacher-quiz.service';
import { TeacherQuizStore } from '../../../services/teacher-quiz/teacher-quiz.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { ToastService } from '../../../shared/toast/toast.service';
import { difficultyLabel, typeLabel } from './quiz-labels';

/** A kvíz kérdéslistája: összecsukható kártyák sorrend-, jóváhagyás-, másolás- és törlés-gombokkal. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quiz-question-list',
  standalone: true,
  host: { class: 'block' },
  imports: [IconComponent],
  template: `
    <ul class="space-y-3 mb-5">
      @for (question of questions(); track question.id) {
        <li class="border border-border-default rounded p-3">
          <!-- UI-UX-T8: alapból összecsukva - 10+ kérdésnél a részletek
               (megoldás, gombsor) csak kibontásra látszanak. -->
          <button type="button" (click)="toggleQuestion(question.id)"
                  class="w-full flex items-start gap-2 text-left cursor-pointer"
                  [attr.aria-expanded]="isQuestionExpanded(question.id)">
            <span class="min-w-0 flex-1">
              <span class="block font-semibold"
                    [class.truncate]="!isQuestionExpanded(question.id)">{{ question.questionText }}</span>
              <span class="text-xs text-text-muted">
                {{ typeLabel(question.questionType) }} · {{ question.topicName }} ·
                {{ difficultyLabel(question.difficulty) }}
              </span>
            </span>
            @if (!question.isApproved) {
              <span class="badge badge-warning shrink-0">Jóváhagyásra vár</span>
            }
            @if (question.reportCount > 0) {
              <span class="badge badge-danger shrink-0">⚠ {{ question.reportCount }} jelentés</span>
            }
            <app-icon name="chevron-down" class="w-4 h-4 block shrink-0 transition-transform"
                      [class.rotate-180]="isQuestionExpanded(question.id)" />
          </button>

          @if (isQuestionExpanded(question.id)) {
            <span class="block text-xs text-text-muted mt-2">
              Helyes: {{ question.correctAnswers.join(', ') }}
            </span>

          <div class="flex gap-2 mt-2">
            <button
              type="button"
              class="btn btn-ghost"
              [disabled]="$first || store.loading()"
              (click)="moveQuestion(question, -1)"
              aria-label="Feljebb"
            >↑</button>
            <button
              type="button"
              class="btn btn-ghost"
              [disabled]="$last || store.loading()"
              (click)="moveQuestion(question, 1)"
              aria-label="Lejjebb"
            >↓</button>
            @if (!question.isApproved) {
              <button type="button" class="btn btn-ghost" (click)="approve(question)">Jóváhagyom</button>
            }
            <button type="button" class="btn btn-ghost" (click)="edit.emit(question)">Szerkesztés</button>
            <button type="button" class="btn btn-ghost" (click)="duplicateQuestion(question)"
                    title="Kérdés másolása a kvíz végére">⊕ Másolás</button>
            <button type="button" class="btn btn-ghost text-danger" (click)="deleteQuestion(question)">
              Törlés
            </button>
          </div>
          @if (question.reportCount > 0) {
            <div class="mt-3 p-2 rounded bg-danger/10 border border-danger/30 text-xs text-danger flex items-center gap-2">
              <span class="flex-1">⚠ {{ question.reportCount }} diák jelentette ezt a kérdést.</span>
              <button type="button" class="btn btn-ghost !text-xs !py-1 !px-2"
                (click)="resolveReports(question)">Elintézve</button>
            </div>
          }
          }
        </li>
      } @empty {
        <li class="text-sm text-text-muted">Még nincs kérdés. Vegyél fel egyet, vagy generáltass AI-jal.</li>
      }
    </ul>
  `,
})
export class QuizQuestionListComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly quizService = inject(TeacherQuizService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  protected readonly store = inject(TeacherQuizStore);

  readonly quizId = input.required<number>();
  readonly questions = input.required<TeacherQuizQuestionDto[]>();
  /** „Szerkesztés”: a kérdés-űrlap tölti be (a kártya ekkor már ki van nyitva). */
  readonly edit = output<TeacherQuizQuestionDto>();

  protected readonly typeLabel = typeLabel;
  protected readonly difficultyLabel = difficultyLabel;

  private readonly expandedQuestionIds = signal<Set<number>>(new Set());

  isQuestionExpanded(questionId: number): boolean {
    return this.expandedQuestionIds().has(questionId);
  }

  toggleQuestion(questionId: number): void {
    this.expandedQuestionIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  /**
   * Kérdés mozgatása a sorrendben. A két érintett kérdés DisplayOrder-jét CSERÉLJÜK,
   * nem "beszúrunk" - így nem kell az egész listát újraszámozni, és két gyors kattintás
   * sem tud lyukat hagyni a sorszámozásban.
   *
   * UI-TT-213: korábban két külön updateQuestion()-hívással történt (a második csak az
   * első sikere UTÁN indult) - ha a MÁSODIK hívás hálózati/átmeneti hibával elbukott, a
   * szerveren két kérdés maradt UGYANAZZAL a DisplayOrder-rel, a hibaüzenet pedig nem
   * jelezte, hogy az állapot félig módosult. A dedikált reorderQuestion() végpont mindkét
   * kérdés DisplayOrder-jét EGYETLEN, atomi BE-hívással cseréli.
   */
  moveQuestion(question: TeacherQuizQuestionDto, direction: -1 | 1): void {
    const questions = this.questions();
    const index = questions.findIndex((q) => q.id === question.id);
    const neighbour = questions[index + direction];
    if (!neighbour || this.store.loading()) return;

    this.store.reorderQuestion(this.quizId(), question.id, neighbour.id);
  }

  approve(question: TeacherQuizQuestionDto): void {
    this.store.approveQuestion(this.quizId(), question.id, () => this.toastService.success('Kérdés jóváhagyva.'));
  }

  resolveReports(question: TeacherQuizQuestionDto): void {
    const quizId = this.quizId();
    // A lekérdezés (olvasás) a komponenssel bontódik; az elintézés (írás) nem.
    this.quizService.getQuestionReports(quizId, true).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => {
        const openReports = data.items.filter((r) => r.questionId === question.id && !r.isReviewed);
        if (openReports.length === 0) {
          this.toastService.success('Nincs elintézetlen jelentés ennél a kérdésnél.');
          return;
        }
        forkJoin(openReports.map((r) => this.quizService.resolveQuestionReport(r.id))).subscribe({
          next: () => {
            this.toastService.success('Jelentések elintézve.');
            this.store.loadDetail(quizId);
          },
          error: () => this.toastService.danger('Hiba a jelentések elintézésekor.'),
        });
      },
      error: () => this.toastService.danger('Hiba a jelentések lekérésekor.'),
    });
  }

  async deleteQuestion(question: TeacherQuizQuestionDto): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Kérdés törlése',
      message: `Biztosan törlöd? „${question.questionText}"`,
      confirmLabel: 'Törlés',
      cancelLabel: 'Mégsem',
      danger: true,
    });
    if (!confirmed) return;

    this.store.deleteQuestion(this.quizId(), question.id, () => this.toastService.success('Kérdés törölve.'));
  }

  duplicateQuestion(question: TeacherQuizQuestionDto): void {
    this.store.duplicateQuestion(this.quizId(), question.id, () =>
      this.toastService.success('Kérdés másolva.'),
    );
  }
}
