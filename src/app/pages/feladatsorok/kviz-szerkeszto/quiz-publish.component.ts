import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TeacherQuizDetailDto } from '../../../models/teacher-quiz.model';
import { TeacherQuizStore } from '../../../services/teacher-quiz/teacher-quiz.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';

/** Publikálás (és platform-kvíznél a visszavonás a diákok elől). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quiz-publish',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="flex items-center gap-3">
      <div class="flex-1">
        <h2 class="font-bold">{{ isAdmin() ? 'Mehet a diákoknak?' : 'Kiadásra kész?' }}</h2>
        <p class="text-sm text-text-muted">
          {{ quiz().questionCount }} kérdés
          @if (quiz().pendingQuestionCount > 0) {
            <span class="text-danger">, ebből {{ quiz().pendingQuestionCount }} jóváhagyásra vár</span>
          }
        </p>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        [disabled]="store.loading() || !!quiz().takedownAt"
        (click)="publish()"
        data-testid="publish-btn"
      >
        {{ quiz().isPublished ? 'Újrapublikálás' : 'Publikálás' }}
      </button>
      @if (isAdmin() && quiz().isPublished) {
        <button type="button" class="btn btn-ghost text-danger" [disabled]="store.loading()"
                (click)="unpublish()" data-testid="unpublish-btn">
          Visszavonás
        </button>
      }
    </div>
    @if (isAdmin()) {
      <p class="text-sm text-text-muted mt-2">
        A publikált platform-kvízt minden előfizető diák látja a „Hivatalos kvízek” között -
        a vizsgaszint dönti el, kinek: a középszintű mindenkinek, a csak emelt szintű csak az
        emelt szintre készülőknek.
      </p>
    }

    @if (store.publishResult(); as result) {
      @if (!result.success) {
        <ul class="mt-3 space-y-1">
          @for (error of result.errors; track error) {
            <li class="text-sm text-danger">{{ error }}</li>
          }
        </ul>
      }
    }
  `,
})
export class QuizPublishComponent {
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  protected readonly store = inject(TeacherQuizStore);

  readonly quizId = input.required<number>();
  readonly quiz = input.required<TeacherQuizDetailDto>();
  readonly isAdmin = input.required<boolean>();

  publish(): void {
    this.store.clearPublishResult();
    this.store.publish(this.quizId(), () => this.toastService.success('Kvíz publikálva.'));
  }

  /** C5: platform-kvíz visszavonása a diákok elől - a már megírt eredmények megmaradnak. */
  async unpublish(): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Kvíz visszavonása',
      message: 'A diákok nem látják és nem indíthatják többé. A már megírt eredmények megmaradnak, és a kvíz bármikor újra publikálható.',
      confirmLabel: 'Visszavonás',
      cancelLabel: 'Mégsem',
      danger: true,
    });
    if (!confirmed) return;

    this.store.clearPublishResult();
    this.store.unpublish(this.quizId(), () => this.toastService.success('Kvíz visszavonva.'));
  }
}
