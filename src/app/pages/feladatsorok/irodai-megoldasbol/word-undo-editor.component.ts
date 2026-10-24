import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OfficeParagraphAnchor, OfficeUndoOp, OfficeWordParagraph, WordUndoOpName } from '../../../models/office-task.model';
import { canonicalWordOp, changeWordUndoOpKind, MAX_REPLACE, WORD_FIELDS, WORD_PARTS, WORD_UNDO_OP_NAMES, WORD_UNDO_OPS, wordOpSpec } from '../irodai-undo.util';
import { WordParagraphPickerComponent } from '../word-paragraph-picker.component';
import { oneBasedToIndex, toggledParts } from './office-form.util';

type WordField = 'from' | 'to' | 'parts' | 'index' | 'section' | 'field' | 'find' | 'original';

/**
 * Egy Word-visszacsinálási művelet szerkesztője (az „Irodai feladat a megoldott fájlból” Visszacsinálás fülén): bekezdés-horgonyok
 * a megoldás bekezdéseiből, szövegcsere, sorszám, szakasz, mező, visszaállítandó részek. Minden módosítás a teljes, új műveletet
 * adja ki (`opChange`); a javaslat frissítése a szülőé.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-word-undo-editor',
  standalone: true,
  imports: [FormsModule, WordParagraphPickerComponent],
  host: { class: 'block' },
  template: `
    @let o = op();
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2" [attr.data-testid]="'io-undo-editor-' + key()">
      <div class="sm:col-span-2">
        <label [for]="'io-op-' + key()" class="text-xs text-text-muted block">Művelet</label>
        <select [id]="'io-op-' + key()" class="input !px-2 !py-1 !text-sm" [ngModel]="canonical(o.op)"
          (ngModelChange)="changeKind($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-op-' + key()">
          @for (n of opNames; track n) { <option [ngValue]="n">{{ opLabel(n) }}</option> }
        </select>
      </div>
      @if (has(o, 'from')) {
        <div class="sm:col-span-2">
          <app-word-paragraph-picker [testId]="'io-from-' + key()" [anchor]="o.from"
            [label]="canonical(o.op) === 'replaceText' ? 'Bekezdés' : canonical(o.op) === 'removeHyperlinks' ? 'Első bekezdés (elhagyható = az egész dokumentum, élőfejjel, élőlábbal, jegyzetekkel együtt)' : 'Első bekezdés'"
            [optional]="canonical(o.op) === 'removeHyperlinks'" clearLabel="Az egész dokumentum"
            [paragraphs]="paragraphs()" [unavailable]="paragraphsUnavailable()"
            (anchorChange)="setFrom($event)" />
        </div>
      }
      @if (has(o, 'to') && canonical(o.op) !== 'replaceText' && o.from) {
        <div class="sm:col-span-2">
          <app-word-paragraph-picker [testId]="'io-to-' + key()" [anchor]="o.to" label="Utolsó bekezdés (elhagyható = csak az első)"
            [optional]="true" clearLabel="Csak az első bekezdés" [minIndex]="o.from.index ?? 0"
            [paragraphs]="paragraphs()" [unavailable]="paragraphsUnavailable()"
            (anchorChange)="set({ to: $event })" />
        </div>
      }
      @if (has(o, 'find')) {
        <div>
          <label [for]="'io-find-' + key()" class="text-xs text-text-muted block">A megoldásban álló szövegrész (pontosan)</label>
          <textarea [id]="'io-find-' + key()" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxReplace" [ngModel]="o.find ?? ''"
            (ngModelChange)="set({ find: $event })" [ngModelOptions]="{ standalone: true }"
            [attr.data-testid]="'io-find-' + key()"></textarea>
        </div>
        <div>
          <label [for]="'io-original-' + key()" class="text-xs text-text-muted block">Az eredeti szöveg (ezt kapja a diák; üres = törlés; sortörés megengedett, tabulátor nem)</label>
          <textarea [id]="'io-original-' + key()" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxReplace" [ngModel]="o.original ?? ''"
            (ngModelChange)="set({ original: $event })" [ngModelOptions]="{ standalone: true }"
            [attr.data-testid]="'io-original-' + key()"></textarea>
        </div>
      }
      @if (has(o, 'index')) {
        <div>
          <label [for]="'io-index-' + key()" class="text-xs text-text-muted block">A(z) {{ indexOf(o) }} sorszáma a dokumentumban (1-től)</label>
          <input [id]="'io-index-' + key()" type="number" min="1" max="1000" class="input !px-2 !py-1 !text-sm"
            [ngModel]="o.index == null ? null : o.index + 1" (ngModelChange)="set({ index: oneBasedToIndex($event) })"
            [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-index-' + key()" />
        </div>
      }
      @if (has(o, 'section')) {
        <div>
          <label [for]="'io-section-' + key()" class="text-xs text-text-muted block">Szakasz</label>
          <select [id]="'io-section-' + key()" class="input !px-2 !py-1 !text-sm" [ngModel]="o.section ?? null"
            (ngModelChange)="set({ section: $event })" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-section-' + key()">
            <option [ngValue]="null">minden szakasz</option>
            @for (n of sectionOptions(o); track n) { <option [ngValue]="n">{{ n + 1 }}. szakasz</option> }
          </select>
        </div>
      }
      @if (has(o, 'field')) {
        <div>
          <label [for]="'io-field-' + key()" class="text-xs text-text-muted block">Mező</label>
          <select [id]="'io-field-' + key()" class="input !px-2 !py-1 !text-sm" [ngModel]="o.field ?? null"
            (ngModelChange)="set({ field: $event })" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-field-' + key()">
            <option [ngValue]="null" disabled>válassz…</option>
            @for (f of fields; track f.key) { <option [ngValue]="f.key">{{ f.key }} - {{ f.label }}</option> }
          </select>
        </div>
      }
      @if (has(o, 'parts')) {
        <fieldset class="sm:col-span-2">
          <legend class="text-xs text-text-muted">Mit állítson vissza? (semmi bejelölve = mindent)</legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            @for (part of parts(o); track part.key) {
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
export class WordUndoEditorComponent {
  readonly op = input.required<OfficeUndoOp>();
  /** A mezők id-/testid-utótagja („részfeladat-művelet” sorszám, pl. `0-1`). */
  readonly key = input.required<string>();
  /** A megoldás bekezdései a horgony-választóhoz (null: nem érhető el - csak kézi megadás). */
  readonly paragraphs = input<OfficeWordParagraph[] | null>(null);
  /** Miért nincs bekezdés-lista. */
  readonly paragraphsUnavailable = input<string | null>(null);
  readonly opChange = output<OfficeUndoOp>();

  readonly opNames = WORD_UNDO_OP_NAMES;
  readonly fields = WORD_FIELDS;
  readonly maxReplace = MAX_REPLACE;
  readonly oneBasedToIndex = oneBasedToIndex;

  set(patch: Partial<OfficeUndoOp>): void {
    this.opChange.emit({ ...this.op(), ...patch });
  }

  changeKind(next: WordUndoOpName): void {
    this.opChange.emit(changeWordUndoOpKind(this.op(), next));
  }

  /** A „from” törlésével (removeHyperlinks: az egész dokumentum) a „to” is megszűnik. */
  setFrom(anchor: OfficeParagraphAnchor | null): void {
    this.set(anchor ? { from: anchor } : { from: null, to: null });
  }

  togglePart(part: string): void {
    const op = this.op();
    this.set({ parts: toggledParts(op.parts, part, this.parts(op)) });
  }

  canonical(op: string): WordUndoOpName | null {
    return canonicalWordOp(op);
  }

  opLabel(name: WordUndoOpName): string {
    return WORD_UNDO_OPS[name].label;
  }

  has(op: OfficeUndoOp, field: WordField): boolean {
    return !!wordOpSpec(op.op)?.fields.includes(field);
  }

  indexOf(op: OfficeUndoOp): string {
    return wordOpSpec(op.op)?.indexOf ?? 'elem';
  }

  parts(op: OfficeUndoOp): { key: string; label: string }[] {
    const name = canonicalWordOp(op.op);
    return (name && WORD_PARTS[name]) || [];
  }

  /** 0-9. szakasz (a felületen 1-10.; és a művelet saját, nagyobb sorszáma, ha van). */
  sectionOptions(op: OfficeUndoOp): number[] {
    const count = Math.max(10, (op.section ?? 0) + 1);
    return Array.from({ length: count }, (_, i) => i);
  }
}
