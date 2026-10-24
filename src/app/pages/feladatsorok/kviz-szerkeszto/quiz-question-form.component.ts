import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { take } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  CreateTeacherQuizQuestionRequest,
  QuizDifficulty,
  QuizQuestionType,
  QuizTopicOptionDto,
  TeacherQuizQuestionDto,
} from '../../../models/teacher-quiz.model';
import { AuthorizedFileService } from '../../../services/file/authorized-file.service';
import { TeacherQuizService } from '../../../services/teacher-quiz/teacher-quiz.service';
import { TeacherQuizStore } from '../../../services/teacher-quiz/teacher-quiz.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { extractErrorMessage } from '../../../shared/http-error/extract-error-message.util';
import { ToastService } from '../../../shared/toast/toast.service';
import { notBlankValidator } from '../../../shared/validators/not-blank.validator';
import { DIFFICULTY_OPTIONS, QUESTION_TYPE_OPTIONS } from './quiz-labels';

/** Soronként megadott szöveg - üres sorok nélkül, trimmelve. */
function lines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Új kérdés / kérdés szerkesztése (képfeltöltéssel).
 *
 * A helyes válaszokat SZÁNDÉKOSAN nem szabad szövegként gépelteti be a tanárral: a
 * lehetőségeket soronként adja meg, és azok közül JELÖLI ki a helyeset. Egy elgépelt
 * "helyes válasz" különben olyan kérdést hozna létre, amit a diák sosem tudna eltalálni
 * (a kiértékelés szöveg-egyezésen alapul) - a backend ezt vissza is utasítja, de jobb, ha
 * a felület eleve nem engedi.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quiz-question-form',
  standalone: true,
  host: { class: 'block' },
  imports: [ReactiveFormsModule],
  templateUrl: './quiz-question-form.component.html',
})
export class QuizQuestionFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly quizService = inject(TeacherQuizService);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly authorizedFileService = inject(AuthorizedFileService);
  protected readonly store = inject(TeacherQuizStore);
  private readonly apiOrigin = new URL(environment.apiUrl).origin;

  readonly quizId = input.required<number>();
  readonly topics = input.required<QuizTopicOptionDto[]>();

  protected readonly questionTypes = QUESTION_TYPE_OPTIONS;
  protected readonly difficulties = DIFFICULTY_OPTIONS;

  readonly editingId = signal<number | null>(null);
  private readonly selectedCorrect = signal<string[]>([]);

  // ── C6: kvízkép-állapot ──────────────────────────────────────
  readonly questionImagePreview = signal<string | null>(null);
  readonly imageUploadError = signal<string | null>(null);
  private readonly pendingImageFileId = signal<string | null>(null);
  private resolvedImageBlobUrl: string | null = null;

  // UI-TT-209: a gombok `[disabled]`-je korábban NEM nézte a form `invalid` állapotát,
  // csak a store-t és a saját figyelmeztetéseket. A `topicId` legördülő kezdőértéke
  // `null` és `Validators.required` - ha a tanár nem nyúlt hozzá explicit, a form
  // érvénytelen maradt, a gomb viszont AKTÍVNAK látszott, és a metódus első sora
  // (`if (form.invalid) return;`) némán, hálózati forgalom nélkül visszatért.
  readonly questionForm = this.fb.nonNullable.group({
    questionType: ['single' as QuizQuestionType, Validators.required],
    questionText: ['', [Validators.required, notBlankValidator()]],
    topicId: this.fb.control<number | null>(null, Validators.required),
    optionsText: [''],
    acceptedText: [''],
    explanation: [''],
    difficulty: ['Medium' as QuizDifficulty, Validators.required],
    secondsLimit: this.fb.control<number | null>(null),
  });

  // A formWarning() `computed`, ezért MINDEN általa olvasott form-értéknek signalnak kell
  // lennie. Egy sima `control.value` olvasás nem váltana újraszámolást: a figyelmeztetés
  // bent ragadna azután is, hogy a tanár kijavította a hibát (pl. beírta a ___ jelölést).
  private readonly controls = this.questionForm.controls;
  readonly questionType = toSignal(this.controls.questionType.valueChanges, {
    initialValue: this.controls.questionType.value,
  });
  private readonly optionsText = toSignal(this.controls.optionsText.valueChanges, {
    initialValue: this.controls.optionsText.value,
  });
  private readonly questionText = toSignal(this.controls.questionText.valueChanges, {
    initialValue: this.controls.questionText.value,
  });
  private readonly acceptedText = toSignal(this.controls.acceptedText.valueChanges, {
    initialValue: this.controls.acceptedText.value,
  });

  /** A soronként megadott lehetőségek — üres sorok nélkül, trimmelve. */
  readonly parsedOptions = computed(() => lines(this.optionsText()));
  private readonly acceptedAnswers = computed(() => lines(this.acceptedText()));

  /**
   * Beküldés előtti, felhasználóbarát ellenőrzés. A backend ugyanezeket kikényszeríti —
   * ez csak azért van itt, hogy a tanár ne egy hibaüzenetből tudja meg.
   */
  readonly formWarning = computed(() => {
    const type = this.questionType();
    const correct = this.selectedCorrect();

    if (type === 'cloze') {
      if (this.acceptedAnswers().length === 0) return 'Adj meg legalább egy elfogadott választ.';
      if (!(this.questionText() ?? '').includes('___')) {
        return 'Jelöld a kihagyást három aláhúzással (___) a kérdés szövegében.';
      }
      return null;
    }

    const options = this.parsedOptions();
    if (options.length < 2) return 'Adj meg legalább két válaszlehetőséget.';
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      return 'A válaszlehetőségek nem ismétlődhetnek.';
    }
    if (correct.length === 0) return 'Jelöld ki a helyes választ.';
    if (type === 'single' && correct.length !== 1) return 'Egyválasztósnál pontosan egy helyes válasz lehet.';
    return null;
  });

  isSelected(option: string): boolean {
    return this.selectedCorrect().includes(option);
  }

  toggleCorrect(option: string): void {
    if (this.questionType() === 'multi') {
      this.selectedCorrect.update((list) =>
        list.includes(option) ? list.filter((o) => o !== option) : [...list, option],
      );
    } else {
      this.selectedCorrect.set([option]);
    }
  }

  /**
   * UI-TT-218: minden kérdés UGYANAZT a questionForm-ot/editingId signalt osztja - ha a
   * tanár egy másik kérdést épp szerkeszt és MÓDOSÍTOTT (de még nem mentett), egy másik
   * kérdés "Szerkesztés" gombjára kattintva a patchValue korábban figyelmeztetés nélkül,
   * nyomtalanul eldobta az el nem mentett szöveget.
   */
  async startEdit(question: TeacherQuizQuestionDto): Promise<void> {
    if (this.editingId() !== null && this.questionForm.dirty) {
      const confirmed = await this.confirmService.ask({
        title: 'Nem mentett módosítás',
        message: 'A jelenleg szerkesztett kérdésen el nem mentett módosításaid vannak - másik kérdésre váltva ezek elvesznek.',
        confirmLabel: 'Váltás mentés nélkül',
        cancelLabel: 'Mégsem',
        danger: true,
      });
      if (!confirmed) return;
    }

    this.editingId.set(question.id);
    this.questionForm.patchValue({
      questionType: question.questionType,
      questionText: question.questionText,
      topicId: question.topicId,
      optionsText: question.options.join('\n'),
      acceptedText: question.questionType === 'cloze' ? question.correctAnswers.join('\n') : '',
      explanation: question.explanation ?? '',
      difficulty: question.difficulty,
      secondsLimit: question.secondsLimit ?? null,
    });
    this.selectedCorrect.set(question.questionType === 'cloze' ? [] : [...question.correctAnswers]);
    this.authorizedFileService.revoke(this.resolvedImageBlobUrl);
    this.resolvedImageBlobUrl = null;
    this.questionImagePreview.set(null);
    if (question.imageUrl) {
      this.authorizedFileService.resolveUrl(this.apiOrigin + question.imageUrl)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe(url => {
          this.resolvedImageBlobUrl = url;
          this.questionImagePreview.set(url);
        });
    }
    this.pendingImageFileId.set(question.imageFileId ?? null);
    this.imageUploadError.set(null);
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.questionForm.reset({ questionType: 'single', difficulty: 'Medium' });
    this.selectedCorrect.set([]);
    this.removeQuestionImage();
  }

  saveQuestion(): void {
    if (this.questionForm.invalid || this.formWarning() || this.store.loading()) return;

    const raw = this.questionForm.getRawValue();
    const type = raw.questionType;

    const request: CreateTeacherQuizQuestionRequest = {
      topicId: Number(raw.topicId),
      questionType: type,
      questionText: raw.questionText,
      options: type === 'cloze' ? [] : this.parsedOptions(),
      correctAnswers: type === 'cloze' ? this.acceptedAnswers() : this.selectedCorrect(),
      explanation: raw.explanation || null,
      difficulty: raw.difficulty,
      secondsLimit: raw.secondsLimit || null,
      imageFileId: this.pendingImageFileId(),
    };

    const editingId = this.editingId();
    const done = () => {
      this.toastService.success(editingId ? 'Kérdés mentve.' : 'Kérdés hozzáadva.');
      this.cancelEdit();
    };

    if (editingId) {
      this.store.updateQuestion(this.quizId(), editingId, request, done);
    } else {
      this.store.addQuestion(this.quizId(), request, done);
    }
  }

  // ── C6: kvízkép-feltöltés ──

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.imageUploadError.set(null);

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.imageUploadError.set('Csak jpg, png vagy webp fájl engedélyezett.');
      input.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.imageUploadError.set('A fájl mérete nem haladhatja meg a 2 MB-ot.');
      input.value = '';
      return;
    }

    const preview = URL.createObjectURL(file);
    this.questionImagePreview.set(preview);

    // Feltöltés (írás): a komponens megszűnésekor sem szakítjuk meg.
    this.quizService.uploadQuizImage(this.quizId(), file).pipe(take(1)).subscribe({
      next: (res) => this.pendingImageFileId.set(res.id),
      error: (err) => {
        this.imageUploadError.set(extractErrorMessage(err, 'A kép feltöltése sikertelen.'));
        this.questionImagePreview.set(null);
        input.value = '';
      },
    });
  }

  removeQuestionImage(): void {
    this.authorizedFileService.revoke(this.resolvedImageBlobUrl);
    this.resolvedImageBlobUrl = null;
    this.questionImagePreview.set(null);
    this.pendingImageFileId.set(null);
    this.imageUploadError.set(null);
  }
}
