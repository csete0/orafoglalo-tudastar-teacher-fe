import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { IconComponent, IconName } from '../icon/icon.component';
import { ToastService, ToastState } from './toast.service';

const STATE_ICON: Record<ToastState, IconName> = {
  success: 'check',
  warning: 'warning-triangle',
  danger: 'x',
};

/** Egyszer mountolva az AppComponent-ben. A diák-app toastjának
 *  egyszerűsített, világos-téma adaptációja (shine/glow/blur nélkül). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-toast',
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (toastService.toast(); as t) {
      <div role="alert" data-testid="toast"
           class="fixed z-50 top-5 left-1/2 -translate-x-1/2 w-[calc(100%-2.5rem)] max-w-md
                  md:left-auto md:translate-x-0 md:right-5 md:w-auto
                  flex items-center gap-3 rounded-2xl border bg-bg-panel shadow-lg p-3 pr-4 animate-toast-in"
           [class.border-success]="t.state === 'success'"
           [class.border-warning]="t.state === 'warning'"
           [class.border-danger]="t.state === 'danger'">
        <div class="icon-tile w-9 h-9 text-white"
             [class.bg-success]="t.state === 'success'"
             [class.bg-warning]="t.state === 'warning'"
             [class.bg-danger]="t.state === 'danger'">
          <app-icon [name]="icon(t.state)" class="w-5 h-5 block" />
        </div>
        <p class="text-sm font-medium flex-1">{{ t.message }}</p>
        <button (click)="toastService.dismiss()" aria-label="Bezárás"
                class="text-text-muted hover:text-text-primary transition-colors">
          <app-icon name="x" class="w-4 h-4 block" />
        </button>
      </div>
    }
  `,
  styles: [
    `
      @keyframes toast-in {
        from { opacity: 0; transform: translateY(-0.75rem); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-toast-in { animation: toast-in 200ms ease-out; }
      /* Mobilon a középre igazító -translate-x-1/2 és az animáció transformja
         ütközne — md alatt csak fade. */
      @media (max-width: 767px) {
        .animate-toast-in { animation-name: toast-in-fade; }
        @keyframes toast-in-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      }
    `,
  ],
})
export class ToastComponent {
  readonly toastService = inject(ToastService);

  icon(state: ToastState): IconName {
    return STATE_ICON[state];
  }
}
