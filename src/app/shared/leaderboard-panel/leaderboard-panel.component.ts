import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LeaderboardCategory, LeaderboardEntryDto, LeaderboardPeriod } from '../../models/leaderboard.model';
import { IconComponent } from '../icon/icon.component';

/** A dobogós helyezések jelvény-színe. */
function rankClass(rank: number): string {
  if (rank === 1) return 'bg-warning-subtle text-warning';
  if (rank === 2) return 'bg-primary-subtle text-primary';
  if (rank === 3) return 'bg-secondary-subtle text-secondary';
  return 'bg-bg-element text-text-muted';
}

/**
 * Ranglista-panel (csoport „Eredmények” fül és intézmény „Ranglista” fül): kategória- és időszakválasztó,
 * top-lista. A választás a szülőben él (`model`), mert a panel fülváltáskor újra létrejön; a betöltést a
 * szülő végzi a `selectionChange` jelzésre (csoport- vagy intézmény-ranglista).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-leaderboard-panel',
  imports: [FormsModule, IconComponent],
  host: { class: 'block' },
  template: `
    <div class="flex gap-2 mb-4">
      <select [ngModel]="category()" (ngModelChange)="category.set($event); selectionChange.emit()" class="input !w-auto"
              aria-label="Ranglista kategória">
        <option value="quiz">Kvíz</option>
        <option value="exam">Vizsga</option>
      </select>
      <select [ngModel]="period()" (ngModelChange)="period.set($event); selectionChange.emit()" class="input !w-auto"
              aria-label="Ranglista időszak">
        <option value="weekly">Heti</option>
        <option value="monthly">Havi</option>
        <option value="alltime">Összes idő</option>
      </select>
    </div>
    @if (error()) {
      <p class="text-danger text-sm mb-4">{{ error() }}</p>
    } @else {
      <ol class="space-y-2">
        @for (entry of entries(); track entry.rank) {
          <li class="flex items-center gap-3 card !rounded-xl p-3 text-sm"
            [class.!border-primary]="entry.isCurrentUser">
            <span class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              [class]="rankClass(entry.rank)">{{ entry.rank }}</span>
            <!-- UI-UX-T7: a tanárnak a valódi név a beazonosítható - a becenév mellette marad, ha eltér. -->
            <span class="flex-1 truncate">
              {{ entry.realName ?? entry.nickname }}
              @if (entry.realName && entry.realName !== entry.nickname) {
                <span class="text-text-muted text-xs">({{ entry.nickname }})</span>
              }
            </span>
            <span class="font-bold">{{ entry.score }}</span>
          </li>
        } @empty {
          <li class="flex flex-col items-center py-10 gap-3">
            <div class="icon-tile icon-tile-neutral">
              <app-icon name="trophy" class="w-6 h-6 block" />
            </div>
            <p class="font-semibold">Még nincs ranglista-adat.</p>
          </li>
        }
      </ol>
    }
  `,
})
export class LeaderboardPanelComponent {
  readonly category = model<LeaderboardCategory>('quiz');
  readonly period = model<LeaderboardPeriod>('weekly');
  /** A top-lista (`LeaderboardStore.leaderboard()?.topEntries`); betöltés előtt üres. */
  readonly entries = input<readonly LeaderboardEntryDto[] | undefined>([]);
  /** A betöltés hibája - a „Még nincs ranglista-adat.” helyett jelenik meg (UI-TT-19). */
  readonly error = input<string | null>(null);
  /** Kategória vagy időszak váltása után (a `model` már frissült) - a szülő újratölt. */
  readonly selectionChange = output<void>();

  readonly rankClass = rankClass;
}
