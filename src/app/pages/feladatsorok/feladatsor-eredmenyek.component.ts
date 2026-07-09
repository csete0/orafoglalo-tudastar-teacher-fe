import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReportStore } from '../../services/report/report.store';

/** Tagonkénti eredmény-mátrix (tagok × feladatok) a tanár saját feladatsorán. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsor-eredmenyek',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (report.taskSetResults(); as results) {
      <div class="max-w-5xl mx-auto px-4 py-10">
        <h1 class="text-xl font-semibold mb-6">{{ results.title }} — eredmények</h1>

        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-left text-text-muted border-b border-border-default">
                <th class="py-2 pr-4">Diák</th>
                <th class="py-2 pr-4">Összesen</th>
                @for (task of results.tasks; track task.taskId) {
                  <th class="py-2 pr-4 whitespace-nowrap">{{ task.taskOrder }}. {{ task.title }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of results.students; track row.userId) {
                <tr class="border-b border-border-default" [class.opacity-50]="!row.hasSession">
                  <td class="py-2 pr-4">
                    <a [routerLink]="['/diakok', row.userId]" class="text-primary hover:underline">{{ row.name }}</a>
                  </td>
                  <td class="py-2 pr-4">
                    @if (row.hasSession) {
                      {{ row.totalEarnedPoints ?? '–' }} / {{ row.totalMaxPoints ?? '–' }}
                    } @else {
                      nem kezdte el
                    }
                  </td>
                  @for (cell of row.taskResults; track cell.taskId) {
                    <td class="py-2 pr-4">
                      @if (cell.isCompleted) {
                        <span class="text-success">{{ cell.earnedPoints ?? '–' }}/{{ cell.maxPoints ?? '–' }}</span>
                      } @else {
                        <span class="text-text-muted">–</span>
                      }
                    </td>
                  }
                </tr>
              } @empty {
                <tr><td [attr.colspan]="results.tasks.length + 2" class="py-4 text-text-muted">Nincs elérhető diák.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    } @else if (report.loading()) {
      <p class="text-text-muted text-center py-10">Betöltés…</p>
    } @else {
      <p class="text-danger text-center py-10">{{ report.error() }}</p>
    }
  `,
})
export class FeladatsorEredmenyekComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly report = inject(ReportStore);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.report.loadTaskSetResults(id);
  }
}
