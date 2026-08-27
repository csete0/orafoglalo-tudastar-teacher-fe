import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon.component';
import { ToastService } from '../../shared/toast/toast.service';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';
import { TeacherQuizStore } from '../../services/teacher-quiz/teacher-quiz.store';
import {
  QUIZ_FEEDBACK_MODE_LABELS,
  QuizFeedbackMode,
  TeacherQuizDto,
} from '../../models/teacher-quiz.model';
import { TartalomFulekComponent } from './tartalom-fulek.component';

/**
 * Tanári kvízek listája.
 *
 * SZÁNDÉKOSAN a Feladatsorok oldal FÜLE alatt él, nem külön menüpontként: a
 * fejléc-navigáció pontosan 6 linkre van méretezve (élőben mérve ~1118.9px a 1248px-es
 * tartalom-dobozban), egy 7. link visszanyitná a UI-TT-181/192/177 alatt javított
 * túlcsordulási hibát. Ugyanez a megfontolás vitte a licenc-kezelést is az Intézmények
 * oldalra.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kvizek-lista',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent, TartalomFulekComponent],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <h1 class="page-title">Kvízeim</h1>
      <p class="text-sm text-text-muted mt-1">Saját kvízek összeállítása és kiadása csoportoknak</p>

      <app-tartalom-fulek />

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }

      @if (store.mineLoading() && store.quizzes().length === 0) {
        <div class="space-y-2 mb-8">
          <div class="skeleton h-20"></div>
          <div class="skeleton h-20"></div>
        </div>
      } @else {
        <ul class="space-y-3 mb-8">
          @for (quiz of store.quizzes(); track quiz.id) {
            <li>
              <a
                [routerLink]="['/feladatsorok', 'kvizek', quiz.id, 'szerkesztes']"
                class="card-link block group"
                [class]="'accent-' + (quiz.id % 4)"
              >
                <div class="accent-bar"></div>
                <div class="p-4 flex items-center gap-3">
                  <div class="icon-tile icon-tile-success">
                    <app-icon name="academic-cap" class="w-6 h-6 block" />
                  </div>
                  <span class="min-w-0 flex-1">
                    <span class="font-bold block truncate">{{ quiz.title }}</span>
                    <span class="text-text-muted text-xs">{{ questionSummary(quiz) }}</span>
                  </span>
                  @if (quiz.pendingQuestionCount > 0) {
                    <span class="badge badge-warning shrink-0">
                      {{ quiz.pendingQuestionCount }} jóváhagyásra vár
                    </span>
                  }
                  <span class="badge shrink-0" [class]="badgeClass(quiz)">{{ badgeLabel(quiz) }}</span>
                  <app-icon
                    name="arrow-right"
                    class="w-4 h-4 block text-text-muted transition-transform group-hover:translate-x-1 shrink-0"
                  />
                </div>
              </a>
            </li>
          } @empty {
            <!-- Sikertelen betöltésnél NE mutassuk a "hozz létre elsőt" üres-állapotot a
                 hibaüzenettel egyidejűleg: az üres lista ilyenkor a hibából ered, nem abból,
                 hogy a tanárnak ténylegesen nincs kvíze (UI-TT-32 ugyanezen tanulsága). -->
            @if (!store.error()) {
              <li class="flex flex-col items-center py-10 gap-3">
                <div class="icon-tile icon-tile-neutral">
                  <app-icon name="academic-cap" class="w-6 h-6 block" />
                </div>
                <p class="font-semibold">Még nincs kvízed.</p>
                <p class="text-sm text-text-muted">Hozd létre az elsőt az alábbi űrlappal.</p>
              </li>
            }
          }
        </ul>
      }

      <form [formGroup]="createForm" (ngSubmit)="create()" class="card p-5 space-y-3">
        <h2 class="font-bold">Új kvíz</h2>

        <input formControlName="title" placeholder="Cím (pl. 3. heti dolgozat)" maxlength="200" class="input" />
        @if (createForm.controls.title.hasError('blank')) {
          <p class="text-sm text-danger">A cím nem állhat kizárólag szóközökből.</p>
        }
        @if (createForm.controls.title.hasError('maxlength')) {
          <p class="text-sm text-danger">A cím legfeljebb 200 karakter hosszú lehet.</p>
        }

        <textarea formControlName="description" placeholder="Leírás (nem kötelező)" rows="2" class="input"></textarea>

        <label class="block">
          <span class="text-sm text-text-muted">Mikor lássa a diák a megoldást?</span>
          <select formControlName="feedbackMode" class="input mt-1">
            @for (mode of feedbackModes; track mode.value) {
              <option [value]="mode.value">{{ mode.label }}</option>
            }
          </select>
        </label>
        <p class="text-xs text-text-muted">
          Gyakorláshoz az azonnali visszajelzés a hasznos; számonkérésnél viszont értelmetlenné
          tenné a dolgozatot.
        </p>

        <button type="submit" [disabled]="createForm.invalid || store.loading()" class="btn btn-primary">
          Létrehozás
        </button>
      </form>
    </div>
  `,
})
export class KvizekListaComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  readonly store = inject(TeacherQuizStore);

  readonly feedbackModes = (Object.keys(QUIZ_FEEDBACK_MODE_LABELS) as QuizFeedbackMode[]).map((value) => ({
    value,
    label: QUIZ_FEEDBACK_MODE_LABELS[value],
  }));

  readonly createForm = this.fb.nonNullable.group({
    // A BE nvarchar(200)-hoz igazodó kemény korlát.
    title: ['', [Validators.required, notBlankValidator(), Validators.maxLength(200)]],
    description: [''],
    feedbackMode: ['after' as QuizFeedbackMode, Validators.required],
  });

  constructor() {
    this.store.loadMine();
  }

  questionSummary(quiz: TeacherQuizDto): string {
    const parts = [`${quiz.questionCount} kérdés`];
    if (quiz.assignedGroupCount > 0) parts.push(`${quiz.assignedGroupCount} csoportnak kiadva`);
    return parts.join(' · ');
  }

  /**
   * Három állapot, a feladatsoroknál bevált (UI-TT-172) hármas mintájára: egy
   * admin-visszavont kvíz nem kaphat ugyanolyan jelvényt, mint egy sosem publikált.
   */
  badgeLabel(quiz: TeacherQuizDto): string {
    if (quiz.takedownAt) return 'Admin visszavonta';
    return quiz.isPublished ? 'Publikált' : 'Piszkozat';
  }

  badgeClass(quiz: TeacherQuizDto): string {
    if (quiz.takedownAt) return 'badge-danger';
    return quiz.isPublished ? 'badge-success' : 'badge-warning';
  }

  create(): void {
    if (this.createForm.invalid || this.store.loading()) return;

    const raw = this.createForm.getRawValue();
    this.store.create(
      {
        title: raw.title,
        description: raw.description || null,
        feedbackMode: raw.feedbackMode,
        shuffleQuestions: true,
        allowLateSubmission: true,
      },
      (quiz) => {
        this.toastService.success('Kvíz létrehozva.');
        this.router.navigate(['/feladatsorok', 'kvizek', quiz.id, 'szerkesztes']);
      },
    );
  }
}
