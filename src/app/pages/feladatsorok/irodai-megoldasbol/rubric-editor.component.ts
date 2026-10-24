import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OfficeProposalSubtask, OfficeRubricItem } from '../../../models/office-task.model';
import { MAX_POINTS, toInt } from './office-form.util';

/** A BE-vel azonos korlátok. */
export const MAX_RUBRIC_ITEMS = 15;
const MAX_ITEM_TEXT = 1000;

const GATE: Record<'ok' | 'failed' | 'source' | 'none', { label: string; badge: string }> = {
  ok: { label: 'gépi szabály: rendben', badge: 'badge-success' },
  source: { label: 'a kiinduló fájlon is teljesül → AI-szempont', badge: 'badge-warning' },
  failed: { label: 'a gépi szabály a megoldáson sem teljesül → AI-szempont', badge: 'badge-danger' },
  none: { label: 'AI-szempont', badge: 'badge-neutral' },
};

/** Egy szempont szerkesztése: a tétel sorszáma és a módosított mezők. */
export interface RubricItemPatch {
  index: number;
  patch: Partial<Pick<OfficeRubricItem, 'text' | 'points'>>;
}

/**
 * Egy részfeladat szempontlistája (az „Irodai feladat a megoldott fájlból” Szempontok fülén): gépi jelvény és kapu-állapot
 * tételenként, szöveg és pont szerkesztése, törlés, új (AI-) szempont. A javaslat frissítése a szülőé.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-rubric-editor',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'block' },
  template: `
    @let s = subtask();
    @let si = index();
    <div class="bg-bg-element rounded-xl p-3 space-y-2" [attr.data-testid]="'io-rubric-subtask-' + si">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="font-semibold text-sm">{{ s.label }} részfeladat</h3>
        <span class="text-xs" [class.text-warning]="sum() !== s.points" [class.text-text-muted]="sum() === s.points">
          Szempontok: {{ sum() }} / {{ s.points }} pont
        </span>
      </div>
      @for (it of s.rubric; track $index; let ri = $index) {
        <div class="bg-bg-panel rounded-lg p-2 space-y-2" [attr.data-testid]="'io-item-' + si + '-' + ri">
          <div class="flex flex-wrap items-center gap-2">
            @if (!dirty()) {
              @if (it.machine) { <span class="badge badge-primary" [attr.data-testid]="'io-item-machine-' + si + '-' + ri">gépi</span> }
              <span class="badge" [class]="gate(it).badge" [attr.data-testid]="'io-item-gate-' + si + '-' + ri">{{ gate(it).label }}</span>
            } @else if (it.key === null) {
              <span class="badge badge-neutral">új - AI-szempont</span>
            }
            <span class="ml-auto flex items-center gap-2">
              <label [for]="'io-item-points-' + si + '-' + ri" class="text-xs text-text-muted">Pont</label>
              <input [id]="'io-item-points-' + si + '-' + ri" type="number" min="1" [max]="maxPoints" class="input !px-2 !py-1 !w-20"
                [ngModel]="it.points" (ngModelChange)="itemChange.emit({ index: ri, patch: { points: toInt($event) } })" [ngModelOptions]="{ standalone: true }"
                [attr.data-testid]="'io-item-points-' + si + '-' + ri" />
              <button type="button" class="text-sm text-danger hover:underline" (click)="itemRemove.emit(ri)"
                [attr.aria-label]="s.label + ' részfeladat ' + (ri + 1) + '. szempontjának törlése'" [attr.data-testid]="'io-item-remove-' + si + '-' + ri">Törlés</button>
            </span>
          </div>
          @if (it.gateReason && !dirty()) { <p class="text-xs text-text-muted break-words">{{ it.gateReason }}</p> }
          <label [for]="'io-item-text-' + si + '-' + ri" class="sr-only">{{ s.label }} részfeladat {{ ri + 1 }}. szempont</label>
          <textarea [id]="'io-item-text-' + si + '-' + ri" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxItemText"
            [ngModel]="it.text" (ngModelChange)="itemChange.emit({ index: ri, patch: { text: $event } })" [ngModelOptions]="{ standalone: true }"
            [attr.data-testid]="'io-item-text-' + si + '-' + ri"></textarea>
        </div>
      }
      @if (s.rubric.length < maxItems) {
        <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm" (click)="itemAdd.emit()" [attr.data-testid]="'io-item-add-' + si">Szempont hozzáadása (AI értékeli)</button>
      }
    </div>
  `,
})
export class RubricEditorComponent {
  readonly subtask = input.required<OfficeProposalSubtask>();
  /** A részfeladat sorszáma (0-tól) - az id-k és a testid-k utótagja. */
  readonly index = input.required<number>();
  /** Módosítás után a kapu-állapot elavult, ezért nem látszik. */
  readonly dirty = input(false);
  readonly itemChange = output<RubricItemPatch>();
  readonly itemRemove = output<number>();
  readonly itemAdd = output<void>();

  readonly maxItems = MAX_RUBRIC_ITEMS;
  readonly maxItemText = MAX_ITEM_TEXT;
  readonly maxPoints = MAX_POINTS;
  readonly toInt = toInt;

  readonly sum = computed(() => this.subtask().rubric.reduce((sum, it) => sum + (it.points || 0), 0));

  gate(item: OfficeRubricItem): { label: string; badge: string } {
    return GATE[item.gate ?? 'none'];
  }
}
