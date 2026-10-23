import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiCodeTaskProposal } from '../../../models/ai-code-task.model';
import { languageName } from './ai-task.constants';
import { AiTaskPreviewState } from './ai-task-preview.state';

/** Előnézet „Mintamegoldás” fül: nyelvenként a teljes megoldás és a részfeladatonkénti kódrészletek, valamint a tárolt bemenet. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-task-solution-tab',
  standalone: true,
  host: { class: 'block' },
  imports: [FormsModule],
  template: `
    @let p = proposal();
    <div class="space-y-3" data-testid="ai-task-panel-megoldas">
      <div class="flex flex-wrap gap-1" role="group" aria-label="Nyelv">
        @for (l of p.languages; track l.language; let li = $index) {
          <button type="button" class="btn !px-3 !py-1 text-sm" [class.btn-primary]="state.languageIndex() === li" [class.btn-ghost]="state.languageIndex() !== li"
            [attr.aria-pressed]="state.languageIndex() === li" (click)="state.languageIndex.set(li)" [attr.data-testid]="'ai-task-lang-' + l.language">
            {{ languageName(l.language) }}
          </button>
        }
      </div>
      @if (p.languages[state.languageIndex()]; as l) {
        <div>
          <label [for]="'ai-task-solution-' + l.language" class="text-sm font-medium block mb-1">
            Teljes megoldás ({{ languageName(l.language) }})
            @if (l.solutionExisting) { <span class="badge badge-neutral ml-1">a tiéd</span> }
          </label>
          <textarea [id]="'ai-task-solution-' + l.language" rows="16" spellcheck="false" [readOnly]="l.solutionExisting"
            class="input !px-2 !py-1 !text-xs font-mono whitespace-pre" [ngModel]="l.solution"
            (ngModelChange)="state.setSolution(state.languageIndex(), $event)" [ngModelOptions]="{ standalone: true }"
            [attr.data-testid]="'ai-task-solution-' + l.language"></textarea>
        </div>
        @if (l.snippets.length > 0) {
          <h3 class="font-semibold text-sm">Kódrészletek részfeladatonként</h3>
        } @else {
          <p class="text-xs text-text-muted" data-testid="ai-task-no-snippets">Ennél a nyelvnél csak a teljes program készül - részfeladatonkénti kódrészlet Pythonban van.</p>
        }
        @for (sn of l.snippets; track $index; let si = $index) {
          <div>
            <label [for]="'ai-task-snippet-' + l.language + '-' + si" class="text-xs text-text-muted block">
              {{ p.subtasks[si]?.label || (si + 1) + '.' }} részfeladat
              @if (sn.existing) { <span class="badge badge-neutral ml-1">a tiéd</span> }
            </label>
            <textarea [id]="'ai-task-snippet-' + l.language + '-' + si" rows="4" spellcheck="false" [readOnly]="sn.existing"
              class="input !px-2 !py-1 !text-xs font-mono whitespace-pre" [ngModel]="sn.code"
              (ngModelChange)="state.setSnippet(state.languageIndex(), si, $event)" [ngModelOptions]="{ standalone: true }"></textarea>
          </div>
        }
      }
      <div>
        <label for="ai-task-stdin" class="text-sm font-medium block mb-1">
          Tárolt bemenet (ha a program billentyűzetről olvas)
          @if (p.stdinExisting) { <span class="badge badge-neutral ml-1">a tiéd</span> }
        </label>
        <textarea id="ai-task-stdin" rows="3" spellcheck="false" [readOnly]="p.stdinExisting" class="input !px-2 !py-1 !text-xs font-mono whitespace-pre"
          [ngModel]="p.stdin ?? ''" (ngModelChange)="state.setStdin($event)" [ngModelOptions]="{ standalone: true }"
          placeholder="Üresen hagyva nincs tárolt bemenet." data-testid="ai-task-stdin"></textarea>
      </div>
    </div>
  `,
})
export class AiTaskSolutionTabComponent {
  readonly state = inject(AiTaskPreviewState);
  readonly proposal = input.required<AiCodeTaskProposal>();
  readonly languageName = languageName;
}
