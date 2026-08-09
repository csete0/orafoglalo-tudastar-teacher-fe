import { ChangeDetectionStrategy, Component, inject, input, OnInit, output, signal } from '@angular/core';
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
export class DateRangeFilterComponent implements OnInit {
  private readonly toastService = inject(ToastService);

  /**
   * UI-TT-178: a komponens egy `@switch`/`@case` ágban élő szülőknél (`csoport-
   * reszletek`, `intezmeny-reszletek`) minden fülváltáskor destroy+recreate-elődik
   * - enélkül az input NÉLKÜL a saját `rangeKey`/`customFrom`/`customTo` szignálja
   * mindig `DEFAULT_RANGE_KEY`-re ("Teljes időszak") inicializálódna újra, FÜGGETLENÜL
   * attól, hogy a szülő már egy korábban alkalmazott, eltérő szűrést tart életben (a
   * lekérdezés maga helyesen újra lefut a perzisztált szűréssel - csak a LÁTHATÓ
   * legördülő csúszott szét ettől a ténytől). A szülő ezt az inputot a saját
   * perzisztált állapotából táplálja minden újra-mountoláskor.
   */
  readonly initialRangeKey = input<ReportRangeKey>(DEFAULT_RANGE_KEY);
  readonly initialCustomFrom = input<string>('');
  readonly initialCustomTo = input<string>('');

  readonly rangeChange = output<{ key: ReportRangeKey; range: ReportDateRange }>();

  /**
   * FIGYELEM — getter, nem mező. Mezőként (`readonly options = REPORT_RANGE_OPTIONS;`)
   * a TESZTKÖRNYEZETBEN némán `undefined` lesz, és a `@for (option of options; ...)`
   * üresen renderel.
   *
   * Mérve (2026-07-28): a hiba a `@angular/build:unit-test` + Vitest chunk-darabolásától
   * függ, NEM a nyelvi szemantikától. Ugyanez a mező-alak
   *   - izoláltan futtatva (1 spec)      → HELYES
   *   - 8 spec fájllal együtt            → HELYES
   *   - a teljes suite-tal (45 spec)     → undefined
   * Vagyis egy modul-darabszám-küszöb fölött a teszt-bundler olyan chunk-sorrendet
   * állít elő, amiben a konstans a mező-inicializálás pillanatában még nincs kiértékelve.
   *
   * A PRODUKCIÓS BUILD NEM ÉRINTETT: az ESM garantálja, hogy egy levél-modul
   * (`report-date-range.ts`-nek nulla importja van) az importálója ELŐTT értékelődik ki,
   * és az `ng build` kimenetében a konstans ugyanabba a chunk-ba kerül, mint az osztály
   * (`options=V;` ahol `V=[...]` helyi változó). Élesben a mező-alak is működne.
   *
   * A getter a renderelés idején olvas, ezért mindkét környezetben helyes — hagyd így,
   * amíg a teszt-toolchain viselkedése meg nem változik.
   */
  get options(): readonly ReportRangeOption[] {
    return REPORT_RANGE_OPTIONS;
  }

  // UI-TT-178: NEM field-initializerben olvassuk ki az initialRangeKey()/
  // initialCustomFrom()/initialCustomTo() inputokat - Angular a direktíva
  // konstruktorát (és a field-initializereket) a bekötött input-értékek
  // ALKALMAZÁSA ELŐTT futtatja le, tehát egy `signal(this.initialRangeKey())`
  // alakú seedelés itt mindig a DEFAULT_RANGE_KEY-t "fagyasztaná be", függetlenül
  // attól, mit köt be a szülő. Az ngOnInit már az első input-kötési kör UTÁN fut
  // le, itt biztonságosan olvasható a ténylegesen bekötött kezdőérték.
  readonly rangeKey = signal<ReportRangeKey>(DEFAULT_RANGE_KEY);
  readonly customFrom = signal<string>('');
  readonly customTo = signal<string>('');

  ngOnInit(): void {
    this.rangeKey.set(this.initialRangeKey());
    this.customFrom.set(this.initialCustomFrom());
    this.customTo.set(this.initialCustomTo());
  }

  selectKey(key: ReportRangeKey): void {
    this.rangeKey.set(key);
    // Az "Egyéni időszak" kiválasztása önmagában még nem szűr — a tanárnak előbb
    // ki kell töltenie a két dátumot, és a Szűrés gombra kattintania.
    if (key === 'custom') return;
    this.rangeChange.emit({ key, range: resolveRange(key) });
  }

  applyCustom(): void {
    const range: ReportDateRange = {
      from: this.customFrom() ? this.parseLocalDate(this.customFrom()) : undefined,
      // BE-STUDENTACTIVITY-CUSTOMRANGE-TO-TIMEZONE-OVERINCLUSION: a `to` a
      // KIVÁLASZTOTT ZÁRÓ NAP UTÁNI nap helyi éjfélét (a kizáró felső határt)
      // képviseli - a backend ezt mostantól közvetlenül `< to.Value`-ként
      // használja, nem ő maga tolja el egy nappal (ld. StudentActivityAggregator).
      to: this.customTo() ? this.parseLocalDate(this.customTo(), 1) : undefined,
    };

    const error = validateRange(range);
    if (error) {
      // UI-TT-134: soha nem néma no-op — ha nem szűrünk, a tanárnak meg kell
      // tudnia, miért nem. A szerver-oldali validáció a mérvadó, ez csak azért
      // van, hogy ne kelljen egy kört várni a visszajelzésre.
      this.toastService.warning(error, 5000);
      return;
    }

    this.rangeChange.emit({ key: 'custom', range });
  }

  /**
   * Az `<input type="date">` "ÉÉÉÉ-HH-NN" stringjét a FELHASZNÁLÓ SAJÁT
   * (böngésző) időzónájában értelmezett naptári nap kezdeteként építi fel -
   * a `new Date(string)` ISO-string alakot MINDIG UTC-ként értelmezi
   * (ECMA-262), függetlenül a böngésző időzónájától, ami egy pozitív
   * UTC-eltolású (pl. magyarországi) felhasználónál a helyi nap kezdetét
   * 1-2 órával KÉSŐBBRE tolja, mint amit a tanár ténylegesen kiválasztott -
   * csendben kizárva a kiválasztott nap kora reggeli aktivitását a FROM
   * oldalon (BE-STUDENTACTIVITY-CUSTOMRANGE-FROM-TIMEZONE-GAP), és tévesen
   * befoglalva a következő nap kora reggeli aktivitását a TO oldalon
   * (BE-STUDENTACTIVITY-CUSTOMRANGE-TO-TIMEZONE-OVERINCLUSION). Ugyanaz a
   * mintázat, amit a `semesterStart()`/`last30` gyorsszűrők már helyesen
   * alkalmaznak (komponensenkénti, LOKÁLIS `new Date(year, month, day)`
   * konstruktor, nem ISO-string parse).
   */
  private parseLocalDate(isoDateString: string, addDays = 0): Date {
    const [year, month, day] = isoDateString.split('-').map(Number);
    return new Date(year, month - 1, day + addDays);
  }
}
