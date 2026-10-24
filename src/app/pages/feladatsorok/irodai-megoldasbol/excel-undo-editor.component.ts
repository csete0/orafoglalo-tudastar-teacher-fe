import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ExcelUndoOpName, OfficeUndoOp } from '../../../models/office-task.model';
import { canonicalOp, changeUndoOpKind, EXCEL_UNDO_OP_NAMES, EXCEL_UNDO_OPS, opSpec, STYLE_PARTS } from '../irodai-undo.util';
import { emptyToNull, oneBasedToIndex, toggledParts } from './office-form.util';

type ExcelField = 'range' | 'name' | 'index' | 'columns' | 'parts';

/**
 * Egy Excel-visszacsinálási művelet szerkesztője (az „Irodai feladat a megoldott fájlból” Visszacsinálás fülén). Minden módosítás
 * a teljes, új műveletet adja ki (`opChange`); a javaslat frissítése a szülőé.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-excel-undo-editor',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'block' },
  template: `
    @let o = op();
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" [attr.data-testid]="'io-undo-editor-' + key()">
      <div>
        <label [for]="'io-op-' + key()" class="text-xs text-text-muted block">Művelet</label>
        <select [id]="'io-op-' + key()" class="input !px-2 !py-1 !text-sm" [ngModel]="canonical(o.op)"
          (ngModelChange)="changeKind($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-op-' + key()">
          @for (n of opNames; track n) { <option [ngValue]="n">{{ opLabel(n) }}</option> }
        </select>
      </div>
      <div>
        <label [for]="'io-sheet-' + key()" class="text-xs text-text-muted block">Munkalap</label>
        <input [id]="'io-sheet-' + key()" class="input !px-2 !py-1 !text-sm" maxlength="31" [ngModel]="o.sheet ?? ''"
          (ngModelChange)="set({ sheet: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }"
          placeholder="egylapos munkafüzetnél elhagyható" [attr.data-testid]="'io-sheet-' + key()" />
      </div>
      @if (has(o, 'range')) {
        <div>
          <label [for]="'io-range-' + key()" class="text-xs text-text-muted block">Tartomány{{ rangeOptional(o) ? ' (elhagyható = az egész lap)' : '' }}</label>
          <input [id]="'io-range-' + key()" class="input !px-2 !py-1 !text-sm font-mono" [ngModel]="o.range ?? ''"
            (ngModelChange)="set({ range: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }"
            placeholder="pl. B2:D10" [attr.data-testid]="'io-range-' + key()" />
        </div>
      }
      @if (has(o, 'columns')) {
        <div>
          <label [for]="'io-columns-' + key()" class="text-xs text-text-muted block">Oszlopok</label>
          <input [id]="'io-columns-' + key()" class="input !px-2 !py-1 !text-sm font-mono" [ngModel]="o.columns ?? ''"
            (ngModelChange)="set({ columns: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }"
            placeholder="pl. B:D" [attr.data-testid]="'io-columns-' + key()" />
        </div>
      }
      @if (has(o, 'name')) {
        <div>
          <label [for]="'io-name-' + key()" class="text-xs text-text-muted block">{{ canonical(o.op) === 'removeChart' ? 'Diagram neve vagy címe' : 'Név' }}</label>
          <input [id]="'io-name-' + key()" class="input !px-2 !py-1 !text-sm" maxlength="255" [ngModel]="o.name ?? ''"
            (ngModelChange)="set({ name: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }"
            [attr.data-testid]="'io-name-' + key()" />
        </div>
      }
      @if (has(o, 'index')) {
        <div>
          <label [for]="'io-index-' + key()" class="text-xs text-text-muted block">VAGY: a diagram sorszáma a lapon (1-től)</label>
          <input [id]="'io-index-' + key()" type="number" min="1" max="100" class="input !px-2 !py-1 !text-sm"
            [ngModel]="o.index == null ? null : o.index + 1" (ngModelChange)="set({ index: oneBasedToIndex($event) })"
            [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-index-' + key()" />
        </div>
      }
      @if (has(o, 'parts')) {
        <fieldset class="sm:col-span-2">
          <legend class="text-xs text-text-muted">Mit állítson alapra? (semmi bejelölve = mindent)</legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            @for (part of styleParts; track part.key) {
              <label class="flex items-center gap-1.5 text-sm">
                <input type="checkbox" [checked]="!!o.parts?.includes(part.key)" (change)="togglePart(part.key)"
                  [attr.data-testid]="'io-part-' + key() + '-' + part.key" />
                {{ part.label }}
              </label>
            }
          </div>
        </fieldset>
      }
    </div>
  `,
})
export class ExcelUndoEditorComponent {
  readonly op = input.required<OfficeUndoOp>();
  /** A mezők id-/testid-utótagja („részfeladat-művelet” sorszám, pl. `0-1`). */
  readonly key = input.required<string>();
  readonly opChange = output<OfficeUndoOp>();

  readonly opNames = EXCEL_UNDO_OP_NAMES;
  readonly styleParts = STYLE_PARTS;
  readonly emptyToNull = emptyToNull;
  readonly oneBasedToIndex = oneBasedToIndex;

  set(patch: Partial<OfficeUndoOp>): void {
    this.opChange.emit({ ...this.op(), ...patch });
  }

  changeKind(next: ExcelUndoOpName): void {
    this.opChange.emit(changeUndoOpKind(this.op(), next));
  }

  togglePart(part: string): void {
    this.set({ parts: toggledParts(this.op().parts, part, STYLE_PARTS) });
  }

  canonical(op: string): ExcelUndoOpName | null {
    return canonicalOp(op);
  }

  opLabel(name: ExcelUndoOpName): string {
    return EXCEL_UNDO_OPS[name].label;
  }

  has(op: OfficeUndoOp, field: ExcelField): boolean {
    return !!opSpec(op.op)?.fields.includes(field);
  }

  rangeOptional(op: OfficeUndoOp): boolean {
    return !!opSpec(op.op)?.rangeOptional;
  }
}
