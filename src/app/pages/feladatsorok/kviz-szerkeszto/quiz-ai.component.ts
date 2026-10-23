import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { QuizTopicOptionDto, TeacherQuizDetailDto } from '../../../models/teacher-quiz.model';
import { TeacherQuizStore } from '../../../services/teacher-quiz/teacher-quiz.store';
import { ToastService } from '../../../shared/toast/toast.service';
import { KvizSzovegbolComponent } from '../kviz-szovegbol.component';

/** „Kérdések generálása AI-jal” szekció, tanári kvíznél a „Kérdések szövegből” ablakkal. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quiz-ai',
  standalone: true,
  host: { class: 'block' },
  imports: [ReactiveFormsModule, KvizSzovegbolComponent],
  template: `
    <h2 class="font-bold mb-1">Kérdések generálása AI-jal</h2>
    <p class="text-sm text-text-muted mb-3">
      A generált kérdések piszkozatként kerülnek be — átnézés és jóváhagyás után válnak
      a kvíz részévé. A kvíz addig nem publikálható, amíg van jóváhagyatlan kérdés.
    </p>

    <form [formGroup]="generateForm" (ngSubmit)="generate()" class="space-y-3">
      <label class="block">
        <span class="text-sm text-text-muted">Témakör</span>
        <select formControlName="topicId" class="input mt-1">
          @for (topic of topics(); track topic.id) {
            <option [value]="topic.id">{{ topic.name }}</option>
          }
        </select>
      </label>

      <label class="block">
        <span class="text-sm text-text-muted">Darabszám</span>
        <input formControlName="count" type="number" min="1" max="20" class="input mt-1" />
      </label>

      <button
        type="submit"
        class="btn btn-primary"
        [disabled]="generateForm.invalid || store.generating() || topics().length === 0 || !!quiz().takedownAt"
      >
        {{ store.generating() ? 'Generálás folyamatban…' : 'Generálás' }}
      </button>
    </form>

    <!-- Kérdések a tanár saját tananyagából (beillesztett szöveg vagy fájl) - csak tanári kvíznél. -->
    @if (!isAdmin()) {
      <div class="border-t border-border-default mt-4 pt-4" data-testid="quiz-source-section">
        <h3 class="font-semibold text-sm mb-1">Kérdések szövegből</h3>
        <p class="text-sm text-text-muted mb-3">
          Saját tananyagból (beillesztett szöveg vagy .txt, .docx, .pdf fájl): minden kérdés szó szerinti idézettel
          ellenőrizve, jóváhagyásra várva kerül a kvízbe. Prémium tanároknak, havi kerettel (a napi MI-keretet nem érinti).
        </p>
        <button type="button" class="btn btn-ghost" (click)="sourceOpen.set(true)"
          [disabled]="topics().length === 0 || !!quiz().takedownAt" data-testid="quiz-source-open">
          Kérdések szövegből…
        </button>
      </div>
      @if (sourceOpen()) {
        <app-kviz-szovegbol [quizId]="quizId()" [topics]="topics()" [initialTopicId]="generateTopicId()"
          (closed)="sourceOpen.set(false)" (changed)="onSourceChanged()" />
      }
    }
  `,
})
export class QuizAiComponent {
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  protected readonly store = inject(TeacherQuizStore);

  readonly quizId = input.required<number>();
  readonly quiz = input.required<TeacherQuizDetailDto>();
  readonly topics = input.required<QuizTopicOptionDto[]>();
  readonly isAdmin = input.required<boolean>();

  readonly generateForm = this.fb.nonNullable.group({
    topicId: this.fb.control<number | null>(null, Validators.required),
    count: [5, [Validators.required, Validators.min(1), Validators.max(20)]],
  });

  // ── Kérdések szövegből ──
  readonly sourceOpen = signal(false);

  generate(): void {
    if (this.generateForm.invalid || this.store.generating()) return;

    const raw = this.generateForm.getRawValue();
    this.store.generateQuestions(
      this.quizId(),
      { topicId: Number(raw.topicId), count: Number(raw.count), difficulty: 'Medium' },
      (count) => this.toastService.success(`${count} kérdés generálva — nézd át és hagyd jóvá őket.`),
    );
  }

  /** Az AI-szekcióban kiválasztott témakör a „Kérdések szövegből” kezdőértékének. */
  generateTopicId(): number | null {
    const id = this.generateForm.controls.topicId.value;
    return id == null ? null : Number(id);
  }

  /** A szövegből készült piszkozatok a meglévő jóváhagyási úton jelennek meg - a kérdéslista újratöltése (az eredményt az ablak mutatja). */
  onSourceChanged(): void {
    this.store.loadDetail(this.quizId());
  }
}
