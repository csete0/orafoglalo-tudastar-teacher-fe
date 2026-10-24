import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { concat, Subscription, toArray } from 'rxjs';
import { GeneratedSqlFileDto, SqlGenerationResultDto, SqlGenerationSource, TeacherFileDto } from '../../models/teacher-content.model';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { ToastService } from '../../shared/toast/toast.service';
import { DialogShellComponent } from '../../shared/dialog/dialog-shell.component';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { saveBlob } from '../../shared/save-blob.util';
import { SqlGenFileComponent } from './sql-generalas/sql-gen-file.component';
import { SqlGenSchemaComponent } from './sql-generalas/sql-gen-schema.component';

export { MAX_EDIT_BYTES } from './sql-generalas/sql-gen-file.component';

/** A BE-vel azonos korlát. */
const MAX_DESCRIPTION = 2000;

type SqlFileKind = GeneratedSqlFileDto['kind'];

/**
 * „Hiányzó SQL-fájl elkészítése” párbeszédablak a feladatsor-szerkesztőben. Lépések: forrás választása → elkészítés (a
 * táblaszerkezetet az MI javasolja a tanár napi MI-keretéből, az adatsorokat a rendszer alakítja át) → előnézet a futtatásos
 * ellenőrzéssel és figyelmeztetésekkel → „Mentés” a szokásos fájlfeltöltéssel (a meglévő azonos fajtájú fájl lecserélődik).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-sql-generalas',
  standalone: true,
  imports: [DialogShellComponent, FormsModule, IconComponent, LocalSpinnerComponent, SqlGenFileComponent, SqlGenSchemaComponent],
  template: `
    <app-dialog-shell labelledBy="sql-gen-title" testId="sql-generation-dialog" backdropTestId="sql-gen-backdrop"
      panelClass="card w-full max-w-3xl p-5 sm:p-6 shadow-xl my-8 sm:my-auto" (closed)="close()">
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
                  <span>
                    @if (r.source !== 'validate') {
                      A create_lite.sql hibátlanul lefutott a futtatón (SQLite), a táblák és a sorok száma egyezik a forrással.
                    } @else if (hasLiteText()) {
                      A javított fájl lefutott a futtatón (SQLite) hiba nélkül.
                      @if (r.comparedWith) { A táblák és a sorok száma egyezik ({{ r.comparedWith }}). }
                    } @else {
                      A javított create.sql értelmezhető – a futtató nem tudja lefuttatni, csak a szerkezet és a sorok száma ellenőrizhető.
                      @if (r.comparedWith) { A táblák és a sorok száma egyezik ({{ r.comparedWith }}). }
                    }
                  </span>
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

            <app-sql-gen-schema [result]="r" />

            @for (f of generatedFiles(); track f.kind) {
              <app-sql-gen-file [file]="f" [text]="texts()[f.kind] ?? f.content" [editing]="isEditing(f.kind)" [replaces]="replacesExisting(f)"
                (textChange)="edit(f.kind, $event)" (editToggle)="toggleEdit(f.kind)" (restore)="restore(f.kind)" (download)="download(f)" />
            }

            @if (dirty()) {
              <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning flex flex-wrap items-center justify-between gap-2" role="status" data-testid="sql-gen-dirty">
                <span>Módosítottad a fájlt – mentés előtt ellenőrizd újra.</span>
                <button type="button" class="btn btn-primary !px-3 !py-1" (click)="revalidate()" [disabled]="revalidating()" data-testid="sql-gen-revalidate">
                  {{ revalidating() ? 'Ellenőrzés…' : 'Újraellenőrzés' }}
                </button>
              </div>
            }
            @if (revalidateError()) {
              <p class="text-sm text-danger" role="alert" data-testid="sql-gen-revalidate-error">{{ revalidateError() }}</p>
            }

            @if (saveError()) {
              <p class="text-sm text-danger" data-testid="sql-gen-save-error">{{ saveError() }}</p>
            }

            <div class="flex flex-wrap justify-end gap-2 pt-2">
              <button type="button" class="btn btn-ghost" (click)="back()" [disabled]="saving()" data-testid="sql-gen-back">Vissza</button>
              <button type="button" class="btn btn-primary" (click)="save()" [disabled]="!canSave() || saving()" data-testid="sql-gen-save">
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
    </app-dialog-shell>
  `,
})
export class SqlGeneralasComponent implements OnInit {
  private readonly service = inject(TeacherTaskSetService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  /** A folyamatban lévő elkészítés - bezáráskor megszakítjuk (a válasz ne írjon egy már nem látható ablakba). */
  private generation: Subscription | null = null;
  /** A folyamatban lévő újraellenőrzés - Vissza / új elkészítés esetén megszakítjuk (az elavult válasz ne írjon az új előnézetbe). */
  private revalidation: Subscription | null = null;

  readonly taskSetId = input.required<number>();
  /** A feladatsor fájljai (a forrás-választáshoz és a csere-jelzéshez). */
  readonly files = input.required<TeacherFileDto[]>();
  /** Feladatonkénti sémánál a célfeladat - a mentés ehhez köti a fájlt (null: feladatsor-szintű, a régi viselkedés). */
  readonly taskId = input<number | null>(null);
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

  // ── Kézi javítás ──
  /** Az elkészítéskor kapott eredmény (a „Visszaállítás” ide tér vissza). */
  private readonly generatedResult = signal<SqlGenerationResultDto | null>(null);
  readonly generatedFiles = computed(() => this.generatedResult()?.files ?? []);
  /** A fájlok jelenlegi szövege (fajtánként) és az utoljára sikeresen ellenőrzött szöveg. */
  readonly texts = signal<Partial<Record<SqlFileKind, string>>>({});
  private readonly validatedTexts = signal<Partial<Record<SqlFileKind, string>>>({});
  private readonly editingKinds = signal<Set<SqlFileKind>>(new Set());
  readonly revalidating = signal(false);
  readonly revalidateError = signal<string | null>(null);
  /** Van-e ellenőrizetlen módosítás - amíg van, nem menthető. */
  readonly dirty = computed(() => {
    const texts = this.texts();
    const validated = this.validatedTexts();
    return (Object.keys(texts) as SqlFileKind[]).some((k) => texts[k] !== validated[k]);
  });
  readonly canSave = computed(() => !!this.result()?.canSave && !this.dirty());

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
          this.showGenerated(result);
        },
        error: (err) => {
          this.generating.set(false);
          this.error.set(extractErrorMessage(err, 'A fájl elkészítése nem sikerült.'));
        },
      });
  }

  back(): void {
    this.cancelRevalidation();
    this.result.set(null);
    this.generatedResult.set(null);
    this.saveError.set(null);
    this.revalidateError.set(null);
  }

  private cancelRevalidation(): void {
    this.revalidation?.unsubscribe();
    this.revalidation = null;
    this.revalidating.set(false);
  }

  readonly hasLiteText = computed(() => this.texts().CreateLiteSql !== undefined);

  private showGenerated(result: SqlGenerationResultDto): void {
    this.cancelRevalidation();
    this.generatedResult.set(result);
    const texts = Object.fromEntries(result.files.map((f) => [f.kind, f.content])) as Partial<Record<SqlFileKind, string>>;
    this.texts.set(texts);
    this.validatedTexts.set({ ...texts });
    this.editingKinds.set(new Set());
    this.revalidateError.set(null);
    this.result.set(result);
  }

  isEditing(kind: SqlFileKind): boolean {
    return this.editingKinds().has(kind);
  }

  toggleEdit(kind: SqlFileKind): void {
    this.editingKinds.update((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  edit(kind: SqlFileKind, text: string): void {
    this.texts.update((current) => ({ ...current, [kind]: text }));
  }

  /** Az elkészített szöveg vissza; ha így minden fájl az eredeti, az eredeti ellenőrzés is érvényes. */
  restore(kind: SqlFileKind): void {
    const generated = this.generatedResult();
    if (!generated) return;
    this.texts.update((current) => ({ ...current, [kind]: generated.files.find((f) => f.kind === kind)?.content }));
    if (generated.files.every((f) => this.texts()[f.kind] === f.content)) {
      this.validatedTexts.set({ ...this.texts() });
      this.result.set(generated);
    }
  }

  download(file: GeneratedSqlFileDto): void {
    saveBlob(new Blob([this.texts()[file.kind] ?? file.content], { type: 'application/sql;charset=utf-8' }), file.fileName);
  }

  /** A javított szöveg(ek) ellenőrzése a szerveren (MI nélkül); siker után menthető. */
  revalidate(): void {
    if (this.revalidating() || !this.generatedResult()) return;
    const sent = { ...this.texts() };
    const basis = this.generatedResult();
    this.revalidating.set(true);
    this.revalidateError.set(null);
    this.saveError.set(null);
    this.revalidation = this.service
      .validateSqlFiles(this.taskSetId(), { createSql: sent.CreateSql ?? null, createLiteSql: sent.CreateLiteSql ?? null })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.revalidating.set(false);
          // Közben új elkészítés vagy Vissza történt: az elavult válasz eldobva.
          if (this.generatedResult() !== basis) return;
          this.validatedTexts.set(sent);
          this.result.set(result);
        },
        error: (err) => {
          this.revalidating.set(false);
          if (this.generatedResult() !== basis) return;
          this.revalidateError.set(
            err?.status === 413
              ? 'A javított fájl túl nagy az ellenőrzéshez (legfeljebb 1 MB fájlonként) – töltsd le, és a feltöltővel töltsd vissza.'
              : extractErrorMessage(err, 'Az ellenőrzés nem sikerült.'),
          );
        },
      });
  }

  /** A szokásos feltöltés fájlonként, egymás után (create.sql előbb) - a feltöltés védelmei (élő vizsga, kvóta) itt is érvényesek. */
  save(): void {
    const result = this.result();
    if (!result || !this.canSave() || this.saving() || this.generatedFiles().length === 0) return;
    this.saving.set(true);
    this.saveError.set(null);
    // A (javított és újraellenőrzött) szöveg megy fel, a szokásos feltöltésen.
    const uploads = this.generatedFiles().map((f) =>
      this.service.uploadFile(
        this.taskSetId(),
        f.kind,
        new File([this.texts()[f.kind] ?? f.content], f.fileName, { type: 'application/sql' }),
        this.taskId() ?? undefined,
      ),
    );
    concat(...uploads)
      .pipe(toArray())
      .subscribe({
        next: () => {
          this.saving.set(false);
          const files = this.generatedFiles();
          this.toastService.success(files.length > 1 ? 'A create.sql és a create_lite.sql elmentve.' : `${files[0].fileName} elmentve.`);
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
    this.cancelRevalidation();
    this.generation?.unsubscribe();
    this.generation = null;
    this.generating.set(false);
    this.closed.emit();
  }

  /** Mentéskor lecserélődik-e egy meglévő fájl. */
  replacesExisting(file: GeneratedSqlFileDto): boolean {
    // Feladatonkénti sémánál csak a célfeladat (vagy a feladatsor-szintű) fájlja cserélődik.
    const taskId = this.taskId();
    return !!this.files().find((f) => f.kind === file.kind && (taskId === null || f.taskId == null || f.taskId === taskId))?.originalFileName;
  }
}
