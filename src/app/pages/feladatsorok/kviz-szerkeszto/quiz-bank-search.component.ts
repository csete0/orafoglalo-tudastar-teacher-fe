import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { QuizBankQuestionDto, QuizDifficulty, QuizTopicOptionDto } from '../../../models/teacher-quiz.model';
import { QuizBankStore } from '../../../services/teacher-quiz/quiz-bank.store';
import { TeacherQuizStore } from '../../../services/teacher-quiz/teacher-quiz.store';
import { IconComponent } from '../../../shared/icon/icon.component';
import { ToastService } from '../../../shared/toast/toast.service';
import { difficultyLabel, DIFFICULTY_OPTIONS, typeLabel } from './quiz-labels';

/** „Meglévő kérdés hozzáadása a bankból”: keresés a közös, jóváhagyott kérdésbankban. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quiz-bank-search',
  standalone: true,
  host: { class: 'block' },
  imports: [ReactiveFormsModule, IconComponent],
  template: `
    <div class="border-t border-border-default pt-4 mt-4">
      <button type="button" (click)="toggleBankSearch()"
              class="w-full flex items-center justify-between text-left cursor-pointer"
              [attr.aria-expanded]="bankSearchExpanded()">
        <h3 class="font-semibold">Meglévő kérdés hozzáadása a bankból</h3>
        <app-icon name="chevron-down" class="w-4 h-4 block shrink-0 transition-transform"
                  [class.rotate-180]="bankSearchExpanded()" />
      </button>

      @if (bankSearchExpanded()) {
        <p class="text-sm text-text-muted mt-2">
          A közös, jóváhagyott kérdésbankból választott kérdés MÁSOLATA kerül a kvízedbe -
          a bank-eredeti utólagos módosítása nem hat vissza rá.
        </p>

        <form [formGroup]="bankSearchForm" (ngSubmit)="searchBank()" class="space-y-3 mt-3">
          <input formControlName="search" type="text" placeholder="Keresés a kérdés szövegében" class="input" />

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="text-sm text-text-muted">Témakör</span>
              <select formControlName="topicId" class="input mt-1">
                <option [ngValue]="null">Mind</option>
                @for (topic of topics(); track topic.id) {
                  <option [ngValue]="topic.id">{{ topic.name }}</option>
                }
              </select>
            </label>

            <label class="block">
              <span class="text-sm text-text-muted">Nehézség</span>
              <select formControlName="difficulty" class="input mt-1">
                <option [ngValue]="null">Mind</option>
                @for (level of difficulties; track level.value) {
                  <option [ngValue]="level.value">{{ level.label }}</option>
                }
              </select>
            </label>
          </div>

          <button type="submit" class="btn btn-ghost" [disabled]="bank.searching()">
            {{ bank.searching() ? 'Keresés…' : 'Keresés' }}
          </button>
        </form>

        @if (bank.error(); as error) {
          <p class="text-sm text-danger mt-2">{{ error }}</p>
        }

        <ul class="space-y-2 mt-3">
          @for (bq of bank.results(); track bq.id) {
            <li class="border border-border-default rounded p-3 flex items-start gap-2">
              <span class="min-w-0 flex-1">
                <span class="block font-semibold">{{ bq.questionText }}</span>
                <span class="text-xs text-text-muted">
                  {{ typeLabel(bq.questionType) }} · {{ bq.topicName }} · {{ difficultyLabel(bq.difficulty) }}
                </span>
                <span class="block text-xs text-text-muted mt-1">
                  Helyes: {{ bq.correctAnswers.join(', ') }}
                </span>
              </span>
              <button type="button" class="btn btn-ghost shrink-0" [disabled]="store.loading()"
                      (click)="addExisting(bq)">
                Hozzáadás a kvízhez
              </button>
            </li>
          } @empty {
            @if (bankSearched() && !bank.searching()) {
              <li class="text-sm text-text-muted">Nincs találat — próbálj más keresőszót/szűrőt.</li>
            }
          }
        </ul>
      }
    </div>
  `,
})
export class QuizBankSearchComponent {
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  protected readonly store = inject(TeacherQuizStore);
  protected readonly bank = inject(QuizBankStore);

  readonly quizId = input.required<number>();
  readonly topics = input.required<QuizTopicOptionDto[]>();

  protected readonly difficulties = DIFFICULTY_OPTIONS;
  protected readonly typeLabel = typeLabel;
  protected readonly difficultyLabel = difficultyLabel;

  // UI-UX: alapból összecsukva, ugyanazzal az indoklással, mint a kérdés-kártyáknál
  // (UI-UX-T8): nem minden szerkesztésnél kell.
  readonly bankSearchExpanded = signal(false);
  readonly bankSearched = signal(false);
  readonly bankSearchForm = this.fb.nonNullable.group({
    search: [''],
    topicId: this.fb.control<number | null>(null),
    difficulty: this.fb.control<QuizDifficulty | null>(null),
  });

  toggleBankSearch(): void {
    this.bankSearchExpanded.update((v) => !v);
  }

  searchBank(): void {
    const raw = this.bankSearchForm.getRawValue();
    this.bankSearched.set(true);
    this.bank.search(raw.search.trim() || null, raw.topicId, raw.difficulty, this.store.scope());
  }

  addExisting(bankQuestion: QuizBankQuestionDto): void {
    this.store.addExistingQuestion(
      this.quizId(),
      bankQuestion.id,
      () => this.toastService.success('Kérdés hozzáadva a kvízhez.'),
    );
  }
}
