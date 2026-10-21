/** A csoportoldal fülei - a `?tab=` query-paraméter értékei. */
export type CsoportTab = 'attekintes' | 'diakok' | 'kiadasok' | 'eredmenyek' | 'technikum' | 'beallitasok';

export const CSOPORT_TABS: readonly { value: CsoportTab; label: string }[] = [
  { value: 'attekintes', label: 'Áttekintés' },
  { value: 'diakok', label: 'Diákok' },
  { value: 'kiadasok', label: 'Kiadások' },
  { value: 'eredmenyek', label: 'Eredmények' },
  { value: 'technikum', label: 'Technikum' },
  { value: 'beallitasok', label: 'Beállítások' },
];

export interface CsoportTabTarget {
  tab: CsoportTab;
  /** Szakasz-horgony a fülön belül (az elem `id`-ja). */
  section?: string;
}

/**
 * A 9 fülös oldal régi `?tab=` értékei - könyvjelzők és a BE-ben tárolt értesítés-linkek
 * (pl. csapatjavaslat: `?tab=csapatok`) BE-változás nélkül is a helyükre visznek.
 */
export const LEGACY_TAB: Readonly<Record<string, CsoportTabTarget>> = {
  tagok: { tab: 'diakok' },
  kiadva: { tab: 'kiadasok' },
  helyek: { tab: 'beallitasok', section: 'helyek' },
  meghivo: { tab: 'beallitasok', section: 'meghivo' },
  ranglista: { tab: 'eredmenyek', section: 'ranglista' },
  'gyenge-temak': { tab: 'eredmenyek', section: 'gyenge-temak' },
  'vizsgaresz-terkep': { tab: 'technikum' },
  csapatok: { tab: 'technikum', section: 'csapatok' },
};

/** `?tab=` érték → fül; hiányzó vagy ismeretlen érték → Áttekintés. */
export function resolveCsoportTab(raw: string | null | undefined): CsoportTabTarget {
  if (raw && CSOPORT_TABS.some((t) => t.value === raw)) return { tab: raw as CsoportTab };
  return raw && Object.hasOwn(LEGACY_TAB, raw) ? LEGACY_TAB[raw] : { tab: 'attekintes' };
}
