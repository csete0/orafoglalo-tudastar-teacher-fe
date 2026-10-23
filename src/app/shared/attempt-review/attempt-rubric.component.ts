import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AttemptRubricGradeDto, RubricGradeItemDto } from '../../models/report.model';
import { gradeReason, GradeReasonView } from '../grade-reason.util';

/** Pontot vesztett szempont: állításnál hamis, egyébként a maximumnál kevesebb pont. */
function isLost(item: RubricGradeItemDto): boolean {
  return item.kind === 'statement' ? item.ok === false : item.points < item.maxPoints;
}

/**
 * Az értékelő panel „Szempontonként” blokkja (teljes vizsga, H5): az MI szempontonkénti
 * értékelése; a pontot vesztett szempontoknál közérthető indokkal.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-attempt-rubric',
  host: { class: 'block' },
  template: `
    @let g = grade();
    <details class="mt-4 text-sm" data-testid="attempt-rubric">
      <summary class="cursor-pointer">
        <span class="text-xs uppercase tracking-wide text-text-muted">Szempontonként</span>
        <strong class="ml-2">{{ g.rawPoints }}/{{ g.rawTotal }} nyers pont</strong>
        @if (g.draftRubric) { <span class="text-xs text-warning ml-1">vázlat-útmutató</span> }
        <span class="text-xs text-text-muted ml-1">– {{ lostCount() }} szempontnál veszett pont</span>
      </summary>
      <ul class="mt-2 space-y-1">
        @for (item of g.items; track item.itemId) {
          <li [class.text-text-muted]="!isLost(item)">
            <span class="font-semibold tabular-nums">{{ item.kind === 'statement' ? (item.ok ? '✓' : '✗') : item.points + '/' + item.maxPoints }}</span>
            {{ item.text }}
            @if (isLost(item) && reason(item); as why) {
              <span class="text-text-muted" data-testid="attempt-rubric-reason">– {{ why.text }}</span>
              @if (why.detail) { <span class="block text-xs text-text-muted" data-testid="attempt-rubric-reason-detail">{{ why.detail }}</span> }
            }
          </li>
        }
      </ul>
    </details>
  `,
})
export class AttemptRubricComponent {
  readonly grade = input.required<AttemptRubricGradeDto>();

  readonly lostCount = computed(() => this.grade().items.filter(isLost).length);

  isLost(item: RubricGradeItemDto): boolean {
    return isLost(item);
  }

  /** Az indok közérthetően (a gépi tétel nyers szabály-útvonala nélkül). */
  reason(item: RubricGradeItemDto): GradeReasonView | null {
    const state = item.kind === 'statement' ? (item.ok ? 'full' : 'none') : item.points >= item.maxPoints ? 'full' : item.points > 0 ? 'partial' : 'none';
    return gradeReason(item.reason, state);
  }
}
