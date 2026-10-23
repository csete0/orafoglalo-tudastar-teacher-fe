import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TaskWeakness, WEAK_THRESHOLD_PERCENT } from '../../../shared/task-analysis/task-weakness';

/**
 * A leggyengébben teljesített feladatok kártyája a feladatsor-eredmények oldalán.
 *
 * A mátrix megmutatja az adatot, de nem MONDJA MEG, mit kell újratanítani. A szülő csak
 * akkor rajzolja ki, ha van legalább egy értékelt beadás: egy beadás nélküli feladatsornál
 * "0%"-ot mutatni hazugság lenne, nem üres állapot.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-gyenge-feladatok',
  host: { class: 'block' },
  standalone: true,
  template: `
    <div class="card mb-4 p-4">
      <h2 class="text-xs uppercase tracking-wide text-text-muted mb-2">
        Leggyengébben teljesített feladatok
      </h2>
      <ul class="flex flex-col gap-1.5">
        @for (task of tasks(); track task.taskId) {
          <li class="flex items-baseline gap-2 flex-wrap text-sm">
            <span class="font-medium">{{ task.taskOrder }}. {{ task.title }}</span>
            <span class="text-text-muted">átlag {{ task.averagePercent }}%</span>
            @if (task.belowThresholdCount > 0) {
              <span class="badge badge-warning !text-[10px] !px-1.5 !py-0.5">
                {{ task.belowThresholdCount }} / {{ task.evaluatedCount }} diák
                {{ weakThresholdPercent }}% alatt
              </span>
            }
          </li>
        }
      </ul>
    </div>
  `,
})
export class GyengeFeladatokComponent {
  readonly tasks = input.required<TaskWeakness[]>();

  /**
   * FIGYELEM — getter, nem mező. Mezőként a TESZTKÖRNYEZETBEN némán `undefined`,
   * és a sablonban üresen renderel (`... diák % alatt`).
   *
   * Mérve (2026-07-28): a `@angular/build:unit-test` + Vitest chunk-darabolásának
   * mellékhatása, nem nyelvi szemantika — a mező-alak izoláltan és 8 spec fájllal
   * még helyes, csak a teljes suite-ban (45 spec) áll elő az `undefined`.
   *
   * A PRODUKCIÓS BUILD NEM ÉRINTETT — részletes indoklás a
   * `date-range-filter.component.ts` azonos getterénél.
   */
  get weakThresholdPercent(): number {
    return WEAK_THRESHOLD_PERCENT;
  }
}
