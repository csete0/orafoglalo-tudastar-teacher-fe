import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription } from 'rxjs';
import { WeakTopicSuggestionDto, WeakTopicSummaryDto, WeakTopicSummaryTopicDto } from '../../models/report.model';
import { ReportService } from '../../services/report/report.service';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

/** A javaslat egyedi kulcsa (egy feladatsor/kvíz több témakörnél is felbukkanhat). */
export function suggestionKey(s: Pick<WeakTopicSuggestionDto, 'kind' | 'id'>): string {
  return `${s.kind}-${s.id}`;
}

/** Fizetős tartalom - a diák indításkor ugyanezt a szabályt kapja. */
export function accessLabel(s: WeakTopicSuggestionDto): string {
  if (!s.isPaid) return 'Ingyenes';
  return s.requiredTier === 'premium'
    ? 'Prémium – diákjaidnak Prémium előfizetés vagy iskolai licenc kell'
    : 'Fizetős – diákjaidnak előfizetés vagy iskolai licenc kell';
}

/** Miért nem adható ki egy hivatalos sor (action: none) - a szerver oka elsőként (pl. visszavont másolat). */
export function blockedReason(s: WeakTopicSuggestionDto): string {
  if (s.reason?.trim()) return s.reason.trim();
  if (s.requiredTier === 'premium') return 'Prémium tartalom - a kiadásához Prémium előfizetés kell.';
  if (s.isPaid) return 'Fizetős tartalom - a kiadásához előfizetés kell.';
  return 'Ezt a feladatsort most nem adhatod ki.';
}

export const COPY_IN_PROGRESS = 'CopyInProgress';
export const COPY_IN_PROGRESS_TEXT = 'A másolás még folyamatban van - próbáld újra pár másodperc múlva.';

/** A kiadás hibája érthető magyar mondatként (a rate limiter 429-es válasza nem `errorMessage` alakú). */
export function assignErrorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 429) return 'Rövid időn belül túl sok másolást indítottál - várj néhány percet, és próbáld újra.';
  if (status === 0) return 'Nem sikerült elérni a szervert - ellenőrizd az internetkapcsolatot, és próbáld újra.';
  return extractErrorMessage(err, 'A kiadás nem sikerült.');
}

/** Lefelé kerekített egész százalék - ugyanúgy, mint az összefoglaló mondatai (így sosem „50%” egy „50% alatt” mondat mellett). */
export function floorPercent(value: number): number {
  return Math.floor(value + 1e-9);
}

const TREND_LABELS: Record<string, string> = { improving: 'javul', declining: 'romlik', steady: 'nem változott érdemben' };

/**
 * „Gyenge témák” fül felső része: MI nélküli magyar összefoglaló a csoport 3 leggyengébb kvíz-témaköréről, és témakörönként
 * gyakorló javaslatok (saját feladatsor / hivatalos feladatsor / saját kvíz) egykattintásos kiadással. A hivatalos sor kiadása
 * megerősítést kér (másolat készül a saját feladatsorok közé), és opcionálisan nyitási dátumot / határidőt.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-gyenge-temak-javaslatok',
  standalone: true,
  imports: [FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div aria-live="polite" [attr.aria-busy]="loading()" data-testid="weak-summary">
      @if (loading()) {
        <app-local-spinner />
      } @else if (error()) {
        <div class="text-sm text-danger flex flex-wrap items-center gap-3 mb-4" data-testid="weak-summary-error">
          <span>{{ error() }}</span>
          <button type="button" class="btn btn-ghost !px-3 !py-1" (click)="load()">Újra</button>
        </div>
      } @else if (summary(); as s) {
        @if (s.topics.length > 0 && s.sentences.length > 0) {
          <div class="card p-4 mb-4 space-y-1.5 text-sm" data-testid="weak-summary-sentences">
            @for (sentence of s.sentences; track $index) {
              <p>{{ sentence }}</p>
            }
          </div>
        }
        @if (!s.canAssign && hasActions(s)) {
          <p class="text-sm text-text-muted mb-4" data-testid="weak-summary-archived">Archivált csoportnak nem adható ki semmi.</p>
        }

        @for (topic of s.topics; track topic.topicId) {
          @if (topic.taskSets.length + topic.quizzes.length > 0) {
            <section class="card p-4 mb-4" [attr.aria-labelledby]="'weak-topic-' + topic.topicId" [attr.data-testid]="'weak-topic-' + topic.topicId">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <h3 class="font-semibold" [id]="'weak-topic-' + topic.topicId">Gyakorlás: {{ topic.topicName }}</h3>
                <span class="text-xs text-text-muted">
                  {{ pct(topic.successRate) }}% helyes · {{ topic.weakStudentCount }}/{{ topic.studentCount }} diák a küszöb alatt
                  @if (topic.trend) { · {{ trendLabel(topic) }} }
                </span>
              </div>
              <ul class="space-y-2">
                @for (item of suggestions(topic); track key(item)) {
                  <li class="bg-bg-element rounded-xl p-3 flex flex-wrap items-center gap-3" [attr.data-testid]="'weak-suggestion-' + key(item)">
                    <div class="min-w-0 flex-[1_1_14rem]">
                      <p class="font-medium break-words">{{ item.title }}</p>
                      <div class="flex flex-wrap items-center gap-1.5 mt-1">
                        <span class="badge badge-neutral">{{ item.kind === 'quiz' ? 'Kvíz' : 'Feladatsor' }}</span>
                        <span class="badge" [class.badge-primary]="item.source === 'catalog'" [class.badge-neutral]="item.source !== 'catalog'">
                          {{ item.source === 'catalog' ? 'Hivatalos' : 'Saját' }}
                        </span>
                        <span class="badge" [class.badge-warning]="item.isPaid" [class.badge-success]="!item.isPaid"
                          [attr.data-testid]="'weak-access-' + key(item)">{{ item.isPaid ? (item.requiredTier === 'premium' ? 'Prémium' : 'Fizetős') : 'Ingyenes' }}</span>
                        <span class="text-xs text-text-muted">{{ item.itemCount }} {{ item.kind === 'quiz' ? 'kérdés a témakörből' : 'feladat' }}</span>
                      </div>
                      @if (item.isPaid) {
                        <p class="text-xs text-warning mt-1 break-words" [attr.data-testid]="'weak-paid-' + key(item)">{{ paidNote(item) }}</p>
                      }
                    </div>
                    <div class="shrink-0 flex flex-col items-end gap-1 max-w-full">
                      @switch (effectiveAction(item)) {
                        @case ('assigned') {
                          <span class="badge badge-success" [attr.data-testid]="'weak-assigned-' + key(item)">
                            <app-icon name="check" class="w-3.5 h-3.5 inline-block align-[-2px]" /> Kiadva
                          </span>
                        }
                        @case ('none') {
                          <button type="button" class="btn btn-primary !px-3 !py-1.5" disabled [attr.aria-describedby]="'weak-blocked-' + key(item)"
                            [attr.data-testid]="'weak-assign-' + key(item)">Kiadás</button>
                          <span class="text-xs text-text-muted text-right max-w-xs" [id]="'weak-blocked-' + key(item)"
                            [attr.data-testid]="'weak-blocked-' + key(item)">{{ blocked(item) }}</span>
                        }
                        @default {
                          @if (s.canAssign) {
                            <button type="button" class="btn btn-primary !px-3 !py-1.5" (click)="act(item)" [disabled]="busyKey() !== null"
                              [attr.aria-label]="'„' + item.title + '” kiadása a csoportnak'" [attr.data-testid]="'weak-assign-' + key(item)">
                              {{ busyKey() === key(item) ? 'Kiadás…' : 'Kiadás' }}
                            </button>
                          }
                        }
                      }
                      @if (errors()[key(item)]; as err) {
                        <span class="text-xs text-danger text-right" role="alert" [attr.data-testid]="'weak-error-' + key(item)">{{ err }}</span>
                      }
                    </div>
                  </li>
                }
              </ul>
            </section>
          }
        }
      }
    </div>

    @if (pendingCatalog(); as item) {
      <!-- Hivatalos sor kiadása: másolat készül → megerősítés + opcionális dátumok. -->
      <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" (keydown.escape)="closeCatalog()">
        <div class="fixed inset-0 bg-black/40" data-testid="weak-catalog-backdrop" (click)="closeCatalog()"></div>
        <div #catalogDialog role="dialog" aria-modal="true" aria-labelledby="weak-catalog-title" aria-describedby="weak-catalog-help" tabindex="-1"
          data-testid="weak-catalog-dialog" class="card relative w-full max-w-lg min-w-0 p-4 sm:p-6 shadow-xl my-8 sm:my-auto outline-none">
          <div class="flex items-start justify-between gap-3 mb-3">
            <h2 id="weak-catalog-title" class="font-bold text-lg">Hivatalos feladatsor kiadása</h2>
            <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="closeCatalog()" [disabled]="busyKey() !== null">
              <app-icon name="x" class="w-5 h-5 block" />
            </button>
          </div>
          <div id="weak-catalog-help" class="text-sm space-y-2 mb-4">
            <p>
              A(z) „{{ item.title }}” ({{ item.itemCount }} feladat)
              @if (item.assignTaskSetId) {
                már meglévő másolatát adjuk ki a csoportnak (ha még nincs publikálva, előbb publikáljuk).
              } @else {
                másolata a saját feladatsoraid közé kerül, publikáljuk, és kiadjuk a csoportnak. A másolatot később szerkesztheted.
              }
            </p>
            <p [class.text-warning]="item.isPaid" [class.text-success]="!item.isPaid" data-testid="weak-catalog-access">
              {{ item.isPaid ? paidNote(item) + '; dolgozatban mindenki elérheti.' : 'Ingyenes – minden diákod eléri.' }}
            </p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="text-sm text-text-muted">Nyitás dátuma (nem kötelező)</span>
              <input type="datetime-local" class="input mt-1" [ngModel]="opensAt()" (ngModelChange)="opensAt.set($event)"
                [ngModelOptions]="{ standalone: true }" data-testid="weak-catalog-opens" />
            </label>
            <label class="block">
              <span class="text-sm text-text-muted">Határidő (nem kötelező)</span>
              <input type="datetime-local" class="input mt-1" [ngModel]="dueAt()" (ngModelChange)="dueAt.set($event)"
                [ngModelOptions]="{ standalone: true }" data-testid="weak-catalog-due" />
            </label>
          </div>
          @if (datesInvalid()) {
            <p class="text-sm text-danger mt-2" data-testid="weak-catalog-dates-error">A nyitás dátuma nem lehet a határidő után.</p>
          }
          @if (errors()[key(item)]; as err) {
            <p class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger mt-3" role="alert" data-testid="weak-catalog-error">{{ err }}</p>
          }
          <div class="flex flex-wrap justify-end gap-2 mt-4">
            <button type="button" class="btn btn-ghost" (click)="closeCatalog()" [disabled]="busyKey() !== null">Mégse</button>
            <button type="button" class="btn btn-primary" (click)="confirmCatalog()" [disabled]="busyKey() !== null || datesInvalid()"
              data-testid="weak-catalog-confirm">{{ busyKey() !== null ? 'Kiadás…' : 'Másolás és kiadás' }}</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class GyengeTemakJavaslatokComponent implements OnInit {
  private readonly reports = inject(ReportService);
  private readonly taskSets = inject(TeacherTaskSetService);
  private readonly quizzes = inject(TeacherQuizService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly groupId = input.required<number>();

  readonly summary = signal<WeakTopicSummaryDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  /** Ebben a nézetben kiadott javaslatok (a válasz `action`-je elavult lenne). */
  readonly assignedKeys = signal<Set<string>>(new Set());
  /** A folyamatban lévő kiadás - közben a többi gomb tiltva (dupla kattintás / párhuzamos másolás ellen). */
  readonly busyKey = signal<string | null>(null);
  readonly errors = signal<Record<string, string>>({});
  /** A megerősítésre váró hivatalos sor (párbeszédablak). */
  readonly pendingCatalog = signal<WeakTopicSuggestionDto | null>(null);
  readonly opensAt = signal('');
  readonly dueAt = signal('');

  private loadRequest: Subscription | null = null;
  private readonly catalogDialog = viewChild<ElementRef<HTMLElement>>('catalogDialog');

  readonly key = suggestionKey;
  readonly pct = floorPercent;
  readonly paidNote = accessLabel;
  readonly blocked = blockedReason;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    // Az előző (pl. „Újra” előtti) kérés megszakítva - elavult válasz nem írhat felül.
    this.loadRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.loadRequest = this.reports
      .getGroupWeakTopicSummary(this.groupId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.loading.set(false);
          this.summary.set(summary);
          this.assignedKeys.set(new Set());
          this.errors.set({});
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(extractErrorMessage(err, 'Az összefoglaló betöltése nem sikerült.'));
        },
      });
  }

  suggestions(topic: WeakTopicSummaryTopicDto): WeakTopicSuggestionDto[] {
    return [...topic.taskSets, ...topic.quizzes];
  }

  hasActions(s: WeakTopicSummaryDto): boolean {
    return s.topics.some((t) => this.suggestions(t).some((x) => x.action === 'assign' || x.action === 'copyAssign'));
  }

  effectiveAction(item: WeakTopicSuggestionDto): WeakTopicSuggestionDto['action'] {
    return this.assignedKeys().has(suggestionKey(item)) ? 'assigned' : item.action;
  }

  trendLabel(topic: WeakTopicSummaryTopicDto): string {
    const t = topic.trend!;
    return `2 hét alatt ${TREND_LABELS[t.direction] ?? t.direction} (${t.previousPercent}% → ${t.recentPercent}%)`;
  }

  readonly datesInvalid = computed(() => !!this.opensAt() && !!this.dueAt() && new Date(this.opensAt()) > new Date(this.dueAt()));

  act(item: WeakTopicSuggestionDto): void {
    if (this.busyKey() !== null || !this.summary()?.canAssign) return;
    if (item.action === 'copyAssign') {
      this.opensAt.set('');
      this.dueAt.set('');
      this.clearError(item);
      this.pendingCatalog.set(item);
      setTimeout(() => this.catalogDialog()?.nativeElement.focus());
      return;
    }
    if (item.action !== 'assign') return;
    if (item.kind === 'taskSet' && item.assignTaskSetId == null) return;
    const groupId = this.groupId();
    const call: Observable<unknown> =
      item.kind === 'quiz'
        ? this.quizzes.assignToGroup(item.id, { groupId })
        : this.taskSets.assignToGroup(item.assignTaskSetId!, { groupId });
    this.run(item, call, () => this.toastService.success(`„${item.title}” kiadva a csoportnak.`));
  }

  confirmCatalog(): void {
    const item = this.pendingCatalog();
    if (!item || this.busyKey() !== null || this.datesInvalid()) return;
    const call = this.taskSets.catalogAssign(this.groupId(), {
      catalogTaskSetId: item.id,
      opensAt: this.opensAt() ? new Date(this.opensAt()).toISOString() : null,
      dueAt: this.dueAt() ? new Date(this.dueAt()).toISOString() : null,
    });
    this.run(item, call, (res) => {
      const r = res as { copied: boolean; warnings: string[] };
      this.pendingCatalog.set(null);
      const summary = `„${item.title}” kiadva a csoportnak${r.copied ? ' - a másolat a saját feladatsoraid közé került' : ''}.`;
      if (r.warnings?.length) this.toastService.warning(`${summary} Figyelem: ${r.warnings.join(' ')}`, 10000);
      else this.toastService.success(summary);
    });
  }

  closeCatalog(): void {
    // A futó másolás+kiadás nem szakítható meg félúton (a szerver több lépésben dolgozik) - addig nyitva marad.
    if (this.busyKey() !== null) return;
    this.pendingCatalog.set(null);
  }

  private run(item: WeakTopicSuggestionDto, call: Observable<unknown>, onSuccess: (res: unknown) => void): void {
    const key = suggestionKey(item);
    this.busyKey.set(key);
    this.clearError(item);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (res) => {
        this.busyKey.set(null);
        this.assignedKeys.update((current) => new Set(current).add(key));
        onSuccess(res);
      },
      error: (err) => {
        this.busyKey.set(null);
        // Párhuzamos másolás (pl. másik lapon): nem hiba, csak várni kell - rövid toast, a gomb újra kattintható.
        if ((err as { error?: { errorType?: string } })?.error?.errorType === COPY_IN_PROGRESS) {
          this.toastService.warning(COPY_IN_PROGRESS_TEXT);
          return;
        }
        this.errors.update((current) => ({ ...current, [key]: assignErrorMessage(err) }));
      },
    });
  }

  private clearError(item: WeakTopicSuggestionDto): void {
    const key = suggestionKey(item);
    if (!(key in this.errors())) return;
    this.errors.update((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
}
