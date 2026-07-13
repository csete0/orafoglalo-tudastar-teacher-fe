import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReportStore } from '../../services/report/report.store';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

/** Tagonkénti eredmény-mátrix (tagok × feladatok) a tanár saját feladatsorán. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsor-eredmenyek',
  standalone: true,
  imports: [RouterLink, LocalSpinnerComponent],
  template: `
    @if (report.taskSetResults(); as results) {
      <div class="max-w-5xl mx-auto px-4 py-10">
        <h1 class="page-title">{{ results.title }} — eredmények</h1>
        <p class="text-sm text-text-muted mt-1">Tagonkénti eredmény-mátrix (diákok × feladatok)</p>
        <div class="hairline"></div>

        <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-left text-text-muted text-xs uppercase tracking-wide border-b border-border-default">
                <th class="py-3 px-4">Diák</th>
                <th class="py-3 px-4">Összesen</th>
                @for (task of results.tasks; track task.taskId) {
                  <th class="py-3 px-4 whitespace-nowrap">{{ task.taskOrder }}. {{ task.title }}</th>
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
                      @if (cell.isCompleted) {
                        <span class="text-success">{{ cell.earnedPoints ?? '–' }}/{{ cell.maxPoints ?? '–' }}</span>
                      } @else {
                        <span class="text-text-muted">–</span>
                      }
                    </td>
                  }
                </tr>
              } @empty {
                <tr><td [attr.colspan]="results.tasks.length + 2" class="py-6 px-4 text-text-muted text-center">Nincs elérhető diák.</td></tr>
              }
            </tbody>
          </table>
        </div>
        </div>
      </div>
    } @else if (report.loading()) {
      <app-local-spinner />
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
