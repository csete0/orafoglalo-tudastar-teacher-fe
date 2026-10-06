import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MockExamService } from '../../services/mock-exam/mock-exam.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import {
  MOCK_EXAM_LEVEL_LABEL, MOCK_EXAM_MEMBER_STATUS_LABEL, MockExamGroupResults, MockExamLevel, MockExamTeacherEvent, MockExamTeacherGroup,
} from '../../models/mock-exam.model';

/**
 * Próbaérettségi – tanári oldal (PATRICKS-PROBAERETTSEGI-TERV.md E): a saját csoportok jelentkeztetése alapszinttel,
 * visszavonás indulás előtt; csoportonként a hét alatt az állapot, a közzététel után a rögzített eredmény (felülbírálás nincs).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-probaerettsegi-page',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, LocalSpinnerComponent],
  template: `
    <div class="max-w-6xl mx-auto px-4 py-6">
      @if (loading()) {
        <app-local-spinner />
      } @else if (event(); as ev) {
        <p class="text-xs font-bold uppercase tracking-wide text-warning">Próbaérettségi · ingyenes</p>
        <h1 class="text-2xl font-bold">{{ ev.title }}</h1>
        <p class="text-sm text-text-muted mt-1 mb-5">
          Kezdhető: {{ ev.opensAt | date: 'MMM d., HH:mm' }} – {{ ev.startClosesAt | date: 'MMM d., HH:mm' }} (egy hét, diákonként egyszer;
          közép 180, emelt 240 perc) · eredmény: {{ ev.resultsPlannedAt | date: 'MMM d., HH:mm' }}.
          A diákok a héten bármikor megírhatják, akár órán is. Az eredményt a platform értékeli és teszi közzé - tanári felülbírálás nincs.
        </p>

        <div class="card overflow-hidden mb-6">
          <div class="overflow-x-auto">
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="text-left text-text-muted text-xs uppercase tracking-wide border-b border-border-default">
                  <th class="py-3 px-4">Csoport</th>
                  <th class="py-3 px-4">Tagok</th>
                  <th class="py-3 px-4">Alapszint</th>
                  <th class="py-3 px-4">Jelentkezett</th>
                  <th class="py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                @for (g of ev.groups; track g.groupId) {
                  <tr class="border-b border-border-default last:border-b-0" data-testid="mock-group-row">
                    <td class="py-2.5 px-4">
                      <a [routerLink]="['/csoportok', g.groupId]" class="text-primary hover:underline">{{ g.name }}</a>
                      @if (g.registered) { <span class="badge badge-success ml-2">jelentkeztetve</span> }
                    </td>
                    <td class="py-2.5 px-4 tabular-nums">
                      {{ g.memberCount }}
                      @if (g.unconfirmedMembers) {
                        <span class="badge badge-warning ml-1" title="Megerősítetlen e-mail-címmel nem indíthatnak, amíg meg nem erősítik">
                          {{ g.unconfirmedMembers }} megerősítetlen
                        </span>
                      }
                    </td>
                    <td class="py-2.5 px-4">
                      <select class="input !py-1" [attr.aria-label]="g.name + ' alapszintje'" [value]="levelOf(g)"
                              [disabled]="!ev.registrationOpen" (change)="setLevel(g, $any($event.target).value)">
                        <option value="kozep">közép</option>
                        <option value="emelt">emelt</option>
                      </select>
                    </td>
                    <td class="py-2.5 px-4 tabular-nums">{{ g.registeredMembers }} / {{ g.memberCount }}</td>
                    <td class="py-2.5 px-4 whitespace-nowrap text-right">
                      @if (ev.registrationOpen) {
                        <button type="button" class="btn btn-primary !py-1" [disabled]="busy()" (click)="register(ev, g)">
                          {{ g.registered ? 'Szint mentése' : 'Jelentkeztetés' }}
                        </button>
                        @if (g.registered) {
                          <button type="button" class="btn btn-ghost !py-1 ml-1" [disabled]="busy()" (click)="revoke(ev, g)">Visszavonás</button>
                        }
                      }
                      @if (g.registered || g.registeredMembers) {
                        <button type="button" class="btn btn-ghost !py-1 ml-1" (click)="toggleResults(ev, g)" [attr.aria-expanded]="open()?.groupId === g.groupId">
                          {{ ev.resultsPublished ? 'Eredmények' : 'Állapot' }}
                        </button>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="py-6 px-4 text-text-muted">Még nincs csoportod. <a routerLink="/csoportok" class="text-primary hover:underline">Csoport létrehozása</a></td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <p class="text-xs text-text-muted mb-6">
          A jelentkeztetés a csoport tagjait a választott alapszinttel jelentkezteti (aki magától már jelentkezett, a saját szintjén marad);
          a diák a kezdésig szintet válthat. A később csatlakozó tag az indításkor kerül be. Visszavonáskor az el nem kezdett,
          általad jelentkeztetett tagok jelentkezése törlődik.
        </p>

        @if (open(); as r) {
          <section class="card p-4" aria-labelledby="mock-results-title" data-testid="mock-group-results">
            <h2 id="mock-results-title" class="text-lg font-bold mb-1">{{ r.groupName }}</h2>
            @if (r.resultsPublished) {
              <p class="text-sm text-text-muted mb-3">
                Csoportátlag: <strong class="tabular-nums">{{ r.avgPercent ?? '–' }}{{ r.avgPercent != null ? '%' : '' }}</strong>
                · eloszlás (10%-os sávok): <span class="tabular-nums">{{ r.distribution.join(' · ') }}</span>.
                Az ablakváltás és a beillesztés csak tájékoztató adat, nem bizonyíték.
              </p>
            } @else {
              <p class="text-sm text-text-muted mb-3">A közzétételig csak az látszik, ki kezdte el és ki adta be - pontszám nincs.</p>
            }
            <div class="overflow-x-auto">
              <table class="w-full text-sm border-collapse">
                <thead>
                  <tr class="text-left text-text-muted text-xs uppercase tracking-wide border-b border-border-default">
                    <th class="py-2 px-3">Diák</th><th class="py-2 px-3">Szint</th><th class="py-2 px-3">Állapot</th>
                    @if (r.resultsPublished) {
                      <th class="py-2 px-3">Pont</th><th class="py-2 px-3">%</th><th class="py-2 px-3">Jegy</th><th class="py-2 px-3">Hely</th>
                      <th class="py-2 px-3">Percentilis</th><th class="py-2 px-3">Fül / beill.</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (m of r.members; track m.userId) {
                    <tr class="border-b border-border-default last:border-b-0" [class.opacity-60]="m.status === 'notRegistered' || m.status === 'notStarted'">
                      <td class="py-2 px-3 whitespace-nowrap">
                        {{ m.name }}
                        @if (!m.emailConfirmed) {
                          <span class="badge badge-warning !text-[10px] !px-1.5 !py-0.5" title="Nem indíthat, amíg meg nem erősíti az e-mail-címét">megerősítetlen e-mail</span>
                        }
                      </td>
                      <td class="py-2 px-3">{{ m.level ? levelLabel[m.level] : '–' }}</td>
                      <td class="py-2 px-3 whitespace-nowrap">{{ statusLabel[m.status] }}</td>
                      @if (r.resultsPublished) {
                        <td class="py-2 px-3 tabular-nums whitespace-nowrap" [title]="taskTitle(m)">{{ m.points != null ? m.points + ' / ' + m.maxPoints : '–' }}</td>
                        <td class="py-2 px-3 tabular-nums">{{ m.percent != null ? (m.percent | number: '1.0-1') + '%' : '–' }}</td>
                        <td class="py-2 px-3 tabular-nums">{{ m.grade ?? '–' }}</td>
                        <td class="py-2 px-3 tabular-nums">{{ m.rank ?? '–' }}</td>
                        <td class="py-2 px-3 tabular-nums">{{ m.percentile != null ? m.percentile + '%' : '–' }}</td>
                        <td class="py-2 px-3 tabular-nums">{{ m.focusLossCount ?? '–' }} / {{ m.pasteCount ?? '–' }}</td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      } @else {
        <h1 class="text-2xl font-bold mb-2">Próbaérettségi</h1>
        <p class="text-text-muted">Jelenleg nincs meghirdetett próbaérettségi. Ha lesz, itt jelentkeztetheted a csoportjaidat.</p>
      }
    </div>
  `,
})
export class ProbaerettsegiPageComponent implements OnInit {
  private readonly api = inject(MockExamService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly event = signal<MockExamTeacherEvent | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly open = signal<MockExamGroupResults | null>(null);
  /** A választott alapszint csoportonként (amíg nincs mentve). */
  readonly levels = signal<Record<number, MockExamLevel>>({});
  readonly levelLabel = MOCK_EXAM_LEVEL_LABEL;
  readonly statusLabel = MOCK_EXAM_MEMBER_STATUS_LABEL;

  async ngOnInit(): Promise<void> {
    try {
      const current = await firstValueFrom(this.api.getCurrent());
      if (current) this.event.set(await firstValueFrom(this.api.get(current.slug)));
    } catch (err) {
      this.toast.danger(extractErrorMessage(err, 'A próbaérettségi adatai most nem tölthetők be.'));
    } finally {
      this.loading.set(false);
    }
  }

  setLevel(g: MockExamTeacherGroup, level: MockExamLevel): void {
    this.levels.update((all) => ({ ...all, [g.groupId]: level }));
  }

  levelOf(g: MockExamTeacherGroup): MockExamLevel {
    return this.levels()[g.groupId] ?? g.defaultLevel ?? 'kozep';
  }

  taskTitle(m: { tasks: { title: string; points: number; maxPoints: number }[] }): string {
    return m.tasks.map((t) => `${t.title}: ${t.points} / ${t.maxPoints}`).join('\n');
  }

  async register(ev: MockExamTeacherEvent, g: MockExamTeacherGroup): Promise<void> {
    await this.run(async () => {
      this.event.set(await firstValueFrom(this.api.registerGroup(ev.slug, g.groupId, this.levelOf(g))));
      this.toast.success(g.registered ? 'Az alapszint mentve.' : `A(z) ${g.name} csoport jelentkeztetve - a diákok értesítést kaptak.`);
    });
  }

  async revoke(ev: MockExamTeacherEvent, g: MockExamTeacherGroup): Promise<void> {
    if (!(await this.confirm.ask({
      title: 'Visszavonod a jelentkeztetést?',
      message: 'Az általad jelentkeztetett, még el nem kezdett tagok jelentkezése törlődik. Aki már elkezdte, az folytathatja.',
      confirmLabel: 'Visszavonás', danger: true,
    }))) return;
    await this.run(async () => {
      this.event.set(await firstValueFrom(this.api.revokeGroup(ev.slug, g.groupId)));
      if (this.open()?.groupId === g.groupId) this.open.set(null);
      this.toast.success('A jelentkeztetés visszavonva.');
    });
  }

  async toggleResults(ev: MockExamTeacherEvent, g: MockExamTeacherGroup): Promise<void> {
    if (this.open()?.groupId === g.groupId) {
      this.open.set(null);
      return;
    }
    await this.run(async () => this.open.set(await firstValueFrom(this.api.getGroupResults(ev.slug, g.groupId))));
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (err) {
      this.toast.danger(extractErrorMessage(err, 'A művelet nem sikerült, próbáld újra.'));
    } finally {
      this.busy.set(false);
    }
  }
}
