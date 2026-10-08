/** A gépi szabály indokának eleje (BE: RubricRules.MachinePrefix, RunCheckScoring.MachineFeedback). */
export const MACHINE_REASON_PREFIX = 'Gépi ellenőrzés: ';

export interface GradeReasonView {
  /** A fő, közérthető szöveg. */
  text: string;
  /** Gépi tételnél a szabály részlete (kicsi, szürke) - a nyers útvonal nélkül; null, ha nincs. */
  detail: string | null;
}

/**
 * Egy szempont indoka közérthetően. Az MI indoka változatlan; a gépi ellenőrzésé „Gépi ellenőrzés: teljesült / részben /
 * nem teljesült” lesz, a szabály részlete külön (kicsi, szürke). A címke nélküli szabály a nyers útvonalat írja az indokba
 * („Paragraphs[?Text~^Fontos:].Runs[*].Bold: nincs adat”) - azt a diák/tanár elől elhagyjuk.
 */
export function gradeReason(reason: string | null | undefined, state: 'full' | 'partial' | 'none'): GradeReasonView | null {
  const trimmed = reason?.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith(MACHINE_REASON_PREFIX)) return { text: trimmed, detail: null };

  const verdict = state === 'full' ? 'teljesült' : state === 'partial' ? 'részben teljesült' : 'nem teljesült';
  const raw = trimmed.slice(MACHINE_REASON_PREFIX.length).trim();
  const separator = raw.indexOf(': ');
  const detail = separator > 0 && isRulePath(raw.slice(0, separator)) ? raw.slice(separator + 2).trim() : raw;
  return { text: MACHINE_REASON_PREFIX + verdict, detail: detail || null };
}

/** Szabály-útvonal-e (pl. „Sections[0].MarginLeftCm”, „Sheets[*].Cells[?Ref=L3].Formula”) - a címke („a cím mérete”) nem az. */
function isRulePath(label: string): boolean {
  return /[.[]/.test(label) && !/\s/.test(label) && /^[A-Za-z]\w*(\[.*\])?(\.[A-Za-z]\w*(\[.*\])?)*$/.test(label);
}
