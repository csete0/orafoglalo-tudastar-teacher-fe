import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthStore } from './services/auth/store/auth.store';
import { AppSidebarComponent } from './shared/app-sidebar/app-sidebar.component';
import { ConfirmDialogComponent } from './shared/confirm/confirm-dialog.component';
import { ToastComponent } from './shared/toast/toast.component';

// §3 migráció (PATRICKS-ADMIN-SZETVALASZTAS-TERV.md): a platform-admin menüpontok
// (jelentkezések/tanárok/intézmények/ellenőrzés/AI-költés) mind admin-fe-be
// költöztek - ez az app csak a admin/kvizek dashboard-kártyát tartja meg
// (ld. dashboard.component.ts), ami nem kap menüpontot.

/** Az alkalmazás-keret: bejelentkezve bal oldali menü (mobilon felső sáv + drawer) + tartalom. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AppSidebarComponent, ToastComponent, ConfirmDialogComponent],
  template: `
    <div class="min-h-screen lg:flex">
      @if (authStore.isAuthenticated()) {
        <app-sidebar />
      }
      <main class="flex-1 min-w-0">
        <router-outlet />
      </main>
    </div>

    <app-toast />
    <app-confirm-dialog />
  `,
})
export class AppComponent {
  readonly authStore = inject(AuthStore);
}
