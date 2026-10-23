import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OfficeSlideShape, OfficeUndoOp, PptUndoOpName } from '../../../models/office-task.model';
import { canonicalPptOp, changePptUndoOpKind, PPT_FONT_PARTS, PPT_UNDO_OP_NAMES, PPT_UNDO_OPS, pptOpSpec } from '../irodai-undo.util';
import { toggledParts, toInt } from './office-form.util';

/**
 * Egy PowerPoint-visszacsinálási művelet szerkesztője (az „Irodai feladat a megoldott fájlból” Visszacsinálás fülén): dia, alakzat a
 * megoldás alakzat-listájából (vagy kézzel), visszaállítandó betű-részek. Minden módosítás a teljes, új műveletet adja ki
 * (`opChange`); a javaslat frissítése a szülőé.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ppt-undo-editor',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'block' },
  template: `
    @let o = op();
    @let spec = specOf(o);
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" [attr.data-testid]="'io-undo-editor-' + key()">
      <div class="sm:col-span-2">
        <label [for]="'io-op-' + key()" class="text-xs text-text-muted block">Művelet</label>
        <select [id]="'io-op-' + key()" class="input !px-2 !py-1 !text-sm" [ngModel]="canonical(o.op)"
          (ngModelChange)="changeKind($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-op-' + key()">
          @for (n of opNames; track n) { <option [ngValue]="n">{{ opLabel(n) }}</option> }
        </select>
      </div>
      <div>
        <label [for]="'io-slide-' + key()" class="text-xs text-text-muted block">Dia (a megoldás szerinti sorszám)</label>
        <select [id]="'io-slide-' + key()" class="input !px-2 !py-1 !text-sm" [ngModel]="o.slide ?? null"
          (ngModelChange)="setSlide($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-slide-' + key()">
          @if (spec?.allSlides) { <option [ngValue]="null">minden dia</option> } @else { <option [ngValue]="null" disabled>válassz…</option> }
          @for (n of slideOptions(o); track n) { <option [ngValue]="n">{{ n }}. dia</option> }
        </select>
      </div>
      @if (has(o, 'shape')) {
        @if (shapeOptions(o.slide).length > 0) {
          <div class="sm:col-span-2">
            <label [for]="'io-shape-' + key()" class="text-xs text-text-muted block">Alakzat{{ spec?.needsShape ? '' : ' (elhagyható = a dia összes animációja)' }}</label>
            <select [id]="'io-shape-' + key()" class="input !px-2 !py-1 !text-sm" [ngModel]="o.shape?.id ?? null"
              (ngModelChange)="setShape($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-shape-' + key()">
              <option [ngValue]="null" [disabled]="spec?.needsShape">{{ spec?.needsShape ? 'válassz…' : 'a dia összes animációja' }}</option>
              @for (sh of shapeOptions(o.slide); track sh.id) { <option [ngValue]="sh.id">{{ shapeLabel(sh) }}</option> }
            </select>
          </div>
        } @else {
          <div>
            <label [for]="'io-shape-id-' + key()" class="text-xs text-text-muted block">Az alakzat azonosítója</label>
            <input [id]="'io-shape-id-' + key()" type="number" min="0" class="input !px-2 !py-1 !text-sm"
              [ngModel]="o.shape?.id ?? null" (ngModelChange)="setShapeManual({ id: $event })"
              [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-shape-id-' + key()" />
          </div>
          <div>
            <label [for]="'io-shape-name-' + key()" class="text-xs text-text-muted block">Az alakzat neve (pontosan)</label>
            <input [id]="'io-shape-name-' + key()" class="input !px-2 !py-1 !text-sm" maxlength="255" [ngModel]="o.shape?.name ?? ''"
              (ngModelChange)="setShapeManual({ name: $event })" [ngModelOptions]="{ standalone: true }"
              [attr.data-testid]="'io-shape-name-' + key()" />
          </div>
        }
      }
      @if (has(o, 'parts')) {
        <fieldset class="sm:col-span-2">
          <legend class="text-xs text-text-muted">Mit állítson alapra? (semmi bejelölve = mindent)</legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            @for (part of fontParts; track part.key) {
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
export class PptUndoEditorComponent {
  readonly op = input.required<OfficeUndoOp>();
  /** A mezők id-/testid-utótagja („részfeladat-művelet” sorszám, pl. `0-1`). */
  readonly key = input.required<string>();
  /** A megoldás alakzatai az alakzat-választóhoz (üres: csak kézi megadás). */
  readonly shapes = input<OfficeSlideShape[]>([]);
  /** A megoldás diáinak száma. */
  readonly slideCount = input(0);
  readonly opChange = output<OfficeUndoOp>();

  readonly opNames = PPT_UNDO_OP_NAMES;
  readonly fontParts = PPT_FONT_PARTS;

  set(patch: Partial<OfficeUndoOp>): void {
    this.opChange.emit({ ...this.op(), ...patch });
  }

  changeKind(next: PptUndoOpName): void {
    this.opChange.emit(changePptUndoOpKind(this.op(), next));
  }

  canonical(op: string): PptUndoOpName | null {
    return canonicalPptOp(op);
  }

  opLabel(name: PptUndoOpName): string {
    return PPT_UNDO_OPS[name].label;
  }

  specOf(op: OfficeUndoOp) {
    return pptOpSpec(op.op);
  }

  has(op: OfficeUndoOp, field: 'shape' | 'parts'): boolean {
    return !!pptOpSpec(op.op)?.fields.includes(field);
  }

  /** A választható diák (1-től; és a művelet saját, nagyobb sorszáma, ha van). */
  slideOptions(op: OfficeUndoOp): number[] {
    const count = Math.max(this.slideCount(), op.slide ?? 0);
    return Array.from({ length: count }, (_, i) => i + 1);
  }

  /** Diaváltáskor az alakzat törlődik (az azonosító dián belüli). */
  setSlide(slide: number | null): void {
    this.set(this.op().slide === slide ? {} : { slide, shape: null });
  }

  shapeOptions(slide: number | null | undefined): OfficeSlideShape[] {
    return slide == null ? [] : this.shapes().filter((s) => s.slide === slide);
  }

  shapeLabel(s: OfficeSlideShape): string {
    return `#${s.id} „${s.name}” (${s.kind})${s.text ? ` - ${s.text}` : ''}`;
  }

  /** Az alakzat a listából: a név a megoldás szerinti. */
  setShape(id: number | null): void {
    const shape = this.shapeOptions(this.op().slide).find((s) => s.id === id);
    this.set({ shape: shape ? { id: shape.id, name: shape.name } : null });
  }

  /** Kézi megadás (nincs lista). */
  setShapeManual(patch: { id?: unknown; name?: string }): void {
    const current = this.op().shape ?? { id: null, name: null };
    const id = patch.id === undefined ? current.id : toInt(patch.id);
    this.set({ shape: { id: Number.isNaN(id) ? null : id, name: patch.name === undefined ? current.name : patch.name } });
  }

  togglePart(part: string): void {
    this.set({ parts: toggledParts(this.op().parts, part, PPT_FONT_PARTS) });
  }
}
