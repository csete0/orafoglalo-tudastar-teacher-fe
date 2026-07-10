import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { ConfirmService } from './confirm.service';

/** Egyszer mountolva az AppComponent-ben; a ConfirmService.pending signal
 *  vezérli. Escape = mégse, Enter = megerősítés, backdrop-katt = mégse.
 *  Teljes fókusz-csapda szándékosan nincs (kis hatókör) — a megerősítő
 *  gomb kap autofókuszt. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (confirmService.pending(); as opts) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4"
           (keydown.escape)="confirmService.resolve(false)">
        <div class="absolute inset-0 bg-black/40" (click)="confirmService.resolve(false)"></div>
        <div role="alertdialog" aria-modal="true" data-testid="confirm-dialog"
             [attr.aria-label]="opts.title ?? 'Megerősítés'"
             class="card relative max-w-sm w-full p-6 shadow-xl">
          <div class="flex items-start gap-4">
            <div class="icon-tile" [class]="opts.danger ? 'icon-tile-danger' : 'icon-tile-warning'">
              <app-icon name="warning-triangle" class="w-6 h-6 block" />
            </div>
            <div class="flex-1 min-w-0">
              <h2 class="font-bold mb-1">{{ opts.title ?? 'Megerősítés' }}</h2>
              <p class="text-sm text-text-muted whitespace-pre-line">{{ opts.message }}</p>
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-6">
            <button class="btn btn-ghost" data-testid="confirm-cancel"
                    (click)="confirmService.resolve(false)">
              {{ opts.cancelLabel ?? 'Mégse' }}
            </button>
            <button #confirmBtn class="btn" data-testid="confirm-accept"
                    [class.btn-danger]="opts.danger"
                    [class.btn-primary]="!opts.danger"
                    (click)="confirmService.resolve(true)"
                    (keydown.enter)="confirmService.resolve(true)">
              {{ opts.confirmLabel ?? 'Megerősítés' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogComponent {
  readonly confirmService = inject(ConfirmService);

  private readonly confirmBtn = viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');

  constructor() {
    // Autofókusz a megerősítő gombra, amint a dialógus megjelenik —
    // így az Enter/Escape azonnal működik egérmozgatás nélkül.
    effect(() => {
      if (this.confirmService.pending()) {
        setTimeout(() => this.confirmBtn()?.nativeElement.focus());
      }
    });
  }
}
