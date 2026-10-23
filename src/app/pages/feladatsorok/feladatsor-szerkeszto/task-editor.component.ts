import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TeacherTaskDto } from '../../../models/teacher-content.model';
import { TaskEditState } from './task-edit.state';
import { TASK_TYPES } from './task-types';

/**
 * UI-TT-214: meglévő feladat inline szerkesztője - a UI-TT-193 részfeladat-mintáját tükrözi (cím/leírás/pont, itt +
 * sorrend-mező), a store `updateTask`-jára kötve. UI-TT-215: kategória-választóval (rossz kategóriájú feladat javítása).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-task-editor',
  standalone: true,
  host: { class: 'block space-y-2' },
  imports: [FormsModule],
  template: `
    <div>
      <label class="text-xs text-text-muted">Cím</label>
      <input [ngModel]="draft().title"
        (ngModelChange)="edit.setEditTaskTitle(task().id, $event)"
        [ngModelOptions]="{standalone: true}"
        class="input !px-2 !py-1" />
    </div>
    <div>
      <label class="text-xs text-text-muted">Leírás</label>
      <textarea rows="2"
        [ngModel]="draft().description"
        (ngModelChange)="edit.setEditTaskDescription(task().id, $event)"
        [ngModelOptions]="{standalone: true}"
        class="input !px-2 !py-1"></textarea>
    </div>
    <div>
      <label class="text-xs text-text-muted block mb-1">Kategória</label>
      <div class="flex flex-wrap gap-x-3 gap-y-1">
        @for (type of taskTypes; track type.id) {
          <label class="flex items-center gap-1 text-sm cursor-pointer">
            <input type="radio" [name]="'editTaskCategory-' + task().id"
              [checked]="draft().taskTypeId === type.id"
              (change)="edit.setEditTaskCategory(task().id, type.id)" />
            {{ type.label }}
          </label>
        }
      </div>
    </div>
    <div class="flex gap-2 items-end">
      <div class="w-24">
        <label class="text-xs text-text-muted">Max pont</label>
        <input type="number" min="1" max="1000"
          [ngModel]="draft().maxPoints"
          (ngModelChange)="edit.setEditTaskMaxPoints(task().id, $event)"
          [ngModelOptions]="{standalone: true}"
          class="input !px-2 !py-1" />
      </div>
      <div class="w-24">
        <label class="text-xs text-text-muted">Sorrend</label>
        <input type="number" min="1"
          [ngModel]="draft().taskOrder"
          (ngModelChange)="edit.setEditTaskOrder(task().id, $event)"
          [ngModelOptions]="{standalone: true}"
          class="input !px-2 !py-1" />
      </div>
      <button (click)="edit.saveEditTask(taskSetId(), task())"
        [disabled]="edit.isEditTaskDraftInvalid(task().id) || edit.loading()"
        class="btn btn-primary !px-3 !py-1.5">
        Mentés
      </button>
      <button (click)="edit.cancelEditTask()" class="btn btn-ghost !px-3 !py-1.5">
        Mégsem
      </button>
    </div>
  `,
})
export class TaskEditorComponent {
  readonly taskSetId = input.required<number>();
  readonly task = input.required<TeacherTaskDto>();

  protected readonly edit = inject(TaskEditState);
  protected readonly taskTypes = TASK_TYPES;

  protected readonly draft = computed(() => this.edit.editTaskDraft(this.task()));
}
