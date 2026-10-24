import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AiCodeTaskMode, AiCodeTaskProposal, AiCodeTaskReport } from '../../../models/ai-code-task.model';
import { saveBlob } from '../../../shared/save-blob.util';
import { AiTaskPreviewState } from './ai-task-preview.state';

/** Az adatfájl előnézetében ennyi sor látszik. */
const PREVIEW_LINES = 40;

export function head(content: string): string {
  const lines = content.split('\n');
  return lines.length <= PREVIEW_LINES ? content : `${lines.slice(0, PREVIEW_LINES).join('\n')}\n… (további ${lines.length - PREVIEW_LINES} sor)`;
}

/** Előnézet „Adatfájl” fül: fájlnév, generáló szkript, a kapott fájl eleje, letöltés és saját változat betöltése. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-task-data-file-tab',
  standalone: true,
  host: { class: 'block' },
  imports: [FormsModule],
  template: `
    @let p = proposal();
    <div class="space-y-3" data-testid="ai-task-panel-adatfajl">
      @if (p.existingInputFiles.length > 0) {
        <p class="text-sm">
          {{ mode() === 'new' ? 'A feladatsor bemeneti fájljai (az új feladat ellenőrzése is ezekkel fut):' : 'A feladat meglévő bemeneti fájljai (ezekkel fut a megoldás):' }}
          @for (f of p.existingInputFiles; track f; let last = $last) { <span class="font-mono">{{ f }}</span>{{ last ? '' : ', ' }} }
        </p>
      }
      @if (p.dataFile; as df) {
        <div>
          <label for="ai-task-df-name" class="text-sm font-medium block mb-1">Fájlnév</label>
          <input id="ai-task-df-name" class="input !px-2 !py-1 font-mono !text-sm sm:!w-80" maxlength="120" [ngModel]="df.fileName"
            (ngModelChange)="state.setDataFileName($event)" [ngModelOptions]="{ standalone: true }" />
        </div>
        <div>
          <label for="ai-task-df-generator" class="text-sm font-medium block mb-1">Generáló szkript (Python)</label>
          <p class="text-xs text-text-muted mb-1">
            A fájlt ez a szkript írja ki rögzített véletlenmaggal - átírhatod (pl. több sor). Módosítás után az Újraellenőrzés futtatja le újra.
          </p>
          <textarea id="ai-task-df-generator" rows="12" spellcheck="false" class="input !px-2 !py-1 !text-xs font-mono whitespace-pre"
            [ngModel]="df.generatorPython ?? ''" (ngModelChange)="state.setGenerator($event)" [ngModelOptions]="{ standalone: true }"
            data-testid="ai-task-df-generator"></textarea>
        </div>
        <div class="bg-bg-element rounded-xl p-3 space-y-2" data-testid="ai-task-df-content">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-medium">A kapott fájl eleje</span>
            @if (state.dataFileInfo(); as info) { <span class="text-xs text-text-muted">{{ info }}</span> }
          </div>
          @if (df.content !== null) {
            <pre class="max-h-72 overflow-auto text-xs font-mono whitespace-pre bg-bg-panel rounded-lg p-2">{{ head(df.content) }}</pre>
          } @else {
            <p class="text-sm text-text-muted">A módosított szkriptet az Újraellenőrzés futtatja le, utána itt látod az eredményt.</p>
          }
          @let checked = report().dataFile;
          @if (checked && !checked.generated) {
            <p class="text-xs text-warning">Kézzel betöltött fájl - a generáló szkript nem fut, ez a tartalom mentődik.</p>
          }
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="download()" [disabled]="df.content === null"
              [attr.aria-label]="df.fileName + ' letöltése'" data-testid="ai-task-df-download">Letöltés</button>
            <label class="btn btn-ghost !px-2 !py-1 text-sm">
              Saját változat betöltése
              <input #upload type="file" accept=".txt,text/plain" class="sr-only" (change)="load(upload)" data-testid="ai-task-df-upload" />
            </label>
          </div>
          <p class="text-xs text-text-muted">Nagy fájlnál: töltsd le, szerkeszd a gépeden, majd töltsd vissza (legfeljebb 1 MB).</p>
          @if (state.dataFileError()) { <p class="text-sm text-danger" role="alert">{{ state.dataFileError() }}</p> }
        </div>
      } @else if (p.existingInputFiles.length === 0) {
        <p class="text-sm text-text-muted">Ehhez a feladathoz nem kell bemeneti adatfájl.</p>
      }
    </div>
  `,
})
export class AiTaskDataFileTabComponent {
  readonly state = inject(AiTaskPreviewState);
  readonly mode = input.required<AiCodeTaskMode>();
  readonly proposal = input.required<AiCodeTaskProposal>();
  readonly report = input.required<AiCodeTaskReport>();
  readonly head = head;

  async load(inputEl: HTMLInputElement): Promise<void> {
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (file) await this.state.loadDataFile(file);
  }

  download(): void {
    const df = this.proposal().dataFile;
    if (!df || df.content === null) return;
    saveBlob(new Blob([df.content], { type: 'text/plain;charset=utf-8' }), df.fileName);
  }
}
