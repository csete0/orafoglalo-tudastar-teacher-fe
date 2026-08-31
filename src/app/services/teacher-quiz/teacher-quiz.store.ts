import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { finalize, take } from 'rxjs/operators';
import { PublishResultDto } from '../../models/teacher-content.model';
import {
  AssignTeacherQuizRequest,
  CreateTeacherQuizQuestionRequest,
  CreateTeacherQuizRequest,
  GenerateTeacherQuizQuestionsRequest,
  QuizBankQuestionDto,
  QuizDifficulty,
  TeacherQuizDetailDto,
  TeacherQuizDto,
} from '../../models/teacher-quiz.model';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { TeacherQuizService } from './teacher-quiz.service';

/**
 * Tanári kvíz-szerkesztés állapota.
 *
 * A `TeacherTaskSetStore` szerkezetét követi, beleértve annak két, hibákból tanult
 * védelmét is - a store `providedIn: 'root'`, tehát a navigáció NEM szakítja meg a
 * háttérben futó hívásokat:
 *
 *  - külön betöltés-jelző a LISTA és a RÉSZLET számára (UI-TT-166 mintája): egy lista-
 *    válasz különben idő előtt lezárná a szerkesztő még futó betöltését;
 *  - generáció-számláló ÉS cél-id őr (UI-TT-105/156 mintája): csak a legutóbb indított
 *    betöltés válasza érvényesül, és egy elhagyott kvíz mutációja nem tölthet újra egy
 *    MÁSIK kvíz nézetébe (különben a szerkesztő csendben másik kvíz adatát mutatná,
 *    miközben az URL az eredetit).
 */
@Injectable({ providedIn: 'root' })
export class TeacherQuizStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(TeacherQuizService);

  private readonly _quizzes = signal<TeacherQuizDto[]>([]);
  private readonly _selectedDetail = signal<TeacherQuizDetailDto | null>(null);
  private readonly _publishResult = signal<PublishResultDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _mineLoading = signal(false);
  private readonly _generating = signal(false);
  private readonly _error = signal<string | null>(null);

  // UI-UX: közös AI-bank keresés ("meglévő kérdés hozzáadása") - a fő betöltés/hiba
  // jelzőktől KÜLÖN, ugyanazzal az indoklással, mint a _generating-nél: a keresés a
  // szerkesztő-oldal más részét ne fagyassza/hibáztassa, és fordítva.
  private readonly _bankResults = signal<QuizBankQuestionDto[]>([]);
  private readonly _bankSearching = signal(false);
  private readonly _bankSearchError = signal<string | null>(null);

  private _detailGeneration = 0;
  private _detailQuizId: number | null = null;

  readonly quizzes = computed(() => this._quizzes());
  readonly selectedDetail = computed(() => this._selectedDetail());
  readonly publishResult = computed(() => this._publishResult());
  readonly loading = computed(() => this._loading());
  readonly mineLoading = computed(() => this._mineLoading());
  /** Az AI-generálás külön jelzőt kap: hosszabb, és saját gombot tilt le. */
  readonly generating = computed(() => this._generating());
  readonly error = computed(() => this._error());
  readonly bankResults = computed(() => this._bankResults());
  readonly bankSearching = computed(() => this._bankSearching());
  readonly bankSearchError = computed(() => this._bankSearchError());

  loadMine(): void {
    this._mineLoading.set(true);
    this._error.set(null);

    this.service
      .getMine()
      .pipe(
        take(1),
        finalize(() => this._mineLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (quizzes) => this._quizzes.set(quizzes),
        error: (err) => this._error.set(extractErrorMessage(err, 'A kvízek betöltése sikertelen.')),
      });
  }

  loadDetail(id: number, onSuccess?: () => void): void {
    // Másik kvízre navigálva azonnal ürítjük, hogy a válaszig ne az ELŐZŐ kvíz
    // adatlapja látszódjon az új URL alatt. Ugyanannak az id-nek az újratöltésekor
    // viszont megtartjuk - különben minden mentésnél a teljes űrlap spinnerre váltana.
    if (this._selectedDetail()?.id !== id) {
      this._selectedDetail.set(null);
    }

    const generation = ++this._detailGeneration;
    this._detailQuizId = id;
    this._loading.set(true);
    this._error.set(null);

    this.service
      .getDetail(id)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._detailGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => {
          // Egy elavult betöltés válasza sem a store-t nem frissítheti, sem az
          // onSuccess-t nem sütheti el (az toastot/navigációt válthatna ki egy már
          // túlhaladott művelet nevében).
          if (generation !== this._detailGeneration) return;
          this._selectedDetail.set(detail);
          if (onSuccess) onSuccess();
        },
        error: (err) => {
          if (generation !== this._detailGeneration) return;
          this._error.set(extractErrorMessage(err, 'A kvíz betöltése sikertelen.'));
        },
      });
  }

  create(request: CreateTeacherQuizRequest, onSuccess?: (quiz: TeacherQuizDto) => void): void {
    this.mutate(this.service.create(request), (quiz) => {
      this._quizzes.update((list) => [quiz, ...list]);
      if (onSuccess) onSuccess(quiz);
    });
  }

  updateQuiz(id: number, request: CreateTeacherQuizRequest, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.update(id, request), id, onSuccess);
  }

  deleteQuiz(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.delete(id), () => {
      this._quizzes.update((list) => list.filter((q) => q.id !== id));
      this._selectedDetail.set(null);
      if (onSuccess) onSuccess();
    });
  }

  publish(id: number, onSuccess?: () => void): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .publish(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          // Cél-ellenőrzés: egy elhagyott kvíz publikálásának KÉSVE érkező válasza nem
          // írhatja felül a közben megnyitott másik kvíz nézetét (sem a validációs
          // hibalistát, sem a sikeres ág újratöltését).
          if (this._detailQuizId !== null && this._detailQuizId !== id) return;

          this._publishResult.set(result);
          if (result.success) {
            // A loading szándékosan true marad, amíg az újratöltés be nem fejeződik -
            // különben a jelvény átmenetileg úgy mutatná, mintha nem sikerült volna.
            this.loadDetail(id, onSuccess);
          } else {
            this._loading.set(false);
          }
        },
        error: (err) => {
          if (this._detailQuizId !== null && this._detailQuizId !== id) return;

          this._error.set(extractErrorMessage(err, 'A publikálás sikertelen.'));
          this._loading.set(false);
        },
      });
  }

  // ── Kérdések ────────────────────────────────────────────────

  addQuestion(quizId: number, request: CreateTeacherQuizQuestionRequest, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.addQuestion(quizId, request), quizId, onSuccess);
  }

  updateQuestion(
    quizId: number,
    questionId: number,
    request: CreateTeacherQuizQuestionRequest,
    onSuccess?: () => void,
  ): void {
    this.mutateAndReload(this.service.updateQuestion(questionId, request), quizId, onSuccess);
  }

  deleteQuestion(quizId: number, questionId: number, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.deleteQuestion(questionId), quizId, onSuccess);
  }

  /**
   * UI-TT-213: két szomszédos kérdés sorrend-cseréje EGYETLEN, atomi BE-hívással - a
   * korábbi mintában a komponens két külön updateQuestion()-t hívott egymás után, aminek
   * a második lépése hálózati/átmeneti hibával duplikált DisplayOrder-t hagyhatott hátra.
   */
  reorderQuestion(quizId: number, questionId: number, neighbourQuestionId: number, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.reorderQuestion(questionId, neighbourQuestionId), quizId, onSuccess);
  }

  approveQuestion(quizId: number, questionId: number, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.approveQuestion(questionId), quizId, onSuccess);
  }

  generateQuestions(
    quizId: number,
    request: GenerateTeacherQuizQuestionsRequest,
    onSuccess?: (count: number) => void,
  ): void {
    if (this._generating()) return;

    this._generating.set(true);
    this._error.set(null);

    this.service
      .generateQuestions(quizId, request)
      .pipe(
        take(1),
        finalize(() => this._generating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (questions) => {
          if (this._detailQuizId !== null && this._detailQuizId !== quizId) return;
          this.loadDetail(quizId, () => onSuccess?.(questions.length));
        },
        error: (err) => {
          if (this._detailQuizId !== null && this._detailQuizId !== quizId) return;
          this._error.set(extractErrorMessage(err, 'A kérdésgenerálás sikertelen.'));
        },
      });
  }

  /** UI-UX: keresés a közös AI-kérdésbankban ("meglévő kérdés hozzáadása"). */
  searchBankQuestions(search: string | null, topicId: number | null, difficulty: QuizDifficulty | null): void {
    this._bankSearching.set(true);
    this._bankSearchError.set(null);

    this.service
      .searchBankQuestions(search, topicId, difficulty)
      .pipe(
        take(1),
        finalize(() => this._bankSearching.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => this._bankResults.set(results),
        error: (err) => this._bankSearchError.set(extractErrorMessage(err, 'A keresés sikertelen.')),
      });
  }

  clearBankResults(): void {
    this._bankResults.set([]);
    this._bankSearchError.set(null);
  }

  /** A kiválasztott bank-kérdés MÁSOLATÁNAK felvétele a kvízbe. */
  addExistingQuestion(quizId: number, bankQuestionId: number, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.addExistingQuestion(quizId, bankQuestionId), quizId, onSuccess);
  }

  // ── Kiadás ──────────────────────────────────────────────────

  assignToGroup(quizId: number, request: AssignTeacherQuizRequest, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.assignToGroup(quizId, request), quizId, onSuccess);
  }

  revokeAssignment(quizId: number, assignmentId: number, onSuccess?: () => void): void {
    this.mutateAndReload(this.service.revokeAssignment(assignmentId), quizId, onSuccess);
  }

  clearError(): void {
    this._error.set(null);
  }

  clearPublishResult(): void {
    this._publishResult.set(null);
  }

  private mutate<T>(observable: Observable<T>, onSuccess: (value: T) => void): void {
    this._loading.set(true);
    this._error.set(null);

    observable
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: onSuccess,
        error: (err) => this._error.set(extractErrorMessage(err, 'A művelet sikertelen.')),
      });
  }

  private mutateAndReload<T>(observable: Observable<T>, quizId: number, onSuccess?: () => void): void {
    this._loading.set(true);
    this._error.set(null);

    observable.pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        // Csak akkor töltünk újra, ha a mutáció célpontja MÉG MINDIG a betöltő aktuális
        // célpontja. A generáció-számláló ezt önmagában nem akadályozná meg: az elhagyott
        // kvíz újratöltése indulna utoljára, tehát ő kapná a legmagasabb generációt.
        //
        // A loading-ot itt SZÁNDÉKOSAN nem állítjuk vissza: a cél-id kizárólag a
        // loadDetail()-ben változik, ami mindig lezáródó finalize()-t kap - a loading
        // ekkor már annak a frissebb betöltésnek a tulajdona.
        if (this._detailQuizId !== null && this._detailQuizId !== quizId) return;

        this.loadDetail(quizId, onSuccess);
      },
      error: (err) => {
        if (this._detailQuizId !== null && this._detailQuizId !== quizId) return;

        this._error.set(extractErrorMessage(err, 'A művelet sikertelen.'));
        this._loading.set(false);
      },
    });
  }
}
