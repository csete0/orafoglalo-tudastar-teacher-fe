import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthStore } from './services/auth/store/auth.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="border-b border-border-default bg-bg-panel shadow-sm">
      <div class="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <a routerLink="/dashboard" aria-label="PaTricks Tanári Felület"
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center shadow-sm">
          <img src="assets/patricks/patricks_logo.png" alt="" class="w-6 h-6 object-contain" />
        </a>

        @if (authStore.isAuthenticated()) {
          <nav class="flex items-center gap-4 text-sm">
            <a routerLink="/intezmenyek" class="hover:text-primary transition-colors">Intézmények</a>
            <a routerLink="/csoportok" class="hover:text-primary transition-colors">Csoportok</a>
            <a routerLink="/feladatsorok" class="hover:text-primary transition-colors">Feladatsorok</a>
            @if (authStore.hasAdminRole()) {
              <a routerLink="/admin/jelentkezesek" class="hover:text-primary transition-colors">Jelentkezések</a>
              <a routerLink="/admin/tanarok" class="hover:text-primary transition-colors">Tanárok</a>
              <a routerLink="/admin/intezmenyek" class="hover:text-primary transition-colors">Intézmények (admin)</a>
            }
            <button (click)="logout()" class="text-text-muted hover:text-danger transition-colors">Kilépés</button>
          </nav>
        }
      </div>
    </header>

    <main>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {
  private readonly router = inject(Router);
  readonly authStore = inject(AuthStore);

  logout(): void {
    this.authStore.logout(() => this.router.navigateByUrl('/login'));
  }
}
