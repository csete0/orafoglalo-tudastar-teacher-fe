import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { AiCodeTaskJobDto, AiCodeTaskMode, AiCodeTaskResultDto } from '../../models/ai-code-task.model';
import { TeacherTaskDto } from '../../models/teacher-content.model';
import { TeacherAiCodeTaskService } from '../../services/teacher-ai-code-task/teacher-ai-code-task.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { DialogShellComponent } from '../../shared/dialog/dialog-shell.component';
import { injectAiJobPoller } from './shared/ai-job-poller';
import { aiTaskErrorText, savedSummary } from './ai-feladat/ai-task.constants';
import { AiTaskPreviewComponent } from './ai-feladat/ai-task-preview.component';
import { AiTaskPreviewState } from './ai-feladat/ai-task-preview.state';
import { AiTaskProgressComponent } from './ai-feladat/ai-task-progress.component';
import { AiTaskRequestComponent } from './ai-feladat/ai-task-request.component';
import { AiTaskRequestState } from './ai-feladat/ai-task-request.state';

/** Az állapot-lekérdezés gyakorisága (ms). */
export const POLL_MS = 2000;

const ACTIVE_STATUSES = new Set(['queued', 'generating', 'running']);

type Step = 'input' | 'running' | 'preview';

/**
 * „AI programozási feladat” párbeszédablak a feladatsor-szerkesztőben (terv: PATRICKS-AI-PROGRAMOZASI-FELADAT-TERV.md).
 * 1. mód („complete”): egy meglévő programozási feladat hiányzó részei; 2. mód („new”): teljes új feladat.
 * Lépések: kérés → háttérben futó generálás (2 mp-enkénti állapot-lekérdezés) → szerkeszthető előnézet a Judge0-s ellenőrzéssel
 * → bármilyen módosítás után Újraellenőrzés (MI nélkül) → Mentés (a szerver által normalizált, utoljára ellenőrzött változat).
 * Ez a komponens a folyamatot vezérli (HTTP, lépések); a lépések nézete és az űrlap / előnézet állapota az `ai-feladat/` mappában van.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-ai-feladat',
  standalone: true,
  imports: [DialogShellComponent, IconComponent, AiTaskRequestComponent, AiTaskProgressComponent, AiTaskPreviewComponent],
  providers: [AiTaskRequestState, AiTaskPreviewState],
  templateUrl: './ai-feladat.component.html',
})
export class AiFeladatComponent implements OnInit {
  private readonly service = inject(TeacherAiCodeTaskService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly request = inject(AiTaskRequestState);
  readonly preview = inject(AiTaskPreviewState);

  readonly taskSetId = input.required<number>();
  /** „complete”: a megadott feladat kiegészítése; „new”: új feladat. */
  readonly startMode = input.required<AiCodeTaskMode>();
  readonly task = input<TeacherTaskDto | null>(null);
  /** A feladatsor feladatai - egy másik feladathoz készült job címének kiírásához. */
  readonly tasks = input<TeacherTaskDto[]>([]);
  readonly closed = output<void>();
  /** Sikeres mentés után a feladat azonosítójával - a szerkesztő újratölti a feladatsort. */
  readonly saved = output<number>();

  readonly mode = signal<AiCodeTaskMode>('new');
  readonly step = signal<Step>('input');

  // ── Kérés ──
  readonly starting = signal(false);
  readonly startError = signal<string | null>(null);
  readonly taskTitle = signal<string | null>(null);
  readonly taskSubtaskCount = computed(() => this.task()?.subTasks.length ?? 0);
  /** A tanár elkészült, még nem mentett jobja egy MÁSIK célra (más feladat / mód) - megnyitható. */
  readonly otherJob = signal<AiCodeTaskJobDto | null>(null);
  readonly otherJobTitle = computed(() => this.titleOf(this.otherJob()?.taskId ?? null));
  /** Nyitáskor a szerveren lévő aktív job lekérdezése - addig nem indítható új (különben „már készül” elutasítás). */
  readonly checkingActive = signal(false);

  readonly canStart = computed(() => {
    if (this.starting() || this.checkingActive() || this.request.premiumRequired() || this.request.quotaExhausted()) return false;
    if (this.mode() === 'complete') return !!this.task() && this.taskSubtaskCount() > 0;
    return this.request.newTaskValid();
  });

  // ── Készítés ──
  readonly poller = injectAiJobPoller<AiCodeTaskJobDto>({
    intervalMs: POLL_MS,
    activeStatuses: ACTIVE_STATUSES,
    fetch: (jobId) => this.service.getJob(this.taskSetId(), jobId),
    onJob: (job) => this.onJob(job),
    onGone: () => this.backToInput('Ez az AI-feladat már nem érhető el (24 óra után lejár). Indíts újat.'),
  });

  // ── Előnézet ──
  readonly revalidating = signal(false);
  /** A folyamatban lévő újraellenőrzés - Elvetéskor / új eredménynél / bezáráskor megszakítjuk. */
  private revalidation: Subscription | null = null;
  readonly saving = signal(false);
  /** „Elvetés”: a szerveren is elvetjük a jobot, hogy a jobs/active ne adja vissza. */
  readonly discarding = signal(false);

  ngOnInit(): void {
    this.mode.set(this.startMode());
    const task = this.task();
    this.taskTitle.set(task?.title ?? null);
    if (task) this.request.preselectLanguages(task);
    this.loadQuota();
    this.reconnect();
  }

  /**
   * Visszakapcsolódás a szerveren futó / elkészült, még nem mentett jobhoz (oldal-újratöltés, bezárt ablak után is).
   * Futó jobhoz mindig (úgysem indítható más), kész jobhoz akkor, ha ugyanerre a célra készült; különben felkínáljuk.
   */
  private reconnect(): void {
    this.checkingActive.set(true);
    this.service
      .getActiveJob(this.taskSetId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.checkingActive.set(false);
          if (!job || this.step() !== 'input') return;
          const sameTarget = job.mode === this.startMode() && job.taskId === (this.task()?.id ?? null);
          if (ACTIVE_STATUSES.has(job.status) || sameTarget) this.resume(job.jobId);
          else this.otherJob.set(job);
        },
        error: () => this.checkingActive.set(false),
      });
  }

  private titleOf(taskId: number | null): string | null {
    if (taskId == null) return null;
    return this.tasks().find((t) => t.id === taskId)?.title ?? (this.task()?.id === taskId ? this.task()!.title : null);
  }

  private loadQuota(): void {
    this.service
      .getQuota()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (q) => this.request.quota.set(q), error: () => this.request.quota.set(null) });
  }

  start(): void {
    if (!this.canStart()) return;
    this.starting.set(true);
    this.startError.set(null);
    this.service
      .startJob(this.taskSetId(), this.request.request(this.mode(), this.task()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.starting.set(false);
          this.request.quota.set(res.quota);
          this.otherJob.set(null);
          this.poll(res.jobId);
        },
        error: (err) => {
          this.starting.set(false);
          if (err?.error?.errorType === 'AiCodeTaskAlreadyRunning') {
            // Már fut egy job: ugyanezen a feladatsoron visszakapcsolódunk hozzá, máshol csak jelezzük.
            const details = err.error.details as { jobId?: number; taskSetId?: number } | undefined;
            if (details?.jobId && details.taskSetId === this.taskSetId()) {
              this.resume(details.jobId);
              return;
            }
            this.startError.set('Egy másik feladatsorodon már készül egy AI-feladat - várd meg, amíg elkészül (ott a gombbal meg is nyithatod).');
            return;
          }
          if (err?.error?.errorType === 'AiCodeTaskPremiumRequired') this.request.rejectPremium();
          if (err?.error?.errorType === 'AiCodeTaskQuotaExceeded') this.loadQuota();
          this.startError.set(aiTaskErrorText(err, 'Az AI-feladat indítása nem sikerült.'));
        },
      });
  }

  /** Egy (korábban indított) job megnyitása: állapot-lekérdezés, amíg kész nincs. */
  resume(jobId: number): void {
    this.otherJob.set(null);
    this.startError.set(null);
    this.poll(jobId);
  }

  private poll(jobId: number): void {
    // A lépés a lekérdezés ELŐTT vált: a szinkron (pl. gyorsítótárazott) kész válasz már az előnézetre lép tovább.
    this.step.set('running');
    this.poller.poll(jobId);
  }

  private onJob(job: AiCodeTaskJobDto): void {
    this.mode.set(job.mode);
    this.taskTitle.set(job.mode === 'complete' ? this.titleOf(job.taskId) : null);
    if (job.status === 'failed') {
      // A szerver üzenete mondja meg, visszajár-e a keret (csak ha az MI-t nem hívta).
      this.loadQuota();
      this.backToInput(job.error || 'Az AI-feladat elkészítése nem sikerült.');
    } else if (job.status === 'done') {
      if (job.appliedTaskId != null) {
        this.backToInput('Ezt az AI-feladatot már elmentetted.');
      } else if (job.result) {
        this.showResult(job.result);
      }
    }
  }

  private backToInput(message: string): void {
    this.poller.clear();
    this.resetPreview();
    this.resetTarget();
    this.step.set('input');
    this.startError.set(message);
  }

  private showResult(result: AiCodeTaskResultDto): void {
    this.cancelRevalidation();
    this.preview.show(result);
    this.step.set('preview');
  }

  private resetPreview(): void {
    this.cancelRevalidation();
    this.preview.reset();
  }

  private cancelRevalidation(): void {
    this.revalidation?.unsubscribe();
    this.revalidation = null;
    this.revalidating.set(false);
  }

  /** Az eredmény eldobása, vissza a kéréshez (új generálás = új keret-egység). */
  discard(): void {
    const jobId = this.poller.jobId();
    if (jobId == null || this.discarding() || this.saving()) return;
    this.discarding.set(true);
    this.preview.saveError.set(null);
    this.service
      .dismiss(this.taskSetId(), jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.afterDiscard(jobId),
        error: (err) => {
          // 404: már nincs ilyen job (lejárt / törölt) - az eredmény úgyis elveszett, vissza a kéréshez.
          if (err?.status === 404) {
            this.afterDiscard(jobId);
            return;
          }
          this.discarding.set(false);
          this.preview.saveError.set(aiTaskErrorText(err, 'Az elvetés nem sikerült - próbáld újra.'));
        },
      });
  }

  private afterDiscard(jobId: number): void {
    this.discarding.set(false);
    if (this.poller.jobId() !== jobId) return;
    this.poller.clear();
    this.resetPreview();
    this.resetTarget();
    this.startError.set(null);
    this.step.set('input');
  }

  /** Egy megnyitott más job után a párbeszédablak saját célja (mód, feladat) áll vissza. */
  private resetTarget(): void {
    this.mode.set(this.startMode());
    this.taskTitle.set(this.task()?.title ?? null);
  }

  /** Ellenőrzés a szerveren MI nélkül; a válasz normalizált javaslata lesz a menthető változat. */
  revalidate(): void {
    const jobId = this.poller.jobId();
    const sent = this.preview.proposal();
    if (this.revalidating() || jobId == null || !sent) return;
    const basis = this.preview.generated();
    this.revalidating.set(true);
    this.preview.revalidateError.set(null);
    this.preview.saveError.set(null);
    this.revalidation = this.service
      .validate(this.taskSetId(), jobId, sent)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.revalidating.set(false);
          // Közben Elvetés / másik job: az elavult válasz eldobva.
          if (this.preview.generated() !== basis || this.poller.jobId() !== jobId) return;
          // Ha a tanár közben nem módosított, a normalizált változat kerül a szerkesztőbe; különben a módosítása marad (újra „módosítva”).
          this.preview.applyValidation(sent, res);
        },
        error: (err) => {
          this.revalidating.set(false);
          if (this.preview.generated() !== basis || this.poller.jobId() !== jobId) return;
          if (err?.error?.errorType === 'AiCodeTaskPremiumRequired') this.request.rejectPremium();
          this.preview.revalidateError.set(aiTaskErrorText(err, 'Az ellenőrzés nem sikerült.'));
        },
      });
  }

  save(): void {
    const jobId = this.poller.jobId();
    const proposal = this.preview.validated();
    if (!this.preview.canSave() || this.saving() || jobId == null || !proposal) return;
    this.saving.set(true);
    this.preview.saveError.set(null);
    this.service.apply(this.taskSetId(), jobId, proposal).subscribe({
      next: (res) => {
        this.saving.set(false);
        const saved = savedSummary(res.saved, proposal);
        this.toastService.success(saved.length > 0 ? `Elmentve: ${saved.join(', ')}.` : 'Nem volt mit menteni - a feladat minden része megvolt.');
        this.saved.emit(res.taskId);
        this.closed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.preview.saveError.set(aiTaskErrorText(err, 'A mentés nem sikerült.'));
        // 1. módban a mentés részben megtörténhetett - a szerkesztő listája frissüljön.
        const task = this.task();
        if (this.mode() === 'complete' && task) this.saved.emit(task.id);
      },
    });
  }

  /** Bezárás: a lekérdezés és az újraellenőrzés leáll (a job a szerveren fut tovább, újranyitáskor visszakapcsolódunk). */
  close(): void {
    if (this.saving()) return;
    this.starting.set(false);
    this.poller.stop();
    this.cancelRevalidation();
    this.closed.emit();
  }
}
