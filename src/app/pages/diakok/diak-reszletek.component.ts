import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ReportStore } from '../../services/report/report.store';
import { StudentActivityDetailDto } from '../../models/report.model';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-diak-reszletek',
  standalone: true,
  imports: [DatePipe, IconComponent, LocalSpinnerComponent],
  template: `
    @if (store.studentDetail(); as detail) {
      <div class="max-w-2xl mx-auto px-4 py-10">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-full bg-primary-subtle text-primary text-sm font-bold flex items-center justify-center shrink-0">
            {{ initials(detail.name) }}</div>
          <h1 class="page-title truncate">{{ detail.name }}</h1>
        </div>
        <div class="hairline"></div>

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
                  <td class="py-2.5 px-4">{{ exam.startedAt | date: 'yyyy.MM.dd' }}</td>
                  <td class="py-2.5 px-4">
                    @if (exam.isCompleted) {
                      {{ exam.scorePercent ?? '–' }}%
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
      </div>
    } @else if (store.loading()) {
      <app-local-spinner />
    } @else {
      <p class="text-danger text-center py-10">{{ store.error() }}</p>
    }
  `,
})
export class DiakReszletekComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly store = inject(ReportStore);

  ngOnInit(): void {
    const userId = Number(this.route.snapshot.paramMap.get('userId'));
    this.store.loadStudentActivity(userId);
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
      { label: 'Átlag pontszázalék', value: `${detail.averageExamScorePercent ?? '–'}%`, icon: 'chart', tile: 'icon-tile-success' },
      { label: 'Kvíz-sessionök', value: `${detail.completedQuizSessionsCount}`, icon: 'academic-cap', tile: 'icon-tile-secondary' },
      { label: 'Kvíz pontosság', value: `${detail.quizAccuracyPercent ?? '–'}%`, icon: 'chart', tile: 'icon-tile-warning' },
      { label: 'Aktuális sorozat', value: `${detail.currentStreak} nap`, icon: 'trophy', tile: 'icon-tile-danger' },
      { label: 'Badge-ek', value: `${detail.badgeCount}`, icon: 'shield', tile: 'icon-tile-primary' },
    ];
  }
}
