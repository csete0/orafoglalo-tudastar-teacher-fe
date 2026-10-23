import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReportService } from '../../services/report/report.service';
import { ResultsCsvExportService } from '../../services/export/results-csv-export.service';
import { ClassOverviewPeriod, SchoolClassOverviewDto, SchoolClassRowDto } from '../../models/report.model';
import { SchoolGroupDto } from '../../models/school.model';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { ariaSort, SortHeaderComponent, SortState, sortRows } from '../../shared/sort-header/sort-header.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

/** Egész százalék lefelé kerekítve; üres nevezőnél null (a „nincs adat” nem 0%). */
export function sharePercent(part: number, whole: number): number | null {
  return whole > 0 ? Math.floor((part / whole) * 100) : null;
}

/**
 * Igazgatói osztály-összesítő (intézmény „Csoportok” fül): iskola-KPI-sáv + csoportonkénti rendezhető tábla,
 * 14/30 napos időszakkal és CSV-exporttal. A sor a csoportoldalra visz, ha a néző a csoport tanára; különben
 * (a csoportoldal másnak nem nyitható) helyben kinyíló, csak olvasható összefoglalót mutat.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-intezmeny-osztalyok',
  imports: [RouterLink, IconComponent, LocalSpinnerComponent, SortHeaderComponent],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div class="flex gap-1 card !rounded-xl p-1" role="group" aria-label="Időszak">
        @for (p of periods; track p) {
          <button type="button" class="btn !py-1 !px-3 text-sm" [class.btn-primary]="days() === p" [class.btn-ghost]="days() !== p"
            [attr.aria-pressed]="days() === p" (click)="setDays(p)">Utolsó {{ p }} nap</button>
        }
      </div>
      <button type="button" class="btn btn-ghost text-sm" data-testid="class-overview-csv"
        [disabled]="!overview()?.groups?.length" (click)="exportCsv()">
        <app-icon name="document" class="w-4 h-4 block" /> CSV-export
      </button>
    </div>

    @if (error()) {
      <p class="text-danger text-sm mb-4">{{ error() }}</p>
    }

    @if (overview(); as o) {
      <section aria-label="Intézményi összesítő" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div class="card p-4 min-w-0" data-testid="kpi-active">
          <p class="text-xs text-text-muted">Aktív diákok ({{ o.periodDays }} nap)</p>
          <p class="text-2xl font-bold tabular-nums">{{ pctText(o.kpi.activeStudentCount, o.kpi.studentCount) }}</p>
          <p class="text-xs text-text-muted tabular-nums">{{ o.kpi.activeStudentCount }} / {{ o.kpi.studentCount }} diák</p>
        </div>
        <div class="card p-4 min-w-0" data-testid="kpi-average">
          <p class="text-xs text-text-muted">Átlag ({{ o.periodDays }} nap)</p>
          <p class="text-2xl font-bold tabular-nums">{{ o.kpi.averageScorePercent == null ? '–' : o.kpi.averageScorePercent + '%' }}</p>
        </div>
        <div class="card p-4 min-w-0" data-testid="kpi-seats">
          <p class="text-xs text-text-muted">Licenc-helyek</p>
          <p class="text-2xl font-bold tabular-nums">
            @if (o.kpi.seatsTotal > 0) { {{ o.kpi.seatsUsed }} <span class="text-base font-normal text-text-muted">/ {{ o.kpi.seatsTotal }}</span> } @else { – }
          </p>
        </div>
        <div class="card p-4 min-w-0" data-testid="kpi-assignments">
          <p class="text-xs text-text-muted">Kiadások ebben a hónapban</p>
          <p class="text-2xl font-bold tabular-nums">{{ o.kpi.assignmentsThisMonth }}</p>
        </div>
      </section>

      <div class="card overflow-hidden">
        <div class="data-table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th class="sticky-col" [attr.aria-sort]="ariaSort('name')">
                  <app-sort-header key="name" [state]="sort()" (sortChange)="sort.set($event)">Csoport</app-sort-header>
                </th>
                <th [attr.aria-sort]="ariaSort('teacher')">
                  <app-sort-header key="teacher" [state]="sort()" (sortChange)="sort.set($event)">Tanár</app-sort-header>
                </th>
                <th class="text-right" [attr.aria-sort]="ariaSort('members')">
                  <app-sort-header key="members" [state]="sort()" (sortChange)="sort.set($event)">Tagok</app-sort-header>
                </th>
                <th class="text-right" [attr.aria-sort]="ariaSort('active')">
                  <app-sort-header key="active" [state]="sort()" (sortChange)="sort.set($event)">Aktív</app-sort-header>
                </th>
                <th class="text-right" [attr.aria-sort]="ariaSort('avg')">
                  <app-sort-header key="avg" [state]="sort()" (sortChange)="sort.set($event)">Átlag</app-sort-header>
                </th>
                <th class="text-right" [attr.aria-sort]="ariaSort('assignments')">
                  <app-sort-header key="assignments" [state]="sort()" (sortChange)="sort.set($event)">Kiadások</app-sort-header>
                </th>
                <th class="text-right" [attr.aria-sort]="ariaSort('readiness')">
                  <app-sort-header key="readiness" [state]="sort()" (sortChange)="sort.set($event)">Felkészültség</app-sort-header>
                </th>
                <th>Leggyengébb téma</th>
              </tr>
            </thead>
            <tbody>
              @for (g of rows(); track g.groupId) {
                <tr [attr.data-testid]="'class-row-' + g.groupId">
                  <td class="sticky-col whitespace-nowrap">
                    @if (g.canOpen) {
                      <a [routerLink]="['/csoportok', g.groupId]" class="text-primary hover:underline">{{ g.name }}</a>
                    } @else {
                      <button type="button" class="text-primary hover:underline inline-flex items-center gap-1"
                        [attr.aria-expanded]="expanded() === g.groupId" (click)="toggle(g.groupId)">
                        {{ g.name }}
                        <app-icon name="chevron-down" class="w-3.5 h-3.5 block transition-transform" [class.rotate-180]="expanded() === g.groupId" />
                      </button>
                    }
                  </td>
                  <td class="text-text-muted whitespace-nowrap">{{ g.teacherDisplayName }}</td>
                  <td class="num text-right">{{ g.memberCount }}</td>
                  <td class="num text-right whitespace-nowrap">{{ g.activeMemberCount }} <span class="text-text-muted">({{ pctText(g.activeMemberCount, g.memberCount) }})</span></td>
                  <td class="num text-right">{{ g.averageScorePercent == null ? '–' : g.averageScorePercent + '%' }}</td>
                  <td class="num text-right whitespace-nowrap">{{ g.assignmentsGiven }}
                    @if (g.assignmentsGiven > 0) { <span class="text-text-muted">· {{ pctText(g.assignmentCompletions, g.assignmentSlots) }} kész</span> }
                  </td>
                  <td class="num text-right whitespace-nowrap">{{ g.readinessPercent == null ? '–' : g.readinessPercent + '%' }}</td>
                  <td class="whitespace-nowrap">
                    @if (g.weakestTopicName) {
                      {{ g.weakestTopicName }} <span class="text-danger tabular-nums">{{ g.weakestTopicSuccessRate }}%</span>
                    } @else { <span class="text-text-muted">–</span> }
                  </td>
                </tr>
                @if (expanded() === g.groupId) {
                  <tr class="detail-row" [attr.data-testid]="'class-summary-' + g.groupId">
                    <td colspan="8" class="bg-bg-element">
                      <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm py-1">
                        <div class="flex justify-between gap-3"><dt class="text-text-muted">Tanár</dt><dd>{{ g.teacherDisplayName }}</dd></div>
                        <div class="flex justify-between gap-3"><dt class="text-text-muted">Aktív tagok ({{ o.periodDays }} nap)</dt><dd class="tabular-nums">{{ g.activeMemberCount }} / {{ g.memberCount }}</dd></div>
                        <div class="flex justify-between gap-3"><dt class="text-text-muted">Vizsga-átlag</dt><dd class="tabular-nums">{{ g.averageScorePercent == null ? 'még nincs értékelt vizsga' : g.averageScorePercent + '%' }}</dd></div>
                        <div class="flex justify-between gap-3"><dt class="text-text-muted">Kiadások / teljesítés</dt><dd class="tabular-nums">{{ g.assignmentsGiven }} kiadás, {{ g.assignmentCompletions }} / {{ g.assignmentSlots }} kész</dd></div>
                        <div class="flex justify-between gap-3"><dt class="text-text-muted">Érettségi-előrejelzés</dt><dd class="tabular-nums">{{ g.readinessPercent == null ? 'nincs friss becslés' : g.readinessPercent + '% (' + g.readinessStudentCount + ' diák alapján)' }}</dd></div>
                        <div class="flex justify-between gap-3"><dt class="text-text-muted">Leggyengébb téma</dt><dd>{{ g.weakestTopicName ? g.weakestTopicName + ' (' + g.weakestTopicSuccessRate + '%)' : '–' }}</dd></div>
                      </dl>
                      <p class="text-xs text-text-muted mt-2">Csak olvasható összefoglaló - a csoport oldalát a csoport tanára kezeli.</p>
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td colspan="8" class="!py-6 text-text-muted text-center">Az intézményhez még nincs aktív csoport kötve.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <p class="text-xs text-text-muted mt-2">
        Aktív: legalább egy befejezett vizsga vagy kvíz az időszakban. Felkészültség: a tagok legutóbbi heti érettségi-becslésének átlaga.
        Leggyengébb téma: kvíz-statisztikából, legalább 3 diák adatával.
      </p>
    } @else if (loading()) {
      <app-local-spinner />
    }

    @if (archivedGroups().length) {
      <details class="mt-6 text-sm">
        <summary class="cursor-pointer text-text-muted">Archivált csoportok ({{ archivedGroups().length }})</summary>
        <ul class="mt-2 space-y-1">
          @for (g of archivedGroups(); track g.groupId) {
            <li class="flex justify-between gap-3 card !rounded-xl p-2">
              <span class="truncate">{{ g.name }}</span>
              <span class="text-text-muted shrink-0">{{ g.teacherDisplayName }} — {{ g.memberCount }} tag</span>
            </li>
          }
        </ul>
      </details>
    }
  `,
})
export class IntezmenyOsztalyokComponent {
  private readonly reportService = inject(ReportService);
  private readonly csvExport = inject(ResultsCsvExportService);

  readonly schoolId = input.required<number>();
  readonly schoolName = input.required<string>();
  /** Az intézmény összes csoportja (meglévő `schools/{id}/groups`) - innen csak az archiváltak kellenek. */
  readonly allGroups = input<SchoolGroupDto[]>([]);

  readonly periods: ClassOverviewPeriod[] = [14, 30];
  readonly days = signal<ClassOverviewPeriod>(30);
  readonly overview = signal<SchoolClassOverviewDto | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly expanded = signal<number | null>(null);
  readonly sort = signal<SortState | null>(null);

  readonly archivedGroups = computed(() => this.allGroups().filter((g) => g.isArchived));

  readonly rows = computed(() =>
    sortRows<SchoolClassRowDto>(this.overview()?.groups ?? [], this.sort(), {
      name: (r) => r.name,
      teacher: (r) => r.teacherDisplayName,
      members: (r) => r.memberCount,
      active: (r) => sharePercent(r.activeMemberCount, r.memberCount),
      avg: (r) => r.averageScorePercent,
      assignments: (r) => r.assignmentsGiven,
      readiness: (r) => r.readinessPercent,
    }));

  private request?: Subscription;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.request?.unsubscribe());
    // Iskola- vagy időszak-váltáskor újratölt; a folyamatban lévő régi kérést eldobjuk, így elavult válasz nem írhat felül.
    effect(() => {
      const schoolId = this.schoolId();
      const days = this.days();
      untracked(() => this.load(schoolId, days));
    });
  }

  setDays(days: ClassOverviewPeriod): void {
    this.days.set(days);
  }

  toggle(groupId: number): void {
    this.expanded.update((current) => (current === groupId ? null : groupId));
  }

  ariaSort(key: string): string | null {
    return ariaSort(this.sort(), key);
  }

  pctText(part: number, whole: number): string {
    const value = sharePercent(part, whole);
    return value == null ? '–' : `${value}%`;
  }

  exportCsv(): void {
    const overview = this.overview();
    if (overview) this.csvExport.exportSchoolClassOverview(overview, this.schoolName());
  }

  private load(schoolId: number, days: ClassOverviewPeriod): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.request = this.reportService.getSchoolClassOverview(schoolId, days).subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.loading.set(false);
      },
      error: (err) => {
        this.overview.set(null);
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, 'Az osztály-összesítő betöltése sikertelen.'));
      },
    });
  }
}
