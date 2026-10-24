import { ChangeDetectionStrategy, Component, inject, input, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { QuizExamLevel, QuizFeedbackMode, TeacherQuizDetailDto } from '../../../models/teacher-quiz.model';
import { TeacherQuizStore } from '../../../services/teacher-quiz/teacher-quiz.store';
import { ToastService } from '../../../shared/toast/toast.service';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { FEEDBACK_MODE_OPTIONS } from './quiz-labels';

/** A kvíz-szerkesztő „Beállítások” szekciója. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quiz-settings',
  standalone: true,
  host: { class: 'block' },
  imports: [ReactiveFormsModule],
  template: `
    <h2 class="font-bold mb-3">Beállítások</h2>
    <form [formGroup]="settingsForm" (ngSubmit)="saveSettings()" class="space-y-3">
      <input formControlName="title" placeholder="Cím" maxlength="200" class="input" />
      <textarea formControlName="description" placeholder="Leírás" rows="2" class="input"></textarea>

      <label class="block">
        <span class="text-sm text-text-muted">Mikor lássa a diák a megoldást?</span>
        <select formControlName="feedbackMode" class="input mt-1">
          @for (mode of feedbackModes; track mode.value) {
            <option [value]="mode.value">{{ mode.label }}</option>
          }
        </select>
      </label>

      <label class="block">
        <span class="text-sm text-text-muted">Kérdésenkénti időkorlát (mp, üresen nincs korlát)</span>
        <input formControlName="secondsPerQuestion" type="number" min="1" class="input mt-1" />
      </label>

      <label class="block">
        <span class="text-sm text-text-muted">Hányszor írhatja meg (üresen korlátlan)</span>
        <input formControlName="maxAttempts" type="number" min="1" class="input mt-1" />
      </label>

      <label class="block">
        <span class="text-sm text-text-muted">Érettségi vizsgaszint</span>
        <select formControlName="examLevel" class="input mt-1">
          @for (level of examLevels; track level.value) {
            <option [ngValue]="level.value">{{ level.label }}</option>
          }
        </select>
      </label>

      <label class="flex items-center gap-2 text-sm">
        <input formControlName="shuffleQuestions" type="checkbox" />
        Kérdések keverése
      </label>

      <!-- Platform-kvíznek nincs határideje - a kapcsoló ott értelmetlen lenne. -->
      @if (!isAdmin()) {
        <label class="flex items-center gap-2 text-sm">
          <input formControlName="allowLateSubmission" type="checkbox" />
          Határidő után is beadható
        </label>
      }

      <button type="submit" class="btn btn-primary" [disabled]="settingsForm.invalid || store.loading()">
        Mentés
      </button>
    </form>
  `,
})
export class QuizSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  protected readonly store = inject(TeacherQuizStore);

  readonly quizId = input.required<number>();
  readonly quiz = input.required<TeacherQuizDetailDto>();
  readonly isAdmin = input.required<boolean>();

  protected readonly feedbackModes = FEEDBACK_MODE_OPTIONS;

  /**
   * Az emelt szint követelményei TARTALMAZZÁK a középszintűeket, ezért a `kozep` jelentése
   * "középtől felfelé kell" - nem kell külön "mindkettő" érték. A `null` = nem érettségi
   * anyag.
   */
  protected readonly examLevels: { value: QuizExamLevel; label: string }[] = [
    { value: null, label: 'Nem érettségi anyag' },
    { value: 'kozep', label: 'Középszint (emelten is kell)' },
    { value: 'emelt', label: 'Csak emelt szint' },
  ];

  readonly settingsForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, notBlankValidator(), Validators.maxLength(200)]],
    description: [''],
    feedbackMode: ['after' as QuizFeedbackMode, Validators.required],
    secondsPerQuestion: this.fb.control<number | null>(null),
    maxAttempts: this.fb.control<number | null>(null),
    shuffleQuestions: [true],
    allowLateSubmission: [true],
    examLevel: this.fb.control<QuizExamLevel>(null),
  });

  // A szekció a kvíz első megjelenésekor jön létre: az ekkor már betöltött adatokkal indul.
  // A szülő a betöltés végén (`loadDetail` callback) még egyszer hívja a `sync()`-et.
  ngOnInit(): void {
    this.sync(this.quiz());
  }

  /**
   * Az űrlap feltöltése a betöltött kvízből (a későbbi újratöltések NEM írják felül a szerkesztést).
   * A kvízt paraméterben kapja: a betöltés callbackje change detection ELŐTT fut, ekkor a
   * `quiz` input még az előző értéket tartja.
   */
  sync(quiz: TeacherQuizDetailDto): void {
    this.settingsForm.patchValue({
      title: quiz.title,
      description: quiz.description ?? '',
      feedbackMode: quiz.feedbackMode,
      secondsPerQuestion: quiz.secondsPerQuestion ?? null,
      maxAttempts: quiz.maxAttempts ?? null,
      shuffleQuestions: quiz.shuffleQuestions,
      allowLateSubmission: quiz.allowLateSubmission,
      examLevel: quiz.examLevel ?? null,
    });
  }

  saveSettings(): void {
    if (this.settingsForm.invalid || this.store.loading()) return;

    const raw = this.settingsForm.getRawValue();
    this.store.updateQuiz(
      this.quizId(),
      {
        title: raw.title,
        description: raw.description || null,
        feedbackMode: raw.feedbackMode,
        secondsPerQuestion: raw.secondsPerQuestion || null,
        maxAttempts: raw.maxAttempts || null,
        shuffleQuestions: raw.shuffleQuestions,
        allowLateSubmission: raw.allowLateSubmission,
        examLevel: raw.examLevel,
        // Konkurrencia-token a betöltött kvízből - ütközésnél a backend elutasít.
        rowVersion: this.store.selectedDetail()?.rowVersion,
      },
      () => {
        this.settingsForm.markAsPristine();
        this.toastService.success('Beállítások mentve.');
      },
    );
  }
}
