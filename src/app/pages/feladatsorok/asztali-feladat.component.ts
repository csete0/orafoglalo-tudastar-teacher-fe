import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  DESKTOP_LIMITS,
  DesktopFramework,
  DesktopRubricItem,
  DesktopTaskItem,
  DesktopTaskJobDto,
  DesktopTaskLevel,
  DesktopTaskProposal,
  desktopTaskProblems,
} from '../../models/desktop-task.model';
import { ReportService } from '../../services/report/report.service';
import { TeacherDesktopTaskService } from '../../services/teacher-desktop-task/teacher-desktop-task.service';
import { DialogShellComponent } from '../../shared/dialog/dialog-shell.component';
import { AI_HELPER_PREMIUM_TEXT, aiHelperBlock, aiHelperErrorMessage, AiHelperQuotaItemDto, quotaRemaining } from '../../shared/ai-helper-quota.util';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { ToastService } from '../../shared/toast/toast.service';
import { injectAiJobPoller } from './shared/ai-job-poller';

/** Az állapot-lekérdezés gyakorisága (ms). */
export const DESKTOP_POLL_MS = 2000;
const ACTIVE_STATUSES = new Set(['queued', 'generating']);

type Step = 'input' | 'running' | 'preview';

export const DESKTOP_LEVELS: { value: DesktopTaskLevel; label: string }[] = [
  { value: 'alap', label: 'Alap' },
  { value: 'kozep', label: 'Közép' },
  { value: 'emelt', label: 'Emelt' },
];

export const DESKTOP_FRAMEWORKS: { value: DesktopFramework; label: string }[] = [
  { value: 'any', label: 'WPF vagy WinForms (a diák választ)' },
  { value: 'wpf', label: 'WPF' },
  { value: 'winforms', label: 'WinForms' },
  { value: 'javafx', label: 'JavaFX (Java)' },
];

/**
 * „Asztali feladatsor témából” párbeszédablak a feladatsor-szerkesztőben: téma, szint, darabszám (1-8, sorozatnál egyre nehezebb) és
 * keretrendszer alapján az MI a háttérben megírja a feladatokat (feladatszöveg + feladatpontok, szempontlista, megoldási vázlat). A tanár
 * feladatonként átnézi és szerkeszti, majd menti - a diák zipet és 1-3 képernyőképet tölt fel, az MI a szempontlista szerint értékel.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-asztali-feladat',
  standalone: true,
  imports: [DialogShellComponent, FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <app-dialog-shell labelledBy="dt-title" testId="dt-dialog"
      panelClass="card w-full max-w-4xl min-w-0 p-4 sm:p-6 shadow-xl my-8 sm:my-auto" (closed)="close()">
        <div class="flex items-start justify-between gap-3 mb-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-secondary shrink-0"><app-icon name="code" class="w-5 h-5 block" /></div>
            <h2 id="dt-title" class="font-bold text-lg">Asztali feladatsor témából (WPF / WinForms / JavaFX)</h2>
          </div>
          <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="close()" data-testid="dt-close">
            <app-icon name="x" class="w-5 h-5 block" />
          </button>
        </div>

        @switch (step()) {
          @case ('running') {
            <div class="space-y-3" data-testid="dt-running">
              <div role="status" aria-live="polite">
                <app-local-spinner [label]="poller.progressText() || 'Indítás…'" />
              </div>
              <p class="text-sm text-text-muted text-center">
                Az MI megírja a feladatokat, a szempontlistákat és a megoldási vázlatokat - ez egy-két percig tarthat. Ha bezárod az ablakot,
                a készítés a háttérben folytatódik, és a gombbal később újra megnyithatod.
              </p>
              @if (poller.error(); as pollError) {
                <p class="text-sm text-danger text-center" role="alert" data-testid="dt-poll-error">{{ pollError }}</p>
              }
              <div class="flex justify-center">
                <button type="button" class="btn btn-ghost" (click)="close()">Bezárás</button>
              </div>
            </div>
          }
          @case ('preview') {
            @if (proposal(); as p) {
              <div class="space-y-4" data-testid="dt-preview">
                <p class="text-sm text-text-muted">
                  Nézd át és szerkeszd a feladatokat. Mentéskor mindegyik külön „Asztali alkalmazás” feladat lesz a feladatpontokkal,
                  a jóváhagyott szempontlistával és a megoldási vázlattal (megoldásfájlként, vizsga alatt a diák elől rejtve). A diák a
                  projektet zipben és 1-3 képernyőképpel adja be, az MI a szempontlista szerint értékel.
                </p>

                <div role="tablist" aria-label="Feladatok" class="flex flex-wrap gap-2">
                  @for (t of p.tasks; track $index) {
                    <button type="button" role="tab" class="btn !px-3 !py-1 text-sm" [class.btn-primary]="active() === $index"
                      [class.btn-ghost]="active() !== $index" [attr.aria-selected]="active() === $index" (click)="active.set($index)"
                      [attr.data-testid]="'dt-tab-' + $index">
                      {{ $index + 1 }}. feladat
                      @if (problems()[$index].length > 0) { <app-icon name="warning-triangle" class="w-4 h-4 inline-block text-warning" /> }
                    </button>
                  }
                </div>

                @if (p.tasks[active()]; as t) {
                  @let i = active();
                  <div class="space-y-3" role="tabpanel" [attr.data-testid]="'dt-task-' + i">
                    <label class="block">
                      <span class="text-sm font-medium">Cím</span>
                      <input class="input mt-1" [maxLength]="limits.maxTitle" [ngModel]="t.title" (ngModelChange)="patchTask(i, { title: $event })"
                        [ngModelOptions]="{ standalone: true }" data-testid="dt-title-input" />
                    </label>
                    <label class="block">
                      <span class="text-sm font-medium">Feladatszöveg (bevezető és beadás - a diák látja)</span>
                      <textarea rows="7" class="input mt-1 !text-sm" [maxLength]="limits.maxDescription" [ngModel]="t.description"
                        (ngModelChange)="patchTask(i, { description: $event })" [ngModelOptions]="{ standalone: true }" data-testid="dt-description"></textarea>
                    </label>

                    <fieldset class="space-y-2">
                      <legend class="text-sm font-medium mb-1">Feladatpontok (a diák látja)</legend>
                      @for (s of t.steps; track $index; let j = $index) {
                        <div class="flex items-start gap-2">
                          <span class="text-sm text-text-muted pt-2 w-6 shrink-0">{{ j + 1 }}.</span>
                          <textarea rows="2" class="input !text-sm flex-1 min-w-0" [maxLength]="limits.maxStep" [ngModel]="s"
                            (ngModelChange)="setStep(i, j, $event)" [ngModelOptions]="{ standalone: true }" [attr.aria-label]="(j + 1) + '. feladatpont'"
                            [attr.data-testid]="'dt-step-' + j"></textarea>
                          <button type="button" class="btn btn-ghost !p-1.5 shrink-0" [attr.aria-label]="(j + 1) + '. feladatpont törlése'"
                            (click)="removeStep(i, j)"><app-icon name="x" class="w-4 h-4 block" /></button>
                        </div>
                      }
                      @if (t.steps.length < limits.maxSteps) {
                        <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm" (click)="addStep(i)" data-testid="dt-add-step">+ Feladatpont</button>
                      }
                    </fieldset>

                    <fieldset class="space-y-2">
                      <legend class="text-sm font-medium mb-1">
                        Szempontlista ({{ total(t) }} pont; szempontonként legalább {{ limits.minItemPoints }}, összesen {{ limits.minTotal }}-{{ limits.maxTotal }})
                      </legend>
                      @for (r of t.rubric; track $index; let j = $index) {
                        <div class="flex items-start gap-2">
                          <textarea rows="2" class="input !text-sm flex-1 min-w-0" [maxLength]="limits.maxItemText" [ngModel]="r.text"
                            (ngModelChange)="patchItem(i, j, { text: $event })" [ngModelOptions]="{ standalone: true }"
                            [attr.aria-label]="(j + 1) + '. szempont'" [attr.data-testid]="'dt-item-' + j"></textarea>
                          <input type="number" class="input !w-20 shrink-0" [min]="limits.minItemPoints" [max]="limits.maxItemPoints" [ngModel]="r.points"
                            (ngModelChange)="patchItem(i, j, { points: toInt($event) })" [ngModelOptions]="{ standalone: true }"
                            [attr.aria-label]="(j + 1) + '. szempont pontja'" [attr.data-testid]="'dt-points-' + j" />
                          <button type="button" class="btn btn-ghost !p-1.5 shrink-0" [attr.aria-label]="(j + 1) + '. szempont törlése'"
                            (click)="removeItem(i, j)"><app-icon name="x" class="w-4 h-4 block" /></button>
                        </div>
                      }
                      @if (t.rubric.length < limits.maxItems) {
                        <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm" (click)="addItem(i)" data-testid="dt-add-item">+ Szempont</button>
                      }
                    </fieldset>

                    <label class="block">
                      <span class="text-sm font-medium">Megoldási vázlat (a tanárnak / értékelőnek)</span>
                      <textarea rows="5" class="input mt-1 !text-sm" [maxLength]="limits.maxReference" [ngModel]="t.reference"
                        (ngModelChange)="patchTask(i, { reference: $event })" [ngModelOptions]="{ standalone: true }" data-testid="dt-reference"></textarea>
                    </label>

                    @if (problems()[i].length > 0) {
                      <ul class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning list-disc pl-8 space-y-0.5" data-testid="dt-problems">
                        @for (e of problems()[i]; track $index) { <li>{{ e }}</li> }
                      </ul>
                    }
                    @if (p.tasks.length > 1) {
                      <button type="button" class="btn btn-ghost !px-3 !py-1 text-sm text-danger" (click)="removeTask(i)" data-testid="dt-remove-task">
                        Ez a feladat ne kerüljön mentésre
                      </button>
                    }
                  </div>
                }

                @if (saveError()) {
                  <p class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger" role="alert" data-testid="dt-save-error">{{ saveError() }}</p>
                }
                <div class="flex flex-wrap justify-end gap-2">
                  <button type="button" class="btn btn-ghost" [disabled]="saving() || discarding()" (click)="discard()" data-testid="dt-discard">Elvetés</button>
                  <button type="button" class="btn btn-primary" [disabled]="!canSave()" (click)="save()" data-testid="dt-save">
                    {{ saving() ? 'Mentés…' : p.tasks.length + ' feladat mentése' }}
                  </button>
                </div>
              </div>
            }
          }
          @default {
            <div class="space-y-4" data-testid="dt-input">
              <p class="text-sm text-text-muted">
                Adj meg egy témát: az MI technikumi vizsgastílusú asztali (grafikus felületű) feladatokat ír hozzá feladatpontokkal,
                szempontlistával (feladatonként kb. 10 pont) és megoldási vázlattal. Több feladatnál egyre nehezedő sorozat készül. Mentés
                előtt mindent átnézhetsz és szerkeszthetsz. Egy készítés egy egység a havi keretedből; sikertelen készítés nem fogy.
              </p>
              @if (blockMessage(); as block) {
                <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" role="status" data-testid="dt-blocked">{{ block }}</p>
              } @else if (quota(); as q) {
                <p class="text-xs text-text-muted" data-testid="dt-quota">Havi keret: ebben a hónapban még {{ remaining(q) }} / {{ q.limit }} generálás.</p>
              }

              <label class="block">
                <span class="text-sm font-medium">Téma</span>
                <input class="input mt-1" [maxLength]="limits.maxTopic" placeholder="pl. iskolai könyvtár kölcsönzései, edzésnapló, mozijegy-foglalás"
                  [ngModel]="topic()" (ngModelChange)="topic.set($event)" [ngModelOptions]="{ standalone: true }" data-testid="dt-topic" />
                <span class="text-xs text-text-muted">{{ topic().trim().length }} / {{ limits.maxTopic }} karakter (legalább {{ limits.minTopic }})</span>
              </label>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label class="block">
                  <span class="text-sm text-text-muted">Szint</span>
                  <select class="input mt-1" [ngModel]="level()" (ngModelChange)="level.set($event)" [ngModelOptions]="{ standalone: true }" data-testid="dt-level">
                    @for (l of levels; track l.value) { <option [ngValue]="l.value">{{ l.label }}</option> }
                  </select>
                </label>
                <label class="block">
                  <span class="text-sm text-text-muted">Feladatok száma (1–{{ limits.maxCount }})</span>
                  <input type="number" min="1" [max]="limits.maxCount" class="input mt-1" [ngModel]="count()" (ngModelChange)="count.set($event)"
                    [ngModelOptions]="{ standalone: true }" data-testid="dt-count" />
                </label>
                <label class="block">
                  <span class="text-sm text-text-muted">Keretrendszer</span>
                  <select class="input mt-1" [ngModel]="framework()" (ngModelChange)="framework.set($event)" [ngModelOptions]="{ standalone: true }"
                    data-testid="dt-framework">
                    @for (f of frameworks; track f.value) { <option [ngValue]="f.value">{{ f.label }}</option> }
                  </select>
                </label>
              </div>

              @if (startError()) {
                <p class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger" role="alert" data-testid="dt-error">{{ startError() }}</p>
              }
              <div class="flex flex-wrap justify-end gap-2">
                <button type="button" class="btn btn-ghost" (click)="close()">Mégse</button>
                <button type="button" class="btn btn-primary" [disabled]="!canStart()" (click)="start()" data-testid="dt-start">
                  {{ starting() ? 'Indítás…' : 'Feladatok készítése' }}
                </button>
              </div>
            </div>
          }
        }
    </app-dialog-shell>
  `,
})
export class AsztaliFeladatComponent implements OnInit {
  private readonly service = inject(TeacherDesktopTaskService);
  private readonly reports = inject(ReportService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly taskSetId = input.required<number>();
  readonly closed = output<void>();
  /** Mentés után: az első új feladat azonosítója. */
  readonly saved = output<number>();

  readonly limits = DESKTOP_LIMITS;
  readonly levels = DESKTOP_LEVELS;
  readonly frameworks = DESKTOP_FRAMEWORKS;
  readonly remaining = quotaRemaining;

  readonly step = signal<Step>('input');
  readonly topic = signal('');
  readonly level = signal<DesktopTaskLevel>('kozep');
  readonly count = signal<number>(3);
  readonly framework = signal<DesktopFramework>('any');

  readonly quota = signal<AiHelperQuotaItemDto | null>(null);
  readonly premium = signal<boolean | null>(null);
  readonly starting = signal(false);
  readonly startError = signal<string | null>(null);

  /** A háttérben futó job lekérdezése (azonosító, haladás, lekérdezési hiba); bezáráskor leáll, a job a szerveren fut tovább. */
  readonly poller = injectAiJobPoller<DesktopTaskJobDto>({
    intervalMs: DESKTOP_POLL_MS,
    activeStatuses: ACTIVE_STATUSES,
    fetch: (jobId) => this.service.getJob(this.taskSetId(), jobId),
    onJob: (job) => this.onJob(job),
    onGone: () => this.backToInput('Ez a generálás már nem érhető el (24 óra után lejár). Indíts újat.'),
  });

  readonly proposal = signal<DesktopTaskProposal | null>(null);
  readonly active = signal(0);
  readonly saving = signal(false);
  readonly discarding = signal(false);
  readonly saveError = signal<string | null>(null);

  readonly blockMessage = computed(() => {
    if (this.premium() === false) return AI_HELPER_PREMIUM_TEXT;
    const q = this.quota();
    return q && quotaRemaining(q) === 0 ? `Elfogyott a havi kereted (${q.limit} generálás / hó) - a következő hónapban újra kérhetsz.` : null;
  });

  readonly canStart = computed(() => {
    const topic = this.topic().trim().length;
    const count = Number(this.count());
    return !this.starting() && !this.blockMessage() && topic >= DESKTOP_LIMITS.minTopic && topic <= DESKTOP_LIMITS.maxTopic
      && Number.isInteger(count) && count >= 1 && count <= DESKTOP_LIMITS.maxCount;
  });

  readonly problems = computed(() => (this.proposal()?.tasks ?? []).map(desktopTaskProblems));
  readonly canSave = computed(() => !this.saving() && !this.discarding() && this.problems().length > 0 && this.problems().every((p) => p.length === 0));

  ngOnInit(): void {
    this.loadQuota();
    // Visszakapcsolódás a futó / elkészült, még nem mentett jobhoz (oldal-újratöltés, bezárt ablak után is).
    this.service
      .getActiveJob(this.taskSetId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (job) => job && this.step() === 'input' && this.poll(job.jobId), error: () => {} });
  }

  private loadQuota(): void {
    this.reports
      .getAiHelperQuota()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (q) => {
          this.premium.set(q.premium);
          this.quota.set(q.desktopTask ?? null);
        },
        error: () => {},
      });
  }

  start(): void {
    if (!this.canStart()) return;
    this.starting.set(true);
    this.startError.set(null);
    this.service
      .startJob(this.taskSetId(), { topic: this.topic().trim(), level: this.level(), count: Number(this.count()), framework: this.framework() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.starting.set(false);
          this.quota.set(res.quota);
          this.poll(res.jobId);
        },
        error: (err) => {
          this.starting.set(false);
          if (err?.error?.errorType === 'DesktopTaskAlreadyRunning') {
            const details = err.error.details as { jobId?: number; taskSetId?: number } | undefined;
            if (details?.jobId && details.taskSetId === this.taskSetId()) {
              this.poll(details.jobId);
              return;
            }
            this.startError.set('Egy másik feladatsorodon már készül egy asztali feladatsor - várd meg, amíg elkészül.');
            return;
          }
          const block = aiHelperBlock(err);
          if (block === 'premium') this.premium.set(false);
          if (block === 'quota') this.loadQuota();
          this.startError.set(aiHelperErrorMessage(err) ?? extractErrorMessage(err, 'A készítés indítása nem sikerült.'));
        },
      });
  }

  private poll(jobId: number): void {
    this.step.set('running');
    this.poller.poll(jobId);
  }

  private onJob(job: DesktopTaskJobDto): void {
    if (job.request && !this.topic()) {
      this.topic.set(job.request.topic);
      this.level.set(job.request.level);
      this.count.set(job.request.count);
      this.framework.set(job.request.framework);
    }
    if (job.status === 'failed') {
      // A szerver üzenete mondja meg, hogy a keret visszajárt.
      this.loadQuota();
      this.backToInput(job.error || 'A feladatok elkészítése nem sikerült.');
    } else if (job.status === 'done') {
      if (job.appliedTaskId != null) this.backToInput('Ezt a javaslatot már elmentetted.');
      else if (job.result) {
        this.proposal.set(job.result.proposal);
        this.active.set(0);
        this.step.set('preview');
      }
    }
  }

  private backToInput(message: string | null): void {
    this.poller.clear();
    this.proposal.set(null);
    this.step.set('input');
    this.startError.set(message);
  }

  // ── Szerkesztés (megváltoztathatatlan frissítés: a computed-ek újraszámolnak) ──

  private updateTask(i: number, change: (t: DesktopTaskItem) => DesktopTaskItem): void {
    this.proposal.update((p) => (p ? { tasks: p.tasks.map((t, k) => (k === i ? change(t) : t)) } : p));
  }

  patchTask(i: number, patch: Partial<DesktopTaskItem>): void {
    this.updateTask(i, (t) => ({ ...t, ...patch }));
  }

  setStep(i: number, j: number, text: string): void {
    this.updateTask(i, (t) => ({ ...t, steps: t.steps.map((s, k) => (k === j ? text : s)) }));
  }

  addStep(i: number): void {
    this.updateTask(i, (t) => ({ ...t, steps: [...t.steps, ''] }));
  }

  removeStep(i: number, j: number): void {
    this.updateTask(i, (t) => ({ ...t, steps: t.steps.filter((_, k) => k !== j) }));
  }

  patchItem(i: number, j: number, patch: Partial<DesktopRubricItem>): void {
    this.updateTask(i, (t) => ({ ...t, rubric: t.rubric.map((r, k) => (k === j ? { ...r, ...patch } : r)) }));
  }

  addItem(i: number): void {
    this.updateTask(i, (t) => ({ ...t, rubric: [...t.rubric, { text: '', points: DESKTOP_LIMITS.minItemPoints }] }));
  }

  removeItem(i: number, j: number): void {
    this.updateTask(i, (t) => ({ ...t, rubric: t.rubric.filter((_, k) => k !== j) }));
  }

  removeTask(i: number): void {
    this.proposal.update((p) => (p && p.tasks.length > 1 ? { tasks: p.tasks.filter((_, k) => k !== i) } : p));
    this.active.update((a) => Math.min(a, (this.proposal()?.tasks.length ?? 1) - 1));
  }

  total(t: DesktopTaskItem): number {
    return t.rubric.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
  }

  toInt(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }

  // ── Mentés / elvetés ──

  save(): void {
    const jobId = this.poller.jobId();
    const proposal = this.proposal();
    if (!this.canSave() || jobId == null || !proposal) return;
    this.saving.set(true);
    this.saveError.set(null);
    this.service.apply(this.taskSetId(), jobId, proposal).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.toast.success(`Elmentve: ${res.saved.join(', ')}.`);
        this.saved.emit(res.taskIds[0]);
        this.closed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        if (aiHelperBlock(err) === 'premium') this.premium.set(false);
        this.saveError.set(aiHelperErrorMessage(err) ?? extractErrorMessage(err, 'A mentés nem sikerült.'));
      },
    });
  }

  discard(): void {
    const jobId = this.poller.jobId();
    if (jobId == null || this.discarding() || this.saving()) return;
    this.discarding.set(true);
    this.saveError.set(null);
    this.service
      .dismiss(this.taskSetId(), jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.afterDiscard(jobId),
        error: (err) => {
          // 404: már nincs ilyen job - az eredmény úgyis elveszett.
          if (err?.status === 404) return this.afterDiscard(jobId);
          this.discarding.set(false);
          this.saveError.set(extractErrorMessage(err, 'Az elvetés nem sikerült - próbáld újra.'));
        },
      });
  }

  private afterDiscard(jobId: number): void {
    this.discarding.set(false);
    if (this.poller.jobId() === jobId) this.backToInput(null);
  }

  close(): void {
    if (this.saving()) return;
    this.poller.stop();
    this.closed.emit();
  }
}
