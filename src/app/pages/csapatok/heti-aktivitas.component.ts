import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TeamActivity, TeamMemberActivity } from '../../models/team.model';
import { weekBars } from './week-bars';

/** A BE (TeamActivityService) heti kulcsai a nem tag soroknál (userId = null), és a sorok neve. */
const IMPORT_KEY = 'import';
const DELETED_KEY = 'deleted';
const KEY_LABEL: Record<string, string> = { [IMPORT_KEY]: 'Importált (GitHub)', [DELETED_KEY]: 'Törölt felhasználó' };

/**
 * Tanári csapatmunka-nézet (spec 3.3; KKK „csapatmunka” / „munkamegosztás”): tagonkénti táblázat + heti halmozott oszlopok jelmagyarázattal +
 * adat-táblázat (nem csak színnel kódolt). A commit ahhoz számít, aki pusholta.
 */
@Component({
  selector: 'app-heti-aktivitas',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = data();
    <div class="space-y-3 min-w-0">
      <p class="text-xs text-text-muted">A commit ahhoz számít, aki a közös tárolóba pusholta (a commit szerzője csak tájékoztató). A +/− sorokba a merge nem számít.</p>
      @if (d.pendingPushes) { <p class="text-xs text-text-muted" role="status">{{ d.pendingPushes }} push feldolgozása folyamatban…</p> }
      <div class="overflow-x-auto"><table class="w-full text-sm">
        <thead><tr><th scope="col" class="text-left">Tag</th><th scope="col">Commit</th><th scope="col">+ sor</th><th scope="col">− sor</th><th scope="col">Merge</th>
          <th scope="col">Utolsó push</th></tr></thead>
        <tbody>
          @for (m of d.members; track key(m)) {
            <tr [attr.data-testid]="'activity-row-' + key(m)">
              <th scope="row" class="text-left font-normal whitespace-nowrap"><span class="inline-block w-2.5 h-2.5 rounded-full mr-1" aria-hidden="true"
                [style.background]="color(key(m))"></span>{{ m.name }}{{ m.userId !== null && !m.active ? ' (már nem tag)' : '' }}</th>
              <td class="text-center">{{ m.commits }}</td><td class="text-center">+{{ m.additions }}</td><td class="text-center">−{{ m.deletions }}</td>
              <td class="text-center">{{ m.merges }}</td>
              <td class="text-center whitespace-nowrap">{{ m.lastPushAt ? (m.lastPushAt | date: 'yyyy.MM.dd. HH:mm') : '–' }}</td>
            </tr>
          } @empty { <tr><td colspan="6" class="text-text-muted">Még nincs push.</td></tr> }
        </tbody>
      </table></div>
      @if (bars().length) {
        <svg class="w-full max-w-2xl h-auto text-border-strong" viewBox="0 0 320 110" role="img" [attr.aria-label]="'Commitok heti bontásban, tagonként (' + bars().length + ' hét)'">
          @for (b of bars(); track b.weekStart; let i = $index) {
            @for (s of b.segments; track s.key) {
              <rect [attr.x]="i * (320 / bars().length) + 1" [attr.y]="s.y" [attr.width]="320 / bars().length - 2" [attr.height]="s.h" [attr.fill]="color(s.key)"></rect>
            }
          }
          <line x1="0" y1="100" x2="320" y2="100" stroke="currentColor" stroke-width=".5"></line>
        </svg>
        <ul class="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-hidden="true">
          @for (k of keys(); track k) { <li><span class="inline-block w-2.5 h-2.5 rounded-full mr-1" [style.background]="color(k)"></span>{{ label(k) }}</li> }
        </ul>
      }
      <details class="text-sm"><summary class="cursor-pointer min-h-8">Heti adatok táblázatban</summary>
        <div class="overflow-x-auto"><table>
          <thead><tr><th scope="col" class="text-left pr-3">Hét</th>@for (k of keys(); track k) { <th scope="col" class="px-2">{{ label(k) }}</th> }</tr></thead>
          <tbody>@for (w of d.weeks; track w.weekStart) {
            <tr><th scope="row" class="text-left font-normal pr-3">{{ w.weekStart | date: 'yyyy.MM.dd.' }}</th>@for (k of keys(); track k) { <td class="text-center">{{ w.commits[k] ?? 0 }}</td> }</tr>
          }</tbody>
        </table></div>
      </details>
      <p class="text-sm break-words">Ágak: @for (b of d.branches; track b.name) { <code>{{ b.name }}</code>{{ $last ? '' : ', ' }} } @empty { még nincs ág }</p>
    </div>
  `,
})
export class HetiAktivitasComponent {
  readonly data = input.required<TeamActivity>();
  private static readonly Palette = ['var(--color-primary)', 'var(--color-success)', 'var(--color-warning)', '#9b59b6', '#e07a5f', '#8a8a8a'];
  /** A tagok sorrendjében, utána a heti adatban szereplő többi kulcs. */
  readonly keys = computed(() => {
    const d = this.data();
    const keys = d.members.map((m) => this.key(m));
    for (const w of d.weeks) for (const k of Object.keys(w.commits)) if (!keys.includes(k)) keys.push(k);
    return keys;
  });
  readonly bars = computed(() => weekBars(this.data().weeks, this.keys()));

  /** A BE heti kulcsa: userId, vagy a nem tag soroknál „import” / „deleted” (a sor neve alapján - a BE két userId = null sort ad). */
  key(m: TeamMemberActivity): string {
    return m.userId !== null ? String(m.userId) : m.name === KEY_LABEL[DELETED_KEY] ? DELETED_KEY : IMPORT_KEY;
  }
  color(key: string): string { return HetiAktivitasComponent.Palette[Math.max(0, this.keys().indexOf(key)) % HetiAktivitasComponent.Palette.length]; }
  label(key: string): string { return this.data().members.find((m) => this.key(m) === key)?.name ?? KEY_LABEL[key] ?? key; }
}
