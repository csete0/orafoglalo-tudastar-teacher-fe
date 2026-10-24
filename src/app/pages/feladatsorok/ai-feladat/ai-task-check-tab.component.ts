import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { AiCodeTaskProposal, AiCodeTaskReport } from '../../../models/ai-code-task.model';
import { byteSize } from '../../../shared/format/byte-size';
import { IconComponent } from '../../../shared/icon/icon.component';
import { languageBadge, languageName, languageStatusLabel, sectionLabel, sectionOk } from './ai-task.constants';
import { AiTaskPreviewState } from './ai-task-preview.state';

/** Előnézet „Ellenőrzés” fül: figyelmeztetések, adatfájl-összegzés és a nyelvenkénti futtatási riport részfeladatonként. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-task-check-tab',
  standalone: true,
  host: { class: 'block' },
  imports: [IconComponent],
  template: `
    @let r = report();
    <div class="space-y-3" data-testid="ai-task-panel-ellenorzes">
      @if (state.dirty()) {
        <p class="text-sm text-warning">Ez a módosítások előtti ellenőrzés eredménye - futtasd le újra.</p>
      }
      @if (proposal().isRandom) {
        <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning flex items-start gap-2" data-testid="ai-task-random">
          <app-icon name="warning-triangle" class="w-4 h-4 block shrink-0 mt-0.5" />
          <span>Véletlenszerű bemenet - nem ellenőrizhető automatikusan: a feladat véletlenszámosnak van jelölve, így a diákok kimenetét a
          rendszer nem tudja a mintamegoldáséhoz mérni.</span>
        </p>
      }
      @if (r.warnings.length > 0) {
        <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" data-testid="ai-task-warnings">
          <p class="font-semibold mb-1 flex items-center gap-2"><app-icon name="warning-triangle" class="w-4 h-4 block" /> Nézd át:</p>
          <ul class="list-disc pl-5 space-y-0.5 break-words">
            @for (w of r.warnings; track $index) { <li>{{ w }}</li> }
          </ul>
        </div>
      }
      @if (r.dataFile; as d) {
        <p class="text-sm">Adatfájl: <span class="font-mono">{{ d.fileName }}</span> - {{ d.lineCount }} sor, {{ byteSize(d.sizeBytes) }}{{ d.generated ? ' (a szkript készítette)' : ' (kézzel betöltve)' }}</p>
      }
      @for (l of r.languages; track l.language) {
        <div class="bg-bg-element rounded-xl p-3 space-y-2" [attr.data-testid]="'ai-task-check-' + l.language">
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-semibold text-sm">{{ languageName(l.language) }}</span>
            <span class="badge" [class]="languageBadge(l)">{{ languageStatusLabel(l) }}</span>
            @if (l.deterministic === true) { <span class="text-xs text-text-muted">kétszer futtatva azonos kimenet</span> }
            @if (l.deterministic === false) {
              <span class="badge badge-warning" data-testid="ai-task-nondeterministic">nem determinisztikus</span>
            }
          </div>
          @if (l.error) { <p class="text-sm text-danger break-words whitespace-pre-wrap">{{ l.error }}</p> }
          <ul class="space-y-2">
            @for (s of l.sections; track $index) {
              <li class="text-sm">
                <div class="flex flex-wrap items-center gap-2">
                  @if (sectionOk(s)) {
                    <span class="text-success font-bold" aria-hidden="true">✔</span>
                  } @else {
                    <span class="text-danger font-bold" aria-hidden="true">✘</span>
                  }
                  <span>{{ s.label || s.order + '.' }} ({{ s.section }}. feladat)</span>
                  <span class="text-xs" [class.text-text-muted]="s.status === 'ok'" [class.text-warning]="s.status === 'format'"
                    [class.text-danger]="!sectionOk(s)">{{ sectionLabel(s) }}</span>
                </div>
                @if (s.preview) {
                  <pre class="mt-1 max-h-32 overflow-auto text-xs font-mono whitespace-pre bg-bg-panel rounded-lg p-2">{{ s.preview }}</pre>
                }
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class AiTaskCheckTabComponent {
  readonly state = inject(AiTaskPreviewState);
  readonly proposal = input.required<AiCodeTaskProposal>();
  readonly report = input.required<AiCodeTaskReport>();

  readonly byteSize = byteSize;
  readonly languageName = languageName;
  readonly languageBadge = languageBadge;
  readonly languageStatusLabel = languageStatusLabel;
  readonly sectionOk = sectionOk;
  readonly sectionLabel = sectionLabel;
}
