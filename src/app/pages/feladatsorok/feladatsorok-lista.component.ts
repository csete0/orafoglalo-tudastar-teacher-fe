import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { CategoryService } from '../../services/category/category.service';
import { PublicCategoryDto } from '../../models/category.model';
import { toSignal } from '@angular/core/rxjs-interop';

const LEVELS = [
  { id: 1, label: 'Kezdő' },
  { id: 2, label: 'Középhaladó' },
  { id: 3, label: 'Haladó' },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsorok-lista',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <h1 class="text-xl font-semibold mb-6">Feladatsoraim</h1>

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }

      <ul class="space-y-2 mb-8">
        @for (taskSet of store.taskSets(); track taskSet.id) {
          <li>
            <a [routerLink]="['/feladatsorok', taskSet.id, 'szerkesztes']"
              class="card-link flex justify-between">
              <span>{{ taskSet.title }} <span class="text-text-muted text-sm">({{ taskSet.taskCount }} feladat)</span></span>
              <span class="text-sm text-text-muted">{{ taskSet.isPublished ? 'Publikált' : 'Piszkozat' }}</span>
            </a>
          </li>
        }
        @empty {
          <li class="text-text-muted">Még nincs feladatsorod.</li>
        }
      </ul>

      <form [formGroup]="createForm" (ngSubmit)="create()" class="bg-bg-panel border border-border-default rounded-lg p-4 space-y-3">
        <h2 class="font-medium">Új feladatsor</h2>
        <input formControlName="title" placeholder="Cím"
          class="w-full rounded border border-border-default bg-bg-element px-3 py-2" />
        <textarea formControlName="description" placeholder="Leírás" rows="3"
          class="w-full rounded border border-border-default bg-bg-element px-3 py-2"></textarea>
        <select formControlName="levelId" class="w-full rounded border border-border-default bg-bg-element px-3 py-2">
          @for (level of levels; track level.id) {
            <option [value]="level.id">{{ level.label }}</option>
          }
        </select>
        <select formControlName="subjectCategoryId" class="w-full rounded border border-border-default bg-bg-element px-3 py-2">
          <option [ngValue]="null">Nincs tantárgyi kategória</option>
          @for (category of categories(); track category.id) {
            <option [ngValue]="category.id">{{ category.name }}</option>
          }
        </select>

        <button type="submit" [disabled]="createForm.invalid"
          class="rounded bg-primary hover:bg-primary-hover text-white px-4 py-2 disabled:opacity-50">
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
  readonly store = inject(TeacherTaskSetStore);

  readonly levels = LEVELS;
  readonly categories = toSignal(this.categoryService.getAll(), { initialValue: [] as PublicCategoryDto[] });

  readonly createForm = this.fb.nonNullable.group({
    title: ['', Validators.required],
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
      (taskSet) => this.router.navigate(['/feladatsorok', taskSet.id, 'szerkesztes']),
    );
  }
}
