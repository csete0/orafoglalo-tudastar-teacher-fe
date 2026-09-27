import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReportStore } from '../../services/report/report.store';
import {
  TaskResultCellDto,
  TaskSetResultsFilter,
  TaskSetResultsStatus,
  TeacherTaskSetResultsDto,
} from '../../models/report.model';
import { ToastService } from '../../shared/toast/toast.service';
import { ResultsCsvExportService } from '../../services/export/results-csv-export.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { AttemptReviewPanelComponent } from '../../shared/attempt-review/attempt-review-panel.component';
import { weakestTasks, WEAK_THRESHOLD_PERCENT } from '../../shared/task-analysis/task-weakness';
import { GroupStore } from '../../services/group/group.store';
import { DateRangeFilterComponent } from '../../shared/date-range-filter/date-range-filter.component';
import {
  DEFAULT_RANGE_KEY,
  ReportDateRange,
  ReportRangeKey,
  toDateInputValue,
  toDateInputValueExclusiveEnd,
} from '../../shared/date-range/report-date-range';

/** Tagonkénti eredmény-mátrix (tagok × feladatok) a tanár saját feladatsorán. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsor-eredmenyek',
  standalone: true,
  imports: [RouterLink, FormsModule, LocalSpinnerComponent, DateRangeFilterComponent, AttemptReviewPanelComponent],
  styles: [`
    @media print {
      tr { break-inside: avoid; }
    }
  `],
  template: `
    @if (report.taskSetResults(); as results) {
      <div class="max-w-5xl mx-auto px-4 py-10">
        <div class="flex items-start justify-between gap-4 flex-wrap">
          <div class="min-w-0">
            <h1 class="page-title truncate">{{ results.title }} — eredmények</h1>
            <p class="text-sm text-text-muted mt-1">Tagonkénti eredmény-mátrix (diákok × feladatok)</p>
          </div>
          <div class="flex gap-2 print:hidden">
            <button type="button" (click)="exportCsv(results)" class="btn shrink-0"
              title="Az eredmények letöltése CSV-ben, osztálynaplóba importálható formában.">
              Exportálás CSV-be
            </button>
            <button type="button" (click)="print()" class="btn shrink-0"
              title="Cél: Mentés PDF-ként">
              Nyomtatás / PDF
            </button>
          </div>
        </div>
        <div class="hairline"></div>

        <!-- C7: szűrősáv — a nyomtatott nézeten nem jelenik meg -->
        <div class="flex flex-wrap items-end gap-4 mb-6 print:hidden">
          <div>
            <label class="text-xs text-text-muted block mb-1" for="filter-group">Csoport</label>
            <select id="filter-group"
              [ngModel]="selectedGroupId()" (ngModelChange)="onGroupChange($event)"
              [ngModelOptions]="{ standalone: true }"
              class="input !w-auto">
              <option [ngValue]="null">Minden csoport</option>
              @for (g of activeGroups(); track g.id) {
                <option [ngValue]="g.id">{{ g.name }}</option>
              }
            </select>
          </div>
          <app-date-range-filter
            [initialRangeKey]="filterRangeKey()"
            [initialCustomFrom]="filterCustomFrom()"
            [initialCustomTo]="filterCustomTo()"
            (rangeChange)="onRangeChange($event)" />
          <div>
            <label class="text-xs text-text-muted block mb-1" for="filter-status">Státusz</label>
            <select id="filter-status"
              [ngModel]="filterStatus()" (ngModelChange)="onStatusChange($event)"
              [ngModelOptions]="{ standalone: true }"
              class="input !w-auto">
              <option value="all">Összes</option>
              <option value="completed">Befejezett</option>
              <option value="inProgress">Folyamatban</option>
              <option value="notStarted">Nem kezdte el</option>
            </select>
          </div>
        </div>

        <!-- ── Leggyengébben teljesített feladatok ──
             A mátrix megmutatja az adatot, de nem MONDJA MEG, mit kell újratanítani.
             Ha nincs egyetlen értékelt beadás sem, a blokk NEM jelenik meg: egy
             beadás nélküli feladatsornál "0%"-ot mutatni hazugság lenne, nem üres
             állapot. -->
        @if (weakest(); as weak) {
          @if (weak.length > 0) {
            <div class="card mb-4 p-4">
              <h2 class="text-xs uppercase tracking-wide text-text-muted mb-2">
                Leggyengébben teljesített feladatok
              </h2>
              <ul class="flex flex-col gap-1.5">
                @for (task of weak; track task.taskId) {
                  <li class="flex items-baseline gap-2 flex-wrap text-sm">
                    <span class="font-medium">{{ task.taskOrder }}. {{ task.title }}</span>
                    <span class="text-text-muted">átlag {{ task.averagePercent }}%</span>
                    @if (task.belowThresholdCount > 0) {
                      <span class="badge badge-warning !text-[10px] !px-1.5 !py-0.5">
                        {{ task.belowThresholdCount }} / {{ task.evaluatedCount }} diák
                        {{ weakThresholdPercent }}% alatt
                      </span>
                    }
                  </li>
                }
              </ul>
            </div>
          }
        }

        <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-left text-text-muted text-xs uppercase tracking-wide border-b border-border-default">
                <th class="py-3 px-4">Diák</th>
                <th class="py-3 px-4">Összesen</th>
                @for (task of results.tasks; track task.taskId) {
                  <th class="py-3 px-4 whitespace-nowrap"
                    [class.text-warning]="task.taskId === weakestTaskId()">
                    {{ task.taskOrder }}. {{ task.title }}
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of results.students; track row.userId) {
                <tr class="border-b border-border-default last:border-b-0 hover:bg-bg-element transition-colors"
                  [class.opacity-50]="!row.hasSession">
                  <td class="py-2.5 px-4">
                    <a [routerLink]="['/diakok', row.userId]" class="text-primary hover:underline">{{ row.name }}</a>
                  </td>
                  <td class="py-2.5 px-4">
                    @if (row.hasSession) {
                      <span class="inline-flex items-center gap-1.5">
                        {{ row.totalEarnedPoints ?? '–' }} / {{ row.totalMaxPoints ?? '–' }}
                        @if (!row.isCompleted) {
                          <!-- UI-TT-49: a totalEarnedPoints/totalMaxPoints csak a MÁR
                               megkísérelt feladatokból összegződik, ezért egy még folyamatban
                               lévő diák részleges eredménye vizuálisan megkülönböztethetetlen
                               lenne egy ténylegesen kész, tökéletes eredménytől e nélkül a badge nélkül. -->
                          <span class="badge badge-warning !text-[10px] !px-1.5 !py-0.5" title="A diák még nem fejezte be a feladatsort.">
                            folyamatban
                          </span>
                        }
                      </span>
                    } @else {
                      nem kezdte el
                    }
                  </td>
                  @for (cell of row.taskResults; track cell.taskId) {
                    <td class="py-2.5 px-4">
                      @if (cell.attemptId != null) {
                        <!-- Valódi <button>, nem (click) a <td>-n: billentyűzettel is
                             elérhetőnek kell lennie. -->
                        <button type="button" (click)="toggleReview(cell)"
                          [attr.aria-expanded]="openAttemptId() === cell.attemptId"
                          class="inline-flex items-center gap-1.5 hover:underline"
                          [class.text-success]="cell.isCompleted"
                          [class.text-text-muted]="!cell.isCompleted"
                          [title]="'Értékelés megnyitása'">
                          {{ cell.earnedPoints ?? '–' }}/{{ cell.maxPoints ?? '–' }}
                          @if (cell.isOverridden) {
                            <span class="badge badge-info !text-[10px] !px-1.5 !py-0.5"
                              title="A pontszámot tanár bírálta felül.">tanári</span>
                          }
                        </button>
                      } @else {
                        <span class="text-text-muted">–</span>
                      }
                    </td>
                  }
                </tr>

                @if (openAttemptId() !== null && rowContainsOpenAttempt(row)) {
                  <tr>
                    <td [attr.colspan]="results.tasks.length + 2" class="px-4 pb-4">
                      <app-attempt-review-panel [attemptId]="openAttemptId()!" [taskSetId]="taskSetId" (closed)="closeReview()" />
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td [attr.colspan]="results.tasks.length + 2" class="py-6 px-4 text-text-muted text-center">Nincs elérhető diák.</td></tr>
              }
            </tbody>
          </table>
        </div>
        </div>
      </div>
    } @else if (report.taskSetResultsLoading()) {
      <app-local-spinner />
    } @else {
      <p class="text-danger text-center py-10">{{ report.error() }}</p>
    }
  `,
})
export class FeladatsorEredmenyekComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly toastService = inject(ToastService);
  private readonly csvExport = inject(ResultsCsvExportService);
  private readonly groupStore = inject(GroupStore);
  readonly report = inject(ReportStore);

  /** C7: szűrő-állapot */
  readonly selectedGroupId = signal<number | null>(null);
  readonly filterStatus = signal<TaskSetResultsStatus>('all');
  readonly filterRange = signal<ReportDateRange>({});
  readonly filterRangeKey = signal<ReportRangeKey>(DEFAULT_RANGE_KEY);

  readonly filterCustomFrom = computed(() => toDateInputValue(this.filterRange().from));
  readonly filterCustomTo = computed(() => toDateInputValueExclusiveEnd(this.filterRange().to));

  readonly activeGroups = computed(() => this.groupStore.groups().filter((g) => !g.isArchived));

  /**
   * FIGYELEM — getter, nem mező. Mezőként a TESZTKÖRNYEZETBEN némán `undefined`,
   * és a sablonban üresen renderel (`... diák % alatt`).
   *
   * Mérve (2026-07-28): a `@angular/build:unit-test` + Vitest chunk-darabolásának
   * mellékhatása, nem nyelvi szemantika — a mező-alak izoláltan és 8 spec fájllal
   * még helyes, csak a teljes suite-ban (45 spec) áll elő az `undefined`.
   * A `maxFeedbackLength` azért nem érintett, mert AZONOS fájlbeli const, így
   * sosem kerül külön chunk-ba.
   *
   * A PRODUKCIÓS BUILD NEM ÉRINTETT — részletes indoklás a
   * `date-range-filter.component.ts` azonos getterénél.
   */
  get weakThresholdPercent(): number {
    return WEAK_THRESHOLD_PERCENT;
  }

  /**
   * A leggyengébben teljesített feladatok — a már letöltött mátrixból számolva,
   * új végpont nélkül. `computed`, ezért minden mátrix-frissítés (pl. egy
   * pont-felülbírálás mentése) után magától újraszámol.
   */
  readonly weakest = computed(() => weakestTasks(this.report.taskSetResults()));

  /** A leggyengébb feladat oszlopát halványan kiemeljük a mátrix fejlécében is. */
  readonly weakestTaskId = computed(() => this.weakest()[0]?.taskId ?? null);

  /** A panel mentése ezzel frissíti a mátrixot (ReportStore). */
  protected taskSetId = 0;

  /** Melyik cella panelja van nyitva; null = egyik sem. */
  readonly openAttemptId = signal<number | null>(null);

  ngOnInit(): void {
    this.taskSetId = Number(this.route.snapshot.paramMap.get('id'));
    this.groupStore.loadMine();
    this.applyFilter();
  }

  onGroupChange(groupId: number | null): void {
    this.selectedGroupId.set(groupId);
    this.applyFilter();
  }

  onStatusChange(status: TaskSetResultsStatus): void {
    this.filterStatus.set(status);
    this.applyFilter();
  }

  onRangeChange(event: { key: ReportRangeKey; range: ReportDateRange }): void {
    this.filterRangeKey.set(event.key);
    this.filterRange.set(event.range);
    this.applyFilter();
  }

  private applyFilter(): void {
    const range = this.filterRange();
    const filter: TaskSetResultsFilter = {
      groupId: this.selectedGroupId(),
      from: range.from,
      to: range.to,
      status: this.filterStatus(),
    };
    this.report.loadTaskSetResults(this.taskSetId, filter);
  }

  print(): void {
    window.print();
  }

  /** A panel-sor a megnyitott cellát TARTALMAZÓ diák sora alá kerül. */
  rowContainsOpenAttempt(row: { taskResults: TaskResultCellDto[] }): boolean {
    const open = this.openAttemptId();
    return open != null && row.taskResults.some((c) => c.attemptId === open);
  }

  toggleReview(cell: TaskResultCellDto): void {
    // Nincs beadás → nincs mit megnyitni. A sablon eleve nem rajzol gombot ilyen
    // cellára, ez a védelem a billentyűzet/programozott hívás ellen szól.
    if (cell.attemptId == null) return;
    // A panel (AttemptReviewPanelComponent) maga tölti be a beadást a megnyitott attemptId-re.
    this.openAttemptId.set(this.openAttemptId() === cell.attemptId ? null : cell.attemptId);
  }

  closeReview(): void {
    this.openAttemptId.set(null);
  }

  /** Az eredmény-mátrix letöltése CSV-ben (osztálynaplóba importálható). */
  exportCsv(results: TeacherTaskSetResultsDto): void {
    if (results.students.length === 0) {
      // Soha ne legyen néma no-op (UI-TT-134): üres mátrixnál a letöltés
      // elindulna, de a tanár egy fejlécet tartalmazó fájlt kapna magyarázat nélkül.
      this.toastService.warning('Nincs exportálható eredmény.');
      return;
    }
    this.csvExport.exportTaskSetResults(results);
  }


}
