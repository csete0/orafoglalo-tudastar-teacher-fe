import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GeneratedSqlFileDto } from '../../../models/teacher-content.model';
import { byteSize } from '../../../shared/format/byte-size';

/** Az előnézetben ennyi sor látszik egy fájlból (a teljes szöveg mentésre kerül). */
const PREVIEW_LINES = 200;
/** E fölött a böngészős szerkesztő lassú lenne: letöltés, gépen szerkesztés, visszatöltés a feltöltővel. */
export const MAX_EDIT_BYTES = 200 * 1024;

/**
 * Egy elkészített SQL-fájl a „Hiányzó SQL-fájl elkészítése” előnézetében: méret és csere-jelzés, letöltés, böngészős
 * szerkesztés (csak {@link MAX_EDIT_BYTES} alatt) és visszaállítás. A szöveget és a szerkesztés állapotát a szülő tartja.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sql-gen-file',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'block' },
  template: `
    <details class="bg-bg-element rounded-xl p-3" [attr.data-testid]="'sql-gen-file-' + file().kind">
      <summary class="cursor-pointer text-sm font-medium">
        {{ file().fileName }} <span class="text-text-muted font-normal">({{ sizeLabel() }}{{ replaces() ? ' – a meglévő fájl lecserélődik' : '' }})</span>
        @if (changed()) { <span class="badge badge-warning ml-1">módosítva</span> }
      </summary>
      <div class="flex flex-wrap gap-2 mt-2">
        <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="download.emit()" [attr.data-testid]="'sql-gen-download-' + file().kind"
          [attr.aria-label]="file().fileName + ' letöltése'">Letöltés</button>
        @if (editable()) {
          <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="editToggle.emit()" [attr.aria-pressed]="editing()"
            [attr.aria-label]="file().fileName + (editing() ? ' szerkesztésének befejezése' : ' szerkesztése')"
            [attr.data-testid]="'sql-gen-edit-' + file().kind">{{ editing() ? 'Szerkesztés vége' : 'Szerkesztés' }}</button>
          @if (changed()) {
            <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="restore.emit()" [attr.data-testid]="'sql-gen-restore-' + file().kind"
              [attr.aria-label]="file().fileName + ' visszaállítása az elkészített változatra'">Visszaállítás</button>
          }
        }
      </div>
      @if (!editable()) {
        <p class="text-xs text-text-muted mt-2" [attr.data-testid]="'sql-gen-large-' + file().kind">
          Nagy fájl – töltsd le, szerkeszd a gépeden, és a feltöltővel töltsd vissza.
        </p>
      }
      @if (editing()) {
        <textarea rows="16" spellcheck="false" [attr.aria-label]="file().fileName + ' szerkesztése'" [attr.data-testid]="'sql-gen-editor-' + file().kind"
          class="input mt-2 !bg-bg-panel !px-2 !py-1 !text-xs font-mono whitespace-pre"
          [ngModel]="text()" (ngModelChange)="textChange.emit($event)" [ngModelOptions]="{ standalone: true }"></textarea>
      } @else {
        <pre class="mt-2 max-h-80 overflow-auto text-xs font-mono whitespace-pre bg-bg-panel rounded-lg p-2">{{ preview() }}</pre>
      }
    </details>
  `,
})
export class SqlGenFileComponent {
  /** Az elkészítéskor kapott fájl (a „Visszaállítás” és a „módosítva” jelzés alapja). */
  readonly file = input.required<GeneratedSqlFileDto>();
  /** A fájl jelenlegi (esetleg kézzel javított) szövege. */
  readonly text = input.required<string>();
  readonly editing = input.required<boolean>();
  /** Mentéskor egy meglévő fájl cserélődik. */
  readonly replaces = input.required<boolean>();

  readonly textChange = output<string>();
  readonly editToggle = output<void>();
  readonly restore = output<void>();
  readonly download = output<void>();

  readonly editable = computed(() => this.file().sizeBytes <= MAX_EDIT_BYTES);
  readonly changed = computed(() => this.text() !== this.file().content);

  /** A szerkesztett szöveg mérete (UTF-8 bájt) - a címkében ez látszik, nem az elkészítetté. */
  readonly sizeLabel = computed(() => {
    const file = this.file();
    const text = this.text();
    return byteSize(text === file.content ? file.sizeBytes : new TextEncoder().encode(text).length);
  });

  readonly preview = computed(() => {
    const content = this.text();
    const lines = content.split('\n');
    return lines.length <= PREVIEW_LINES
      ? content
      : `${lines.slice(0, PREVIEW_LINES).join('\n')}\n… (további ${lines.length - PREVIEW_LINES} sor - a mentés a teljes fájlt tartalmazza)`;
  });
}
