import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AiCodeTaskQuotaDto } from '../../models/ai-code-task.model';
import { OfficeFileKind } from '../../models/office-task.model';
import { RubricQuotaDto } from '../../models/teacher-content.model';
import { ReportService } from '../../services/report/report.service';
import { TeacherAiCodeTaskService } from '../../services/teacher-ai-code-task/teacher-ai-code-task.service';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import {
  AI_HELPER_PREMIUM_TEXT,
  AI_HELPER_QUOTA_EXHAUSTED_TEXT,
  AiHelperQuotaDto,
  AiHelperQuotaItemDto,
} from '../../shared/ai-helper-quota.util';
import { IconComponent } from '../../shared/icon/icon.component';

/** A vázlatban kijelölt feladat - a panel ehhez kínálja a feladatszintű segítségeket. */
export interface MiSegitoSelection {
  label: string;
  programming: boolean;
  sql: boolean;
}

/** Egy MI-segítség keret-állapota: a kijelzett „used/limit” és a tiltás oka (prémium hiánya vagy elfogyott keret). */
export interface QuotaState {
  usage: string | null;
  blocked: string | null;
}

/** Ismeretlen keret (hiba, nincs válasz) → nincs szám és nincs tiltás: a dialógus maga is kezeli a keretet. */
export function quotaState(quota: AiHelperQuotaItemDto | null | undefined, premium: boolean | undefined): QuotaState {
  if (premium === false) return { usage: null, blocked: AI_HELPER_PREMIUM_TEXT };
  if (!quota) return { usage: null, blocked: null };
  return {
    usage: `havi keret: ${quota.used}/${quota.limit}`,
    blocked: quota.used >= quota.limit ? AI_HELPER_QUOTA_EXHAUSTED_TEXT : null,
  };
}

const OFFICE_KINDS: { kind: OfficeFileKind; label: string }[] = [
  { kind: 'excel', label: 'Excel' },
  { kind: 'word', label: 'Word' },
  { kind: 'powerpoint', label: 'PowerPoint' },
  { kind: 'web', label: 'Weblap' },
  { kind: 'graphics', label: 'Kép' },
];

/**
 * A feladatsor-szerkesztő jobb oldali MI-segítő panelje: a meglévő MI-dialógusok egyetlen belépési pontja,
 * a meglévő keret-végpontok (ai-helpers, rubric, ai-code-task) számaival. A dialógusokat a szerkesztő hosztolja,
 * a panel csak jelez; a keretek a dialógusok bezárása után (és a szerkesztő `reload()` hívására) újratöltődnek.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-mi-segito-panel',
  standalone: true,
  // A ragadós hasáb maga a host (a rács cellája), különben a tartalom magasságú hostban nem ragadna.
  host: { class: 'block min-w-0 xl:sticky xl:top-4' },
  imports: [FormsModule, NgTemplateOutlet, RouterLink, IconComponent],
  template: `
    <aside aria-labelledby="ai-panel-title" class="card !rounded-xl p-4 space-y-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto"
      data-testid="ai-panel">
      <div>
        <h2 id="ai-panel-title" class="font-bold flex items-center gap-2">
          <app-icon name="sparkles" class="w-5 h-5 block text-primary" /> MI-segítő
        </h2>
        <p class="text-xs text-text-muted mt-1">Minden MI-funkció egy helyen. A javaslatot mindig átnézheted, mielőtt mented.</p>
      </div>
      @if (takedown()) {
        <p class="text-xs text-danger" data-testid="ai-panel-takedown">Visszavont feladatsoron az MI-segítségek nem használhatók.</p>
      }

      <section aria-labelledby="ai-panel-task" class="space-y-3">
        <h3 id="ai-panel-task" class="text-xs font-semibold uppercase tracking-wide text-text-muted">A kijelölt feladathoz</h3>
        @if (selection(); as sel) {
          <p class="text-sm font-medium truncate" data-testid="ai-panel-selection">{{ sel.label }}</p>
        } @else {
          <p class="text-sm text-text-muted" data-testid="ai-panel-no-selection">Válassz feladatot a vázlatban.</p>
        }

        <div>
          <button type="button" class="btn btn-ghost w-full justify-start !px-3 !py-1.5 text-sm"
            [disabled]="takedown() || !selection() || !!rubric().blocked" (click)="rubricRequested.emit()" data-testid="ai-rubric-open">
            Szempontlista-vázlat
          </button>
          <ng-container *ngTemplateOutlet="hint; context: { $implicit: rubric(), id: 'rubric', text: 'a feladatszövegből és a megoldásból' }" />
        </div>

        @if (selection()?.programming) {
          <div>
            <button type="button" class="btn btn-ghost w-full justify-start !px-3 !py-1.5 text-sm"
              [disabled]="takedown() || !!code().blocked" (click)="aiTaskRequested.emit('complete')" data-testid="ai-complete-open">
              Hiányzó részek pótlása
            </button>
            <ng-container *ngTemplateOutlet="hint; context: { $implicit: code(), id: 'complete', text: 'mintamegoldás, kódrészletek, bemenet' }" />
          </div>
        }

        @if (selection()?.sql) {
          <div>
            <button type="button" class="btn btn-ghost w-full justify-start !px-3 !py-1.5 text-sm"
              [disabled]="takedown()" (click)="sqlQueriesRequested.emit()" data-testid="sql-queries-open">
              SQL megoldó lekérdezések
            </button>
            <ng-container *ngTemplateOutlet="hint; context: { $implicit: null, id: 'sql-queries', text: 'részfeladatonként, SQLite-on futtatva' }" />
          </div>
        }
      </section>

      <section aria-labelledby="ai-panel-new" class="space-y-3 border-t border-border-default pt-4">
        <h3 id="ai-panel-new" class="text-xs font-semibold uppercase tracking-wide text-text-muted">Új feladat</h3>

        <div>
          <button type="button" class="btn btn-ghost w-full justify-start !px-3 !py-1.5 text-sm"
            [disabled]="takedown() || !!code().blocked" (click)="aiTaskRequested.emit('new')" data-testid="ai-new-open">
            Új programozási feladat
          </button>
          <ng-container *ngTemplateOutlet="hint; context: { $implicit: code(), id: 'new', text: 'mintamegoldással, lefuttatva' }" />
        </div>

        <div>
          <label class="block text-xs text-text-muted mb-1" for="ai-office-kind">Irodai feladat a megoldott fájlból</label>
          <div class="flex gap-2">
            <select id="ai-office-kind" class="input !w-auto !px-2 !py-1 min-w-0 flex-1" [ngModel]="officeKind()"
              (ngModelChange)="officeKind.set($event)" data-testid="office-task-kind">
              @for (option of officeKinds; track option.kind) {
                <option [ngValue]="option.kind">{{ option.label }}</option>
              }
            </select>
            <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm shrink-0"
              [disabled]="takedown() || !!office().blocked" (click)="officeTaskRequested.emit(officeKind())" data-testid="office-task-open">
              Megnyitás
            </button>
          </div>
          <ng-container *ngTemplateOutlet="hint; context: { $implicit: office(), id: 'office', text: 'Excel, Word, PowerPoint, weblap, kép' }" />
        </div>

        <div>
          <button type="button" class="btn btn-ghost w-full justify-start !px-3 !py-1.5 text-sm"
            [disabled]="takedown() || !!desktop().blocked" (click)="desktopTaskRequested.emit()" data-testid="desktop-task-open">
            Asztali feladatsor témából
          </button>
          <ng-container *ngTemplateOutlet="hint; context: { $implicit: desktop(), id: 'desktop', text: 'WPF / WinForms' }" />
        </div>

        @if (sqlAvailable()) {
          <div>
            <button type="button" class="btn btn-ghost w-full justify-start !px-3 !py-1.5 text-sm"
              [disabled]="takedown()" (click)="sqlFilesRequested.emit()" data-testid="ai-sql-files-open">
              Hiányzó SQL-fájl elkészítése
            </button>
            <ng-container *ngTemplateOutlet="hint; context: { $implicit: null, id: 'sql-files', text: 'create.sql ↔ create_lite.sql vagy az adatfájlokból' }" />
          </div>
        }

        <div>
          <a routerLink="/feladatsorok" [queryParams]="{ katalogus: 1 }" class="block text-sm text-primary hover:underline px-3"
            data-testid="ai-catalog-link">Másolás a katalógusból</a>
          <ng-container *ngTemplateOutlet="hint; context: { $implicit: null, id: 'catalog', text: 'hivatalos sor piszkozatként' }" />
        </div>
      </section>
    </aside>

    <!-- Egy sor alatti rövid leírás, mellette a keret („leírás · havi keret: x/y”); tiltásnál az ok külön sorban. -->
    <ng-template #hint let-state let-id="id" let-text="text">
      <p class="text-xs text-text-muted mt-1 px-3" [attr.data-testid]="'ai-hint-' + id">
        {{ text }}@if (state?.usage && !state?.blocked) {
          · <span [attr.data-testid]="'ai-quota-' + id">{{ state.usage }}</span>
        }
      </p>
      @if (state?.blocked) {
        <p class="text-xs text-danger mt-1 px-3" [attr.data-testid]="'ai-quota-blocked-' + id">{{ state.blocked }}</p>
      }
    </ng-template>
  `,
})
export class MiSegitoPanelComponent {
  private readonly reportService = inject(ReportService);
  private readonly rubricService = inject(TeacherRubricService);
  private readonly aiCodeTaskService = inject(TeacherAiCodeTaskService);

  readonly takedown = input(false);
  readonly selection = input<MiSegitoSelection | null>(null);
  /** Van-e SQL a feladatsorban (a szerkesztő `showSqlGeneration()`-je) - csak ekkor kínáljuk a hiányzó SQL-fájlt. */
  readonly sqlAvailable = input(false);
  /** Nyitva van-e valamelyik MI-dialógus - bezáráskor a keretek újratöltődnek. */
  readonly dialogOpen = input(false);

  readonly rubricRequested = output<void>();
  readonly aiTaskRequested = output<'new' | 'complete'>();
  readonly sqlQueriesRequested = output<void>();
  readonly sqlFilesRequested = output<void>();
  readonly officeTaskRequested = output<OfficeFileKind>();
  readonly desktopTaskRequested = output<void>();

  readonly officeKinds = OFFICE_KINDS;
  readonly officeKind = signal<OfficeFileKind>('excel');

  private readonly helperQuota = signal<AiHelperQuotaDto | null>(null);
  private readonly rubricQuota = signal<RubricQuotaDto | null>(null);
  private readonly codeQuota = signal<AiCodeTaskQuotaDto | null>(null);

  readonly rubric = computed(() => quotaState(this.rubricQuota(), undefined));
  readonly code = computed(() => quotaState(this.codeQuota(), this.codeQuota()?.isPremium));
  readonly office = computed(() => quotaState(this.helperQuota()?.officeTask, this.helperQuota()?.premium));
  readonly desktop = computed(() => quotaState(this.helperQuota()?.desktopTask, this.helperQuota()?.premium));

  private lastDialogOpen: boolean | null = null;

  constructor() {
    // Első futáskor (init) és minden dialógus-bezáráskor (true → false) egyszer töltjük a három keretet.
    effect(() => {
      const open = this.dialogOpen();
      if (!open && this.lastDialogOpen !== false) this.reload();
      this.lastDialogOpen = open;
    });
  }

  /** A három keret újratöltése - a szerkesztő hívja a nem dialógusos MI-használat után is (inline szempontlista-vázlat). */
  reload(): void {
    this.reportService.getAiHelperQuota().subscribe({ next: (q) => this.helperQuota.set(q), error: () => this.helperQuota.set(null) });
    this.rubricService.getRubricQuota().subscribe({ next: (q) => this.rubricQuota.set(q), error: () => this.rubricQuota.set(null) });
    this.aiCodeTaskService.getQuota().subscribe({ next: (q) => this.codeQuota.set(q), error: () => this.codeQuota.set(null) });
  }
}
