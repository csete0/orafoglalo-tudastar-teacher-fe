import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReportStore } from '../../services/report/report.store';
import { StudentActivityDetailDto } from '../../models/report.model';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { DateRangeFilterComponent } from '../../shared/date-range-filter/date-range-filter.component';
import { ReportDateRange, ReportRangeKey } from '../../shared/date-range/report-date-range';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-diak-reszletek',
  standalone: true,
  imports: [DatePipe, RouterLink, IconComponent, LocalSpinnerComponent, DateRangeFilterComponent],
  template: `
    @if (store.studentDetail(); as detail) {
      <div class="max-w-2xl mx-auto px-4 py-10">
        <!-- UI-UX-T9: az oldalra a csoport-eredményekből érkezik a tanár - legyen visszaút. -->
        <button type="button" (click)="goBack()" class="text-sm text-text-muted hover:underline mb-3">
          ← Vissza
        </button>
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-full bg-primary-subtle text-primary text-sm font-bold flex items-center justify-center shrink-0">
            {{ initials(detail.name) }}</div>
          <h1 class="page-title truncate">{{ detail.name }}</h1>
        </div>
        @if (detail.groups.length) {
          <p class="text-sm text-text-muted mt-2 flex items-center gap-2 flex-wrap">
            Csoport:
            @for (group of detail.groups; track group.groupId) {
              <a [routerLink]="['/csoportok', group.groupId]" class="text-primary hover:underline">
                {{ group.name }}</a>
            }
          </p>
        }
        <div class="hairline"></div>

        <app-date-range-filter (rangeChange)="applyRange($event)" />

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          @for (stat of stats(detail); track stat.label) {
            <div class="card !rounded-xl p-4 flex items-center gap-3">
              <div class="icon-tile" [class]="stat.tile">
                <app-icon [name]="stat.icon" class="w-5 h-5 block" />
              </div>
              <div class="min-w-0">
                <p class="text-lg font-black leading-tight">{{ stat.value }}</p>
                <p class="text-xs text-text-muted truncate">{{ stat.label }}</p>
              </div>
            </div>
          }
        </div>

        <h2 class="font-bold mb-3">Legutóbbi vizsgák</h2>
        <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-text-muted text-xs uppercase tracking-wide border-b border-border-default">
                <th class="py-3 px-4">Feladatsor</th>
                <th class="py-3 px-4">Dátum</th>
                <th class="py-3 px-4">Eredmény</th>
              </tr>
            </thead>
            <tbody>
              @for (exam of detail.recentExams; track exam.sessionId) {
                <tr class="border-b border-border-default last:border-b-0 hover:bg-bg-element transition-colors">
                  <td class="py-2.5 px-4">{{ exam.taskSetTitle }}</td>
                  <!-- BE-STUDENTACTIVITY-FILTER-DISPLAY-DATE-MISMATCH: az "Egyéni időszak"
                       szűrő a befejezés (submittedAt) idejére szűr - a kijelzett dátumnak
                       ezzel kell egyeznie, különben egy hosszan elhúzódó session a kért
                       tartományon messze kívül eső dátummal jelenne meg. submittedAt csak
                       befejezetlen (folyamatban lévő) sessionnél lehetne null - ilyenkor
                       startedAt-ra esik vissza. -->
                  <td class="py-2.5 px-4">{{ (exam.submittedAt ?? exam.startedAt) | date: 'yyyy.MM.dd' }}</td>
                  <td class="py-2.5 px-4">
                    @if (exam.isCompleted) {
                      <!-- UI-TT-37 (mis-triage correction): a százalékjel korábban a
                           nullish-coalescing fallback-jén KÍVÜL volt - egy befejezett,
                           de null scorePercent-ű vizsgánál (TotalMax=0) "–%"-ot
                           mutatott a várt "–" helyett. -->
                      {{ exam.scorePercent != null ? exam.scorePercent + '%' : '–' }}
                    } @else {
                      <span class="badge badge-warning">folyamatban</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="3" class="py-6 px-4 text-text-muted text-center">Nincs vizsga-előzmény.</td></tr>
              }
            </tbody>
          </table>
        </div>
        </div>

        <!-- UI-UX-T9: a kvíz-kitöltésekből eddig csak két aggregált szám látszott -
             a tanári kérdés ("mit írt, mikor, hány %-ra, élőben vagy önállóan?")
             előzmény-szinten is megérdemli a választ. -->
        <h2 class="font-bold mb-3 mt-8">Legutóbbi kvízek</h2>
        <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-text-muted text-xs uppercase tracking-wide border-b border-border-default">
                <th class="py-3 px-4">Kvíz / témák</th>
                <th class="py-3 px-4">Dátum</th>
                <th class="py-3 px-4">Eredmény</th>
              </tr>
            </thead>
            <tbody>
              @for (quiz of detail.recentQuizzes; track quiz.sessionId) {
                <tr class="border-b border-border-default last:border-b-0 hover:bg-bg-element transition-colors">
                  <td class="py-2.5 px-4">
                    <span class="flex items-center gap-2 flex-wrap">
                      {{ quiz.quizTitle ?? quiz.topics.join(', ') }}
                      @if (quiz.mode === 'live') {
                        <span class="badge badge-primary !text-[10px] !px-1.5 !py-0.5"
                          title="Élő, tanár-vezérelt játékban született">Élő</span>
                      }
                    </span>
                  </td>
                  <td class="py-2.5 px-4">{{ quiz.completedAt | date: 'yyyy.MM.dd' }}</td>
                  <td class="py-2.5 px-4">
                    {{ quiz.correctAnswers }} / {{ quiz.totalQuestions }} ({{ quiz.successRate }}%)
                    @if (quiz.mode === 'live' && quiz.totalPoints > 0) {
                      <span class="text-text-muted">· ⚡ {{ quiz.totalPoints }} pont</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="3" class="py-6 px-4 text-text-muted text-center">Nincs kvíz-előzmény.</td></tr>
              }
            </tbody>
          </table>
        </div>
        </div>
      </div>
    } @else if (store.studentDetailLoading()) {
      <app-local-spinner />
    } @else {
      <p class="text-danger text-center py-10">{{ store.error() }}</p>
    }
  `,
})
export class DiakReszletekComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  readonly store = inject(ReportStore);

  goBack(): void {
    this.location.back();
  }

  private userId = 0;

  ngOnInit(): void {
    this.userId = Number(this.route.snapshot.paramMap.get('userId'));
    this.store.loadStudentActivity(this.userId);
  }

  applyRange(event: { key: ReportRangeKey; range: ReportDateRange }): void {
    this.store.loadStudentActivity(this.userId, event.range.from, event.range.to);
  }

  initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  stats(detail: StudentActivityDetailDto): { label: string; value: string; icon: IconName; tile: string }[] {
    return [
      { label: 'Befejezett vizsgák', value: `${detail.completedExamsCount}`, icon: 'clipboard-list', tile: 'icon-tile-primary' },
      { label: 'Átlag pontszázalék', value: detail.averageExamScorePercent == null ? '–' : `${detail.averageExamScorePercent}%`, icon: 'chart', tile: 'icon-tile-success' },
      { label: 'Kvíz-sessionök', value: `${detail.completedQuizSessionsCount}`, icon: 'academic-cap', tile: 'icon-tile-secondary' },
      { label: 'Kvíz pontosság', value: detail.quizAccuracyPercent == null ? '–' : `${detail.quizAccuracyPercent}%`, icon: 'chart', tile: 'icon-tile-warning' },
      { label: 'Aktuális sorozat', value: `${detail.currentStreak} nap`, icon: 'trophy', tile: 'icon-tile-danger' },
      { label: 'Badge-ek', value: `${detail.badgeCount}`, icon: 'shield', tile: 'icon-tile-primary' },
    ];
  }
}
