import { OfficeParagraphAnchor, OfficeUndoOp, WordUndoOpName } from '../../../models/office-task.model';
import { cut, disallowedFieldError, isInt, ordinal, presentBaseFields, presentWordFields, replacementError } from './common';

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
const MAX_PARAGRAPHS = 5000;
const MAX_ANCHOR = 200;

/** A szerver horgony-alakja (WordUndo.AnchorText): minden szóközszerű karakter egy szóközzé vonva, a szélek nélkül. */
export function anchorText(text: string | null | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * A horgonyszöveg egységes alakja (WordUndo.AnchorPrefix): a köré tett „…” idézőjelpár és a záró rövidítésjel („…” vagy „...”) lekerül,
 * a szóközök összevonva.
 */
export function anchorPrefix(text: string | null | undefined): string {
  let s = anchorText(text);
  if (s.length >= 2 && s.startsWith('„') && s.endsWith('”')) s = s.slice(1, -1);
  if (s.endsWith('…')) s = s.slice(0, -1);
  else if (s.endsWith('...')) s = s.slice(0, -3);
  return anchorText(s);
}

export function canonicalWordOp(op: string | null | undefined): WordUndoOpName | null {
  const t = (op ?? '').trim().toLowerCase();
  return WORD_UNDO_OP_NAMES.find((n) => n.toLowerCase() === t) ?? null;
}

export function wordOpSpec(op: string): WordOpSpec | null {
  const name = canonicalWordOp(op);
  return name ? WORD_UNDO_OPS[name] : null;
}


function anchorError(a: OfficeParagraphAnchor, what: 'from' | 'to'): string | null {
  if (a.index == null) return `a(z) „${what}” horgonyból hiányzik a bekezdés sorszáma`;
  if (!isInt(a.index) || a.index < 0 || a.index >= MAX_PARAGRAPHS) return `a(z) „${what}” bekezdés sorszáma 1 és ${MAX_PARAGRAPHS} közötti egész szám`;
  if (anchorPrefix(a.startsWith).length > MAX_ANCHOR) return `a(z) „${what}” horgony szövege legfeljebb ${MAX_ANCHOR} karakter`;
  return null;
}

/** A bekezdés-tartomány („from”/„to” horgony) hibája. */
function paragraphRangeError(name: WordUndoOpName, op: OfficeUndoOp): string | null {
  const { from, to } = op;
  if (from == null && name !== 'removeHyperlinks') return 'hiányzó első bekezdés („from” horgony)';
  if (to != null && from == null) return 'az utolsó bekezdés („to”) csak az elsővel („from”) együtt adható meg';
  const err = (from ? anchorError(from, 'from') : null) ?? (to ? anchorError(to, 'to') : null);
  if (err) return err;
  if (from?.index != null && to?.index != null && to.index < from.index) return 'az utolsó bekezdés („to”) nem lehet az első („from”) előtt';
  return null;
}

function wordPartsError(name: WordUndoOpName, parts: string[] | null): string | null {
  if (!parts?.length) return null;
  const known = (WORD_PARTS[name] ?? []).map((p) => p.key.toLowerCase());
  const unknown = parts.filter((p) => !known.includes((p ?? '').trim().toLowerCase()));
  return unknown.length ? `ismeretlen rész: ${unknown.join(', ')}` : null;
}

function wordIndexError(spec: WordOpSpec, index: number | null | undefined): string | null {
  if (index == null) return `hiányzó ${spec.indexOf}-sorszám`;
  if (!isInt(index) || index < 0 || index > MAX_WORD_INDEX) return `a sorszám 1 és ${MAX_WORD_INDEX + 1} közötti egész szám`;
  return null;
}

function sectionError(section: number | null | undefined): string | null {
  return section != null && (!isInt(section) || section < 0 || section > MAX_SECTION) ? `a szakasz sorszáma 1 és ${MAX_SECTION + 1} közötti egész szám` : null;
}

/** A műveletenkénti egyedi szabályok (a közös paraméter-ellenőrzések után). */
const WORD_OP_CHECKS: Partial<Record<WordUndoOpName, (op: OfficeUndoOp) => string | null>> = {
  setParagraphStyle: (op) => {
    const style = op.name?.trim().toLowerCase();
    return style && style !== 'normal' && style !== 'normál' ? 'a stílus csak „Normal” lehet' : null;
  },
  removeField: (op) => {
    const field = op.field?.trim() ?? '';
    if (!field) return 'hiányzó mezőfajta (pl. PAGE)';
    return WORD_FIELDS.some((f) => f.key === field.toUpperCase()) ? null : `ismeretlen mezőfajta: „${field}”`;
  },
  replaceText: (op) => {
    if (op.to != null && op.to.index !== op.from?.index) return 'a szöveg-visszaállítás egyetlen bekezdésen fut („to” nélkül)';
    if (!op.find) return 'hiányzó szövegrész (ami a megoldásban áll)';
    if (op.original == null) return 'hiányzó eredeti szöveg (üres = törlés)';
    return replacementError(op.find, op.original);
  },
};

/** A Word-művelet hibája magyarul (a szerver WordUndo.Validate-jével egyezően), vagy null. */
export function validateWordUndoOp(op: OfficeUndoOp): string | null {
  const name = canonicalWordOp(op.op);
  if (!name) return 'ismeretlen művelet (Word-dokumentumnál csak Word-művelet használható)';
  const spec = WORD_UNDO_OPS[name];
  return (
    disallowedFieldError([...presentBaseFields(op), ...presentWordFields(op)], spec.fields) ??
    (spec.fields.includes('from') ? paragraphRangeError(name, op) : null) ??
    wordPartsError(name, op.parts) ??
    (spec.fields.includes('index') ? wordIndexError(spec, op.index) : null) ??
    sectionError(op.section) ??
    WORD_OP_CHECKS[name]?.(op) ??
    null
  );
}

/** „[4] „Az indulás…”” - a horgony sorszáma (1-től) és szövegének eleje. */
export function describeAnchor(a: OfficeParagraphAnchor | null | undefined): string {
  if (!a) return '[?]';
  const text = anchorPrefix(a.startsWith);
  return `[${ordinal(a.index)}] ${text ? `„${cut(text, 30)}”` : '(üres bekezdés)'}`;
}

function describeParagraphs(op: OfficeUndoOp): string {
  const { from, to } = op;
  if (!from) return 'a(z) ? bekezdés';
  if (!to || to.index === from.index) return describeAnchor(from);
  const text = (a: OfficeParagraphAnchor) => (anchorPrefix(a.startsWith) ? `„${cut(anchorPrefix(a.startsWith), 30)}”` : '(üres)');
  return `[${ordinal(from.index)}]–[${ordinal(to.index)}] ${text(from)} – ${text(to)}`;
}

function describeParts(name: WordUndoOpName, parts: string[] | null, all: string): string {
  const labels = (WORD_PARTS[name] ?? []).filter((p) => parts?.some((x) => x.toLowerCase() === p.key.toLowerCase())).map((p) => p.label);
  return labels.length ? labels.join(', ') : all;
}

const sectionText = (section: number | null | undefined) => (section != null ? `${section + 1}. szakasz` : 'minden szakasz');

/** A Word-művelet magyar leírása (sorszámok 1-től), pl. „[4]–[6] „Az indulás…” – „Kérjük…”: karakterformázás törlése (félkövér, dőlt)”. */
export function describeWordUndoOp(op: OfficeUndoOp): string {
  const name = canonicalWordOp(op.op);
  const idx = `${ordinal(op.index)}.`;
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
      return `${op.from ? describeParagraphs(op) : 'az egész dokumentum (élőfej, élőláb, láb- és végjegyzetek is)'}: hivatkozások törlése`;
    case 'replaceText': {
      const find = `„${cut(op.find ?? '', 40)}”`;
      return op.original
        ? `${describeAnchor(op.from)}: ${find} → „${cut(op.original, 40)}” (szöveg visszaállítása)`
        : `${describeAnchor(op.from)}: ${find} törlése (szöveg visszaállítása)`;
    }
    case 'removeTable':
      return `a(z) ${idx} táblázat törlése`;
    case 'convertTableToText':
      return `a(z) ${idx} táblázat szöveggé alakítása`;
    case 'removeImage':
      return `a(z) ${idx} rajz törlése (kép/alakzat/szövegdoboz/diagram)`;
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
  /** 0-alapú sorszám (a szerver üzenete 1-től számoz, mint a felület - itt már átszámolva). */
  index: number;
  /** A bekezdés valódi (normalizált) szövegének eleje a szerver üzenetéből (≤ 60 karakter, rövidítésjel nélkül; üres bekezdésnél ''). */
  actual: string;
}

/**
 * A szerver horgony-eltérés üzenete: „a(z) „from” horgony nem egyezik: a(z) 3. bekezdés szövegének eleje „…”, nem „…”” vagy
 * „… a(z) 9. bekezdés üres (a horgony szövege legyen üres), nem „…””.
 */
export function parseAnchorMismatch(message: string | null | undefined): AnchorMismatch | null {
  const m = /a\(z\) „(from|to)” horgony nem egyezik: a\(z\) (\d+)\. bekezdés (?:szövegének eleje „([\s\S]*?)”, nem „|üres \(a horgony szövege legyen üres\))/.exec(
    message ?? '',
  );
  if (!m) return null;
  return { which: m[1] as 'from' | 'to', index: +m[2] - 1, actual: anchorText(m[3] ?? '') };
}
