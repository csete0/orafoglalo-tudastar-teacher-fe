import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon/icon.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="max-w-md mx-auto px-4 py-20 text-center flex flex-col items-center gap-4">
      <div class="icon-tile icon-tile-neutral !w-16 !h-16">
        <app-icon name="warning-triangle" class="w-8 h-8 block" />
      </div>
      <h1 class="text-6xl font-black tracking-tight">404</h1>
      <p class="text-text-muted">Az oldal nem található.</p>
      <a routerLink="/dashboard" class="btn btn-primary">Vissza a vezérlőpultra</a>
    </div>
  `,
})
export class NotFoundComponent {}
