import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../toast/toast.service';
import {
  DEFAULT_RANGE_KEY,
  REPORT_RANGE_OPTIONS,
  ReportDateRange,
  ReportRangeKey,
  ReportRangeOption,
  resolveRange,
  validateRange,
} from '../date-range/report-date-range';

/**
 * A tanári riportok dátum-tartomány szűrője. Közös komponens, mert három oldal
 * (`csoport-reszletek`, `diak-reszletek`, `intezmeny-reszletek`) használja
 * ugyanazokkal a gyorsválasztókkal — háromszor lemásolva a "félév" definíciója
 * és a validáció is szétcsúszhatna.
 *
 * A komponens NEM tölt be semmit; csak feloldott tartományt ad ki
 * (`rangeChange`), a betöltés a szülő oldal dolga.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-date-range-filter',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="flex flex-wrap items-end gap-2 mb-4">
      <div>
        <label class="text-xs text-text-muted block mb-1" [attr.for]="'range-key'">Időszak</label>
        <select id="range-key" [ngModel]="rangeKey()" (ngModelChange)="selectKey($event)"
          [ngModelOptions]="{ standalone: true }" class="input !w-auto">
          @for (option of options; track option.key) {
            <option [value]="option.key">{{ option.label }}</option>
          }
        </select>
      </div>

      @if (rangeKey() === 'custom') {
        <div>
          <label class="text-xs text-text-muted block mb-1" [attr.for]="'range-from'">Kezdete</label>
          <input id="range-from" type="date" [ngModel]="customFrom()" (ngModelChange)="customFrom.set($event)"
            [ngModelOptions]="{ standalone: true }" class="input !w-auto" />
        </div>
        <div>
          <label class="text-xs text-text-muted block mb-1" [attr.for]="'range-to'">Vége</label>
          <input id="range-to" type="date" [ngModel]="customTo()" (ngModelChange)="customTo.set($event)"
            [ngModelOptions]="{ standalone: true }" class="input !w-auto" />
        </div>
        <button (click)="applyCustom()" class="btn btn-primary">Szűrés</button>
      }
    </div>
  `,
})
export class DateRangeFilterComponent {
  private readonly toastService = inject(ToastService);

  readonly rangeChange = output<ReportDateRange>();

  /**
   * FIGYELEM — getter, nem mező. Mezőként (`readonly options = REPORT_RANGE_OPTIONS;`)
   * ez némán `undefined` volt ebben a build-beállításban: az importált `const`
   * KÖZVETLEN mező-hozzárendelése nem áll be, miközben modul-szinten és
   * függvényhívásban helyes. Következmény: a `@for (option of options; ...)` egy
   * `undefined`-on iterált, így a gyorsszűrő gombok EGYÁLTALÁN NEM jelentek meg.
   * (A `rangeKey` azért működött, mert a konstans egy függvényhívás argumentuma.)
   * A getter a renderelés idején olvas — NE alakítsd vissza mezővé.
   */
  get options(): readonly ReportRangeOption[] {
    return REPORT_RANGE_OPTIONS;
  }

  readonly rangeKey = signal<ReportRangeKey>(DEFAULT_RANGE_KEY);
  readonly customFrom = signal<string>('');
  readonly customTo = signal<string>('');

  selectKey(key: ReportRangeKey): void {
    this.rangeKey.set(key);
    // Az "Egyéni időszak" kiválasztása önmagában még nem szűr — a tanárnak előbb
    // ki kell töltenie a két dátumot, és a Szűrés gombra kattintania.
    if (key === 'custom') return;
    this.rangeChange.emit(resolveRange(key));
  }

  applyCustom(): void {
    const range: ReportDateRange = {
      from: this.customFrom() ? new Date(this.customFrom()) : undefined,
      to: this.customTo() ? new Date(this.customTo()) : undefined,
    };

    const error = validateRange(range);
    if (error) {
      // UI-TT-134: soha nem néma no-op — ha nem szűrünk, a tanárnak meg kell
      // tudnia, miért nem. A szerver-oldali validáció a mérvadó, ez csak azért
      // van, hogy ne kelljen egy kört várni a visszajelzésre.
      this.toastService.warning(error, 5000);
      return;
    }

    this.rangeChange.emit(range);
  }
}
