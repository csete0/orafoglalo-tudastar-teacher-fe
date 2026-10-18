import { ExcelStylePart, ExcelUndoOpName, OfficeUndoOp } from '../../models/office-task.model';

/**
 * Az Excel „visszacsinálási” szókészlet a kliensen: magyar leírás, paraméter-szerkezet és ugyanaz az ellenőrzés, mint a szerveren
 * (ExcelUndo.Validate) - hogy a tanár az Újraellenőrzés előtt lássa a hibát, ne egy 400-as választ kapjon.
 */

type Field = 'range' | 'name' | 'index' | 'columns' | 'parts';

interface OpSpec {
  label: string;
  /** A műveletnél megengedett mezők (a „sheet” mindig megadható). */
  fields: Field[];
  rangeOptional?: boolean;
}

export const EXCEL_UNDO_OPS: Record<ExcelUndoOpName, OpSpec> = {
  clearFormulas: { label: 'Képletek törlése', fields: ['range'] },
  clearValues: { label: 'Beírt értékek törlése', fields: ['range'] },
  resetStyle: { label: 'Formázás alapra', fields: ['range', 'parts'] },
  removeChart: { label: 'Diagram törlése', fields: ['name', 'index'] },
  removeConditionalFormatting: { label: 'Feltételes formázás törlése', fields: ['range'], rangeOptional: true },
  removeAutoFilter: { label: 'Autoszűrő eltávolítása', fields: [] },
  removeDefinedName: { label: 'Név törlése', fields: ['name'] },
  resetColumnWidth: { label: 'Oszlopszélesség alapra', fields: ['columns'] },
  unmergeCells: { label: 'Cellaegyesítés megszüntetése', fields: ['range'] },
  removeDataValidation: { label: 'Adatérvényesítés törlése', fields: ['range'] },
};

export const EXCEL_UNDO_OP_NAMES = Object.keys(EXCEL_UNDO_OPS) as ExcelUndoOpName[];

export const STYLE_PARTS: { key: ExcelStylePart; label: string }[] = [
  { key: 'numberFormat', label: 'számformátum' },
  { key: 'font', label: 'betű' },
  { key: 'fill', label: 'kitöltés' },
  { key: 'border', label: 'szegély' },
  { key: 'alignment', label: 'igazítás' },
];

const MAX_SHEET = 31;
const MAX_NAME = 255;
const MAX_INDEX = 99;
const MAX_ROW = 1_048_576;
const MAX_COL = 16_384;

/** A szerverrel azonos kis/nagybetű-független műveletnév, vagy null. */
export function canonicalOp(op: string | null | undefined): ExcelUndoOpName | null {
  const t = (op ?? '').trim().toLowerCase();
  return EXCEL_UNDO_OP_NAMES.find((n) => n.toLowerCase() === t) ?? null;
}

export function opSpec(op: string): OpSpec | null {
  const name = canonicalOp(op);
  return name ? EXCEL_UNDO_OPS[name] : null;
}

const blank = (s: string | null | undefined) => !s || !s.trim();
const clean = (s: string | null | undefined) => (s ?? '').trim().toUpperCase().replace(/\$/g, '');

function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** „A1” vagy „A1:C10” ($ megengedett), a lapon belül. */
export function isCellRange(text: string | null | undefined): boolean {
  const parts = clean(text).split(':');
  if (parts.length > 2 || parts[0] === '') return false;
  return parts.every((p) => {
    const m = /^([A-Z]{1,3})(\d{1,7})$/.exec(p);
    return !!m && columnNumber(m[1]) <= MAX_COL && +m[2] >= 1 && +m[2] <= MAX_ROW;
  });
}

/** „B” vagy „B:D”. */
export function isColumnRange(text: string | null | undefined): boolean {
  const parts = clean(text).split(':');
  return parts.length <= 2 && parts.every((p) => /^[A-Z]{1,3}$/.test(p) && columnNumber(p) <= MAX_COL);
}

/** A művelet hibája magyarul (a szerver ExcelUndo.Validate-jével egyezően), vagy null. A kikapcsolt műveletet is ellenőrzi a szerver. */
export function validateUndoOp(op: OfficeUndoOp): string | null {
  const name = canonicalOp(op.op);
  if (!name) return 'ismeretlen művelet';
  if ((op.sheet?.trim().length ?? 0) > MAX_SHEET) return `a munkalap neve legfeljebb ${MAX_SHEET} karakter`;
  if ((op.name?.trim().length ?? 0) > MAX_NAME) return `a név legfeljebb ${MAX_NAME} karakter`;
  if (op.index != null && (!Number.isInteger(op.index) || op.index < 0 || op.index > MAX_INDEX)) return `a sorszám 0 és ${MAX_INDEX} közötti egész szám`;
  const spec = EXCEL_UNDO_OPS[name];
  const allowed = new Set<Field>(spec.fields);
  const present: Field[] = [];
  if (!blank(op.range)) present.push('range');
  if (!blank(op.name)) present.push('name');
  if (op.index != null) present.push('index');
  if (!blank(op.columns)) present.push('columns');
  if (op.parts != null) present.push('parts');
  if (present.some((f) => !allowed.has(f))) return 'ennél a műveletnél nem adható meg ilyen paraméter';
  if (allowed.has('range')) {
    if (blank(op.range) && !spec.rangeOptional) return 'hiányzó tartomány (pl. „B2:D10”)';
    if (!blank(op.range) && !isCellRange(op.range)) return 'hibás tartomány (pl. „B2:D10”)';
  }
  if (name === 'removeChart' && !blank(op.name) && op.index != null) return 'a diagramot névvel VAGY sorszámmal jelöld ki';
  if (name === 'removeDefinedName' && blank(op.name)) return 'hiányzó név';
  if (name === 'resetColumnWidth' && !isColumnRange(op.columns)) return 'hiányzó vagy hibás oszloptartomány (pl. „B:D”)';
  return null;
}

/** Ember által olvasható leírás, pl. „Adatok!B5: képletek törlése (a formázás marad)”. */
export function describeUndoOp(op: OfficeUndoOp): string {
  const name = canonicalOp(op.op);
  const sheet = op.sheet?.trim() || null;
  const where = (range: string | null) => {
    const r = range?.trim() ? clean(range) : null;
    if (sheet && r) return `${sheet}!${r}`;
    return r ?? (sheet ? `a(z) „${sheet}” lap` : 'a munkalap');
  };
  switch (name) {
    case 'clearFormulas':
      return `${where(op.range)}: képletek törlése (a formázás marad)`;
    case 'clearValues':
      return `${where(op.range)}: beírt értékek törlése (a formázás marad)`;
    case 'resetStyle': {
      const parts = op.parts?.length ? STYLE_PARTS.filter((p) => op.parts!.includes(p.key)).map((p) => p.label).join(', ') : 'minden formázás';
      return `${where(op.range)}: formázás alapra (${parts})`;
    }
    case 'removeChart':
      if (op.name?.trim()) return `${where(null)}: a(z) „${op.name.trim()}” diagram törlése`;
      if (op.index != null) return `${where(null)}: a(z) ${op.index + 1}. diagram törlése`;
      return `${where(null)}: a diagram törlése`;
    case 'removeConditionalFormatting':
      return op.range?.trim() ? `${where(op.range)}: feltételes formázás törlése` : `${where(null)}: az összes feltételes formázás törlése`;
    case 'removeAutoFilter':
      return `${where(null)}: autoszűrő eltávolítása`;
    case 'removeDefinedName':
      return `a(z) „${op.name?.trim() ?? ''}” név törlése${sheet ? ` (${sheet} lap)` : ''}`;
    case 'resetColumnWidth':
      return `${where(null)}: ${clean(op.columns)} oszlopszélesség alapra`;
    case 'unmergeCells':
      return `${where(op.range)}: cellaegyesítés megszüntetése`;
    case 'removeDataValidation':
      return `${where(op.range)}: adatérvényesítés törlése`;
    default:
      return `ismeretlen művelet: ${op.op}`;
  }
}

/** Új művelet alapértékekkel. */
export function newUndoOp(op: ExcelUndoOpName, sheet: string | null): OfficeUndoOp {
  return { op, sheet, range: null, name: null, index: null, columns: null, parts: null, enabled: true, result: null, message: null };
}

/** Műveletváltáskor a nem megengedett paraméterek törlődnek (különben a szerver elutasítja). */
export function changeUndoOpKind(op: OfficeUndoOp, next: ExcelUndoOpName): OfficeUndoOp {
  const allowed = new Set<Field>(EXCEL_UNDO_OPS[next].fields);
  return {
    ...op,
    op: next,
    range: allowed.has('range') ? op.range : null,
    name: allowed.has('name') ? op.name : null,
    index: allowed.has('index') ? op.index : null,
    columns: allowed.has('columns') ? op.columns : null,
    parts: allowed.has('parts') ? op.parts : null,
  };
}
