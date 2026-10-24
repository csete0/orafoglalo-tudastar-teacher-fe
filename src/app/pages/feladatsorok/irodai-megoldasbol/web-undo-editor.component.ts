import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OfficeUndoOp, OfficeWebElement, WebUndoOpName } from '../../../models/office-task.model';
import { canonicalWebOp, changeWebUndoOpKind, isCssFile, isHtmlFile, MAX_REPLACE, WEB_UNDO_OP_NAMES, WEB_UNDO_OPS, webOpSpec } from '../irodai-undo.util';
import { emptyToNull, oneBasedToIndex } from './office-form.util';

type WebField = 'selector' | 'property' | 'media' | 'element' | 'attribute' | 'find' | 'original';

/**
 * Egy weblap-visszacsinálási művelet szerkesztője (az „Irodai feladat a megoldott fájlból” Visszacsinálás fülén): fájl a csomagból,
 * elem a megoldás elem-listájából (vagy kézzel), CSS-szelektor, tulajdonság, attribútum, szövegcsere. Minden módosítás a teljes, új
 * műveletet adja ki (`opChange`); a javaslat frissítése a szülőé.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-web-undo-editor',
  standalone: true,
  imports: [FormsModule],
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
      <div class="sm:col-span-2">
        <label [for]="'io-file-' + key()" class="text-xs text-text-muted block">Fájl</label>
        <select [id]="'io-file-' + key()" class="input !px-2 !py-1 !text-sm" [ngModel]="o.file ?? null"
          (ngModelChange)="setFile($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-file-' + key()">
          <option [ngValue]="null" disabled>válassz…</option>
          @for (f of fileOptions(o); track f) { <option [ngValue]="f">{{ f }}</option> }
        </select>
      </div>
      @if (has(o, 'element')) {
        @if (elementOptions(o.file).length > 0) {
          <div class="sm:col-span-2">
            <label [for]="'io-element-' + key()" class="text-xs text-text-muted block">Elem (a megoldásban; a behúzás a beágyazást mutatja)</label>
            <select [id]="'io-element-' + key()" class="input !px-2 !py-1 !text-sm font-mono" [ngModel]="o.element?.index ?? null"
              (ngModelChange)="setElement($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-element-' + key()">
              <option [ngValue]="null" disabled>válassz…</option>
              @for (e of elementOptions(o.file); track e.index) { <option [ngValue]="e.index">{{ elementLabel(e) }}</option> }
            </select>
          </div>
        } @else {
          <div>
            <label [for]="'io-element-index-' + key()" class="text-xs text-text-muted block">Az elem sorszáma a fájlban (1-től)</label>
            <input [id]="'io-element-index-' + key()" type="number" min="1" max="3000" class="input !px-2 !py-1 !text-sm"
              [ngModel]="o.element?.index == null ? null : o.element!.index! + 1" (ngModelChange)="setElementManual({ index: $event })"
              [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'io-element-index-' + key()" />
          </div>
          <div>
            <label [for]="'io-element-tag-' + key()" class="text-xs text-text-muted block">Az elem címkéje (pl. img)</label>
            <input [id]="'io-element-tag-' + key()" class="input !px-2 !py-1 !text-sm font-mono" maxlength="20" [ngModel]="o.element?.tag ?? ''"
              (ngModelChange)="setElementManual({ tag: $event })" [ngModelOptions]="{ standalone: true }"
              [attr.data-testid]="'io-element-tag-' + key()" />
          </div>
        }
      }
      @if (has(o, 'selector')) {
        <div>
          <label [for]="'io-selector-' + key()" class="text-xs text-text-muted block">CSS-szelektor (pontosan, ahogy a stíluslapban áll)</label>
          <input [id]="'io-selector-' + key()" class="input !px-2 !py-1 !text-sm font-mono" maxlength="300" [ngModel]="o.selector ?? ''"
            (ngModelChange)="set({ selector: $event })" [ngModelOptions]="{ standalone: true }" placeholder="pl. #fejlec h1"
            [attr.data-testid]="'io-selector-' + key()" />
        </div>
        <div>
          <label [for]="'io-media-' + key()" class="text-xs text-text-muted block">@media-feltétel (elhagyható = a @media blokkokon kívül)</label>
          <input [id]="'io-media-' + key()" class="input !px-2 !py-1 !text-sm font-mono" maxlength="200" [ngModel]="o.media ?? ''"
            (ngModelChange)="set({ media: emptyToNull($event) })" [ngModelOptions]="{ standalone: true }" placeholder="pl. (max-width: 600px)"
            [attr.data-testid]="'io-media-' + key()" />
        </div>
      }
      @if (has(o, 'property')) {
        <div>
          <label [for]="'io-property-' + key()" class="text-xs text-text-muted block">CSS-tulajdonság</label>
          <input [id]="'io-property-' + key()" class="input !px-2 !py-1 !text-sm font-mono" maxlength="60" [ngModel]="o.property ?? ''"
            (ngModelChange)="set({ property: $event })" [ngModelOptions]="{ standalone: true }" placeholder="pl. background-color"
            [attr.data-testid]="'io-property-' + key()" />
        </div>
      }
      @if (has(o, 'attribute')) {
        <div>
          <label [for]="'io-attribute-' + key()" class="text-xs text-text-muted block">Attribútum</label>
          <input [id]="'io-attribute-' + key()" class="input !px-2 !py-1 !text-sm font-mono" maxlength="60" [ngModel]="o.attribute ?? ''"
            (ngModelChange)="set({ attribute: $event })" [ngModelOptions]="{ standalone: true }" placeholder="pl. alt"
            [attr.data-testid]="'io-attribute-' + key()" />
        </div>
      }
      @if (canonical(o.op) === 'renameElement') {
        <div>
          <label [for]="'io-original-tag-' + key()" class="text-xs text-text-muted block">Az eredeti címke (ezt kapja a diák)</label>
          <input [id]="'io-original-tag-' + key()" class="input !px-2 !py-1 !text-sm font-mono" maxlength="20" [ngModel]="o.original ?? ''"
            (ngModelChange)="set({ original: $event })" [ngModelOptions]="{ standalone: true }" placeholder="pl. td"
            [attr.data-testid]="'io-original-tag-' + key()" />
        </div>
      }
      @if (has(o, 'find')) {
        <div>
          <label [for]="'io-find-' + key()" class="text-xs text-text-muted block">Az elem szövegében álló szövegrész (pontosan, címke nélkül)</label>
          <textarea [id]="'io-find-' + key()" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxReplace" [ngModel]="o.find ?? ''"
            (ngModelChange)="set({ find: $event })" [ngModelOptions]="{ standalone: true }"
            [attr.data-testid]="'io-find-' + key()"></textarea>
        </div>
        <div>
          <label [for]="'io-original-' + key()" class="text-xs text-text-muted block">Az eredeti szöveg (ezt kapja a diák; üres = törlés)</label>
          <textarea [id]="'io-original-' + key()" rows="2" class="input !px-2 !py-1 !text-sm" [maxlength]="maxReplace" [ngModel]="o.original ?? ''"
            (ngModelChange)="set({ original: $event })" [ngModelOptions]="{ standalone: true }"
            [attr.data-testid]="'io-original-' + key()"></textarea>
        </div>
      }
    </div>
  `,
})
export class WebUndoEditorComponent {
  readonly op = input.required<OfficeUndoOp>();
  /** A mezők id-/testid-utótagja („részfeladat-művelet” sorszám, pl. `0-1`). */
  readonly key = input.required<string>();
  /** A megoldás csomagjának fájljai. */
  readonly files = input<string[]>([]);
  /** A megoldás HTML-elemei az elem-választóhoz (üres: csak kézi megadás). */
  readonly elements = input<OfficeWebElement[]>([]);
  readonly opChange = output<OfficeUndoOp>();

  readonly opNames = WEB_UNDO_OP_NAMES;
  readonly maxReplace = MAX_REPLACE;
  readonly emptyToNull = emptyToNull;

  set(patch: Partial<OfficeUndoOp>): void {
    this.opChange.emit({ ...this.op(), ...patch });
  }

  changeKind(next: WebUndoOpName): void {
    this.opChange.emit(changeWebUndoOpKind(this.op(), next));
  }

  canonical(op: string): WebUndoOpName | null {
    return canonicalWebOp(op);
  }

  opLabel(name: WebUndoOpName): string {
    return WEB_UNDO_OPS[name].label;
  }

  has(op: OfficeUndoOp, field: WebField): boolean {
    return !!webOpSpec(op.op)?.fields.includes(field);
  }

  /** A művelethez választható fájlok: elem-művelethez a HTML-ek, CSS-hez és fájl-elhagyáshoz a HTML-ek és a stíluslapok (+ a művelet saját fájlja). */
  fileOptions(op: OfficeUndoOp): string[] {
    const htmlOnly = webOpSpec(op.op)?.on === 'html';
    const files = this.files().filter((f) => isHtmlFile(f) || (!htmlOnly && isCssFile(f)));
    return op.file && !files.includes(op.file) ? [...files, op.file] : files;
  }

  /** Fájlváltáskor az elem-horgony törlődik (a sorszám fájlon belüli). */
  setFile(file: string): void {
    this.set(this.op().element ? { file, element: { index: null, tag: null } } : { file });
  }

  elementOptions(file: string | null | undefined): OfficeWebElement[] {
    return file ? this.elements().filter((e) => e.file === file) : [];
  }

  elementLabel(e: OfficeWebElement): string {
    const name = e.tag + (e.id ? `#${e.id}` : '') + (e.class ? '.' + e.class.trim().split(/\s+/).join('.') : '');
    const detail = e.text ? ` „${e.text}”` : e.attributes ? ` ${e.attributes}` : '';
    return `${'  '.repeat(Math.min(e.depth, 8))}[${e.index + 1}] <${name}>${detail}`;
  }

  /** Az elem a listából: a címke a megoldás szerinti. */
  setElement(index: number | null): void {
    const el = this.elementOptions(this.op().file).find((e) => e.index === index);
    this.set({ element: el ? { index: el.index, tag: el.tag } : { index: null, tag: null } });
  }

  /** Kézi megadás (nincs lista): a sorszám a felületen 1-től. */
  setElementManual(patch: { index?: unknown; tag?: string }): void {
    const current = this.op().element ?? { index: null, tag: null };
    this.set({
      element: {
        index: patch.index === undefined ? current.index : oneBasedToIndex(patch.index),
        tag: patch.tag === undefined ? current.tag : patch.tag,
      },
    });
  }
}
