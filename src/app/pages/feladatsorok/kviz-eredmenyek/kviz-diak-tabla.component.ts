import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { TeacherQuizStudentResultDto } from '../../../models/teacher-quiz.model';
import { ariaSort, SortHeaderComponent, SortState, sortRows } from '../../../shared/sort-header/sort-header.component';

/**
 * A kvíz-eredmények „Diákonként” táblája: kompakt, oszloponként rendezhető (UI-UX-T5: 25+ fős
 * osztálynál a "ki a leggyengébb" kérdésre ne szemmel-kereséssel jöjjön a válasz).
 *
 * A rendezés állapota (`sort`) a szülőé: így egy hibás szűrő-lekérés után (amikor a szülő a
 * teljes eredmény-blokkot eltünteti) a tanár választott rendezése megmarad.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kviz-diak-tabla',
  host: { class: 'block' },
  standalone: true,
  imports: [DatePipe, SortHeaderComponent],
  template: `
    <section aria-labelledby="diakonkent">
      <h2 id="diakonkent" class="font-bold mb-3">Diákonként</h2>
      <div class="card overflow-hidden">
        <div class="data-table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th class="sticky-col" [attr.aria-sort]="ariaSort('name')">
                  <app-sort-header key="name" [state]="sort()" (sortChange)="sort.set($event)">Diák</app-sort-header>
                </th>
                <th [attr.aria-sort]="ariaSort('group')">
                  <app-sort-header key="group" [state]="sort()" (sortChange)="sort.set($event)">Csoport</app-sort-header>
                </th>
                <th [attr.aria-sort]="ariaSort('last')">
                  <app-sort-header key="last" [state]="sort()" (sortChange)="sort.set($event)">Utolsó kitöltés</app-sort-header>
                </th>
                <th class="text-right" [attr.aria-sort]="ariaSort('attempts')">
                  <app-sort-header key="attempts" [state]="sort()" (sortChange)="sort.set($event)">Kitöltés</app-sort-header>
                </th>
                <th class="text-right" [attr.aria-sort]="ariaSort('score')">
                  <app-sort-header key="score" [state]="sort()" (sortChange)="sort.set($event)">Legjobb eredmény</app-sort-header>
                </th>
                <th>Jelzés</th>
              </tr>
            </thead>
            <tbody>
              @for (s of sortedStudents(); track s.userId) {
                <tr>
                  <td class="sticky-col whitespace-nowrap font-medium">{{ s.name }}</td>
                  <td class="text-text-muted">{{ s.groupName }}</td>
                  <td class="num whitespace-nowrap">{{ s.lastCompletedAt ? (s.lastCompletedAt | date: 'yyyy.MM.dd. HH:mm') : '–' }}</td>
                  <td class="num text-right whitespace-nowrap">
                    {{ s.attemptCount }}
                    @if (s.liveAttemptCount > 0 && s.attemptCount !== s.liveAttemptCount) {
                      <span class="text-text-muted">(ebből {{ s.liveAttemptCount }} élő)</span>
                    }
                  </td>
                  <td class="num text-right whitespace-nowrap">
                    <strong>{{ s.bestScore != null ? s.bestScore + ' / ' + s.totalQuestions : '–' }}</strong>
                    <!-- UI-TT-223: a "⚡ N pont" csak akkor mehet a fő arány mellé, ha az
                         UGYANABBÓL az élő session-ből jön (bestScoreMode === 'live') - máskülönben
                         egy sosem megtörtént kombinációt sugallna. Ha a legjobb élő próbálkozás
                         nem a legjobb arányú, külön, egyértelműen jelölt sorban jelenik meg. -->
                    @if (s.bestScoreMode === 'live' && s.bestLivePoints != null) {
                      <span class="text-text-muted"> · ⚡ {{ s.bestLivePoints }} pont</span>
                    }
                    @if (s.bestScoreMode !== 'live' && s.bestLivePoints != null) {
                      <span class="block text-xs text-text-muted">
                        Legjobb élő menet: {{ s.bestLiveCorrectAnswers }} / {{ s.bestLiveTotalQuestions }}
                        · ⚡ {{ s.bestLivePoints }} pont
                      </span>
                    }
                  </td>
                  <td class="whitespace-nowrap">
                    @if (s.bestScoreMode === 'live') {
                      <span class="badge badge-primary"
                            title="A beszámított legjobb eredmény élő játékból származik">Élő</span>
                    }
                    @if (s.completedLate) {
                      <span class="badge badge-warning">Késett</span>
                    }
                    @if (s.hasInProgress) {
                      <span class="badge">Folyamatban</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="!py-6 text-text-muted text-center">Még nincs kinek eredményt mutatni.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `,
})
export class KvizDiakTablaComponent {
  readonly students = input.required<TeacherQuizStudentResultDto[]>();
  readonly sort = model<SortState | null>({ key: 'name', dir: 'asc' });

  /**
   * UI-UX-T5: kliens-oldali rendezés - az adat már mind itt van. A "legjobb eredmény"
   * arány szerint rendez (a nyers pont két eltérő kérdésszámú kvíz-változat között
   * hazudna); a még nem próbálkozók (null) mindig a lista végére kerülnek. Az előzetes
   * név szerinti rendezés (stabil sort) adja az egyenlő értékek sorrendjét.
   */
  readonly sortedStudents = computed(() => {
    const byName = [...this.students()].sort((a, b) => a.name.localeCompare(b.name, 'hu'));
    return sortRows(byName, this.sort(), {
      name: (s) => s.name,
      group: (s) => s.groupName,
      last: (s) => (s.lastCompletedAt ? new Date(s.lastCompletedAt).getTime() : null),
      attempts: (s) => s.attemptCount,
      score: (s) => (s.bestScore == null || s.totalQuestions === 0 ? null : s.bestScore / s.totalQuestions),
    });
  });

  ariaSort(key: string): string | null {
    return ariaSort(this.sort(), key);
  }
}
