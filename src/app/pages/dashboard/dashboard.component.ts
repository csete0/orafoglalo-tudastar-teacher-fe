import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../services/auth/store/auth.store';
import { IconComponent, IconName } from '../../shared/icon/icon.component';

interface DashboardCard {
  path: string;
  title: string;
  description: string;
  icon: IconName;
  accent: string;
  tile: string;
}

const CARDS: DashboardCard[] = [
  {
    path: '/intezmenyek',
    title: 'Intézményeim',
    description: 'Iskolák és szervezetek, tanári tagságok és igazgatói riportok.',
    icon: 'building',
    accent: 'accent-0',
    tile: 'icon-tile-primary',
  },
  {
    path: '/csoportok',
    title: 'Csoportjaim',
    description: 'Diák-csoportok meghívó kóddal, eredmények és ranglisták.',
    icon: 'users',
    accent: 'accent-1',
    tile: 'icon-tile-secondary',
  },
  {
    path: '/feladatsorok',
    title: 'Feladatsoraim',
    description: 'Saját feladatsorok szerkesztése, fájlok és publikálás.',
    icon: 'clipboard-list',
    accent: 'accent-2',
    tile: 'icon-tile-success',
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Üdv, {{ authStore.currentUser()?.firstName }}!</h1>
      <p class="text-sm text-text-muted mt-1">Tanári vezérlőpult</p>
      <div class="hairline"></div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        @for (card of cards; track card.path) {
          <a [routerLink]="card.path" class="card-link block group" [class]="card.accent">
            <div class="accent-bar"></div>
            <div class="p-5">
              <div class="icon-tile mb-3" [class]="card.tile">
                <app-icon [name]="card.icon" class="w-6 h-6 block" />
              </div>
              <h2 class="font-bold mb-1">{{ card.title }}</h2>
              <p class="text-xs text-text-muted mb-4">{{ card.description }}</p>
              <div class="flex items-center gap-1 pt-3 border-t border-border-default text-sm text-primary">
                Megnyitás
                <app-icon name="arrow-right" class="w-4 h-4 block transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </a>
        }
      </div>
    </div>
  `,
})
export class DashboardComponent {
  readonly authStore = inject(AuthStore);
  readonly cards = CARDS;
}
