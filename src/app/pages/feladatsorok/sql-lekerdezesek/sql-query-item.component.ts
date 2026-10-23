import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SqlQueryItemDto, SqlQueryStatus } from '../../../models/teacher-content.model';

const STATUS: Record<SqlQueryStatus, { icon: string; label: string; badge: string }> = {
  ok: { icon: '✔', label: 'lefutott', badge: 'badge-success' },
  not_query: { icon: '✔', label: 'lefutott (nem lekérdezés)', badge: 'badge-success' },
  error: { icon: '✘', label: 'hiba', badge: 'badge-danger' },
  nondeterministic: { icon: '⚠', label: 'kétszer futtatva eltérő eredmény', badge: 'badge-warning' },
  missing: { icon: '⚠', label: 'nincs lekérdezés', badge: 'badge-warning' },
  not_run: { icon: '⚠', label: 'nem ellenőrzött', badge: 'badge-warning' },
};

/**
 * Egy részfeladat lekérdezése az „SQL megoldó lekérdezések MI-vel” előnézetében: állapot-jelvények, hibák és figyelmeztetések,
 * szerkeszthető SQL, mentésre jelölés, visszaállítás és a futtatás eredménytáblája. Az állapotot a szülő tartja; ez csak
 * megjeleníti, és a változásokat (szöveg, jelölés, visszaállítás) jelzi.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sql-query-item',
  standalone: true,
  imports: [FormsModule],
  host: { class: 'block' },
  template: `
    <section class="bg-bg-element rounded-xl p-3 space-y-2 min-w-0" [attr.data-testid]="'sql-q-item-' + item().subTaskId"
      [attr.aria-labelledby]="'sql-q-label-' + item().subTaskId">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="font-semibold text-sm" [id]="'sql-q-label-' + item().subTaskId">{{ item().label }}</h3>
        <span class="badge" [class]="statusBadge()" [attr.data-testid]="'sql-q-status-' + item().subTaskId"
          [attr.aria-label]="'Állapot: ' + statusLabel()">
          <span aria-hidden="true">{{ statusIcon() }}</span>&nbsp;{{ statusLabel() }}
        </span>
        @if (changed()) { <span class="badge badge-warning">módosítva</span> }
        @if (check()?.status === 'missing') {
          <span class="badge badge-neutral" [attr.data-testid]="'sql-q-missing-' + item().subTaskId">Nem készült lekérdezés (pl. importálás – nem igényel SQL-t)</span>
        } @else if (!willSave() && (check()?.hadSnippet ?? item().hadSnippet)) {
          <span class="badge badge-neutral" [attr.data-testid]="'sql-q-wont-save-' + item().subTaskId">Nem lesz mentve – már van megoldás</span>
        } @else if (check()?.hadSnippet ?? item().hadSnippet) {
          <span class="badge badge-neutral" [attr.data-testid]="'sql-q-had-' + item().subTaskId">van már SQL-megoldása – felülíródik</span>
        }
      </div>

      @if (check()?.error; as error) {
        <p class="text-sm text-danger break-words" [attr.data-testid]="'sql-q-error-' + item().subTaskId">{{ error }}</p>
      }
      @if (warnings().length > 0) {
        <ul class="text-sm text-warning list-disc pl-5 space-y-0.5" [attr.data-testid]="'sql-q-item-warnings-' + item().subTaskId">
          @for (w of warnings(); track $index) { <li>{{ w }}</li> }
        </ul>
      }

      <textarea rows="6" spellcheck="false" [attr.aria-label]="item().label + ' lekérdezése'" [attr.data-testid]="'sql-q-editor-' + item().subTaskId"
        class="input !bg-bg-panel !px-2 !py-1 !text-xs font-mono whitespace-pre"
        placeholder="Ide írhatod a lekérdezést (üresen hagyva nem kerül mentésre)."
        [ngModel]="text()" (ngModelChange)="textChange.emit($event)" [ngModelOptions]="{ standalone: true }"></textarea>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" [checked]="selected()" [disabled]="!hasText() || !willSave()"
            (change)="selectedToggle.emit()" [attr.data-testid]="'sql-q-select-' + item().subTaskId" />
          Mentésre kijelölve
        </label>
        @if (changed()) {
          <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="restore.emit()" [attr.data-testid]="'sql-q-restore-' + item().subTaskId"
            [attr.aria-label]="item().label + ' visszaállítása az MI változatára'">Visszaállítás</button>
        }
      </div>

      @if (check()?.preview; as p) {
        <div [attr.data-testid]="'sql-q-preview-' + item().subTaskId">
          <p class="text-xs text-text-muted mb-1">
            Eredmény: {{ p.totalRows }} sor{{ p.rows.length < p.totalRows ? ' – az első ' + p.rows.length + ' látszik' : '' }}
          </p>
          @if (p.columns.length > 0) {
            <div class="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-border-default bg-bg-panel" tabindex="0"
              [attr.aria-label]="item().label + ' eredménye'" role="region">
              <table class="text-xs font-mono border-collapse min-w-full">
                <thead>
                  <tr>
                    @for (c of p.columns; track $index) {
                      <th scope="col" class="text-left font-semibold px-2 py-1 border-b border-border-default whitespace-nowrap bg-bg-element">{{ c }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of p.rows; track $index) {
                    <tr>
                      @for (cell of row; track $index) {
                        <td class="px-2 py-0.5 border-b border-border-default whitespace-nowrap" [class.text-text-muted]="cell === null">{{ cell ?? 'NULL' }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </section>
  `,
})
export class SqlQueryItemComponent {
  /** Az MI által elkészített tétel (a „Visszaállítás” és a „módosítva” jelzés alapja). */
  readonly item = input.required<SqlQueryItemDto>();
  /** A legutóbbi ellenőrzés eredménye (elkészítés vagy újraellenőrzés). */
  readonly check = input<SqlQueryItemDto | undefined>(undefined);
  /** A szerkesztőben álló (esetleg javított) lekérdezés. */
  readonly text = input.required<string>();
  readonly selected = input.required<boolean>();
  /** A BE szerint az apply menti-e ezt a részfeladatot. */
  readonly willSave = input.required<boolean>();

  readonly textChange = output<string>();
  readonly selectedToggle = output<void>();
  readonly restore = output<void>();

  readonly changed = computed(() => this.text() !== (this.item().sql ?? ''));
  readonly hasText = computed(() => !!this.text().trim());

  /** A „nem lesz mentve” figyelmeztetést a jelvény mutatja - a listában nem ismételjük. */
  readonly warnings = computed(() => {
    const check = this.check();
    const warnings = check?.warnings ?? [];
    return check?.willSave === false ? warnings.filter((w) => !w.startsWith('Nem lesz mentve')) : warnings;
  });

  private readonly status = computed(() => {
    const status = this.check()?.status;
    return status ? STATUS[status] : undefined;
  });
  readonly statusLabel = computed(() => {
    const status = this.check()?.status;
    return status ? (this.status()?.label ?? status) : 'nem ellenőrzött';
  });
  readonly statusIcon = computed(() => this.status()?.icon ?? '⚠');
  readonly statusBadge = computed(() => this.status()?.badge ?? 'badge-neutral');
}
