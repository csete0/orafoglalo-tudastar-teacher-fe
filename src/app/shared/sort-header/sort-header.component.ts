import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

/**
 * UI-UX-K3: kattintható oszlopfejléc a riport-táblákhoz. 25+ fős osztálynál a
 * "ki a leggyengébb ebben az oszlopban" kérdésre ne szemmel-kereséssel jöjjön a
 * válasz. Az adat már mind a kliensen van - a rendezés lokális.
 *
 * Használat: <th> belsejébe; az aria-sort a SZÜLŐ th-ra való (a hívó köti), itt a
 * gomb aria-labelje mondja el az állapotot.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sort-header',
  standalone: true,
  template: `
    <button type="button" (click)="toggle()"
      class="inline-flex items-center gap-1 uppercase tracking-wide text-xs font-semibold
             text-text-muted hover:text-text-primary transition-colors"
      [attr.aria-label]="ariaLabel()">
      <ng-content />
      <span aria-hidden="true" class="w-3 text-center">{{ arrow() }}</span>
    </button>
  `,
})
export class SortHeaderComponent {
  /** Az oszlop kulcsa - ezzel hívja vissza a szülőt. */
  readonly key = input.required<string>();
  /** A tábla aktuális rendezése (a szülő signalja). */
  readonly state = input.required<SortState | null>();
  readonly sortChange = output<SortState>();

  readonly active = computed(() => this.state()?.key === this.key());
  readonly arrow = computed(() =>
    !this.active() ? '' : this.state()!.dir === 'asc' ? '▲' : '▼');

  readonly ariaLabel = computed(() =>
    this.active()
      ? `Rendezés: ${this.state()!.dir === 'asc' ? 'növekvő' : 'csökkenő'} — kattints a váltáshoz`
      : 'Rendezés ezen oszlop szerint');

  toggle(): void {
    // Első kattintás: csökkenő (riportnál tipikusan a "legjobb/legtöbb elöl" a kérdés),
    // második: növekvő, tovább: váltogat.
    const next: SortState = this.active() && this.state()!.dir === 'desc'
      ? { key: this.key(), dir: 'asc' }
      : { key: this.key(), dir: 'desc' };
    this.sortChange.emit(next);
  }
}

/** Közös rendező-segéd: null értékek mindig a lista végére. */
export function sortRows<T>(rows: T[], state: SortState | null,
  selectors: Record<string, (row: T) => string | number | null | undefined>): T[] {
  if (!state) return rows;
  const select = selectors[state.key];
  if (!select) return rows;
  const dir = state.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = select(a);
    const vb = select(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string' || typeof vb === 'string') {
      return dir * String(va).localeCompare(String(vb), 'hu');
    }
    return dir * (Number(va) - Number(vb));
  });
}
