import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiCodeTaskMode, AiCodeTaskProposal } from '../../../models/ai-code-task.model';
import { MAX_SUBTASKS } from './ai-task.constants';
import { AiTaskPreviewState } from './ai-task-preview.state';

/** Üres / nem szám bevitel → null pont (a szerver ellenőrzi). */
export const toPoints = (value: unknown): number | null =>
  value === null || value === '' || value === undefined || Number.isNaN(Number(value)) ? null : Number(value);

/** Előnézet „Feladat” fül: cím, leírás (2. mód) és a részfeladat-szerkesztő (2. módban hozzáadás, törlés, áthelyezés). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-task-subtasks-tab',
  standalone: true,
  host: { class: 'block' },
  imports: [FormsModule],
  template: `
    @let p = proposal();
    <div class="space-y-3" data-testid="ai-task-panel-feladat">
      @if (mode() === 'new') {
        <div>
          <label for="ai-task-p-title" class="text-sm font-medium block mb-1">Cím</label>
          <input id="ai-task-p-title" class="input !px-2 !py-1" maxlength="200" [ngModel]="p.title ?? ''"
            (ngModelChange)="state.setField('title', $event)" [ngModelOptions]="{ standalone: true }" data-testid="ai-task-p-title" />
        </div>
        <div>
          <label for="ai-task-p-description" class="text-sm font-medium block mb-1">Leírás</label>
          <textarea id="ai-task-p-description" rows="10" class="input !px-2 !py-1 !text-sm" [ngModel]="p.description ?? ''"
            (ngModelChange)="state.setField('description', $event)" [ngModelOptions]="{ standalone: true }" data-testid="ai-task-p-description"></textarea>
        </div>
      } @else {
        <p class="text-sm text-text-muted">A feladat leírása és a meglévő részfeladatok a tieid, ezeket itt nem lehet módosítani - csak a hiányzó pontokat.</p>
      }

      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="font-semibold text-sm">Részfeladatok</h3>
        <span class="text-xs text-text-muted">Összesen {{ state.pointsSum() }} pont</span>
      </div>
      @for (s of p.subtasks; track $index; let i = $index) {
        <div class="bg-bg-element rounded-xl p-3 space-y-2" [attr.data-testid]="'ai-task-subtask-' + i">
          <div class="flex flex-wrap items-end gap-2">
            <div class="w-24">
              <label [for]="'ai-task-st-label-' + i" class="text-xs text-text-muted block">Címke</label>
              <input [id]="'ai-task-st-label-' + i" class="input !bg-bg-panel !px-2 !py-1" maxlength="50" [readOnly]="s.existing"
                [ngModel]="s.label" (ngModelChange)="state.setSubtask(i, { label: $event })" [ngModelOptions]="{ standalone: true }" />
            </div>
            <div class="w-24">
              <label [for]="'ai-task-st-points-' + i" class="text-xs text-text-muted block">Pont</label>
              <input [id]="'ai-task-st-points-' + i" type="number" min="0" max="1000" class="input !bg-bg-panel !px-2 !py-1" [readOnly]="s.pointsExisting"
                [ngModel]="s.points" (ngModelChange)="state.setSubtask(i, { points: toPoints($event) })" [ngModelOptions]="{ standalone: true }"
                [attr.data-testid]="'ai-task-st-points-' + i" />
            </div>
            @if (s.existing) { <span class="badge badge-neutral">a tiéd</span> }
            @if (mode() === 'new') {
              <span class="ml-auto flex items-center gap-3">
                @if (i > 0) {
                  <button type="button" class="text-sm text-primary hover:underline" (click)="state.moveSubtask(i, -1)"
                    [attr.aria-label]="s.label + ' részfeladat feljebb'" [attr.data-testid]="'ai-task-st-up-' + i">Fel</button>
                }
                @if (i < p.subtasks.length - 1) {
                  <button type="button" class="text-sm text-primary hover:underline" (click)="state.moveSubtask(i, 1)"
                    [attr.aria-label]="s.label + ' részfeladat lejjebb'" [attr.data-testid]="'ai-task-st-down-' + i">Le</button>
                }
                @if (p.subtasks.length > 1) {
                  <button type="button" class="text-sm text-danger hover:underline" (click)="state.removeSubtask(i)"
                    [attr.aria-label]="s.label + ' részfeladat törlése'" [attr.data-testid]="'ai-task-st-remove-' + i">Törlés</button>
                }
              </span>
            }
          </div>
          <div>
            <label [for]="'ai-task-st-text-' + i" class="text-xs text-text-muted block">Szöveg</label>
            <textarea [id]="'ai-task-st-text-' + i" rows="3" class="input !bg-bg-panel !px-2 !py-1 !text-sm" [readOnly]="s.existing"
              [ngModel]="s.text" (ngModelChange)="state.setSubtask(i, { text: $event })" [ngModelOptions]="{ standalone: true }"
              [attr.data-testid]="'ai-task-st-text-' + i"></textarea>
          </div>
        </div>
      }
      @if (mode() === 'new') {
        @if (p.subtasks.length < maxSubtasks) {
          <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm" (click)="state.addSubtask()" data-testid="ai-task-add-subtask">Részfeladat hozzáadása</button>
        }
        <p class="text-xs text-text-muted" data-testid="ai-task-renumber-note">
          Hozzáadáskor, törléskor és áthelyezéskor a címkék automatikusan újraszámozódnak (1., 2., …). A mintamegoldás
          „N. feladat” fejléceinek ehhez kell igazodniuk - az Újraellenőrzés ezt is ellenőrzi.
        </p>
      }
    </div>
  `,
})
export class AiTaskSubtasksTabComponent {
  readonly state = inject(AiTaskPreviewState);
  readonly mode = input.required<AiCodeTaskMode>();
  readonly proposal = input.required<AiCodeTaskProposal>();
  readonly maxSubtasks = MAX_SUBTASKS;
  readonly toPoints = toPoints;
}
