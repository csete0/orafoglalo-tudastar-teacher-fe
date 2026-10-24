import { ChangeDetectionStrategy, Component, inject, input, model, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { PublicCategoryDto } from '../../../models/category.model';
import { TeacherSkillDto } from '../../../models/teacher-content.model';
import { CategoryService } from '../../../services/category/category.service';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { SkillPickerComponent } from '../../../shared/skill-picker/skill-picker.component';

/** Az „Alapadatok” mentetlen piszkozata; a szerkesztő tartja (UI-TT-238: elhagyáskor ebből látja a módosítást). */
export interface MetadataDraft {
  title: string;
  description: string;
  levelId: number;
  subjectCategoryId: number | null;
  requiredSkillIds: number[];
}

const LEVELS: { id: number; label: string }[] = [
  { id: 1, label: 'Kezdő' },
  { id: 2, label: 'Középhaladó' },
  { id: 3, label: 'Haladó' },
];

/** A szerkesztő „Alapadatok” része: cím, leírás, szint, tantárgy, ajánlott előtte; a mentést a szerkesztő végzi. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-metadata-section',
  standalone: true,
  host: { class: 'block space-y-3' },
  imports: [FormsModule, SkillPickerComponent],
  template: `
    <label class="block">
      <span class="text-sm text-text-muted">Cím</span>
      <input
        [ngModel]="draft().title"
        (ngModelChange)="patch({ title: $event })"
        [ngModelOptions]="{ standalone: true }"
        maxlength="250"
        class="input mt-1"
      />
    </label>
    <label class="block">
      <span class="text-sm text-text-muted">Leírás</span>
      <textarea
        rows="3"
        [ngModel]="draft().description"
        (ngModelChange)="patch({ description: $event })"
        [ngModelOptions]="{ standalone: true }"
        class="input mt-1"
      ></textarea>
    </label>
    <label class="block">
      <span class="text-sm text-text-muted">Szint</span>
      <select
        [ngModel]="draft().levelId"
        (ngModelChange)="patch({ levelId: +$event })"
        [ngModelOptions]="{ standalone: true }"
        class="input mt-1"
      >
        @for (level of levels; track level.id) {
          <option [value]="level.id">{{ level.label }}</option>
        }
      </select>
    </label>
    <label class="block">
      <span class="text-sm text-text-muted">Tantárgy (elhagyható)</span>
      <select
        [ngModel]="draft().subjectCategoryId"
        (ngModelChange)="patch({ subjectCategoryId: $event ? +$event : null })"
        [ngModelOptions]="{ standalone: true }"
        class="input mt-1"
      >
        <option [value]="null">—</option>
        @for (cat of selectableCategories(); track cat.id) {
          <option [value]="cat.id">{{ cat.name }}</option>
        }
      </select>
    </label>
    @if (skills().length) {
      <app-skill-picker
        [skills]="skills()"
        [selected]="draft().requiredSkillIds"
        (selectedChange)="patch({ requiredSkillIds: $event })"
      />
    }
    <button
      type="button"
      class="btn btn-primary"
      [disabled]="!draft().title.trim() || !draft().description.trim() || busy()"
      (click)="save.emit()"
    >
      Mentés
    </button>
  `,
})
export class MetadataSectionComponent {
  readonly draft = model.required<MetadataDraft>();
  readonly busy = input(false);
  readonly save = output<void>();

  protected readonly levels = LEVELS;

  protected readonly selectableCategories = toSignal(
    inject(CategoryService).getAll().pipe(catchError(() => of([] as PublicCategoryDto[]))),
    { initialValue: [] as PublicCategoryDto[] },
  );

  /** Az „Ajánlott előtte” témaválasztó listája - hiba esetén a választó egyszerűen nem jelenik meg. */
  protected readonly skills = toSignal(
    inject(TeacherTaskSetService).getSkills().pipe(catchError(() => of([] as TeacherSkillDto[]))),
    { initialValue: [] as TeacherSkillDto[] },
  );

  protected patch(change: Partial<MetadataDraft>): void {
    this.draft.update((d) => ({ ...d, ...change }));
  }
}
