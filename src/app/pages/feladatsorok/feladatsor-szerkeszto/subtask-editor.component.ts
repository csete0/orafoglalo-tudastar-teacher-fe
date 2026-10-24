import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TeacherSubTaskDto, TeacherTaskDto } from '../../../models/teacher-content.model';
import { SnippetDraftsState } from './snippet-drafts.state';
import { SnippetEditorComponent } from './snippet-editor.component';
import { TaskEditState } from './task-edit.state';
import { TaskSectionState } from './task-section.state';
import { isOfficeTask } from './task-types';

/** Egy részfeladat kártyája: leírás és pont (inline szerkeszthető, UI-TT-193), törlés, és a kódrészletei. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-subtask-editor',
  standalone: true,
  host: { class: 'block bg-bg-panel rounded-xl p-3' },
  imports: [FormsModule, SnippetEditorComponent],
  template: `
    @let solution = subTask();
    @if (edit.editingSolutionId() === solution.id) {
      <!-- UI-TT-193: inline szerkesztő - az „Új részfeladat” űrlap mezőit tükrözi (leírás + pont), a store
           updateSubTask-jára kötve. -->
      <div class="mb-2 space-y-2">
        <div>
          <label class="text-xs text-text-muted">Leírás</label>
          <textarea rows="2"
            [ngModel]="draft().description"
            (ngModelChange)="edit.setEditSolutionDescription(solution.id, $event)"
            [ngModelOptions]="{standalone: true}"
            class="input !px-2 !py-1"></textarea>
        </div>
        <div class="flex gap-2 items-end">
          <div class="w-24">
            <label class="text-xs text-text-muted">Pont</label>
            <input type="number"
              [ngModel]="draft().points"
              (ngModelChange)="edit.setEditSolutionPoints(solution.id, $event)"
              [ngModelOptions]="{standalone: true}"
              class="input !px-2 !py-1" />
          </div>
          <button (click)="edit.saveEditSolution(taskSetId(), solution)"
            [disabled]="edit.isEditSolutionDraftDescriptionBlank(solution.id) || edit.loading()"
            class="btn btn-primary !px-3 !py-1.5">
            Mentés
          </button>
          <button (click)="edit.cancelEditSolution()" class="btn btn-ghost !px-3 !py-1.5">
            Mégsem
          </button>
        </div>
      </div>
    } @else {
      <div class="flex justify-between items-start gap-2 mb-2">
        <p class="text-sm font-medium min-w-0 flex-1 truncate">{{ label() }} ({{ solution.points ?? 0 }} pont)</p>
        <div class="flex items-center gap-3 shrink-0">
          <button (click)="edit.startEditSolution(solution)" class="text-sm text-primary hover:underline">Szerkesztés</button>
          <button (click)="tasks.deleteSubTask(taskSetId(), solution.id, label())" class="text-sm text-danger hover:underline">Törlés</button>
        </div>
      </div>
      <p class="text-sm text-text-muted mb-2 break-words">{{ solution.description }}</p>
    }

    <!-- Irodai feladatnál nincs kódrészlet: a referencia a feltöltött megoldásfájl. -->
    @if (!isOfficeTask(task())) {
      <app-snippet-editor [draftKey]="solution.id" saveLabel="Kódrészletek mentése"
        (save)="drafts.saveSnippets(taskSetId(), solution)" />
    }
  `,
})
export class SubtaskEditorComponent {
  readonly taskSetId = input.required<number>();
  readonly task = input.required<TeacherTaskDto>();
  readonly subTask = input.required<TeacherSubTaskDto>();

  protected readonly tasks = inject(TaskSectionState);
  protected readonly edit = inject(TaskEditState);
  protected readonly drafts = inject(SnippetDraftsState);
  protected readonly isOfficeTask = isOfficeTask;

  protected readonly draft = computed(() => this.edit.editSolutionDraft(this.subTask()));
  protected readonly label = computed(() => this.subTask().label || '#' + this.subTask().id);
}
