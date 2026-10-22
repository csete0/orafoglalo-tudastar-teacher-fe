import { ChangeDetectionStrategy, Component, computed, inject, input, model, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, take } from 'rxjs';
import { ReportStore } from '../../../services/report/report.store';
import { ReportService } from '../../../services/report/report.service';
import { LeaderboardStore } from '../../../services/leaderboard/leaderboard.store';
import { LeaderboardCategory, LeaderboardPeriod } from '../../../models/leaderboard.model';
import { TeacherWeakTopicDto } from '../../../models/report.model';
import { IconComponent, isIconName } from '../../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../../shared/local-spinner/local-spinner.component';
import { DateRangeFilterComponent } from '../../../shared/date-range-filter/date-range-filter.component';
import { ariaSort, SortHeaderComponent, SortState, sortRows } from '../../../shared/sort-header/sort-header.component';
import {
  DEFAULT_RANGE_KEY, ReportDateRange, ReportRangeKey, toDateInputValue, toDateInputValueExclusiveEnd,
} from '../../../shared/date-range/report-date-range';
import { floorPercent, GyengeTemakJavaslatokComponent } from '../gyenge-temak-javaslatok.component';

/**
 * Csoportoldal „Eredmények” fül: Összesítő (dátumszűrő + rendezhető tábla), Ranglista és Gyenge témák szakasz -
 * a régi három külön fül; a szakaszok `id`-ja a régi `?tab=ranglista` / `?tab=gyenge-temak` linkek horgonya.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-eredmenyek',
  imports: [FormsModule, RouterLink, IconComponent, LocalSpinnerComponent, DateRangeFilterComponent, SortHeaderComponent, GyengeTemakJavaslatokComponent],
  template: `
    <div class="max-w-4xl space-y-10">
      <section aria-labelledby="osszesito">
        <h2 id="osszesito" class="text-lg font-bold mb-3">Összesítő</h2>
        <!-- UI-TT-178/180: a fül minden váltáskor újra létrejön - a szűrő kulcsa és tartománya a szülőben (model) él,
             különben a legördülő mindig „Teljes időszak”-ra ugrana vissza. -->
        <app-date-range-filter class="block mb-4" [initialRangeKey]="rangeKey()"
          [initialCustomFrom]="customFromValue()" [initialCustomTo]="customToValue()"
          (rangeChange)="applyRange($event)" />
        @if (report.error()) {
          <p class="text-danger text-sm mb-4">{{ report.error() }}</p>
        } @else {
          <div class="card overflow-hidden">
            <div class="data-table-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="sticky-col" [attr.aria-sort]="ariaSort('name')">
                      <app-sort-header key="name" [state]="resultsSort()" (sortChange)="resultsSort.set($event)">Diák</app-sort-header>
                    </th>
                    <th class="text-right" [attr.aria-sort]="ariaSort('exams')">
                      <app-sort-header key="exams" [state]="resultsSort()" (sortChange)="resultsSort.set($event)">Vizsgák</app-sort-header>
                    </th>
                    <th class="text-right" [attr.aria-sort]="ariaSort('avg')">
                      <app-sort-header key="avg" [state]="resultsSort()" (sortChange)="resultsSort.set($event)">Átlag %</app-sort-header>
                    </th>
                    <th class="text-right" [attr.aria-sort]="ariaSort('quiz')">
                      <app-sort-header key="quiz" [state]="resultsSort()" (sortChange)="resultsSort.set($event)">Kvíz pontosság</app-sort-header>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (student of sortedGroupActivity(); track student.userId) {
                    <tr>
                      <td class="sticky-col whitespace-nowrap">
                        <a [routerLink]="['/diakok', student.userId]" class="text-primary hover:underline">{{ student.name }}</a>
                      </td>
                      <td class="num text-right">{{ student.completedExamsCount }}</td>
                      <td class="num text-right">{{ student.averageExamScorePercent ?? '–' }}</td>
                      <td class="num text-right">{{ student.quizAccuracyPercent ?? '–' }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="!py-6 text-text-muted text-center">Nincs adat.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </section>

      <section aria-labelledby="ranglista">
        <h2 id="ranglista" class="text-lg font-bold mb-3 scroll-mt-20">Ranglista</h2>
        <div class="flex gap-2 mb-4">
          <select [ngModel]="category()" (ngModelChange)="category.set($event); loadLeaderboard()" class="input !w-auto"
                  aria-label="Ranglista kategória">
            <option value="quiz">Kvíz</option>
            <option value="exam">Vizsga</option>
          </select>
          <select [ngModel]="period()" (ngModelChange)="period.set($event); loadLeaderboard()" class="input !w-auto"
                  aria-label="Ranglista időszak">
            <option value="weekly">Heti</option>
            <option value="monthly">Havi</option>
            <option value="alltime">Összes idő</option>
          </select>
        </div>
        @if (leaderboard.error()) {
          <p class="text-danger text-sm mb-4">{{ leaderboard.error() }}</p>
        } @else {
          <ol class="space-y-2">
            @for (entry of leaderboard.leaderboard()?.topEntries; track entry.rank) {
              <li class="flex items-center gap-3 card !rounded-xl p-3 text-sm">
                <span class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  [class]="rankClass(entry.rank)">{{ entry.rank }}</span>
                <!-- UI-UX-T7: a tanárnak a valódi név a beazonosítható - a becenév mellette marad, ha eltér. -->
                <span class="flex-1 truncate">
                  {{ entry.realName ?? entry.nickname }}
                  @if (entry.realName && entry.realName !== entry.nickname) {
                    <span class="text-text-muted text-xs">({{ entry.nickname }})</span>
                  }
                </span>
                <span class="font-bold">{{ entry.score }}</span>
              </li>
            } @empty {
              <li class="flex flex-col items-center py-10 gap-3">
                <div class="icon-tile icon-tile-neutral">
                  <app-icon name="trophy" class="w-6 h-6 block" />
                </div>
                <p class="font-semibold">Még nincs ranglista-adat.</p>
              </li>
            }
          </ol>
        }
      </section>

      <section aria-labelledby="gyenge-temak">
        <h2 id="gyenge-temak" class="text-lg font-bold mb-3 scroll-mt-20">Gyenge témák</h2>
        <!-- Összefoglaló + témakörönkénti gyakorló javaslatok egykattintásos kiadással - csak ha van gyenge téma. -->
        @if (!weakTopicsLoading() && weakTopics().length) {
          <app-gyenge-temak-javaslatok [groupId]="groupId()" />
          <h3 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2 mt-2">Minden gyenge téma</h3>
        }
        <!-- A2: névtelen aggregátum, k-anonimitással (≥3 diák, ≥5 válasz/téma). -->
        @if (weakTopicsError(); as err) {
          <p class="text-danger text-sm mb-4">{{ err }}</p>
        }
        @if (weakTopicsLoading()) {
          <app-local-spinner />
        } @else if (weakTopics().length) {
          <ul class="flex flex-wrap gap-2">
            @for (topic of weakTopics(); track topic.topicId) {
              <li class="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                  [style.background-color]="topic.topicColor ? topic.topicColor + '22' : 'var(--color-bg-element)'"
                  [style.color]="topic.topicColor ?? 'var(--color-text-primary)'">
                @if (isIconName(topic.topicIcon)) {
                  <app-icon [name]="topic.topicIcon" class="w-3.5 h-3.5 block shrink-0" />
                }
                {{ topic.topicName }}
                <span class="opacity-70">{{ pct(topic.successRate) }}% · {{ topic.studentCount }} tanuló</span>
              </li>
            }
          </ul>
        } @else {
          <div class="flex flex-col items-center py-10 gap-3">
            <div class="icon-tile icon-tile-neutral">
              <app-icon name="check" class="w-6 h-6 block" />
            </div>
            <p class="font-semibold">Nincs gyenge téma.</p>
            <p class="text-sm text-text-muted">Még nincs elég adat (legalább 3 diák, 5 válasz/téma szükséges).</p>
          </div>
        }
      </section>
    </div>
  `,
})
export class CsoportEredmenyekComponent implements OnInit {
  readonly isIconName = isIconName;
  readonly groupId = input.required<number>();
  /** A dátumszűrő kulcsa és tartománya - a szülőben él, hogy fülváltás után is megmaradjon. */
  readonly rangeKey = model<ReportRangeKey>(DEFAULT_RANGE_KEY);
  readonly range = model<ReportDateRange>({});

  readonly report = inject(ReportStore);
  readonly leaderboard = inject(LeaderboardStore);
  private readonly reportService = inject(ReportService);

  readonly customFromValue = computed(() => toDateInputValue(this.range().from));
  readonly customToValue = computed(() => toDateInputValueExclusiveEnd(this.range().to));

  // ── UI-UX-K3: az összesítő tábla rendezése ──
  readonly resultsSort = signal<SortState | null>(null);
  readonly sortedGroupActivity = computed(() =>
    sortRows(this.report.groupActivity(), this.resultsSort(), {
      name: (r) => r.name,
      exams: (r) => r.completedExamsCount,
      avg: (r) => r.averageExamScorePercent,
      quiz: (r) => r.quizAccuracyPercent,
    }));

  readonly category = signal<LeaderboardCategory>('quiz');
  readonly period = signal<LeaderboardPeriod>('weekly');

  // ── A2: Gyenge témák ──
  readonly weakTopics = signal<TeacherWeakTopicDto[]>([]);
  readonly weakTopicsLoading = signal(false);
  readonly weakTopicsError = signal<string | null>(null);
  /** Az összefoglalóval egyező, lefelé kerekített százalék. */
  readonly pct = floorPercent;

  ngOnInit(): void {
    const groupId = this.groupId();
    this.report.loadGroupActivity(groupId, this.range().from, this.range().to);
    this.loadLeaderboard();
    this.weakTopicsLoading.set(true);
    this.reportService.getGroupWeakTopics(groupId)
      .pipe(take(1), finalize(() => this.weakTopicsLoading.set(false)))
      .subscribe({
        next: (topics) => this.weakTopics.set(topics),
        error: () => this.weakTopicsError.set('A gyenge témák betöltése sikertelen.'),
      });
  }

  ariaSort(key: string): string | null {
    return ariaSort(this.resultsSort(), key);
  }

  applyRange(event: { key: ReportRangeKey; range: ReportDateRange }): void {
    this.rangeKey.set(event.key);
    this.range.set(event.range);
    this.report.loadGroupActivity(this.groupId(), event.range.from, event.range.to);
  }

  loadLeaderboard(): void {
    this.leaderboard.loadGroupLeaderboard(this.groupId(), this.category(), this.period());
  }

  rankClass(rank: number): string {
    if (rank === 1) return 'bg-warning-subtle text-warning';
    if (rank === 2) return 'bg-primary-subtle text-primary';
    if (rank === 3) return 'bg-secondary-subtle text-secondary';
    return 'bg-bg-element text-text-muted';
  }
}
