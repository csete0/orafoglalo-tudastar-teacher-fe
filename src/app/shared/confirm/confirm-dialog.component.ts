import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { DialogShellComponent } from '../dialog/dialog-shell.component';
import { IconComponent } from '../icon/icon.component';
import { ConfirmService } from './confirm.service';

/** Egyszer mountolva az AppComponent-ben; a ConfirmService.pending signal
 *  vezérli. Escape = mégse, Enter = megerősítés, backdrop-katt = mégse.
 *  A háttér, az ARIA-attribútumok, a nyitáskori autofókusz (a Megerősítés
 *  gombra) és a zárás utáni fókusz-visszaadás (UI-TT-187) a közös
 *  `app-dialog-shell` feladata.
 *  Fókusz-csapdázva: Tab/Shift+Tab csak a Mégse/Megerősítés gomb közt
 *  ciklizál, nem hagyhatja el a dialógust a háttér-oldal felé (UI-TT-28 —
 *  enélkül Shift+Tab a háttér egy MÁSIK sorának mutáló gombjára ugorhatott,
 *  aminek lenyomása jelzés nélkül a másik akciót erősítette meg). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [DialogShellComponent, IconComponent],
  template: `
    @if (confirmService.pending(); as opts) {
      <app-dialog-shell role="alertdialog" align="center" [label]="opts.title ?? 'Megerősítés'"
                        testId="confirm-dialog" backdropTestId="confirm-backdrop"
                        panelClass="card max-w-sm w-full p-6 shadow-xl"
                        (closed)="confirmService.resolve(false)"
                        (keydown)="onKeydown($event)">
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
          <button #cancelBtn class="btn btn-ghost" data-testid="confirm-cancel"
                  (click)="confirmService.resolve(false)">
            {{ opts.cancelLabel ?? 'Mégse' }}
          </button>
          <button #confirmBtn class="btn" data-testid="confirm-accept" data-dialog-autofocus
                  [class.btn-danger]="opts.danger"
                  [class.btn-primary]="!opts.danger"
                  (click)="confirmService.resolve(true)"
                  (keydown.enter)="confirmService.resolve(true)">
            {{ opts.confirmLabel ?? 'Megerősítés' }}
          </button>
        </div>
      </app-dialog-shell>
    }
  `,
})
export class ConfirmDialogComponent {
  readonly confirmService = inject(ConfirmService);

  private readonly cancelBtn = viewChild<ElementRef<HTMLButtonElement>>('cancelBtn');
  private readonly confirmBtn = viewChild<ElementRef<HTMLButtonElement>>('confirmBtn');

  /** A dialógus egyetlen két fókuszálható eleme (Mégse/Megerősítés) közt
   *  ciklizál Tab/Shift+Tab-ra, hogy a fókusz sose hagyhassa el a dialógust. */
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;

    const cancel = this.cancelBtn()?.nativeElement;
    const confirm = this.confirmBtn()?.nativeElement;
    if (!cancel || !confirm) return;

    const active = document.activeElement;
    event.preventDefault();

    if (event.shiftKey) {
      (active === cancel ? confirm : cancel).focus();
    } else {
      (active === confirm ? cancel : confirm).focus();
    }
  }
}
