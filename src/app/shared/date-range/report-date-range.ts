/**
 * A tanári riportok (`csoport-reszletek` / `diak-reszletek` / `intezmeny-reszletek`)
 * dátum-tartomány szűrőjének EGYETLEN forrása. Szándékosan itt él a teljes
 * dátum-aritmetika, nem a három komponensben szétszórva — a "félév" definíciója
 * üzleti döntés, nem lehet három helyen három változata.
 */

export type ReportRangeKey = 'all' | 'last30' | 'semester' | 'custom';

export interface ReportDateRange {
  from?: Date;
  to?: Date;
}

export interface ReportRangeOption {
  key: ReportRangeKey;
  label: string;
}

/**
 * Alapértelmezés: `all` — ez a mai viselkedés (szűrő nélküli hívás). Nem szabad
 * csendben megváltoztatni azt, amit a tanárok jelenleg látnak.
 */
export const DEFAULT_RANGE_KEY: ReportRangeKey = 'all';

export const REPORT_RANGE_OPTIONS: readonly ReportRangeOption[] = [
  { key: 'all', label: 'Teljes időszak' },
  { key: 'last30', label: 'Utolsó 30 nap' },
  { key: 'semester', label: 'Ebben a félévben' },
  { key: 'custom', label: 'Egyéni időszak' },
] as const;

/** A backend legfeljebb ennyi évet fogad el, ha MINDKÉT végpont meg van adva. */
export const MAX_RANGE_YEARS = 5;

/**
 * Az aktuális félév kezdete.
 *
 * A magyar tanév szeptembertől júniusig tart, a második félév február elején
 * kezdődik. Ebből:
 *   - szeptember–december → az idei tanév első féléve (idei szeptember 1.)
 *   - január              → MÉG az első félév, de az már a MÚLT naptári év
 *                           szeptemberében kezdődött
 *   - február–augusztus   → második félév (idei február 1.)
 *
 * A nyári hónapok (július–augusztus) szigorúan véve már tanéven kívül esnek;
 * ilyenkor a legutóbbi félév-kezdetet (február 1.) adjuk vissza, mert "ebben a
 * félévben" nyáron amúgy is a legutóbb lezárt félévet jelenti a tanár számára.
 */
export function semesterStart(now: Date): Date {
  const month = now.getMonth(); // 0 = január
  if (month >= 8) return new Date(now.getFullYear(), 8, 1); // szept. 1.
  if (month === 0) return new Date(now.getFullYear() - 1, 8, 1); // előző szept. 1.
  return new Date(now.getFullYear(), 1, 1); // febr. 1.
}

/**
 * A kiválasztott gyorsszűrőt konkrét dátum-tartománnyá oldja fel.
 *
 * A `to` szándékosan `undefined` a `last30`/`semester` esetén: "az elmúlt 30 nap"
 * és "ebben a félévben" egyaránt a MÁIG tart, és egy explicit felső korlát csak
 * időzóna-eltolódásból fakadó hibákat hozna be (a mai nap végét kellene eltalálni).
 */
export function resolveRange(
  key: ReportRangeKey,
  custom?: ReportDateRange,
  now: Date = new Date(),
): ReportDateRange {
  switch (key) {
    case 'all':
      return {};
    case 'last30': {
      const from = new Date(now);
      from.setDate(from.getDate() - 30);
      return { from };
    }
    case 'semester':
      return { from: semesterStart(now) };
    case 'custom':
      return { from: custom?.from, to: custom?.to };
  }
}

/**
 * Kliens-oldali ellenőrzés. A szerver-oldali validáció a mérvadó
 * (`TeacherReportService.ValidateDateRange`) — ez csak azért van, hogy a tanár
 * azonnal visszajelzést kapjon, ne egy kör után.
 *
 * `null` = rendben; egyébként a megjelenítendő magyar hibaüzenet.
 */
/**
 * Egy `Date` visszaalakítása `<input type="date">`-kompatibilis "ÉÉÉÉ-HH-NN"
 * stringgé, a HELYI (nem UTC) naptári napot használva - a `parseLocalDate`
 * (`date-range-filter.component.ts`) pontos fordítottja. `undefined`-re üres
 * stringet ad (üres input mező).
 *
 * UI-TT-178: ez teszi lehetővé, hogy egy szülő oldal (`csoport-reszletek`/
 * `intezmeny-reszletek`) a saját perzisztált `range()`-jéből vissza tudja
 * tölteni az "Egyéni időszak" Kezdete/Vége mezőket a `DateRangeFilterComponent`
 * `initialCustomFrom`/`initialCustomTo` inputjaiba, amikor a fül-váltás miatt a
 * gyermek-komponens újra-mountol.
 */
export function toDateInputValue(date: Date | undefined): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * UI-TT-180: a `range().to` (amit egy szülő oldal `customToValue`-ként tölt
 * vissza a "Vége" mezőbe fülváltás utáni újra-mountoláskor) a `DateRangeFilterComponent.
 * applyCustom()` óta MÁR a kiválasztott záró nap UTÁNI nap helyi éjfélét
 * (a kizáró felső határt) tárolja, ld. `toDateInputValue` doksi-kommentjét
 * fent és `BE-STUDENTACTIVITY-CUSTOMRANGE-TO-TIMEZONE-OVERINCLUSION`-t.
 * A puszta `toDateInputValue(range().to)` ezt a MÁR eltolt dátumot mutatta
 * vissza a mezőben - minden fülváltás EGY NAPPAL KÉSŐBBRE csúsztatta a
 * látható "Vége" értéket. Ez a variáns levonja az 1 napot megjelenítés
 * előtt, hogy a mező a tanár ÁLTAL TÉNYLEGESEN kiválasztott záró napot
 * mutassa, a belső kizáró-határ ábrázolás helyett. Kizárólag a "custom"
 * kulcshoz tartozó `to`-ra alkalmazandó - ez az egyetlen forrás, ami
 * valaha kitölti a `to` mezőt (`resolveRange` egyik másik ága sem ad `to`-t).
 */
export function toDateInputValueExclusiveEnd(date: Date | undefined): string {
  if (!date) return '';
  const inclusive = new Date(date);
  inclusive.setDate(inclusive.getDate() - 1);
  return toDateInputValue(inclusive);
}

export function validateRange(range: ReportDateRange): string | null {
  const { from, to } = range;
  if (!from || !to) {
    // Fél-nyitott tartomány megengedett — a szűrő nélküli "Teljes időszak" is az.
    return null;
  }
  if (from > to) {
    return 'A kezdő dátum nem lehet későbbi a záró dátumnál.';
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_YEARS * 366 * 24 * 60 * 60 * 1000) {
    return `A lekérdezett időszak nem lehet hosszabb ${MAX_RANGE_YEARS} évnél.`;
  }
  return null;
}
