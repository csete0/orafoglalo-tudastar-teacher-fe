import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { AiCodeTaskMode } from '../../../models/ai-code-task.model';
import { LocalSpinnerComponent } from '../../../shared/local-spinner/local-spinner.component';

/** Az AI-feladat 2. lépése: a háttérben futó készítés haladása (a bezárás a jobot nem állítja le). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-task-progress',
  standalone: true,
  host: { class: 'block' },
  imports: [LocalSpinnerComponent],
  template: `
    <!-- ── 2. Készítés a háttérben ───────────────── -->
    <div class="space-y-3" data-testid="ai-task-running">
      <div role="status" aria-live="polite">
        <app-local-spinner [label]="progressText() || 'Indítás…'" />
      </div>
      <p class="text-sm text-text-muted text-center">
        {{ mode() === 'new' ? 'Az AI megírja a feladatot és a mintamegoldást' : 'Az AI megírja a hiányzó részeket' }}, majd a rendszer
        lefuttatja a megoldást a futtatón. Ez néhány percig is tarthat.
        Ha bezárod az ablakot, a készítés a háttérben folytatódik, és a gombbal később újra megnyithatod.
      </p>
      @if (pollError()) {
        <p class="text-sm text-danger text-center" role="alert" data-testid="ai-task-poll-error">{{ pollError() }}</p>
      }
      <div class="flex justify-center">
        <button type="button" class="btn btn-ghost" (click)="closed.emit()">Bezárás</button>
      </div>
    </div>
  `,
})
export class AiTaskProgressComponent {
  readonly mode = input.required<AiCodeTaskMode>();
  readonly progressText = input<string | null>(null);
  readonly pollError = input<string | null>(null);
  readonly closed = output<void>();
}
