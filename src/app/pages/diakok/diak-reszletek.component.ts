import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ReportStore } from '../../services/report/report.store';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-diak-reszletek',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (store.studentDetail(); as detail) {
      <div class="max-w-2xl mx-auto px-4 py-10">
        <h1 class="text-xl font-semibold mb-6">{{ detail.name }}</h1>

        <dl class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-8">
          <div><dt class="text-text-muted">Befejezett vizsgák</dt><dd>{{ detail.completedExamsCount }}</dd></div>
          <div><dt class="text-text-muted">Átlag pontszázalék</dt><dd>{{ detail.averageExamScorePercent ?? '–' }}%</dd></div>
          <div><dt class="text-text-muted">Kvíz-sessionök</dt><dd>{{ detail.completedQuizSessionsCount }}</dd></div>
          <div><dt class="text-text-muted">Kvíz pontosság</dt><dd>{{ detail.quizAccuracyPercent ?? '–' }}%</dd></div>
          <div><dt class="text-text-muted">Aktuális sorozat</dt><dd>{{ detail.currentStreak }} nap</dd></div>
          <div><dt class="text-text-muted">Badge-ek</dt><dd>{{ detail.badgeCount }}</dd></div>
        </dl>

        <h2 class="font-medium mb-3">Legutóbbi vizsgák</h2>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-text-muted border-b border-border-default">
              <th class="py-2">Feladatsor</th>
              <th class="py-2">Dátum</th>
              <th class="py-2">Eredmény</th>
            </tr>
          </thead>
          <tbody>
            @for (exam of detail.recentExams; track exam.sessionId) {
              <tr class="border-b border-border-default">
                <td class="py-2">{{ exam.taskSetTitle }}</td>
                <td class="py-2">{{ exam.startedAt | date: 'yyyy.MM.dd' }}</td>
                <td class="py-2">
                  @if (exam.isCompleted) {
                    {{ exam.scorePercent ?? '–' }}%
                  } @else {
                    folyamatban
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="3" class="py-4 text-text-muted">Nincs vizsga-előzmény.</td></tr>
            }
          </tbody>
        </table>
      </div>
    } @else if (store.loading()) {
      <p class="text-text-muted text-center py-10">Betöltés…</p>
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
}
