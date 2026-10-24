import { OfficeUndoOp } from '../../../models/office-task.model';

/** A formátumok közös segédei (a szerver OfficeUndo / WordUndo / WebUndo / PptxUndo azonos szabályai). */

export const blank = (s: string | null | undefined) => !s || !s.trim();

export const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

export const cut = (s: string, max: number) => {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join('') + '…';
};

/** A felületen minden Word-sorszám 1-től számít (a szerződésben 0-alapú). */
export const ordinal = (index: number | null | undefined): string => (index != null ? String(index + 1) : '?');

export const WORD_ONLY_KEYS = ['from', 'to', 'section', 'field', 'find', 'original'] as const;
export const WEB_ONLY_KEYS = ['file', 'selector', 'property', 'media', 'element', 'attribute'] as const;

export const MAX_REPLACE = 500;
/** .NET char.IsControl (Cc), a \n kivételével. */
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/;

/** A minden formátumban ismert (Excel-eredetű) paraméterek közül a megadottak, a szerver sorrendjében. */
export function presentBaseFields(op: OfficeUndoOp): string[] {
  const present: string[] = [];
  if (!blank(op.sheet)) present.push('sheet');
  if (!blank(op.range)) present.push('range');
  if (!blank(op.columns)) present.push('columns');
  if (!blank(op.name)) present.push('name');
  if (op.index != null) present.push('index');
  if (op.parts?.length) present.push('parts');
  return present;
}

/** A Word-paraméterek közül a megadottak (a Word és a weblap ellenőrzése így számolja). */
export function presentWordFields(op: OfficeUndoOp): string[] {
  const present: string[] = [];
  if (op.from != null) present.push('from');
  if (op.to != null) present.push('to');
  if (op.section != null) present.push('section');
  if (!blank(op.field)) present.push('field');
  if (op.find != null) present.push('find');
  if (op.original != null) present.push('original');
  return present;
}

/** Az első, a műveletnél meg nem engedett paraméter hibája, vagy null. */
export function disallowedFieldError(present: string[], allowed: readonly string[]): string | null {
  const extra = present.find((f) => !allowed.includes(f));
  return extra ? `ennél a műveletnél a(z) „${extra}” nem adható meg` : null;
}

/** A szöveg-visszaállítás (replaceText) közös korlátai; weblapnál a szöveg címkét sem tartalmazhat. */
export function replacementError(find: string, original: string, textOnly = false): string | null {
  const f = find.replace(/\r\n/g, '\n');
  const o = original.replace(/\r\n/g, '\n');
  if (f.length > MAX_REPLACE || o.length > MAX_REPLACE) return `a szövegrész és az eredeti szöveg legfeljebb ${MAX_REPLACE} karakter`;
  if (textOnly && (/[<>]/.test(f) || /[<>]/.test(o))) return 'a szövegrész és az eredeti szöveg csak szöveg lehet (címke nélkül)';
  if (CONTROL_EXCEPT_NEWLINE.test(o)) return 'az eredeti szöveg nem tartalmazhat vezérlőkaraktert (pl. tabulátort) - csak sortörést';
  if (f === o) return 'a szövegrész és az eredeti szöveg azonos - nincs mit visszacsinálni';
  return null;
}
