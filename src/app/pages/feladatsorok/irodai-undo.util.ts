import { ExcelStylePart, ExcelUndoOpName, OfficeFileKind, OfficeParagraphAnchor, OfficeUndoOp, WordUndoOpName } from '../../models/office-task.model';

/**
 * Az Excel és a Word „visszacsinálási” szókészlete a kliensen: magyar leírás, paraméter-szerkezet és ugyanaz az ellenőrzés, mint a
 * szerveren (OfficeUndo.Validate → ExcelUndo / WordUndo) - hogy a tanár az Újraellenőrzés előtt lássa a hibát, ne egy 400-as választ kapjon.
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

const WORD_ONLY_KEYS = ['from', 'to', 'section', 'field', 'find', 'original'] as const;

/**
 * A művelet hibája magyarul (a szerver OfficeUndo.Validate-jével egyezően, a fájl fajtája szerint), vagy null. A kikapcsolt műveletet
 * is ellenőrzi a szerver.
 */
export function validateUndoOp(op: OfficeUndoOp, kind: OfficeFileKind = 'excel'): string | null {
  if (kind === 'word') return validateWordUndoOp(op);
  if (WORD_ONLY_KEYS.some((k) => op[k] != null)) return 'a „from”, „to”, „section”, „field”, „find” és „original” csak Word-dokumentumnál adható meg';
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
export function describeUndoOp(op: OfficeUndoOp, kind: OfficeFileKind = 'excel'): string {
  if (kind === 'word') return describeWordUndoOp(op);
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

// ═════════════════════════════════════════════ Word (WordUndo) ═════════════════════════════════════════════

type WordField = 'from' | 'to' | 'parts' | 'index' | 'section' | 'field' | 'find' | 'original' | 'name';

interface WordOpSpec {
  label: string;
  /** A szerver Allowed-listája: a többi paraméter megadása hiba. */
  fields: WordField[];
  /** Az „index” mit számoz (a szerkesztő felirata). */
  indexOf?: 'táblázat' | 'rajz' | 'szakasz';
}

export const WORD_UNDO_OPS: Record<WordUndoOpName, WordOpSpec> = {
  clearRunFormatting: { label: 'Karakterformázás törlése', fields: ['from', 'to', 'parts'] },
  resetParagraphFormatting: { label: 'Bekezdésformázás alapra', fields: ['from', 'to', 'parts'] },
  setParagraphStyle: { label: 'Stílus „Normál”-ra', fields: ['from', 'to', 'name'] },
  removeNumbering: { label: 'Felsorolás/számozás törlése', fields: ['from', 'to'] },
  removeParagraphBorderShading: { label: 'Bekezdésszegély és -mintázat törlése', fields: ['from', 'to'] },
  removeHyperlinks: { label: 'Hivatkozások törlése', fields: ['from', 'to'] },
  replaceText: { label: 'Szöveg visszaállítása', fields: ['from', 'to', 'find', 'original'] },
  removeTable: { label: 'Táblázat törlése', fields: ['index'], indexOf: 'táblázat' },
  convertTableToText: { label: 'Táblázat szöveggé alakítása', fields: ['index'], indexOf: 'táblázat' },
  removeImage: { label: 'Rajz törlése (kép/alakzat/szövegdoboz/diagram)', fields: ['index'], indexOf: 'rajz' },
  removeHeader: { label: 'Élőfej törlése', fields: ['section'] },
  removeFooter: { label: 'Élőláb törlése', fields: ['section'] },
  removeToc: { label: 'Tartalomjegyzék törlése', fields: [] },
  removeField: { label: 'Mező törlése', fields: ['field'] },
  removeFootnotes: { label: 'Láb-/végjegyzetek törlése', fields: ['parts'] },
  resetPageSetup: { label: 'Oldalbeállítás alapra (A4, álló, 2,5 cm, 1 hasáb)', fields: ['section', 'parts'] },
  removeColumns: { label: 'Hasábok megszüntetése', fields: ['section'] },
  removeSectionBreak: { label: 'Szakasztörés törlése', fields: ['index'], indexOf: 'szakasz' },
};

export const WORD_UNDO_OP_NAMES = Object.keys(WORD_UNDO_OPS) as WordUndoOpName[];

/** A „parts”-ot elfogadó Word-műveletek részei, a szerver (WordUndo.PartsOf) sorrendjében. */
export const WORD_PARTS: Partial<Record<WordUndoOpName, { key: string; label: string }[]>> = {
  clearRunFormatting: [
    { key: 'bold', label: 'félkövér' },
    { key: 'italic', label: 'dőlt' },
    { key: 'underline', label: 'aláhúzás' },
    { key: 'strike', label: 'áthúzás' },
    { key: 'caps', label: 'nagybetűs / kiskapitális' },
    { key: 'font', label: 'betűtípus' },
    { key: 'size', label: 'betűméret' },
    { key: 'color', label: 'betűszín' },
    { key: 'highlight', label: 'kiemelés / háttér' },
    { key: 'verticalAlign', label: 'felső/alsó index' },
    { key: 'characterSpacing', label: 'karaktertávolság' },
    { key: 'characterStyle', label: 'karakterstílus' },
  ],
  resetParagraphFormatting: [
    { key: 'alignment', label: 'igazítás' },
    { key: 'indent', label: 'behúzás' },
    { key: 'spacing', label: 'térköz/sorköz' },
    { key: 'tabs', label: 'tabulátorok' },
    { key: 'pagination', label: 'tördelés + kézi oldal-/hasábtörés' },
  ],
  resetPageSetup: [
    { key: 'margins', label: 'margók' },
    { key: 'orientation', label: 'tájolás' },
    { key: 'size', label: 'papírméret' },
    { key: 'columns', label: 'hasábok' },
  ],
  removeFootnotes: [
    { key: 'footnotes', label: 'lábjegyzetek' },
    { key: 'endnotes', label: 'végjegyzetek' },
  ],
};

/** A removeField-del törölhető mezők (WordUndo.Fields) magyar magyarázattal. */
export const WORD_FIELDS: { key: string; label: string }[] = [
  { key: 'PAGE', label: 'oldalszám' },
  { key: 'NUMPAGES', label: 'oldalak száma' },
  { key: 'SECTIONPAGES', label: 'a szakasz oldalainak száma' },
  { key: 'DATE', label: 'dátum' },
  { key: 'TIME', label: 'idő' },
  { key: 'CREATEDATE', label: 'létrehozás dátuma' },
  { key: 'SAVEDATE', label: 'mentés dátuma' },
  { key: 'PRINTDATE', label: 'nyomtatás dátuma' },
  { key: 'FILENAME', label: 'fájlnév' },
  { key: 'AUTHOR', label: 'szerző' },
  { key: 'TITLE', label: 'cím' },
  { key: 'SUBJECT', label: 'tárgy' },
  { key: 'SEQ', label: 'sorszám (pl. képaláírás)' },
  { key: 'REF', label: 'kereszthivatkozás' },
  { key: 'PAGEREF', label: 'oldalszám-hivatkozás' },
  { key: 'NOTEREF', label: 'jegyzet-hivatkozás' },
  { key: 'STYLEREF', label: 'stílus-hivatkozás' },
];

const MAX_WORD_INDEX = 999;
const MAX_SECTION = 99;
/** WordFactExtractor.MaxParagraphs */
export const MAX_PARAGRAPHS = 5000;
const MAX_ANCHOR = 200;
export const MAX_REPLACE = 500;
/** A választóval kitöltött horgony ennyi karakterrel kezdődik (a szerver bármilyen hosszú elejét elfogadja ≤ 200-ig). */
const ANCHOR_PREFIX = 40;

/** A szerver horgony-alakja (WordUndo.AnchorText): minden szóközszerű karakter egy szóközzé vonva, a szélek nélkül. */
export function anchorText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Horgony a bekezdés sorszámából és (megoldásbeli) szövegéből: a normalizált szöveg eleje. */
export function anchorFor(index: number, text: string): OfficeParagraphAnchor {
  return { index, startsWith: Array.from(anchorText(text)).slice(0, ANCHOR_PREFIX).join('').trim() };
}

export function canonicalWordOp(op: string | null | undefined): WordUndoOpName | null {
  const t = (op ?? '').trim().toLowerCase();
  return WORD_UNDO_OP_NAMES.find((n) => n.toLowerCase() === t) ?? null;
}

export function wordOpSpec(op: string): WordOpSpec | null {
  const name = canonicalWordOp(op);
  return name ? WORD_UNDO_OPS[name] : null;
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

function anchorError(a: OfficeParagraphAnchor, what: 'from' | 'to'): string | null {
  if (a.index == null) return `a(z) „${what}” horgonyból hiányzik a bekezdés sorszáma`;
  if (!isInt(a.index) || a.index < 0 || a.index >= MAX_PARAGRAPHS) return `a(z) „${what}” bekezdés sorszáma 0 és ${MAX_PARAGRAPHS - 1} közötti egész szám`;
  if (anchorText(a.startsWith).length > MAX_ANCHOR) return `a(z) „${what}” horgony szövege legfeljebb ${MAX_ANCHOR} karakter`;
  return null;
}

/** A Word-művelet hibája magyarul (a szerver WordUndo.Validate-jével egyezően), vagy null. */
export function validateWordUndoOp(op: OfficeUndoOp): string | null {
  const name = canonicalWordOp(op.op);
  if (!name) return 'ismeretlen művelet (Word-dokumentumnál csak Word-művelet használható)';
  const spec = WORD_UNDO_OPS[name];
  const present: string[] = [];
  if (!blank(op.sheet)) present.push('sheet');
  if (!blank(op.range)) present.push('range');
  if (!blank(op.columns)) present.push('columns');
  if (!blank(op.name)) present.push('name');
  if (op.index != null) present.push('index');
  if (op.parts?.length) present.push('parts');
  if (op.from != null) present.push('from');
  if (op.to != null) present.push('to');
  if (op.section != null) present.push('section');
  if (!blank(op.field)) present.push('field');
  if (op.find != null) present.push('find');
  if (op.original != null) present.push('original');
  const extra = present.find((f) => !(spec.fields as string[]).includes(f));
  if (extra) return `ennél a műveletnél a(z) „${extra}” nem adható meg`;

  if (spec.fields.includes('from')) {
    if (op.from == null && name !== 'removeHyperlinks') return 'hiányzó első bekezdés („from” horgony)';
    if (op.to != null && op.from == null) return 'az utolsó bekezdés („to”) csak az elsővel („from”) együtt adható meg';
    for (const [what, a] of [['from', op.from], ['to', op.to]] as const) {
      const err = a ? anchorError(a, what) : null;
      if (err) return err;
    }
    if (op.to != null && op.from != null && op.to.index! < op.from.index!) return 'az utolsó bekezdés („to”) nem lehet az első („from”) előtt';
  }
  if (op.parts?.length) {
    const known = (WORD_PARTS[name] ?? []).map((p) => p.key.toLowerCase());
    const unknown = op.parts.filter((p) => !known.includes((p ?? '').trim().toLowerCase()));
    if (unknown.length) return `ismeretlen rész: ${unknown.join(', ')}`;
  }
  if (spec.fields.includes('index')) {
    if (op.index == null) return `hiányzó ${spec.indexOf}-sorszám (0-tól)`;
    if (!isInt(op.index) || op.index < 0 || op.index > MAX_WORD_INDEX) return `a sorszám 0 és ${MAX_WORD_INDEX} közötti egész szám`;
  }
  if (op.section != null && (!isInt(op.section) || op.section < 0 || op.section > MAX_SECTION)) return `a szakasz sorszáma 0 és ${MAX_SECTION} közötti egész szám`;
  switch (name) {
    case 'setParagraphStyle': {
      const style = op.name?.trim().toLowerCase();
      if (style && style !== 'normal' && style !== 'normál') return 'a stílus csak „Normal” lehet';
      break;
    }
    case 'removeField': {
      if (blank(op.field)) return 'hiányzó mezőfajta (pl. PAGE)';
      const field = op.field!.trim().toUpperCase();
      if (!WORD_FIELDS.some((f) => f.key === field)) return `ismeretlen mezőfajta: „${op.field!.trim()}”`;
      break;
    }
    case 'replaceText': {
      if (op.to != null && op.to.index !== op.from!.index) return 'a szöveg-visszaállítás egyetlen bekezdésen fut („to” nélkül)';
      if (!op.find) return 'hiányzó szövegrész (ami a megoldásban áll)';
      if (op.original == null) return 'hiányzó eredeti szöveg (üres = törlés)';
      const find = op.find.replace(/\r\n/g, '\n');
      const original = op.original.replace(/\r\n/g, '\n');
      if (find.length > MAX_REPLACE || original.length > MAX_REPLACE) return `a szövegrész és az eredeti szöveg legfeljebb ${MAX_REPLACE} karakter`;
      if (find === original) return 'a szövegrész és az eredeti szöveg azonos - nincs mit visszacsinálni';
      break;
    }
  }
  return null;
}

const cut = (s: string, max: number) => {
  const chars = Array.from(s);
  return chars.length <= max ? s : chars.slice(0, max).join('') + '…';
};

/** „[3] „Az indulás…”” - a horgony sorszáma és szövegének eleje. */
export function describeAnchor(a: OfficeParagraphAnchor | null | undefined): string {
  if (!a) return '[?]';
  const text = anchorText(a.startsWith);
  return `[${a.index ?? '?'}] ${text ? `„${cut(text, 30)}”` : '(üres bekezdés)'}`;
}

function describeParagraphs(op: OfficeUndoOp): string {
  const { from, to } = op;
  if (!from) return 'a(z) ? bekezdés';
  if (!to || to.index === from.index) return describeAnchor(from);
  const text = (a: OfficeParagraphAnchor) => (anchorText(a.startsWith) ? `„${cut(anchorText(a.startsWith), 30)}”` : '(üres)');
  return `[${from.index ?? '?'}]–[${to.index ?? '?'}] ${text(from)} – ${text(to)}`;
}

function describeParts(name: WordUndoOpName, parts: string[] | null, all: string): string {
  const labels = (WORD_PARTS[name] ?? []).filter((p) => parts?.some((x) => x.toLowerCase() === p.key.toLowerCase())).map((p) => p.label);
  return labels.length ? labels.join(', ') : all;
}

const sectionText = (section: number | null | undefined) => (section != null ? `szakasz ${section}` : 'minden szakasz');

/** A Word-művelet magyar leírása, pl. „[3]–[5] „Az indulás…” – „Kérjük…”: karakterformázás törlése (félkövér, dőlt)”. */
export function describeWordUndoOp(op: OfficeUndoOp): string {
  const name = canonicalWordOp(op.op);
  const idx = op.index != null ? `#${op.index}` : '#?';
  switch (name) {
    case 'clearRunFormatting':
      return `${describeParagraphs(op)}: karakterformázás törlése (${describeParts(name, op.parts, 'minden közvetlen karakterformázás')})`;
    case 'resetParagraphFormatting':
      return `${describeParagraphs(op)}: bekezdésformázás alapra (${describeParts(name, op.parts, 'minden közvetlen bekezdésformázás')})`;
    case 'setParagraphStyle':
      return `${describeParagraphs(op)}: stílus „Normál”-ra`;
    case 'removeNumbering':
      return `${describeParagraphs(op)}: felsorolás/számozás törlése`;
    case 'removeParagraphBorderShading':
      return `${describeParagraphs(op)}: bekezdésszegély és -mintázat törlése`;
    case 'removeHyperlinks':
      return `${op.from ? describeParagraphs(op) : 'az egész dokumentum'}: hivatkozások törlése`;
    case 'replaceText': {
      const find = `„${cut(op.find ?? '', 40)}”`;
      return op.original
        ? `${describeAnchor(op.from)}: ${find} → „${cut(op.original, 40)}” (szöveg visszaállítása)`
        : `${describeAnchor(op.from)}: ${find} törlése (szöveg visszaállítása)`;
    }
    case 'removeTable':
      return `táblázat ${idx} törlése`;
    case 'convertTableToText':
      return `táblázat ${idx} szöveggé alakítása`;
    case 'removeImage':
      return `rajz ${idx} törlése (kép/alakzat/szövegdoboz/diagram)`;
    case 'removeHeader':
      return `élőfej törlése (${sectionText(op.section)})`;
    case 'removeFooter':
      return `élőláb törlése (${sectionText(op.section)})`;
    case 'removeToc':
      return 'tartalomjegyzék törlése';
    case 'removeField': {
      const field = (op.field ?? '').trim().toUpperCase();
      const label = WORD_FIELDS.find((f) => f.key === field)?.label;
      return `${field || '?'} mező törlése${label ? ` (${label})` : ''}`;
    }
    case 'removeFootnotes':
      return `${describeParts(name, op.parts, 'láb- és végjegyzetek')} törlése`;
    case 'resetPageSetup':
      return `oldalbeállítás alapra - A4, álló, 2,5 cm, 1 hasáb (${sectionText(op.section)}: ${describeParts(name, op.parts, 'minden rész')})`;
    case 'removeColumns':
      return `hasábok megszüntetése (${sectionText(op.section)})`;
    case 'removeSectionBreak':
      return `szakasztörés törlése a(z) ${idx} szakasz végén`;
    default:
      return `ismeretlen művelet: ${op.op}`;
  }
}

/** Új Word-művelet (minden paraméter üres - a horgonyt a tanár választja ki). */
export function newWordUndoOp(op: WordUndoOpName): OfficeUndoOp {
  return {
    op, sheet: null, range: null, name: null, index: null, columns: null, parts: null,
    from: null, to: null, section: null, field: null, find: null, original: null,
    enabled: true, result: null, message: null,
  };
}

/** Word-műveletváltás: csak az új művelet által megengedett paraméterek maradnak (a részek csak, ha az új műveletnek is részei). */
export function changeWordUndoOpKind(op: OfficeUndoOp, next: WordUndoOpName): OfficeUndoOp {
  const allowed = new Set<WordField>(WORD_UNDO_OPS[next].fields);
  const known = new Set((WORD_PARTS[next] ?? []).map((p) => p.key));
  const parts = allowed.has('parts') && op.parts?.every((p) => known.has(p)) ? op.parts : null;
  return {
    ...op,
    op: next,
    sheet: null, range: null, columns: null, name: null,
    index: allowed.has('index') ? op.index : null,
    parts,
    from: allowed.has('from') ? op.from ?? null : null,
    to: allowed.has('to') && next !== 'replaceText' ? op.to ?? null : null,
    section: allowed.has('section') ? op.section ?? null : null,
    field: allowed.has('field') ? op.field ?? null : null,
    find: allowed.has('find') ? op.find ?? '' : null,
    original: allowed.has('original') ? op.original ?? '' : null,
  };
}

export interface AnchorMismatch {
  which: 'from' | 'to';
  index: number;
  /** A bekezdés valódi (normalizált) szövegének eleje a szerver üzenetéből (≤ 60 karakter). */
  actual: string;
}

/** A szerver horgony-eltérés üzenete („a(z) „from” horgony nem egyezik: a(z) 3. bekezdés szövege „…”, nem „…”-val kezdődik”). */
export function parseAnchorMismatch(message: string | null | undefined): AnchorMismatch | null {
  const m = /a\(z\) „(from|to)” horgony nem egyezik: a\(z\) (\d+)\. bekezdés szövege „([\s\S]*?)”, nem „/.exec(message ?? '');
  if (!m) return null;
  return { which: m[1] as 'from' | 'to', index: +m[2], actual: anchorText(m[3].replace(/…$/, '')) };
}
