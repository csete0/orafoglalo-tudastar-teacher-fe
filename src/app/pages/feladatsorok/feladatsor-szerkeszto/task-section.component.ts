import { ChangeDetectionStrategy, Component, inject, input, output, viewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../shared/icon/icon.component';
import { AutomatikusJavitasComponent } from '../automatikus-javitas.component';
import { SqlLekerdezesekComponent } from '../sql-lekerdezesek.component';
import { TesztbemenetComponent } from '../tesztbemenet.component';
import { allocatedPoints, FeladatVazlatSection } from './feladat-vazlat.component';
import { SnippetDraftsState } from './snippet-drafts.state';
import { SnippetEditorComponent } from './snippet-editor.component';
import { SubtaskEditorComponent } from './subtask-editor.component';
import { TaskEditState } from './task-edit.state';
import { TaskEditorComponent } from './task-editor.component';
import { TaskSectionState } from './task-section.state';
import { isCodeTask, isOfficeTask, isOfficeType } from './task-types';

/** A szerkesztő egy típus-blokkja (összecsukható): a feladatkártyák és a blokk „Új feladat” űrlapja. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-task-section',
  standalone: true,
  host: { class: 'block' },
  imports: [FormsModule, IconComponent, AutomatikusJavitasComponent, SqlLekerdezesekComponent, TesztbemenetComponent,
    TaskEditorComponent, SubtaskEditorComponent, SnippetEditorComponent],
  templateUrl: './task-section.component.html',
})
export class TaskSectionComponent {
  readonly section = input.required<FeladatVazlatSection>();
  readonly taskSetId = input.required<number>();
  /** A feladat szempontlistája változott (inline MI-vázlat) - a MI-segítő panel újratölti a kereteket. */
  readonly rubricChanged = output<void>();
  /** Az SQL-lekérdezések ablakából: a feladat hiányzó SQL-fájljának elkészítése. */
  readonly sqlFilesRequested = output<number>();

  protected readonly tasks = inject(TaskSectionState);
  protected readonly edit = inject(TaskEditState);
  protected readonly drafts = inject(SnippetDraftsState);
  protected readonly allocatedPoints = allocatedPoints;
  protected readonly isOfficeType = isOfficeType;
  protected readonly isOfficeTask = isOfficeTask;
  protected readonly isCodeTask = isCodeTask;

  // A „Tesztbemenet” részek (a kinyitott kód-feladatoké) - az „Automatikus javítás” „stdin” teendője ide vezet.
  private readonly runInputPanels = viewChildren(TesztbemenetComponent);

  protected openRunInput(taskId: number): void {
    this.runInputPanels().find((p) => p.task().id === taskId)?.open();
  }
}
