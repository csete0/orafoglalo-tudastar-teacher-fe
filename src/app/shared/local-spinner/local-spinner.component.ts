import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Egyszerű, inline betöltés-jelző — a diák-app local-spinner-ének
 *  világos-téma adaptációja (glow/blur nélkül). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-local-spinner',
  standalone: true,
  template: `
    <div class="flex flex-col items-center justify-center gap-3 py-10" role="status">
      <div class="w-10 h-10 rounded-full animate-spin"
           style="border: 3px solid var(--color-border-default); border-top-color: var(--color-primary);"></div>
      @if (label()) {
        <p class="text-sm text-text-muted">{{ label() }}</p>
      }
    </div>
  `,
})
export class LocalSpinnerComponent {
  readonly label = input<string>('Betöltés…');
}
