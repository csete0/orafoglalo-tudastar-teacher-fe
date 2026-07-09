import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../services/auth/store/auth.store';

/** Placeholder — a Fázis 8 tölti fel widgetekkel (összesítők, gyors linkek). */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="text-xl font-semibold mb-2">Üdv, {{ authStore.currentUser()?.firstName }}!</h1>
      <p class="text-text-muted mb-8">Tanári vezérlőpult</p>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a routerLink="/intezmenyek" class="block bg-bg-panel border border-border-default rounded-lg p-4 hover:border-primary">
          Intézményeim
        </a>
        <a routerLink="/csoportok" class="block bg-bg-panel border border-border-default rounded-lg p-4 hover:border-primary">
          Csoportjaim
        </a>
        <a routerLink="/feladatsorok" class="block bg-bg-panel border border-border-default rounded-lg p-4 hover:border-primary">
          Feladatsoraim
        </a>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  readonly authStore = inject(AuthStore);
}
