import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { SqlQueryItemDto, SqlQueryResultDto, SqlQueryStatus, TeacherTaskDto } from '../../models/teacher-content.model';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

const SQL_LANGUAGE_ID = 6;

const STATUS: Record<SqlQueryStatus, { icon: string; label: string; badge: string }> = {
  ok: { icon: '✔', label: 'lefutott', badge: 'badge-success' },
  not_query: { icon: '✔', label: 'lefutott (nem lekérdezés)', badge: 'badge-success' },
  error: { icon: '✘', label: 'hiba', badge: 'badge-danger' },
  nondeterministic: { icon: '⚠', label: 'kétszer futtatva eltérő eredmény', badge: 'badge-warning' },
  missing: { icon: '⚠', label: 'nincs lekérdezés', badge: 'badge-warning' },
  not_run: { icon: '⚠', label: 'nem ellenőrzött', badge: 'badge-warning' },
};

const isGood = (status: SqlQueryStatus | undefined) => status === 'ok' || status === 'not_query';

/** A rate limiter 429-es válaszának teste nem `errorMessage` alakú - saját, érthető szöveg kell. */
function errorText(err: unknown, fallback: string): string {
  return (err as { status?: number })?.status === 429
    ? 'Túl sok kérés rövid időn belül - várj néhány percet, és próbáld újra.'
    : extractErrorMessage(err, fallback);
}

/**
 * „SQL megoldó lekérdezések MI-vel” párbeszédablak egy SQL-feladathoz. Lépések: beállítás → elkészítés (MI, a tanár napi
 * keretéből; a futtató a create_lite.sql-en le is futtatja) → részfeladatonként szerkeszthető előnézet eredménytáblával →
 * „Mentés” a részfeladatok SQL-megoldásaként. Bármely szerkesztés után a mentés csak újraellenőrzéssel lehetséges.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sql-lekerdezesek',
  standalone: true,
  imports: [FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" (keydown.escape)="close()">
      <!-- fixed, nem absolute: a görgethető ablak-tartalom alatt is az egész képernyőt takarja. -->
      <div class="fixed inset-0 bg-black/40" data-testid="sql-q-backdrop" (click)="close()"></div>
      <div #dialog role="dialog" aria-modal="true" aria-labelledby="sql-q-title" tabindex="-1" data-testid="sql-queries-dialog"
        class="card relative w-full max-w-3xl min-w-0 p-4 sm:p-6 shadow-xl my-8 sm:my-auto outline-none">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-primary shrink-0"><app-icon name="database" class="w-5 h-5 block" /></div>
            <div class="min-w-0">
              <h2 id="sql-q-title" class="font-bold text-lg">SQL megoldó lekérdezések MI-vel</h2>
              <p class="text-xs text-text-muted truncate">{{ task().taskOrder }}. {{ task().title }}</p>
            </div>
          </div>
          <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="close()" data-testid="sql-q-close">
            <app-icon name="x" class="w-5 h-5 block" />
          </button>
        </div>

        @if (generating()) {
          <div class="space-y-3" data-testid="sql-q-generating">
            <app-local-spinner label="Készülnek a lekérdezések, és lefutnak a futtatón… ez akár egy percig is tarthat." />
            <div class="flex justify-end">
              <button type="button" class="btn btn-ghost" (click)="cancelGeneration()" data-testid="sql-q-cancel">Mégse</button>
            </div>
          </div>
        } @else if (generated(); as gen) {
          <!-- ── 2. Előnézet ─────────────────────────────── -->
          <div class="space-y-4" data-testid="sql-q-preview">
            @if (latest()?.validationStatus === 'unavailable') {
              <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" role="status" data-testid="sql-q-unavailable">
                A futtató most nem érhető el, így a lekérdezések ellenőrzése elmaradt - mentés előtt érdemes később újraellenőrizni.
              </p>
            }
            @if ((latest()?.warnings ?? []).length > 0) {
              <ul class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning list-disc pl-8 space-y-0.5" data-testid="sql-q-warnings">
                @for (w of latest()!.warnings; track $index) { <li>{{ w }}</li> }
              </ul>
            }
            @if (gen.aiNotes) {
              <p class="text-sm text-text-muted"><span class="font-medium">Az MI megjegyzése:</span> {{ gen.aiNotes }}</p>
            }

            @for (item of gen.queries; track item.subTaskId) {
              @let check = checks()[item.subTaskId];
              <section class="bg-bg-element rounded-xl p-3 space-y-2 min-w-0" [attr.data-testid]="'sql-q-item-' + item.subTaskId"
                [attr.aria-labelledby]="'sql-q-label-' + item.subTaskId">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="font-semibold text-sm" [id]="'sql-q-label-' + item.subTaskId">{{ item.label }}</h3>
                  <span class="badge" [class]="statusBadge(check?.status)" [attr.data-testid]="'sql-q-status-' + item.subTaskId"
                    [attr.aria-label]="'Állapot: ' + statusLabel(check?.status)">
                    <span aria-hidden="true">{{ statusIcon(check?.status) }}</span>&nbsp;{{ statusLabel(check?.status) }}
                  </span>
                  @if (isChanged(item)) { <span class="badge badge-warning">módosítva</span> }
                  @if (check?.status === 'missing') {
                    <span class="badge badge-neutral" [attr.data-testid]="'sql-q-missing-' + item.subTaskId">Nem készült lekérdezés (pl. importálás – nem igényel SQL-t)</span>
                  } @else if (!willSave(item.subTaskId) && (check?.hadSnippet ?? item.hadSnippet)) {
                    <span class="badge badge-neutral" [attr.data-testid]="'sql-q-wont-save-' + item.subTaskId">Nem lesz mentve – már van megoldás</span>
                  } @else if (check?.hadSnippet ?? item.hadSnippet) {
                    <span class="badge badge-neutral" [attr.data-testid]="'sql-q-had-' + item.subTaskId">van már SQL-megoldása – felülíródik</span>
                  }
                </div>

                @if (check?.error) {
                  <p class="text-sm text-danger break-words" [attr.data-testid]="'sql-q-error-' + item.subTaskId">{{ check!.error }}</p>
                }
                @if (itemWarnings(check).length > 0) {
                  <ul class="text-sm text-warning list-disc pl-5 space-y-0.5" [attr.data-testid]="'sql-q-item-warnings-' + item.subTaskId">
                    @for (w of itemWarnings(check); track $index) { <li>{{ w }}</li> }
                  </ul>
                }

                <textarea rows="6" spellcheck="false" [attr.aria-label]="item.label + ' lekérdezése'" [attr.data-testid]="'sql-q-editor-' + item.subTaskId"
                  class="input !bg-bg-panel !px-2 !py-1 !text-xs font-mono whitespace-pre"
                  placeholder="Ide írhatod a lekérdezést (üresen hagyva nem kerül mentésre)."
                  [ngModel]="texts()[item.subTaskId] ?? ''" (ngModelChange)="edit(item.subTaskId, $event)" [ngModelOptions]="{ standalone: true }"></textarea>

                <div class="flex flex-wrap items-center justify-between gap-2">
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" [checked]="isSelected(item.subTaskId)" [disabled]="!hasText(item.subTaskId) || !willSave(item.subTaskId)"
                      (change)="toggleSelected(item.subTaskId)" [attr.data-testid]="'sql-q-select-' + item.subTaskId" />
                    Mentésre kijelölve
                  </label>
                  @if (isChanged(item)) {
                    <button type="button" class="btn btn-ghost !px-2 !py-1 text-sm" (click)="restore(item)" [attr.data-testid]="'sql-q-restore-' + item.subTaskId"
                      [attr.aria-label]="item.label + ' visszaállítása az MI változatára'">Visszaállítás</button>
                  }
                </div>

                @if (check?.preview; as p) {
                  <div [attr.data-testid]="'sql-q-preview-' + item.subTaskId">
                    <p class="text-xs text-text-muted mb-1">
                      Eredmény: {{ p.totalRows }} sor{{ p.rows.length < p.totalRows ? ' – az első ' + p.rows.length + ' látszik' : '' }}
                    </p>
                    @if (p.columns.length > 0) {
                      <div class="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-border-default bg-bg-panel" tabindex="0"
                        [attr.aria-label]="item.label + ' eredménye'" role="region">
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
            }

            @if (dirty()) {
              <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning flex flex-wrap items-center justify-between gap-2" role="status" data-testid="sql-q-dirty">
                <span>Módosítottál egy lekérdezést – mentés előtt ellenőrizd újra.</span>
                <button type="button" class="btn btn-primary !px-3 !py-1" (click)="revalidate()" [disabled]="revalidating() || toValidate().length === 0" data-testid="sql-q-revalidate">
                  {{ revalidating() ? 'Ellenőrzés…' : 'Újraellenőrzés' }}
                </button>
              </div>
            }
            @if (revalidateError()) {
              <p class="text-sm text-danger" role="alert" data-testid="sql-q-revalidate-error">{{ revalidateError() }}</p>
            }
            @if (!dirty() && selectedHasError()) {
              <p class="text-sm text-danger" data-testid="sql-q-error-selected">
                Hibás lekérdezés van kijelölve – javítsd és ellenőrizd újra, vagy vedd ki a jelölést.
              </p>
            } @else if (!dirty() && selectedUnchecked()) {
              <p class="text-sm text-warning" data-testid="sql-q-unchecked-selected">
                Van kijelölt, de nem ellenőrzött vagy nem egyértelmű eredményű lekérdezés - a diákok gépi javítása ehhez méri a beadásokat.
              </p>
            }
            @if (saveError()) {
              <p class="text-sm text-danger" role="alert" data-testid="sql-q-save-error">{{ saveError() }}</p>
            }

            <div class="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" class="btn btn-ghost" (click)="back()" [disabled]="saving()" data-testid="sql-q-back">Vissza</button>
              <button type="button" class="btn btn-primary" (click)="save()" [disabled]="!canSave()" data-testid="sql-q-save">
                {{ saving() ? 'Mentés…' : 'Mentés' + (selectedPayload().length > 0 ? ' (' + selectedPayload().length + ')' : '') }}
              </button>
            </div>
          </div>
        } @else {
          <!-- ── 1. Beállítás ─────────────────────────────── -->
          <div class="space-y-4" data-testid="sql-q-input">
            <p class="text-sm text-text-muted">
              Az MI a feladat és a részfeladatok szövegéből, valamint a <span class="font-mono">create_lite.sql</span> táblaszerkezetéből
              megírja a megoldó lekérdezéseket a napi MI-keretedből. Mindegyik le is fut a futtatón, így látod az eredményt. Mentés előtt
              mindent átnézhetsz és javíthatsz; a diákok beadásainak gépi javítása ezekhez méri az eredményt.
            </p>

            @if (!hasLiteSql()) {
              <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning space-y-2" data-testid="sql-q-no-lite">
                <p>
                  Ehhez a feladatsorhoz még nincs <span class="font-mono">create_lite.sql</span>, így a lekérdezések nem futtathatók.
                  Előbb töltsd fel, vagy készítsd el az SQL-fájl generálóval.
                </p>
                <button type="button" class="btn btn-primary !px-3 !py-1" (click)="openSqlFiles.emit()" data-testid="sql-q-open-sql-files">
                  Hiányzó SQL-fájl elkészítése
                </button>
              </div>
            } @else if (task().subTasks.length === 0) {
              <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" data-testid="sql-q-no-subtasks">
                A feladatnak még nincs részfeladata - előbb add hozzá a részfeladatokat, utána készülhetnek hozzájuk lekérdezések.
              </p>
            } @else {
              <p class="text-sm" data-testid="sql-q-summary">
                {{ task().subTasks.length }} részfeladat, ebből
                <span class="font-semibold">{{ missingCount() }}</span> még SQL-megoldás nélkül.
              </p>
              <label class="flex items-start gap-2 rounded-xl p-3 border border-border-default">
                <input type="checkbox" class="mt-1" [checked]="regenerate()" (change)="regenerate.set(!regenerate())"
                  data-testid="sql-q-regenerate" />
                <span>
                  <span class="text-sm font-medium block">A meglévő lekérdezéseket is írd újra</span>
                  <span class="text-xs text-text-muted block">
                    Az MI a már megoldott részfeladatokra is javasol lekérdezést.
                  </span>
                </span>
              </label>
              @if (regenerate()) {
                <label class="flex items-start gap-2 rounded-xl p-3 border border-border-default ml-6">
                  <input type="checkbox" class="mt-1" [checked]="overwriteExisting()" (change)="overwriteExisting.set(!overwriteExisting())" data-testid="sql-q-overwrite" />
                  <span>
                    <span class="text-sm font-medium block">Mentéskor írja felül a meglévő megoldásokat</span>
                    <span class="text-xs text-text-muted block">
                      Kikapcsolva a meglévő megoldásokhoz írt javaslat csak összehasonlításra látszik, nem kerül mentésre.
                      A más nyelvű kódrészletek mindig megmaradnak.
                    </span>
                  </span>
                </label>
              }
              @if (!regenerate() && missingCount() === 0) {
                <p class="text-sm text-text-muted" data-testid="sql-q-nothing-missing">
                  Minden részfeladatnak van már SQL-megoldása - újraíráshoz jelöld be a fenti lehetőséget.
                </p>
              }
            }

            @if (error()) {
              <p class="text-sm text-danger" role="alert" data-testid="sql-q-error">{{ error() }}</p>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <button type="button" class="btn btn-ghost" (click)="close()">Mégse</button>
              <button type="button" class="btn btn-primary" (click)="generate()" [disabled]="!canGenerate()" data-testid="sql-q-generate">
                Elkészítés
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class SqlLekerdezesekComponent implements OnInit {
  private readonly service = inject(TeacherTaskSetService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  /** A folyamatban lévő elkészítés - Mégse / bezárás esetén megszakítjuk. */
  private generation: Subscription | null = null;
  /** A folyamatban lévő újraellenőrzés - Vissza / bezárás esetén megszakítjuk. */
  private revalidation: Subscription | null = null;

  readonly taskSetId = input.required<number>();
  readonly task = input.required<TeacherTaskDto>();
  /** Van-e a feladathoz futtatható create_lite.sql (feladatsor- vagy erre a feladatra kötött). */
  readonly hasLiteSql = input.required<boolean>();
  readonly closed = output<void>();
  /** Sikeres mentés után a mentett részfeladatok - a szerkesztő újratölti a feladatsort. */
  readonly saved = output<number[]>();
  /** A tanár a hiányzó create_lite.sql elkészítését kérte. */
  readonly openSqlFiles = output<void>();

  readonly regenerate = signal(false);
  /** Újraírásnál: mentéskor felülírja-e a meglévő SQL-megoldásokat. */
  readonly overwriteExisting = signal(true);
  readonly generating = signal(false);
  readonly error = signal<string | null>(null);
  /** Az elkészítéskor kapott eredmény (a „Visszaállítás” ide tér vissza). */
  readonly generated = signal<SqlQueryResultDto | null>(null);
  /** Az elkészítéskor használt „újraírás” - mentéskor ez a felülírás-engedély. */
  private overwrite = false;
  /** Részfeladatonként a legutóbbi ellenőrzés eredménye (elkészítés vagy újraellenőrzés). */
  readonly checks = signal<Record<number, SqlQueryItemDto>>({});
  /** Az utolsó ellenőrzés teljes válasza (összesített figyelmeztetések, futtató-állapot). */
  readonly latest = signal<SqlQueryResultDto | null>(null);
  readonly texts = signal<Record<number, string>>({});
  private readonly validatedTexts = signal<Record<number, string>>({});
  readonly selected = signal<Set<number>>(new Set());
  readonly revalidating = signal(false);
  readonly revalidateError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  readonly missingCount = computed(
    () => this.task().subTasks.filter((s) => !s.snippets.some((sn) => sn.programmingLanguageId === SQL_LANGUAGE_ID && sn.code.trim())).length,
  );

  readonly canGenerate = computed(
    () => this.hasLiteSql() && this.task().subTasks.length > 0 && !this.generating() && (this.regenerate() || this.missingCount() > 0),
  );

  readonly dirty = computed(() => {
    const texts = this.texts();
    const validated = this.validatedTexts();
    return Object.keys(texts).some((k) => (texts[+k] ?? '') !== (validated[+k] ?? ''));
  });

  /** A nem üres, ellenőrizhető lekérdezések, a részfeladatok sorrendjében. */
  readonly toValidate = computed(() =>
    (this.generated()?.queries ?? [])
      .filter((q) => this.hasText(q.subTaskId))
      .map((q) => ({ subTaskId: q.subTaskId, sql: this.texts()[q.subTaskId] })),
  );

  readonly selectedPayload = computed(() =>
    this.toValidate().filter((q) => this.selected().has(q.subTaskId) && this.willSave(q.subTaskId)),
  );
  readonly selectedHasError = computed(() => this.selectedPayload().some((q) => this.checks()[q.subTaskId]?.status === 'error'));
  readonly selectedUnchecked = computed(() => this.selectedPayload().some((q) => !isGood(this.checks()[q.subTaskId]?.status)));

  readonly canSave = computed(
    () => !this.saving() && !this.revalidating() && !this.dirty() && this.selectedPayload().length > 0 && !this.selectedHasError(),
  );

  ngOnInit(): void {
    // Ha minden részfeladatnak van már megoldása, csak az újraírásnak van értelme.
    this.regenerate.set(this.missingCount() === 0);
    setTimeout(() => this.dialog()?.nativeElement.focus());
  }

  generate(): void {
    if (!this.canGenerate()) return;
    const regenerate = this.regenerate();
    const overwrite = regenerate && this.overwriteExisting();
    this.generating.set(true);
    this.error.set(null);
    this.generation = this.service
      .generateSqlQueries(this.taskSetId(), this.task().id, { regenerate, overwrite })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.generating.set(false);
          this.generation = null;
          this.overwrite = overwrite;
          this.showGenerated(result);
        },
        error: (err) => {
          this.generating.set(false);
          this.generation = null;
          this.error.set(errorText(err, 'A lekérdezések elkészítése nem sikerült.'));
        },
      });
  }

  cancelGeneration(): void {
    this.generation?.unsubscribe();
    this.generation = null;
    this.generating.set(false);
  }

  private showGenerated(result: SqlQueryResultDto): void {
    this.cancelRevalidation();
    const texts: Record<number, string> = {};
    for (const q of result.queries) texts[q.subTaskId] = q.sql ?? '';
    this.texts.set(texts);
    this.validatedTexts.set({ ...texts });
    this.checks.set(Object.fromEntries(result.queries.map((q) => [q.subTaskId, q])));
    this.latest.set(result);
    this.selected.set(new Set(result.queries.filter((q) => q.sql?.trim() && isGood(q.status) && q.willSave !== false).map((q) => q.subTaskId)));
    this.revalidateError.set(null);
    this.saveError.set(null);
    this.generated.set(result);
  }

  hasText(subTaskId: number): boolean {
    return !!this.texts()[subTaskId]?.trim();
  }

  isSelected(subTaskId: number): boolean {
    return this.selected().has(subTaskId) && this.hasText(subTaskId) && this.willSave(subTaskId);
  }

  /** A BE szerint az apply menti-e ezt a részfeladatot (régebbi válaszban hiányzó mező: igen). */
  willSave(subTaskId: number): boolean {
    return this.checks()[subTaskId]?.willSave !== false;
  }

  /** A „nem lesz mentve” figyelmeztetést a jelvény mutatja - a listában nem ismételjük. */
  itemWarnings(check: SqlQueryItemDto | undefined): string[] {
    const warnings = check?.warnings ?? [];
    return check?.willSave === false ? warnings.filter((w) => !w.startsWith('Nem lesz mentve')) : warnings;
  }

  toggleSelected(subTaskId: number): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(subTaskId)) next.delete(subTaskId);
      else next.add(subTaskId);
      return next;
    });
  }

  isChanged(item: SqlQueryItemDto): boolean {
    return (this.texts()[item.subTaskId] ?? '') !== (item.sql ?? '');
  }

  edit(subTaskId: number, text: string): void {
    this.saveError.set(null);
    this.texts.update((current) => ({ ...current, [subTaskId]: text }));
  }

  /** Az MI változata vissza; ha így minden az eredeti, az eredeti ellenőrzés is érvényes. */
  restore(item: SqlQueryItemDto): void {
    const generated = this.generated();
    if (!generated) return;
    this.texts.update((current) => ({ ...current, [item.subTaskId]: item.sql ?? '' }));
    if (generated.queries.every((q) => (this.texts()[q.subTaskId] ?? '') === (q.sql ?? ''))) {
      this.cancelRevalidation();
      this.validatedTexts.set({ ...this.texts() });
      this.checks.set(Object.fromEntries(generated.queries.map((q) => [q.subTaskId, q])));
      this.latest.set(generated);
    }
  }

  /** A (javított) lekérdezések újraellenőrzése a szerveren, MI nélkül; siker után menthető. */
  revalidate(): void {
    const basis = this.generated();
    const sent = this.toValidate();
    if (this.revalidating() || !basis || sent.length === 0) return;
    const sentTexts = { ...this.texts() };
    this.revalidating.set(true);
    this.revalidateError.set(null);
    this.saveError.set(null);
    this.revalidation = this.service
      .validateSqlQueries(this.taskSetId(), this.task().id, sent, this.overwrite)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.revalidating.set(false);
          this.revalidation = null;
          // Közben új elkészítés vagy Vissza történt: az elavult válasz eldobva.
          if (this.generated() !== basis) return;
          const previous = this.checks();
          const next: Record<number, SqlQueryItemDto> = {};
          for (const q of basis.queries) {
            const fresh = result.queries.find((r) => r.subTaskId === q.subTaskId);
            // Az üresen hagyott (nem küldött) lekérdezésnek nincs eredménye.
            next[q.subTaskId] = fresh ?? { ...q, sql: null, status: 'missing', error: null, warnings: [], preview: null, willSave: q.willSave };
          }
          // A most rendbe jött lekérdezés automatikusan mentésre kerül (a tanár ezért javította).
          this.selected.update((current) => {
            const sel = new Set(current);
            for (const id of Object.keys(next).map(Number)) if (isGood(next[id].status) && next[id].willSave !== false && !isGood(previous[id]?.status)) sel.add(id);
            return sel;
          });
          this.checks.set(next);
          this.latest.set(result);
          this.validatedTexts.set(sentTexts);
        },
        error: (err) => {
          this.revalidating.set(false);
          this.revalidation = null;
          if (this.generated() !== basis) return;
          this.revalidateError.set(errorText(err, 'Az ellenőrzés nem sikerült.'));
        },
      });
  }

  save(): void {
    if (!this.canSave()) return;
    const queries = this.selectedPayload();
    const labels = new Map((this.generated()?.queries ?? []).map((q) => [q.subTaskId, q.label]));
    this.saving.set(true);
    this.saveError.set(null);
    this.service
      .applySqlQueries(this.taskSetId(), this.task().id, { queries, overwrite: this.overwrite })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          const skipped = res.skipped.map((s) => `${labels.get(s.subTaskId) ?? '#' + s.subTaskId}: ${s.reason}`);
          if (res.applied.length === 0) {
            this.saveError.set(`Egyik lekérdezés sem került mentésre. ${skipped.join(' ')}`.trim());
            return;
          }
          const saved = `SQL-megoldás mentve: ${res.applied.map((id) => labels.get(id) ?? '#' + id).join(', ')}.`;
          if (skipped.length > 0) this.toastService.warning(`${saved} Kimaradt – ${skipped.join(' ')}`, 8000);
          else this.toastService.success(saved);
          this.saved.emit(res.applied);
          this.closed.emit();
        },
        error: (err) => {
          this.saving.set(false);
          this.saveError.set(errorText(err, 'A mentés nem sikerült.'));
        },
      });
  }

  back(): void {
    if (this.saving()) return;
    this.cancelRevalidation();
    this.generated.set(null);
    this.latest.set(null);
    this.checks.set({});
    this.texts.set({});
    this.validatedTexts.set({});
    this.saveError.set(null);
    this.revalidateError.set(null);
  }

  close(): void {
    if (this.saving()) return;
    this.cancelRevalidation();
    this.cancelGeneration();
    this.closed.emit();
  }

  private cancelRevalidation(): void {
    this.revalidation?.unsubscribe();
    this.revalidation = null;
    this.revalidating.set(false);
  }

  statusLabel(status: SqlQueryStatus | undefined): string {
    return status ? (STATUS[status]?.label ?? status) : 'nem ellenőrzött';
  }

  statusIcon(status: SqlQueryStatus | undefined): string {
    return status ? (STATUS[status]?.icon ?? '⚠') : '⚠';
  }

  statusBadge(status: SqlQueryStatus | undefined): string {
    return status ? (STATUS[status]?.badge ?? 'badge-neutral') : 'badge-neutral';
  }
}
