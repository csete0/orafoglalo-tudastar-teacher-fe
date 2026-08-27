import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/**
 * Fülsáv a tanári tartalom két fajtája között.
 *
 * Ez a komponens a fejléc-navigáció mérethatárának a következménye: a nav pontosan 6
 * linkre van méretezve (UI-TT-181/192/177), egy 7. "Kvízek" link visszanyitná a mért
 * túlcsordulást. A két tartalomtípus ezért egy oldalon, füleken osztozik.
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
