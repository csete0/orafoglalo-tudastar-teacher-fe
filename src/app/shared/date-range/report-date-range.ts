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
