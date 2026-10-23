import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { SafeHtml } from '@angular/platform-browser';

/** Egy weblap élő előnézete (`sandbox=""` iframe srcdoc-ja), vagy miért nem készült el. */
export interface WebFrame {
  html: SafeHtml | null;
  error: string | null;
}

/** A megoldás és a kiinduló oldal előnézete; null = még töltődik. */
export type WebPreview = { solution: WebFrame; source: WebFrame } | null;

/**
 * Weblap-előnézet (az „Irodai feladat a megoldott fájlból” Előnézet fülén): a megoldás és a kiinduló oldal egymás mellett, szkript
 * nélküli `sandbox=""` iframe-ben, asztali vagy telefonos (390 px) szélességben. A csomagok letöltése és átalakítása a szülőé.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-web-preview-frame',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="space-y-3" data-testid="io-web-preview">
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span id="io-web-width-label" class="font-medium">Szélesség:</span>
        <div role="group" aria-labelledby="io-web-width-label" class="flex gap-1">
          <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" [attr.aria-pressed]="!phone()" (click)="phone.set(false)" data-testid="io-web-desktop">Asztali</button>
          <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" [attr.aria-pressed]="phone()" (click)="phone.set(true)" data-testid="io-web-phone">Telefon (390 px)</button>
        </div>
        <span class="text-text-muted">A szkriptek nem futnak, a külső (internetes) hivatkozások nem töltődnek be.</span>
      </div>
      @if (preview(); as wp) {
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          @for (f of [{ id: 'solution', label: 'Megoldás', d: wp.solution }, { id: 'source', label: 'Kiinduló oldal', d: wp.source }]; track f.id) {
            <div class="min-w-0" [attr.data-testid]="'io-web-' + f.id">
              <h3 class="font-semibold text-sm mb-1">{{ f.label }}</h3>
              @if (f.d.html; as html) {
                <div class="overflow-x-auto">
                  <iframe sandbox="" [srcdoc]="html" [title]="f.label + ' - élő előnézet'" class="h-[28rem] max-w-full rounded-lg border border-border-default bg-white"
                    [style.width]="phone() ? '390px' : '100%'"></iframe>
                </div>
              } @else {
                <p class="text-sm text-text-muted">{{ f.d.error }}</p>
              }
            </div>
          }
        </div>
      } @else {
        <p class="text-sm text-text-muted" role="status">Előnézet betöltése…</p>
      }
    </div>
  `,
})
export class WebPreviewFrameComponent {
  readonly preview = input<WebPreview>(null);
  /** Telefonos (390 px) szélesség - a szülő tartja, így fülváltás után is megmarad. */
  readonly phone = model(false);
}
