import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="max-w-md mx-auto px-4 py-20 text-center">
      <h1 class="text-2xl font-semibold mb-2">404</h1>
      <p class="text-text-muted mb-6">Az oldal nem található.</p>
      <a routerLink="/dashboard" class="text-primary hover:underline">Vissza a vezérlőpultra</a>
    </div>
  `,
})
export class NotFoundComponent {}
