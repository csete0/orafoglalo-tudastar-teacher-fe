import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Fülsáv a tanári tartalom fajtái között (feladatsorok, kvízek, Projektműhely-projektek).
 *
 * A bal oldali menüben mindhárom saját menüpontot kap; a fülsáv azért marad, mert a
 * tartalom-oldalakon belül egy kattintással vált a rokon listák között (összecsukott
 * ikonsávnál és mobilon, a drawer megnyitása nélkül is).
 *
 * A `routerLinkActive` a feladatsor-fülön `[routerLinkActiveOptions]="{ exact: true }"`-t
 * használ: enélkül a `/feladatsorok` prefix a `/feladatsorok/kvizek` útvonalon is aktívnak
 * jelölné, tehát MINDKÉT fül egyszerre látszana kiválasztottnak.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tartalom-fulek',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="flex gap-1 mt-4 border-b border-border" aria-label="Tartalom típusa">
      <a
        routerLink="/feladatsorok"
        routerLinkActive="tab-active"
        [routerLinkActiveOptions]="{ exact: true }"
        class="tab-link"
      >
        Feladatsorok
      </a>
      <a routerLink="/feladatsorok/kvizek" routerLinkActive="tab-active" class="tab-link"> Kvízek </a>
      <a routerLink="/feladatsorok/projektek" routerLinkActive="tab-active" class="tab-link"> Projektek </a>
    </nav>
  `,
  styles: [
    `
      .tab-link {
        padding: 0.5rem 1rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-text-muted, #6b7280);
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
      }

      .tab-link:hover {
        color: inherit;
      }

      .tab-active {
        color: inherit;
        border-bottom-color: currentColor;
      }
    `,
  ],
})
export class TartalomFulekComponent {}
