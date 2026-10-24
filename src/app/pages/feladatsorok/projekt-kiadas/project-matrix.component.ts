import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  DESKTOP_LANGUAGE_LABELS,
  INDEPENDENCE_LABELS,
  ProjectAssignmentStepDto,
  ProjectAssignmentStudentDto,
  ProjectAssignmentStudentsDto,
  RUNTIME_LABELS,
} from '../../../models/teacher-project.model';
import { parseUtc } from '../../../shared/utc-date.util';

/** Egy cella állapota a mátrixban. */
type CellState = 'onallo' | 'kis-segitseggel' | 'segitseggel' | 'folyamatban' | 'nincs';

/**
 * A projekt-kiadás diák × lépés mátrixa az önállósággal (önállóan / kis segítséggel / segítséggel / folyamatban / még nincs),
 * lépésenkénti összesítővel és a legnagyobb lemorzsolódással. A diák nevére kattintva a szülő megnyitja a kódját.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-matrix',
  host: { class: 'block' },
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="flex flex-wrap gap-3 text-xs mt-4" aria-label="Jelmagyarázat">
      @for (l of legend; track l.state) {
        <span class="inline-flex items-center gap-1.5"><span class="cell-dot" [class]="'cell-dot cell--' + l.state"></span>{{ l.label }}</span>
      }
    </div>

    <div class="card overflow-hidden mt-4">
    <div class="data-table-scroll">
      <table class="data-table" data-testid="project-matrix">
        <thead>
          <tr>
            <th class="sticky-col">Diák</th>
            @for (m of view().milestones; track m.orderNo) {
              <th class="!px-2 text-center" [class.drop-col]="m.orderNo === worstDrop()" [attr.title]="m.title">{{ m.orderNo }}.</th>
            }
            <th class="text-right">Ellenőrzés</th>
            <th class="text-right">AI-token (30 nap)</th>
            <th>Utoljára</th>
          </tr>
        </thead>
        <tbody>
          @for (s of view().students; track s.userId) {
            <tr [attr.data-testid]="'student-' + s.userId">
              <td class="sticky-col">
                @if (s.runtime && !s.leftGroup) {
                  <button type="button" class="font-semibold text-left underline-offset-2 hover:underline" (click)="studentSelected.emit(s)">{{ s.name }}</button>
                } @else {
                  <span class="font-semibold">{{ s.name }}</span>
                }
                @if (s.leftGroup) {
                  <span class="badge badge-neutral !text-[10px] !px-1.5 !py-0.5" [attr.data-testid]="'left-group-' + s.userId"
                      title="A diák azóta kilépett vagy kikerült a csoportból - a tagként írt dolgozata csak olvasható">kilépett a csoportból</span>
                }
                <span class="block text-xs text-text-muted">
                  {{ languageLabel(s) }}{{ s.completedAt ? ' · kész' : '' }}
                  @if (!s.hasFullAccess && !s.leftGroup) { · <span class="text-warning">ingyenes lépésekig</span> }
                </span>
              </td>
              @for (step of s.steps; track step.orderNo) {
                <td class="!px-2 text-center" [class.drop-col]="step.orderNo === worstDrop()">
                  <span class="cell-dot" [class]="'cell-dot cell--' + cell(s, step)" [attr.title]="cellTitle(s, step)"
                        [attr.aria-label]="step.orderNo + '. lépés: ' + cellLabel(s, step)"></span>
                </td>
              }
              <td class="num text-right">{{ checks(s) }}</td>
              <td class="num text-right">{{ s.aiTokens30 }}</td>
              <td class="num whitespace-nowrap text-xs text-text-muted">{{ s.lastActivityAt ? (utc(s.lastActivityAt) | date: 'MM.dd. HH:mm') : '–' }}</td>
            </tr>
          } @empty {
            <tr><td class="!py-6 text-text-muted text-center" [attr.colspan]="view().milestones.length + 4">A csoportnak még nincs tagja.</td></tr>
          }
        </tbody>
        <tfoot>
          <tr class="text-xs">
            <td>Teljesítette</td>
            @for (c of passedCounts(); track c.orderNo) {
              <td class="num !px-2 text-center" [class.drop-col]="c.orderNo === worstDrop()">{{ c.passed }}/{{ view().students.length }}</td>
            }
            <td colspan="3"></td>
          </tr>
        </tfoot>
      </table>
    </div>
    </div>
    @if (worstDrop(); as order) {
      <p class="text-sm mt-3" data-testid="worst-drop">A legtöbben a(z) <strong>{{ order }}. lépésnél</strong> akadnak el ({{ milestoneTitle(order) }}).</p>
    }
  `,
  styles: [`
    .cell-dot { display: inline-block; width: 1rem; height: 1rem; border-radius: 999px; border: 2px solid transparent; vertical-align: middle; }
    .cell--onallo { background: var(--color-success); }
    .cell--kis-segitseggel { background: var(--color-primary); }
    .cell--segitseggel { background: var(--color-warning); }
    .cell--folyamatban { border-color: var(--color-text-muted); }
    .cell--nincs { background: var(--color-bg-element); }
    .drop-col { background: var(--color-warning-subtle); }
  `],
})
export class ProjectMatrixComponent {
  readonly view = input.required<ProjectAssignmentStudentsDto>();
  /** Egy elkezdett, a csoportban lévő diák nevére kattintottak. */
  readonly studentSelected = output<ProjectAssignmentStudentDto>();

  readonly utc = parseUtc;
  readonly legend: { state: CellState; label: string }[] = [
    { state: 'onallo', label: INDEPENDENCE_LABELS.onallo },
    { state: 'kis-segitseggel', label: INDEPENDENCE_LABELS['kis-segitseggel'] },
    { state: 'segitseggel', label: INDEPENDENCE_LABELS.segitseggel },
    { state: 'folyamatban', label: 'folyamatban' },
    { state: 'nincs', label: 'még nem jutott el' },
  ];

  readonly passedCounts = computed(() => {
    const v = this.view();
    return v.milestones.map((m) => ({
      orderNo: m.orderNo,
      passed: v.students.filter((s) => s.steps.find((x) => x.orderNo === m.orderNo)?.passed).length,
    }));
  });

  /** Ahol a legtöbben akadtak el: a legnagyobb esés az előző lépés teljesítőihez képest (az elsőnél az elkezdőkhöz). */
  readonly worstDrop = computed(() => {
    const v = this.view();
    if (v.assignment.startedCount === 0) return null;
    let previous = v.students.filter((s) => s.runtime).length;
    let worst: { orderNo: number; drop: number } | null = null;
    for (const c of this.passedCounts()) {
      const drop = previous - c.passed;
      if (drop > 0 && (!worst || drop > worst.drop)) worst = { orderNo: c.orderNo, drop };
      previous = c.passed;
    }
    return worst?.orderNo ?? null;
  });

  /** A diák nyelve: technikumi projektnél a választott C#/Java (a futtató ott csak a REST-backendé), különben a futtató. */
  languageLabel(s: ProjectAssignmentStudentDto): string {
    if (s.desktopLanguage) return DESKTOP_LANGUAGE_LABELS[s.desktopLanguage];
    return s.runtime ? RUNTIME_LABELS[s.runtime] : 'még nem kezdte';
  }

  cell(s: ProjectAssignmentStudentDto, step: ProjectAssignmentStepDto): CellState {
    if (step.passed) return step.independence ?? 'onallo';
    return s.runtime && s.currentMilestoneOrder === step.orderNo && !s.completedAt ? 'folyamatban' : 'nincs';
  }

  cellLabel(s: ProjectAssignmentStudentDto, step: ProjectAssignmentStepDto): string {
    return this.legend.find((l) => l.state === this.cell(s, step))!.label;
  }

  cellTitle(s: ProjectAssignmentStudentDto, step: ProjectAssignmentStepDto): string {
    const parts = [this.cellLabel(s, step)];
    if (step.checks) parts.push(`${step.checks} Ellenőrzés`);
    if (step.hint1 + step.hint2 + step.hint3) parts.push(`tipp ${step.hint1} · hely ${step.hint2} · kód ${step.hint3}`);
    return parts.join(' – ');
  }

  checks(s: ProjectAssignmentStudentDto): number {
    return s.steps.reduce((sum, x) => sum + x.checks, 0);
  }

  milestoneTitle(orderNo: number): string {
    return this.view().milestones.find((m) => m.orderNo === orderNo)?.title ?? '';
  }
}
