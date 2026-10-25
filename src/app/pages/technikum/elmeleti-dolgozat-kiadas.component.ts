import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TeacherQuizAssignmentDto, TheoryTestOptionDto } from '../../models/teacher-quiz.model';
import { TeacherQuizTestService } from '../../services/teacher-quiz/teacher-quiz-test.service';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { TestWindowErrorsComponent, testWindowValidator } from '../../shared/test-window/test-window';
import { ToastService } from '../../shared/toast/toast.service';

/**
 * Technikumi elméleti teszt kiadása dolgozatként (a csoport „Technikum” fülén): a szakmai (KKK) próbateszt, az ágazati alapvizsga
 * vagy egy témakör. A kérdéssort a szerver egyszer húzza a kiadáshoz - minden diák ugyanazt kapja -, és kvíz-dolgozatként megy ki
 * (időablak, időkorlát, egy kitöltés, közzététel a kvíz-dolgozat áttekintőjén).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-elmeleti-dolgozat-kiadas',
  imports: [ReactiveFormsModule, RouterLink, TestWindowErrorsComponent],
  host: { class: 'block' },
  template: `
    @if (options().length) {
      <form [formGroup]="form" (ngSubmit)="assign()" class="card p-4 space-y-3 max-w-2xl" data-testid="theory-test-form">
        <p class="text-sm text-text-muted">
          A diákok a Dolgozataim között írják meg, időre; a kérdéssor mindenkinek ugyanaz (keverve). Az eredményt te teszed közzé.
          A diákoknak Prémium (vagy iskolai licenc) kell, mint a próbavizsgához.
        </p>
        <label class="block">
          <span class="text-sm text-text-muted">Teszt</span>
          <select formControlName="option" class="input mt-1" (change)="applyDefaultMinutes()" data-testid="theory-test-option">
            @for (o of options(); track $index) {
              <option [value]="$index">{{ o.name }} ({{ o.questionCount }} kérdés)</option>
            }
          </select>
        </label>
        <div class="grid gap-3 sm:grid-cols-3">
          <label class="block">
            <span class="text-sm text-text-muted">Időkorlát (perc)</span>
            <input formControlName="timeLimitMinutes" type="number" min="5" max="240" class="input mt-1" />
          </label>
          <label class="block">
            <span class="text-sm text-text-muted">Megírható ettől</span>
            <input formControlName="opensAt" type="datetime-local" class="input mt-1" data-testid="theory-test-opens" />
          </label>
          <label class="block">
            <span class="text-sm text-text-muted">Megírható eddig</span>
            <input formControlName="dueAt" type="datetime-local" class="input mt-1" data-testid="theory-test-due" />
          </label>
        </div>
        <app-test-window-errors [errors]="form.errors" />
        <div class="flex items-center gap-3 flex-wrap">
          <button type="submit" class="btn btn-primary" [disabled]="form.invalid || saving()" data-testid="theory-test-submit">
            {{ saving() ? 'Kiadás…' : 'Kiadás dolgozatként' }}
          </button>
          @if (created(); as c) {
            <a class="text-primary font-semibold" [routerLink]="['/dolgozatok', 'kviz', c.id]" data-testid="theory-test-created">Áttekintés</a>
          }
        </div>
      </form>
    } @else if (error(); as err) {
      <p class="text-sm text-text-muted">{{ err }}</p>
    }
  `,
})
export class ElmeletiDolgozatKiadasComponent implements OnInit {
  private readonly api = inject(TeacherQuizTestService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly groupId = input.required<number>();
  readonly options = signal<TheoryTestOptionDto[]>([]);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly created = signal<TeacherQuizAssignmentDto | null>(null);

  readonly form = this.fb.nonNullable.group(
    { option: [0], timeLimitMinutes: [30], opensAt: [''], dueAt: [''] },
    { validators: testWindowValidator() },
  );

  ngOnInit(): void {
    this.api.getTheoryTestOptions().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (options) => {
        this.options.set(options);
        this.applyDefaultMinutes();
      },
      error: (err) => this.error.set(extractErrorMessage(err, 'Az elméleti tesztek nem érhetők el.')),
    });
  }

  /** Teszt-váltáskor az időkorlát a teszt alapideje (szakmai 45, alapvizsga 30, témakör 15 perc). */
  applyDefaultMinutes(): void {
    const option = this.options()[Number(this.form.controls.option.value)];
    if (option) this.form.controls.timeLimitMinutes.setValue(option.defaultMinutes);
  }

  assign(): void {
    const option = this.options()[Number(this.form.controls.option.value)];
    if (!option || this.form.invalid || this.saving()) return;
    const raw = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .createTheoryTest({
        groupId: this.groupId(),
        kind: option.kind,
        topicKey: option.topicKey,
        opensAt: new Date(raw.opensAt).toISOString(),
        dueAt: new Date(raw.dueAt).toISOString(),
        timeLimitMinutes: Number(raw.timeLimitMinutes),
      })
      .subscribe({
        next: (dto) => {
          this.saving.set(false);
          this.created.set(dto);
          this.toast.success('Elméleti dolgozat kiadva - a csoport Kiadások fülén is látszik.');
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.danger(extractErrorMessage(err, 'A kiadás nem sikerült.'));
        },
      });
  }
}
