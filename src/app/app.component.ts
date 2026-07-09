import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthStore } from './services/auth/store/auth.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="border-b border-border-default bg-bg-panel">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <a routerLink="/dashboard" class="font-semibold">PaTricks Tanári Felület</a>

        @if (authStore.isAuthenticated()) {
          <nav class="flex items-center gap-4 text-sm">
            <a routerLink="/intezmenyek" class="hover:text-primary">Intézmények</a>
            <a routerLink="/csoportok" class="hover:text-primary">Csoportok</a>
            <a routerLink="/feladatsorok" class="hover:text-primary">Feladatsorok</a>
            @if (authStore.hasAdminRole()) {
              <a routerLink="/admin/jelentkezesek" class="hover:text-primary">Jelentkezések</a>
            }
            <button (click)="logout()" class="text-text-muted hover:text-danger">Kilépés</button>
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
