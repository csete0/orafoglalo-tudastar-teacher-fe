import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { concat, Subscription, toArray } from 'rxjs';
import {
  GeneratedSqlFileDto,
  ReferenceSubtaskCheckDto,
  SqlGenerationResultDto,
  SqlGenerationSource,
  TeacherFileDto,
} from '../../models/teacher-content.model';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

/** A BE-vel azonos korlát. */
const MAX_DESCRIPTION = 2000;
/** Az előnézetben ennyi sor látszik egy fájlból (a teljes szöveg mentésre kerül). */
const PREVIEW_LINES = 200;

const REFERENCE_STATUS: Record<ReferenceSubtaskCheckDto['status'], { label: string; badge: string }> = {
  match: { label: 'ugyanazt adja, mint eddig', badge: 'badge-success' },
  ok: { label: 'lefutott', badge: 'badge-success' },
  different: { label: 'mást ad, mint eddig', badge: 'badge-warning' },
  error: { label: 'hiba', badge: 'badge-danger' },
  not_query: { label: 'nem lekérdezés', badge: 'badge-neutral' },
};

/**
 * „Hiányzó SQL-fájl elkészítése” párbeszédablak a feladatsor-szerkesztőben. Lépések: forrás választása → elkészítés (a
 * táblaszerkezetet az MI javasolja a tanár napi MI-keretéből, az adatsorokat a rendszer alakítja át) → előnézet a futtatásos
 * ellenőrzéssel és figyelmeztetésekkel → „Mentés” a szokásos fájlfeltöltéssel (a meglévő azonos fajtájú fájl lecserélődik).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sql-generalas',
  standalone: true,
  imports: [FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" (keydown.escape)="close()">
      <div class="absolute inset-0 bg-black/40" (click)="close()"></div>
      <div #dialog role="dialog" aria-modal="true" aria-labelledby="sql-gen-title" tabindex="-1" data-testid="sql-generation-dialog"
        class="card relative w-full max-w-3xl p-5 sm:p-6 shadow-xl my-8 outline-none">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-primary shrink-0"><app-icon name="database" class="w-5 h-5 block" /></div>
            <h2 id="sql-gen-title" class="font-bold text-lg">Hiányzó SQL-fájl elkészítése</h2>
          </div>
          <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="close()" data-testid="sql-gen-close">
            <app-icon name="x" class="w-5 h-5 block" />
          </button>
        </div>

        @if (generating()) {
          <app-local-spinner label="Készül a fájl és lefut az ellenőrzés… ez akár egy percig is tarthat." />
        } @else if (result(); as r) {
          <!-- ── 3. Előnézet ─────────────────────────────── -->
          <div class="space-y-4" data-testid="sql-gen-preview">
            @switch (r.validation.status) {
              @case ('ok') {
                <p class="bg-success-subtle border border-success/40 rounded-xl p-3 text-sm text-success flex items-start gap-2" data-testid="sql-gen-valid">
                  <app-icon name="check" class="w-5 h-5 block shrink-0" />
                  <span>A create_lite.sql hibátlanul lefutott a futtatón (SQLite), a táblák és a sorok száma egyezik a forrással.</span>
                </p>
              }
              @case ('unavailable') {
                <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" data-testid="sql-gen-unavailable">
                  A futtató most nem érhető el, így az ellenőrzés elmaradt - mentés előtt próbáld újra később.
                  @for (e of r.validation.errors; track $index) { <span class="block text-xs mt-1">{{ e }}</span> }
                </p>
              }
              @default {
                <div class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger" data-testid="sql-gen-invalid">
                  <p class="font-semibold mb-1">Az ellenőrzés hibát talált - így nem menthető:</p>
                  <ul class="list-disc pl-5 space-y-0.5">
                    @for (e of r.validation.errors; track $index) { <li>{{ e }}</li> }
                  </ul>
                </div>
              }
            }

            @if (r.warnings.length > 0) {
              <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" data-testid="sql-gen-warnings">
                <p class="font-semibold mb-1 flex items-center gap-2"><app-icon name="warning-triangle" class="w-4 h-4 block" /> Nézd át:</p>
                <ul class="list-disc pl-5 space-y-0.5">
                  @for (w of r.warnings; track $index) { <li>{{ w }}</li> }
                </ul>
              </div>
            }

            @if (r.aiNotes) {
              <p class="text-sm text-text-muted"><span class="font-medium">Az MI megjegyzése:</span> {{ r.aiNotes }}</p>
            }

            <div>
              <h3 class="font-semibold text-sm mb-2">Táblák</h3>
              <div class="space-y-2">
                @for (t of r.tables; track t.name) {
                  <div class="bg-bg-element rounded-xl p-3 text-sm" [attr.data-testid]="'sql-gen-table-' + t.name">
                    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <span class="font-mono font-semibold break-all">{{ t.name }}</span>
                      <span class="text-xs text-text-muted">
                        forrás: {{ t.source }} ·
                        <span [class.text-danger]="t.actualRows !== null && t.actualRows !== t.expectedRows">
                          {{ t.actualRows ?? '–' }} / {{ t.expectedRows }} sor
                        </span>
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      @for (c of t.columns; track c.name) {
                        <span class="badge badge-neutral !font-normal">
                          <span class="font-mono">{{ c.name }}</span>&nbsp;<span class="text-text-muted">{{ typeLabel(c.type) }}</span>
                          @if (c.primaryKey) { <span class="text-primary font-semibold">&nbsp;kulcs</span> }
                          @if (c.references) { <span class="text-secondary">&nbsp;→ {{ c.references }}</span> }
                        </span>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>

            @if (r.referenceChecks.length > 0) {
              <div data-testid="sql-gen-reference-checks">
                <h3 class="font-semibold text-sm mb-1">A feladatsor megoldásai az új sémán</h3>
                <ul class="space-y-1 text-sm">
                  @for (task of r.referenceChecks; track task.taskId) {
                    @for (s of task.subtasks; track $index) {
                      <li class="flex flex-wrap items-center gap-2">
                        <span class="min-w-0">{{ task.taskTitle }} – {{ s.label }}</span>
                        <span class="badge" [class]="referenceBadge(s)">{{ referenceLabel(s) }}</span>
                        @if (s.rows !== null) { <span class="text-xs text-text-muted">{{ s.rows }} sor</span> }
                        @if (s.message) { <span class="text-xs text-danger break-all">{{ s.message }}</span> }
                      </li>
                    }
                  }
                </ul>
              </div>
            }

            @for (f of r.files; track f.kind) {
              <details class="bg-bg-element rounded-xl p-3" [attr.data-testid]="'sql-gen-file-' + f.kind">
                <summary class="cursor-pointer text-sm font-medium">
                  {{ f.fileName }} <span class="text-text-muted font-normal">({{ sizeLabel(f.sizeBytes) }}{{ existingFileName(f) ? ' – a meglévő fájl lecserélődik' : '' }})</span>
                </summary>
                <pre class="mt-2 max-h-80 overflow-auto text-xs font-mono whitespace-pre bg-bg-panel rounded-lg p-2">{{ preview(f) }}</pre>
              </details>
            }

            @if (saveError()) {
              <p class="text-sm text-danger" data-testid="sql-gen-save-error">{{ saveError() }}</p>
            }

            <div class="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" class="btn btn-ghost" (click)="back()" [disabled]="saving()" data-testid="sql-gen-back">Vissza</button>
              <button type="button" class="btn btn-primary" (click)="save()" [disabled]="!r.canSave || saving()" data-testid="sql-gen-save">
                {{ saving() ? 'Mentés…' : 'Mentés' }}
              </button>
            </div>
          </div>
        } @else {
          <!-- ── 1. Forrás választása ─────────────────────── -->
          <div class="space-y-4" data-testid="sql-gen-input">
            <p class="text-sm text-text-muted">
              Az SQL-feladatokhoz a <span class="font-mono">create.sql</span> és a <span class="font-mono">create_lite.sql</span> is kell
              (a futtató SQLite-ot használ). Itt elkészítheted, ami hiányzik. A táblaszerkezetet (típusok, kulcsok) az MI javasolja a
              napi MI-keretedből; az adatsorokat a rendszer alakítja át, azokat nem az MI írja. Mentés előtt mindent átnézhetsz.
            </p>

            <fieldset class="space-y-2">
              <legend class="text-sm font-medium mb-1">Miből készüljön?</legend>
              @for (option of options(); track option.value) {
                <label class="flex items-start gap-2 rounded-xl p-3 border border-border-default"
                  [class.opacity-60]="!option.enabled" [class.border-primary]="source() === option.value">
                  <input type="radio" name="sql-gen-source" class="mt-1" [value]="option.value" [disabled]="!option.enabled"
                    [checked]="source() === option.value" (change)="source.set(option.value)" [attr.data-testid]="'sql-gen-source-' + option.value" />
                  <span>
                    <span class="text-sm font-medium block">{{ option.label }}</span>
                    <span class="text-xs text-text-muted block">{{ option.enabled ? option.help : option.missing }}</span>
                  </span>
                </label>
              }
            </fieldset>

            @if (source() === 'dataFiles') {
              <div class="space-y-3 bg-bg-element rounded-xl p-3" data-testid="sql-gen-data-options">
                <div>
                  <p class="text-sm font-medium mb-1">Adatfájlok (egy fájl = egy tábla)</p>
                  @for (f of inputFiles(); track f.id) {
                    <label class="flex items-center gap-2 text-sm">
                      <input type="checkbox" [checked]="selectedFileIds().has(f.id)" (change)="toggleFile(f.id)" [attr.data-testid]="'sql-gen-file-option-' + f.id" />
                      <span class="font-mono break-all">{{ f.originalFileName }}</span>
                    </label>
                  }
                </div>
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" [ngModel]="hasHeader()" (ngModelChange)="hasHeader.set($event)" [ngModelOptions]="{ standalone: true }" data-testid="sql-gen-has-header" />
                  Az első sor fejléc (oszlopnevek)
                </label>
                <div>
                  <label for="sql-gen-description" class="text-sm font-medium block mb-1">Rövid leírás (nem kötelező)</label>
                  <textarea id="sql-gen-description" rows="3" class="input !bg-bg-panel !px-2 !py-1 !text-sm" [maxLength]="maxDescription"
                    [ngModel]="description()" (ngModelChange)="description.set($event)" [ngModelOptions]="{ standalone: true }"
                    placeholder="Pl.: a versenyzok.txt azon mezője az egyedi azonosító, az eredmenyek.txt versenyzo mezője erre hivatkozik."
                    data-testid="sql-gen-description"></textarea>
                  <p class="text-xs text-text-muted mt-1">Táblákról, kulcsokról, típusokról - a táblanév alapból a fájl neve. {{ description().length }}/{{ maxDescription }}</p>
                </div>
              </div>
            }

            @if (error()) {
              <p class="text-sm text-danger" data-testid="sql-gen-error">{{ error() }}</p>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <button type="button" class="btn btn-ghost" (click)="close()">Mégse</button>
              <button type="button" class="btn btn-primary" (click)="generate()" [disabled]="!canGenerate()" data-testid="sql-gen-generate">
                Elkészítés
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class SqlGeneralasComponent implements OnInit {
  private readonly service = inject(TeacherTaskSetService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  /** A folyamatban lévő elkészítés - bezáráskor megszakítjuk (a válasz ne írjon egy már nem látható ablakba). */
  private generation: Subscription | null = null;

  readonly taskSetId = input.required<number>();
  /** A feladatsor fájljai (a forrás-választáshoz és a csere-jelzéshez). */
  readonly files = input.required<TeacherFileDto[]>();
  readonly closed = output<void>();
  /** Sikeres mentés után - a szerkesztő újratölti a feladatsort. */
  readonly saved = output<void>();

  readonly maxDescription = MAX_DESCRIPTION;
  readonly source = signal<SqlGenerationSource | null>(null);
  readonly description = signal('');
  readonly hasHeader = signal(true);
  readonly selectedFileIds = signal<Set<string>>(new Set());
  readonly generating = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly result = signal<SqlGenerationResultDto | null>(null);

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  private readonly hasKind = (kind: string) => this.files().some((f) => f.kind === kind);
  readonly inputFiles = computed(() => this.files().filter((f) => f.kind === 'InputTxt'));

  readonly options = computed(() => [
    {
      value: 'createSql' as const,
      label: 'create.sql → create_lite.sql',
      help: 'A feltöltött create.sql (MS SQL, MySQL vagy Access nyelvjárás) SQLite-változata.',
      missing: 'Ehhez előbb töltsd fel a create.sql fájlt.',
      enabled: this.hasKind('CreateSql'),
    },
    {
      value: 'createLiteSql' as const,
      label: 'create_lite.sql → create.sql',
      help: 'A feltöltött create_lite.sql MS SQL Server-változata (pl. SSMS-hez).',
      missing: 'Ehhez előbb töltsd fel a create_lite.sql fájlt.',
      enabled: this.hasKind('CreateLiteSql'),
    },
    {
      value: 'dataFiles' as const,
      label: 'Adatfájlokból mindkettő',
      help: 'Érettségi-stílusú bemeneti fájlokból (.txt, tabulátorral vagy pontosvesszővel tagolt, fejléccel): create.sql és create_lite.sql.',
      missing: 'Ehhez előbb tölts fel legalább egy bemeneti fájlt (.txt).',
      enabled: this.inputFiles().length > 0,
    },
  ]);

  readonly canGenerate = computed(() => {
    const source = this.source();
    if (!source || this.generating() || !this.options().find((o) => o.value === source)?.enabled) return false;
    return source !== 'dataFiles' || this.selectedFileIds().size > 0;
  });

  ngOnInit(): void {
    this.selectedFileIds.set(new Set(this.inputFiles().map((f) => f.id)));
    // Alapból az, ami hiányzik: create.sql van, lite nincs → lite; fordítva → create.sql; egyik sincs → adatfájlokból.
    const hasCreate = this.hasKind('CreateSql');
    const hasLite = this.hasKind('CreateLiteSql');
    const preferred: SqlGenerationSource | null =
      hasCreate && !hasLite ? 'createSql' : hasLite && !hasCreate ? 'createLiteSql' : this.inputFiles().length > 0 ? 'dataFiles' : hasCreate ? 'createSql' : null;
    this.source.set(preferred);
    setTimeout(() => this.dialog()?.nativeElement.focus());
  }

  toggleFile(id: string): void {
    this.selectedFileIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  generate(): void {
    const source = this.source();
    if (!source || !this.canGenerate()) return;
    this.generating.set(true);
    this.error.set(null);
    this.generation = this.service
      .generateSqlFiles(this.taskSetId(), {
        source,
        description: source === 'dataFiles' ? this.description().trim() || null : null,
        fileIds: source === 'dataFiles' ? [...this.selectedFileIds()] : null,
        hasHeader: this.hasHeader(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.generating.set(false);
          this.result.set(result);
        },
        error: (err) => {
          this.generating.set(false);
          this.error.set(extractErrorMessage(err, 'A fájl elkészítése nem sikerült.'));
        },
      });
  }

  back(): void {
    this.result.set(null);
    this.saveError.set(null);
  }

  /** A szokásos feltöltés fájlonként, egymás után (create.sql előbb) - a feltöltés védelmei (élő vizsga, kvóta) itt is érvényesek. */
  save(): void {
    const result = this.result();
    if (!result?.canSave || this.saving()) return;
    this.saving.set(true);
    this.saveError.set(null);
    const uploads = result.files.map((f) =>
      this.service.uploadFile(this.taskSetId(), f.kind, new File([f.content], f.fileName, { type: 'application/sql' })),
    );
    concat(...uploads)
      .pipe(toArray())
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toastService.success(result.files.length > 1 ? 'A create.sql és a create_lite.sql elmentve.' : `${result.files[0].fileName} elmentve.`);
          this.saved.emit();
          this.closed.emit();
        },
        error: (err) => {
          this.saving.set(false);
          this.saveError.set(extractErrorMessage(err, 'A mentés nem sikerült.'));
          // Ha az első fájl már felment, a szerkesztő listája frissüljön.
          this.saved.emit();
        },
      });
  }

  close(): void {
    if (this.saving()) return;
    this.generation?.unsubscribe();
    this.generation = null;
    this.generating.set(false);
    this.closed.emit();
  }

  existingFileName(file: GeneratedSqlFileDto): string | null {
    return this.files().find((f) => f.kind === file.kind)?.originalFileName ?? null;
  }

  preview(file: GeneratedSqlFileDto): string {
    const lines = file.content.split('\n');
    return lines.length <= PREVIEW_LINES
      ? file.content
      : `${lines.slice(0, PREVIEW_LINES).join('\n')}\n… (további ${lines.length - PREVIEW_LINES} sor - a mentés a teljes fájlt tartalmazza)`;
  }

  sizeLabel(bytes: number): string {
    return bytes < 1024 ? `${bytes} bájt` : `${Math.round(bytes / 1024)} KB`;
  }

  typeLabel(type: string): string {
    return (
      { INTEGER: 'egész', DECIMAL: 'tizedes', TEXT: 'szöveg', DATE: 'dátum', DATETIME: 'dátum+idő', TIME: 'idő', BOOLEAN: 'logikai' }[type] ??
      type.toLowerCase()
    );
  }

  referenceLabel(s: ReferenceSubtaskCheckDto): string {
    return REFERENCE_STATUS[s.status]?.label ?? s.status;
  }

  referenceBadge(s: ReferenceSubtaskCheckDto): string {
    return REFERENCE_STATUS[s.status]?.badge ?? 'badge-neutral';
  }
}
