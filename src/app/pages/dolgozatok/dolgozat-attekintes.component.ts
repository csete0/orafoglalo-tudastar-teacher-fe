import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ClassTestService } from '../../services/class-test/class-test.service';
import { ClassTestCell, ClassTestOverview, ClassTestStudentRow } from '../../models/class-test.model';
import { TeacherTaskSetResultsDto } from '../../models/report.model';
import { ResultsCsvExportService } from '../../services/export/results-csv-export.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { AttemptReviewPanelComponent } from '../../shared/attempt-review/attempt-review-panel.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

const STATUS_LABELS: Record<ClassTestStudentRow['status'], string> = {
  not_started: 'nem kezdte el',
  in_progress: 'írja',
  submitted: 'beadta',
};

/** Élő frissítés gyakorisága az ablak alatt (és utána még ennyi ideig, amíg a szerver beadja a lejártakat). */
const LIVE_REFRESH_MS = 10_000;
const LIVE_TAIL_MS = 15 * 60_000;

/**
 * Dolgozat-áttekintő (PATRICKS-DOLGOZAT-MOD-TERV.md): élő névsor (ki írja, ki adta be, mennyi ideje
 * van), pontok feladatonként a meglévő értékelő panellel, integritás-jelzések (csak tájékoztatás),
 * statisztika, CSV-export és az eredmények közzététele a megírási idő után.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dolgozat-attekintes',
  standalone: true,
  imports: [RouterLink, DatePipe, LocalSpinnerComponent, AttemptReviewPanelComponent],
  template: `
    <div class="max-w-6xl mx-auto px-4 py-6">
      @if (overview(); as o) {
        <a [routerLink]="['/csoportok', o.groupId]" class="text-sm text-primary hover:underline">← {{ o.groupName }}</a>
        <div class="flex items-start justify-between gap-4 flex-wrap mt-2 mb-5">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-warning">Dolgozat · {{ o.timeLimitSeconds / 60 }} perc</p>
            <h1 class="text-2xl font-bold">{{ o.taskSetTitle }}</h1>
            <p class="text-sm text-text-muted">
              Megírható: {{ o.opensAt | date: 'yyyy.MM.dd. HH:mm' }} – {{ o.dueAt | date: 'HH:mm' }}
              @if (isLive()) { · <span class="text-success font-semibold">élő frissítés</span> }
            </p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button type="button" class="btn btn-ghost" (click)="exportCsv(o)">Exportálás CSV-be</button>
            @if (o.resultsPublishedAt) {
              <span class="badge badge-success">Közzétéve: {{ o.resultsPublishedAt | date: 'MM.dd. HH:mm' }}</span>
            } @else {
              <button type="button" class="btn btn-primary" [disabled]="!o.canPublish || publishing()" (click)="publish(o)"
                      [title]="o.canPublish ? '' : 'Amikor már minden dolgozat be van adva, közzéteheted'">
                {{ publishing() ? 'Közzététel…' : 'Eredmények közzététele' }}
              </button>
            }
          </div>
        </div>

        @if (!o.resultsPublishedAt && !o.canPublish) {
          <p class="text-sm text-text-muted mb-4">
            Az eredményt {{ o.publishableAt | date: 'HH:mm' }}-tól teheted közzé, amikor a rendszer már a határidőkor még író diákok dolgozatát is beadta - addig a diákok csak annyit látnak: „Beadva”.
          </p>
        }

        <!-- Összesítő -->
        <div class="grid gap-3 grid-cols-2 md:grid-cols-4 mb-5">
          <div class="card p-4">
            <p class="text-xs text-text-muted uppercase tracking-wide">Beadta</p>
            <p class="text-2xl font-bold tabular-nums">{{ o.stats.submitted }} <span class="text-sm text-text-muted font-normal">/ {{ o.students.length }}</span></p>
            <p class="text-xs text-text-muted">írja: {{ o.stats.inProgress }} · nem kezdte: {{ o.stats.notStarted }}</p>
          </div>
          <div class="card p-4">
            <p class="text-xs text-text-muted uppercase tracking-wide">Átlag</p>
            <p class="text-2xl font-bold tabular-nums">{{ o.stats.averagePercent ?? '–' }}{{ o.stats.averagePercent != null ? '%' : '' }}</p>
            <p class="text-xs text-text-muted">medián: {{ o.stats.medianPercent ?? '–' }}{{ o.stats.medianPercent != null ? '%' : '' }}</p>
          </div>
          <div class="card p-4 col-span-2">
            <p class="text-xs text-text-muted uppercase tracking-wide mb-2">Jegyeloszlás (40 / 55 / 70 / 85%)</p>
            <div class="flex items-end gap-2 h-20" role="img" [attr.aria-label]="distributionLabel(o)">
              @for (g of grades; track g) {
                <div class="flex-1 flex flex-col items-center gap-1">
                  <span class="text-xs tabular-nums">{{ o.stats.gradeDistribution[g] ?? 0 }}</span>
                  <div class="w-full rounded-t bg-primary" [style.height.px]="barHeight(o, g)"></div>
                  <span class="text-xs text-text-muted">{{ g }}</span>
                </div>
              }
            </div>
          </div>
        </div>

        <p class="text-xs text-text-muted mb-2">
          AI-pontozás ebben a hónapban: {{ o.aiGradedThisMonth }} / {{ o.aiMonthlyLimit }} dolgozat.
          Az ablakváltás és a beillesztés csak tájékoztató adat, nem bizonyíték.
        </p>

        <!-- Névsor -->
        <div class="card overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="text-left text-text-muted text-xs uppercase tracking-wide border-b border-border-default">
                  <th class="py-3 px-4">Diák</th>
                  <th class="py-3 px-4">Állapot</th>
                  <th class="py-3 px-4">Összesen</th>
                  @for (task of o.tasks; track task.taskId; let i = $index) {
                    <th class="py-3 px-4 min-w-[6rem] max-w-[12rem] align-bottom" [title]="task.title">{{ i + 1 }}. {{ task.title }} <span class="normal-case">({{ task.maxPoints }})</span></th>
                  }
                  <th class="py-3 px-4 min-w-[7rem] max-w-[9rem] align-bottom">Fül-elhagyás / beillesztés</th>
                </tr>
              </thead>
              <tbody>
                @for (row of o.students; track row.userId) {
                  <tr class="border-b border-border-default last:border-b-0" [class.opacity-50]="row.status === 'not_started'">
                    <td class="py-2.5 px-4 whitespace-nowrap">{{ row.name }}</td>
                    <td class="py-2.5 px-4 whitespace-nowrap">
                      {{ statusLabels[row.status] }}
                      @if (row.status === 'in_progress') {
                        <span class="tabular-nums text-text-muted">· {{ remaining(row) }}</span>
                      }
                      @if (row.timeLimitReached) {
                        <span class="badge badge-neutral !text-[10px] !px-1.5 !py-0.5" title="Az idő lejártakor automatikusan adódott be (a mentett munkájából)">lejárt az idő</span>
                      }
                      @if (row.needsManualGrading) {
                        <span class="badge badge-warning !text-[10px] !px-1.5 !py-0.5" title="Az AI nem pontozta (elfogyott a havi keret) - pontozd kézzel">kézi pontozás</span>
                      }
                    </td>
                    <td class="py-2.5 px-4 whitespace-nowrap tabular-nums">
                      @if (row.status === 'submitted' && row.earnedPoints !== null) {
                        <strong>{{ row.earnedPoints }} / {{ row.maxPoints }}</strong>
                        <span class="text-text-muted"> ({{ percent(row) }}%)</span>
                      } @else if (row.status === 'submitted') {
                        <span class="text-text-muted">– / {{ row.maxPoints }}</span>
                      } @else { – }
                    </td>
                    @for (cell of row.tasks; track cell.taskId) {
                      <td class="py-2.5 px-4 whitespace-nowrap tabular-nums">
                        @if (row.status === 'submitted' && cell.attemptId != null) {
                          <button type="button" class="text-primary hover:underline" (click)="toggleReview(cell)"
                                  [attr.aria-expanded]="openAttemptId() === cell.attemptId">
                            {{ cell.earnedPoints ?? '–' }} / {{ cell.maxPoints }}
                            @if (cell.isOverridden) { <span class="text-xs text-text-muted">(tanári)</span> }
                          </button>
                        } @else { – }
                      </td>
                    }
                    <td class="py-2.5 px-4 whitespace-nowrap tabular-nums"
                        [class.text-warning]="row.focusLossCount + row.pasteCount > 0">
                      {{ row.focusLossCount }} / {{ row.pasteCount }}
                      @if (row.pastedChars > 0) { <span class="text-text-muted text-xs">({{ row.pastedChars }} kar.)</span> }
                    </td>
                  </tr>
                  @if (openAttemptId() !== null && rowHasOpenAttempt(row)) {
                    <tr>
                      <td [attr.colspan]="o.tasks.length + 4" class="px-4 pb-4">
                        <app-attempt-review-panel [attemptId]="openAttemptId()!" [taskSetId]="o.taskSetId"
                                                  (closed)="openAttemptId.set(null)" (changed)="load()" />
                      </td>
                    </tr>
                  }
                }
              </tbody>
              @if (o.stats.submitted > 0) {
                <tfoot>
                  <tr class="border-t border-border-default text-text-muted">
                    <td class="py-2.5 px-4" colspan="3">Feladatonkénti átlag</td>
                    @for (avg of o.stats.taskAverages; track avg.taskId) {
                      <td class="py-2.5 px-4 tabular-nums">{{ avg.averagePercent ?? '–' }}{{ avg.averagePercent != null ? '%' : '' }}</td>
                    }
                    <td></td>
                  </tr>
                </tfoot>
              }
            </table>
          </div>
        </div>
      } @else if (error()) {
        <p class="text-danger">{{ error() }}</p>
      } @else {
        <app-local-spinner />
      }
    </div>
  `,
})
export class DolgozatAttekintesComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly classTests = inject(ClassTestService);
  private readonly csvExport = inject(ResultsCsvExportService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly overview = signal<ClassTestOverview | null>(null);
  readonly error = signal<string | null>(null);
  readonly publishing = signal(false);
  readonly openAttemptId = signal<number | null>(null);
  readonly statusLabels = STATUS_LABELS;
  readonly grades = ['1', '2', '3', '4', '5'];

  /** Az ablak alatt és utána még egy ideig élőben frissül (a szerver órája szerint). */
  readonly isLive = computed(() => {
    const o = this.overview();
    if (!o) return false;
    const now = Date.parse(o.serverNow);
    return now >= Date.parse(o.opensAt) && now <= Date.parse(o.dueAt) + LIVE_TAIL_MS;
  });

  private assignmentId = 0;

  ngOnInit(): void {
    this.assignmentId = Number(this.route.snapshot.paramMap.get('assignmentId'));
    this.load();
    const timer = setInterval(() => {
      // Nyitott értékelő panel alatt nem frissítünk, hogy a tanár szerkesztése ne ugráljon.
      if (this.isLive() && this.openAttemptId() === null) this.load();
    }, LIVE_REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  load(): void {
    this.classTests.getOverview(this.assignmentId).subscribe({
      next: (o) => this.overview.set(o),
      error: (err) => this.error.set(extractErrorMessage(err, 'A dolgozat betöltése nem sikerült.')),
    });
  }

  toggleReview(cell: ClassTestCell): void {
    if (cell.attemptId == null) return;
    this.openAttemptId.set(this.openAttemptId() === cell.attemptId ? null : cell.attemptId);
  }

  rowHasOpenAttempt(row: ClassTestStudentRow): boolean {
    return row.tasks.some((c) => c.attemptId === this.openAttemptId());
  }

  percent(row: ClassTestStudentRow): number {
    return row.maxPoints ? Math.round((100 * (row.earnedPoints ?? 0)) / row.maxPoints) : 0;
  }

  remaining(row: ClassTestStudentRow): string {
    const s = row.remainingSeconds ?? 0;
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  barHeight(o: ClassTestOverview, grade: string): number {
    const max = Math.max(1, ...this.grades.map((g) => o.stats.gradeDistribution[g] ?? 0));
    return Math.round((32 * (o.stats.gradeDistribution[grade] ?? 0)) / max) + 2;
  }

  distributionLabel(o: ClassTestOverview): string {
    return 'Jegyeloszlás: ' + this.grades.map((g) => `${g}-es: ${o.stats.gradeDistribution[g] ?? 0}`).join(', ');
  }

  async publish(o: ClassTestOverview): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Eredmények közzététele',
      message: `A diákok értesítést kapnak, és látják a pontjaikat és a visszajelzéseket. ${o.stats.submitted} beadott dolgozat. Utána is módosíthatod a pontokat - a változás azonnal látszik nekik.`,
      confirmLabel: 'Közzététel',
    });
    if (!confirmed) return;
    this.publishing.set(true);
    this.classTests.publish(o.assignmentId).subscribe({
      next: () => {
        this.publishing.set(false);
        this.toastService.success('Eredmények közzétéve.');
        this.load();
      },
      error: (err) => {
        this.publishing.set(false);
        this.toastService.danger(extractErrorMessage(err));
      },
    });
  }

  /** A meglévő CSV-export (osztálynaplóba importálható), a beadott dolgozatokkal. */
  exportCsv(o: ClassTestOverview): void {
    if (o.stats.submitted === 0) {
      this.toastService.warning('Még nincs beadott dolgozat.');
      return;
    }
    const results: TeacherTaskSetResultsDto = {
      taskSetId: o.taskSetId,
      title: `${o.taskSetTitle} - dolgozat`,
      tasks: o.tasks.map((t, i) => ({ taskId: t.taskId, title: t.title, maxPoints: t.maxPoints, taskOrder: i + 1 })),
      students: o.students.map((s) => ({
        userId: s.userId,
        name: s.name,
        hasSession: s.status !== 'not_started',
        isCompleted: s.status === 'submitted',
        totalEarnedPoints: s.earnedPoints ?? undefined,
        totalMaxPoints: s.maxPoints ?? undefined,
        taskResults: s.tasks.map((c) => ({
          taskId: c.taskId,
          attemptId: c.attemptId ?? undefined,
          isCompleted: s.status === 'submitted',
          earnedPoints: c.earnedPoints ?? undefined,
          maxPoints: c.maxPoints,
          isOverridden: c.isOverridden,
        })),
      })),
    };
    this.csvExport.exportTaskSetResults(results);
  }
}
