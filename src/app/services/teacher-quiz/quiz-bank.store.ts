import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { QuizAuthoringScope, QuizBankQuestionDto, QuizDifficulty } from '../../models/teacher-quiz.model';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { TeacherQuizService } from './teacher-quiz.service';

/**
 * UI-UX: keresés a közös, jóváhagyott kérdésbankban ("meglévő kérdés hozzáadása" a
 * kvíz-szerkesztőben). A `TeacherQuizStore` fő betöltés/hiba jelzőitől KÜLÖN, ugyanazzal az
 * indoklással, mint a generálásnál: a keresés a szerkesztő-oldal más részét ne
 * fagyassza/hibáztassa, és fordítva.
 *
 * `providedIn: 'root'`, mint a kvíz-store: a találatok a szerkesztők között megmaradnak, a
 * scope-váltás (tanári ↔ platform-kvíz) viszont a `TeacherQuizStore.setScope()`-on át üríti.
 */
@Injectable({ providedIn: 'root' })
export class QuizBankStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(TeacherQuizService);

  private readonly _results = signal<QuizBankQuestionDto[]>([]);
  private readonly _searching = signal(false);
  private readonly _error = signal<string | null>(null);

  // UI-TT-226: minden keresés saját, független subscribe()-ot indít - cél-generáció nélkül
  // egy lassabb, tág keresés KÉSVE érkező válasza csendben felülírhatná egy közben
  // indított, szűkített keresés már megjelenő, helyes találatait.
  private _requestId = 0;

  readonly results = this._results.asReadonly();
  readonly searching = this._searching.asReadonly();
  readonly error = this._error.asReadonly();

  search(
    search: string | null,
    topicId: number | null,
    difficulty: QuizDifficulty | null,
    scope: QuizAuthoringScope,
  ): void {
    this._searching.set(true);
    this._error.set(null);

    const requestId = ++this._requestId;

    this.service
      .searchBankQuestions(search, topicId, difficulty, scope)
      .pipe(
        take(1),
        finalize(() => {
          if (requestId !== this._requestId) return;
          this._searching.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => {
          if (requestId !== this._requestId) return;
          this._results.set(results);
        },
        error: (err) => {
          if (requestId !== this._requestId) return;
          this._error.set(extractErrorMessage(err, 'A keresés sikertelen.'));
        },
      });
  }

  /** Találatok ürítése; a még futó keresés válasza is érvénytelenné válik. */
  clear(): void {
    this._requestId++;
    this._results.set([]);
    this._error.set(null);
  }
}
