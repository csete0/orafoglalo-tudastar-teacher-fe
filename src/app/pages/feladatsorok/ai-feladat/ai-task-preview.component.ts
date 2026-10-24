import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { AiCodeTaskMode, AiCodeTaskReport } from '../../../models/ai-code-task.model';
import { tablistKeyTarget } from '../../../shared/a11y/tablist-keys';
import { IconComponent } from '../../../shared/icon/icon.component';
import { AI_TASK_TABS } from './ai-task.constants';
import { AiTaskCheckTabComponent } from './ai-task-check-tab.component';
import { AiTaskDataFileTabComponent } from './ai-task-data-file-tab.component';
import { AiTaskPreviewState } from './ai-task-preview.state';
import { AiTaskSolutionTabComponent } from './ai-task-solution-tab.component';
import { AiTaskSubtasksTabComponent } from './ai-task-subtasks-tab.component';

/**
 * Az AI-feladat 3. lépése: az ellenőrzés összegzése, a szerkeszthető részek fülekre bontva, Újraellenőrzés, Elvetés,
 * Visszaállítás és Mentés. A műveletek HTTP-része a szülőé (outputok), a szerkesztés az `AiTaskPreviewState`-é.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-task-preview',
  standalone: true,
  host: { class: 'block' },
  imports: [IconComponent, AiTaskSubtasksTabComponent, AiTaskDataFileTabComponent, AiTaskSolutionTabComponent, AiTaskCheckTabComponent],
  templateUrl: './ai-task-preview.component.html',
})
export class AiTaskPreviewComponent {
  readonly state = inject(AiTaskPreviewState);

  readonly mode = input.required<AiCodeTaskMode>();
  readonly report = input.required<AiCodeTaskReport>();
  readonly revalidating = input(false);
  readonly saving = input(false);
  readonly discarding = input(false);

  readonly revalidate = output<void>();
  readonly discard = output<void>();
  readonly save = output<void>();

  readonly tabs = AI_TASK_TABS;

  onTabKey(event: KeyboardEvent, index: number): void {
    const target = tablistKeyTarget(event.key, index, this.tabs.length);
    if (target === null) return;
    event.preventDefault();
    const next = this.tabs[target];
    this.state.tab.set(next.id);
    setTimeout(() => document.getElementById(`ai-task-tab-${next.id}`)?.focus());
  }
}
