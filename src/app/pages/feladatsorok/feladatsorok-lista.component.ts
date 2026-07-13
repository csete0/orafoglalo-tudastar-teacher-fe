import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { CategoryService } from '../../services/category/category.service';
import { PublicCategoryDto } from '../../models/category.model';
import { toSignal } from '@angular/core/rxjs-interop';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { notBlankValidator } from '../../shared/validators/not-blank.validator';

const LEVELS = [
  { id: 1, label: 'Kezdő' },
  { id: 2, label: 'Középhaladó' },
  { id: 3, label: 'Haladó' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsorok-lista',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <h1 class="page-title">Feladatsoraim</h1>
      <p class="text-sm text-text-muted mt-1">Saját feladatsorok szerkesztése és publikálása</p>
      <div class="hairline"></div>

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }

      @if (store.loading() && store.taskSets().length === 0) {
        <div class="space-y-2 mb-8">
          <div class="skeleton h-20"></div>
          <div class="skeleton h-20"></div>
          <div class="skeleton h-20"></div>
        </div>
      } @else {
        <ul class="space-y-3 mb-8">
          @for (taskSet of store.taskSets(); track taskSet.id) {
            <li>
              <a [routerLink]="['/feladatsorok', taskSet.id, 'szerkesztes']"
                class="card-link block group" [class]="'accent-' + (taskSet.id % 4)">
                <div class="accent-bar"></div>
                <div class="p-4 flex items-center gap-3">
                  <div class="icon-tile icon-tile-success">
                    <app-icon name="clipboard-list" class="w-6 h-6 block" />
                  </div>
                  <span class="min-w-0 flex-1">
                    <span class="font-bold block truncate">{{ taskSet.title }}</span>
                    <span class="text-text-muted text-xs">{{ taskSet.taskCount }} feladat</span>
                  </span>
                  <span class="badge shrink-0" [class]="taskSet.isPublished ? 'badge-success' : 'badge-warning'">
                    {{ taskSet.isPublished ? 'Publikált' : 'Piszkozat' }}</span>
                  <app-icon name="arrow-right"
                    class="w-4 h-4 block text-text-muted transition-transform group-hover:translate-x-1 shrink-0" />
                </div>
              </a>
            </li>
          }
          @empty {
            <!-- UI-TT-32: sikertelen betöltésnél NE mutassuk a "hozz létre elsőt" üres-állapotot
                 a fenti hibaüzenettel egyidejűleg — az üres tömb ilyenkor a hibából ered, nem
                 abból, hogy a tanárnak ténylegesen nincs egy feladatsora sem. -->
            @if (!store.error()) {
              <li class="flex flex-col items-center py-10 gap-3">
                <div class="icon-tile icon-tile-neutral">
                  <app-icon name="clipboard-list" class="w-6 h-6 block" />
                </div>
                <p class="font-semibold">Még nincs feladatsorod.</p>
                <p class="text-sm text-text-muted">Hozd létre az elsőt az alábbi űrlappal.</p>
              </li>
            }
          }
        </ul>
      }

      <form [formGroup]="createForm" (ngSubmit)="create()" class="card p-5 space-y-3">
        <h2 class="font-bold">Új feladatsor</h2>
        <input formControlName="title" placeholder="Cím" class="input" />
        @if (createForm.controls.title.hasError('blank')) {
          <p class="text-sm text-danger">A cím nem állhat kizárólag szóközökből.</p>
        }
        <textarea formControlName="description" placeholder="Leírás" rows="3" class="input"></textarea>
        <select formControlName="levelId" class="input">
          @for (level of levels; track level.id) {
            <option [value]="level.id">{{ level.label }}</option>
          }
        </select>
        <select formControlName="subjectCategoryId" class="input">
          <option [ngValue]="null">Nincs tantárgyi kategória</option>
          @for (category of categories(); track category.id) {
            <option [ngValue]="category.id">{{ category.name }}</option>
          }
        </select>

        <button type="submit" [disabled]="createForm.invalid" class="btn btn-primary">
          Létrehozás
        </button>
      </form>
    </div>
  `,
})
export class FeladatsorokListaComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly categoryService = inject(CategoryService);
  private readonly toastService = inject(ToastService);
  readonly store = inject(TeacherTaskSetStore);

  readonly levels = LEVELS;
  readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] as PublicCategoryDto[] });

  readonly createForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, notBlankValidator()]],
    description: ['', Validators.required],
    levelId: [2, Validators.required],
    subjectCategoryId: this.fb.control<number | null>(null),
  });

  constructor() {
    this.store.loadMine();
  }

  create(): void {
    if (this.createForm.invalid) return;
    const raw = this.createForm.getRawValue();
    this.store.create(
      {
        title: raw.title,
        description: raw.description,
        levelId: raw.levelId,
        subjectCategoryId: raw.subjectCategoryId ?? undefined,
      },
      (taskSet) => {
        this.toastService.success('Feladatsor létrehozva.');
        this.router.navigate(['/feladatsorok', taskSet.id, 'szerkesztes']);
      },
    );
  }
}
