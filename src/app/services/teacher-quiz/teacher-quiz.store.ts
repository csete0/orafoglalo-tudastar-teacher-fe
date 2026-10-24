import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { finalize, take } from 'rxjs/operators';
import { PublishResultDto } from '../../models/teacher-content.model';
import {
  AssignTeacherQuizRequest,
  CreateTeacherQuizQuestionRequest,
  CreateTeacherQuizRequest,
  GenerateTeacherQuizQuestionsRequest,
  QuizAuthoringScope,
  TeacherQuizDetailDto,
  TeacherQuizDto,
} from '../../models/teacher-quiz.model';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { DetailReloadTarget, mutateAndReload, publishAndReload } from '../detail-reload.util';
import { QuizBankStore } from './quiz-bank.store';
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
 *
 * C5: a store egy `scope`-ot is tart (`teacher` | `admin`), ami a service-ben a BE-gyökeret
 * váltja. A tanári és az admin (platform-kvíz) oldalak UGYANEZT az egy root-store-t
 * használják, ezért a scope-váltás a teljes tartalmat üríti: a tanár saját listája nem
 * villanhat fel a platform-kvízek oldalán, és fordítva (a kérdésbank-keresés találatai is,
 * amelyek a külön `QuizBankStore`-ban vannak).
 */
@Injectable({ providedIn: 'root' })
export class TeacherQuizStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(TeacherQuizService);
  private readonly bank = inject(QuizBankStore);

  private readonly _scope = signal<QuizAuthoringScope>('teacher');
  private readonly _quizzes = signal<TeacherQuizDto[]>([]);
  private readonly _selectedDetail = signal<TeacherQuizDetailDto | null>(null);
  private readonly _publishResult = signal<PublishResultDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _mineLoading = signal(false);
  private readonly _generating = signal(false);
  private readonly _error = signal<string | null>(null);

  private _detailGeneration = 0;
  private _detailQuizId: number | null = null;

  /** A mutáció+újratöltés közös folyamata (`detail-reload.util`) ezen a szeleten dolgozik. */
  private readonly detailReload: DetailReloadTarget = {
    destroyRef: this.destroyRef,
    loading: this._loading,
    error: this._error,
    publishResult: this._publishResult,
    currentId: () => this._detailQuizId,
    reload: (id, onSuccess) => this.loadDetail(id, onSuccess),
  };

  readonly scope = this._scope.asReadonly();
  readonly quizzes = this._quizzes.asReadonly();
  readonly selectedDetail = this._selectedDetail.asReadonly();
  readonly publishResult = this._publishResult.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly mineLoading = this._mineLoading.asReadonly();
  /** Az AI-generálás külön jelzőt kap: hosszabb, és saját gombot tilt le. */
  readonly generating = this._generating.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * C5: a szerkesztő-oldalak minden belépéskor beállítják, hogy tanári vagy admin
   * (platform-kvíz) nézetben járunk. Váltáskor minden betöltött tartalom kiürül, és a
   * folyamatban lévő betöltések válasza érvénytelenné válik (generáció-léptetés) - az
   * előző scope adata így sosem érkezhet meg az újba.
   */
  setScope(scope: QuizAuthoringScope): void {
    if (this._scope() === scope) return;

    this._scope.set(scope);
    this._detailGeneration++;
    this._detailQuizId = null;
    this._quizzes.set([]);
    this._selectedDetail.set(null);
    this._publishResult.set(null);
    this._error.set(null);
    this._loading.set(false);
    this._mineLoading.set(false);
    this.bank.clear();
  }

  loadMine(): void {
    this._mineLoading.set(true);
    this._error.set(null);

    this.service
      .getMine(this._scope())
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
      .getDetail(id, this._scope())
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
    this.mutate(this.service.create(request, this._scope()), (quiz) => {
      this._quizzes.update((list) => [quiz, ...list]);
      if (onSuccess) onSuccess(quiz);
    });
  }

  updateQuiz(id: number, request: CreateTeacherQuizRequest, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.update(id, request, this._scope()), id, onSuccess);
  }

  deleteQuiz(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.delete(id, this._scope()), () => {
      this._quizzes.update((list) => list.filter((q) => q.id !== id));
      this._selectedDetail.set(null);
      if (onSuccess) onSuccess();
    });
  }

  publish(id: number, onSuccess?: () => void): void {
    publishAndReload(this.detailReload, () => this.service.publish(id, this._scope()), id, onSuccess);
  }

  /**
   * C5: platform-kvíz visszavonása a diákok elől. A BE csak admin-scope-ban engedi; a
   * tanári nézet ezt nem is kínálja.
   */
  unpublish(id: number, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.unpublish(id, this._scope()), id, onSuccess);
  }

  // ── Kérdések ────────────────────────────────────────────────

  addQuestion(quizId: number, request: CreateTeacherQuizQuestionRequest, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.addQuestion(quizId, request, this._scope()), quizId, onSuccess);
  }

  updateQuestion(
    quizId: number,
    questionId: number,
    request: CreateTeacherQuizQuestionRequest,
    onSuccess?: () => void,
  ): void {
    mutateAndReload(this.detailReload, this.service.updateQuestion(questionId, request, this._scope()), quizId, onSuccess);
  }

  deleteQuestion(quizId: number, questionId: number, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.deleteQuestion(questionId, this._scope()), quizId, onSuccess);
  }

  /**
   * UI-TT-213: két szomszédos kérdés sorrend-cseréje EGYETLEN, atomi BE-hívással - a
   * korábbi mintában a komponens két külön updateQuestion()-t hívott egymás után, aminek
   * a második lépése hálózati/átmeneti hibával duplikált DisplayOrder-t hagyhatott hátra.
   */
  reorderQuestion(quizId: number, questionId: number, neighbourQuestionId: number, onSuccess?: () => void): void {
    mutateAndReload(
      this.detailReload, this.service.reorderQuestion(questionId, neighbourQuestionId, this._scope()), quizId, onSuccess);
  }

  approveQuestion(quizId: number, questionId: number, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.approveQuestion(questionId, this._scope()), quizId, onSuccess);
  }

  duplicateQuestion(quizId: number, questionId: number, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.duplicateQuestion(questionId), quizId, onSuccess);
  }

  cloneQuiz(quizId: number, onSuccess?: (newQuizId: number) => void): void {
    this._loading.set(true);
    this._error.set(null);

    this.service.cloneQuiz(quizId).pipe(take(1), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (newQuiz) => {
        this._loading.set(false);
        onSuccess?.(newQuiz.id);
      },
      error: (err) => {
        this._error.set(extractErrorMessage(err, 'A klónozás sikertelen.'));
        this._loading.set(false);
      },
    });
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
      .generateQuestions(quizId, request, this._scope())
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

  /** A kiválasztott bank-kérdés MÁSOLATÁNAK felvétele a kvízbe. */
  addExistingQuestion(quizId: number, bankQuestionId: number, onSuccess?: () => void): void {
    mutateAndReload(
      this.detailReload, this.service.addExistingQuestion(quizId, bankQuestionId, this._scope()), quizId, onSuccess);
  }

  // ── Kiadás ──────────────────────────────────────────────────

  assignToGroup(quizId: number, request: AssignTeacherQuizRequest, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.assignToGroup(quizId, request), quizId, onSuccess);
  }

  revokeAssignment(quizId: number, assignmentId: number, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.revokeAssignment(assignmentId), quizId, onSuccess);
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
}
