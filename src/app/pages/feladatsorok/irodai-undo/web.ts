import { OfficeUndoOp, WebUndoOpName } from '../../../models/office-task.model';
import { blank, cut, disallowedFieldError, isInt, ordinal, presentBaseFields, presentWordFields, replacementError } from './common';

// ═════════════════════════════════════════════ Weblap (WebUndo) ═════════════════════════════════════════════

type WebField = 'file' | 'selector' | 'property' | 'media' | 'element' | 'attribute' | 'find' | 'original';

interface WebOpSpec {
  label: string;
  /** A szerver Allowed-listája. */
  fields: WebField[];
  /** Milyen fájlon fut: html = csak HTML, any = HTML (a <style> blokkok) vagy CSS. */
  on: 'html' | 'any';
}

export const WEB_UNDO_OPS: Record<WebUndoOpName, WebOpSpec> = {
  removeCssRule: { label: 'CSS-szabály törlése', fields: ['file', 'selector', 'media'], on: 'any' },
  removeCssDeclaration: { label: 'CSS-deklaráció törlése', fields: ['file', 'selector', 'property', 'media'], on: 'any' },
  removeElement: { label: 'Elem törlése (a tartalmával)', fields: ['file', 'element'], on: 'html' },
  unwrapElement: { label: 'Elem kibontása (a címke törlődik, a tartalma marad)', fields: ['file', 'element'], on: 'html' },
  removeAttribute: { label: 'Attribútum törlése', fields: ['file', 'element', 'attribute'], on: 'html' },
  renameElement: { label: 'Címke visszaállítása (pl. th → td)', fields: ['file', 'element', 'original'], on: 'html' },
  replaceText: { label: 'Szöveg visszaállítása', fields: ['file', 'element', 'find', 'original'], on: 'html' },
  removeFile: { label: 'Fájl elhagyása (a diák hozza létre)', fields: ['file'], on: 'any' },
};

export const WEB_UNDO_OP_NAMES = Object.keys(WEB_UNDO_OPS) as WebUndoOpName[];

/** WebFactExtractor.MaxElements */
const MAX_ELEMENTS = 3000;
const TAG_NAME = /^[a-z][a-z0-9-]*$/;
const PROPERTY_NAME = /^-?[a-z_][a-z0-9_-]*$/;
const ATTRIBUTE_NAME = /^[a-z_:@][-a-z0-9_:.@]*$/;

export const isHtmlFile = (name: string | null | undefined) => /\.html?$/i.test(name ?? '');
export const isCssFile = (name: string | null | undefined) => /\.css$/i.test(name ?? '');

export function canonicalWebOp(op: string | null | undefined): WebUndoOpName | null {
  const t = (op ?? '').trim().toLowerCase();
  return WEB_UNDO_OP_NAMES.find((n) => n.toLowerCase() === t) ?? null;
}

export function webOpSpec(op: string): WebOpSpec | null {
  const name = canonicalWebOp(op);
  return name ? WEB_UNDO_OPS[name] : null;
}

/** A címke egységes alakja (WebUndo): „<IMG>” → „img”. */
export const tagName = (tag: string | null | undefined) => (tag ?? '').trim().replace(/^<|>$/g, '').trim().toLowerCase();

/** A weblap-paraméterek közül a megadottak, a szerver sorrendjében. */
function presentWebFields(op: OfficeUndoOp): string[] {
  const present: string[] = [];
  if (!blank(op.file)) present.push('file');
  if (!blank(op.selector)) present.push('selector');
  if (!blank(op.property)) present.push('property');
  if (!blank(op.media)) present.push('media');
  if (op.element != null) present.push('element');
  if (!blank(op.attribute)) present.push('attribute');
  return present;
}

function fileError(name: WebUndoOpName, spec: WebOpSpec, file: string): string | null {
  if (!file) return 'hiányzó fájl';
  if (file.length > 160 || /[\\/]/.test(file)) return 'a fájlnév legfeljebb 160 karakteres, mappa nélküli név';
  if (!isHtmlFile(file) && !isCssFile(file)) return `a(z) „${file}” nem HTML- vagy CSS-fájl`;
  if (spec.on === 'html' && !isHtmlFile(file) && name !== 'removeFile') return 'ez a művelet csak HTML-fájlon fut';
  return null;
}

function elementError(op: OfficeUndoOp): string | null {
  const el = op.element;
  if (!el) return 'hiányzó elem (válaszd ki a listából)';
  if (el.index == null) return 'hiányzik az elem sorszáma';
  if (!isInt(el.index) || el.index < 0 || el.index >= MAX_ELEMENTS) return `az elem sorszáma 1 és ${MAX_ELEMENTS} közötti egész szám`;
  if (!TAG_NAME.test(tagName(el.tag))) return 'hiányzik az elem címkéje (pl. img)';
  return null;
}

function selectorError(op: OfficeUndoOp): string | null {
  const sel = op.selector?.trim() ?? '';
  if (!sel) return 'hiányzó szelektor (pl. #fejlec h1)';
  if (sel.length > 300 || /[{};,]/.test(sel)) return 'a szelektor egyetlen (vessző nélküli) CSS-szelektor, legfeljebb 300 karakter';
  const media = op.media?.trim() ?? '';
  if (media.length > 200 || /[{};]/.test(media)) return 'a @media-feltétel legfeljebb 200 karakter, kapcsos zárójel és pontosvessző nélkül';
  return null;
}

/** A műveletenkénti egyedi szabályok (a közös fájl-, elem- és szelektor-ellenőrzés után). */
const WEB_OP_CHECKS: Partial<Record<WebUndoOpName, (op: OfficeUndoOp) => string | null>> = {
  removeCssDeclaration: (op) => {
    const prop = op.property?.trim().toLowerCase() ?? '';
    if (!prop) return 'hiányzó tulajdonság (pl. color)';
    return prop.length > 60 || !PROPERTY_NAME.test(prop) ? `hibás CSS-tulajdonság: „${prop}”` : null;
  },
  removeAttribute: (op) => {
    const attr = op.attribute?.trim().toLowerCase() ?? '';
    if (!attr) return 'hiányzó attribútum (pl. alt)';
    return attr.length > 60 || !ATTRIBUTE_NAME.test(attr) ? `hibás attribútumnév: „${attr}”` : null;
  },
  renameElement: (op) => {
    const original = tagName(op.original);
    if (!original || !TAG_NAME.test(original) || original.length > 20) return 'hiányzó vagy hibás eredeti címke (pl. td)';
    return original === tagName(op.element?.tag) ? 'az eredeti címke azonos a mostanival - nincs mit visszacsinálni' : null;
  },
  replaceText: (op) => {
    if (!op.find) return 'hiányzó szövegrész (ami a megoldásban áll)';
    if (op.original == null) return 'hiányzó eredeti szöveg (üres = törlés)';
    return replacementError(op.find, op.original, true);
  },
};

/** A weblap-művelet hibája magyarul (a szerver WebUndo.Validate-jével egyezően), vagy null. */
export function validateWebUndoOp(op: OfficeUndoOp): string | null {
  const name = canonicalWebOp(op.op);
  if (!name) return 'ismeretlen művelet (weblapnál csak weblap-művelet használható)';
  const spec = WEB_UNDO_OPS[name];
  return (
    disallowedFieldError([...presentBaseFields(op), ...presentWordFields(op), ...presentWebFields(op)], spec.fields) ??
    fileError(name, spec, op.file?.trim() ?? '') ??
    (spec.fields.includes('element') ? elementError(op) : null) ??
    (spec.fields.includes('selector') ? selectorError(op) : null) ??
    WEB_OP_CHECKS[name]?.(op) ??
    null
  );
}

/** „index.html [13] <img>” - az elem 1-től számozva. */
export function describeElement(op: OfficeUndoOp): string {
  const el = op.element;
  return `${op.file?.trim() || '?'} [${ordinal(el?.index)}] <${tagName(el?.tag) || '?'}>`;
}

const mediaText = (op: OfficeUndoOp) => (op.media?.trim() ? ` (@media ${op.media.trim()})` : '');

/** A weblap-művelet magyar leírása (az elem sorszáma 1-től). */
export function describeWebUndoOp(op: OfficeUndoOp): string {
  const name = canonicalWebOp(op.op);
  const sel = `„${cut(op.selector?.trim() ?? '', 60)}”`;
  switch (name) {
    case 'removeCssRule':
      return `${op.file?.trim() || '?'}: a(z) ${sel} CSS-szabály törlése${mediaText(op)}`;
    case 'removeCssDeclaration':
      return `${op.file?.trim() || '?'}: ${sel} { ${op.property?.trim() || '?'} } deklaráció törlése${mediaText(op)}`;
    case 'removeElement':
      return `${describeElement(op)}: elem törlése a tartalmával`;
    case 'unwrapElement':
      return `${describeElement(op)}: kibontás (a címke törlődik, a tartalma marad)`;
    case 'removeAttribute':
      return `${describeElement(op)}: a(z) „${op.attribute?.trim() || '?'}” attribútum törlése`;
    case 'renameElement':
      return `${describeElement(op)} → <${tagName(op.original) || '?'}> (címke visszaállítása)`;
    case 'replaceText': {
      const find = `„${cut(op.find ?? '', 40)}”`;
      return op.original ? `${describeElement(op)}: ${find} → „${cut(op.original, 40)}”` : `${describeElement(op)}: ${find} törlése`;
    }
    case 'removeFile':
      return `${op.file?.trim() || '?'}: a fájl kimarad a kiinduló fájlok közül`;
    default:
      return `ismeretlen művelet: ${op.op}`;
  }
}

/** Új weblap-művelet (a fájl az első illő fájl; a többit a tanár választja ki). */
export function newWebUndoOp(op: WebUndoOpName, file: string | null): OfficeUndoOp {
  const allowed = new Set<WebField>(WEB_UNDO_OPS[op].fields);
  return {
    op, sheet: null, range: null, name: null, index: null, columns: null, parts: null,
    file,
    selector: allowed.has('selector') ? '' : null,
    property: allowed.has('property') ? '' : null,
    media: null,
    element: allowed.has('element') ? { index: null, tag: null } : null,
    attribute: allowed.has('attribute') ? '' : null,
    find: allowed.has('find') ? '' : null,
    original: allowed.has('original') ? '' : null,
    enabled: true, result: null, message: null,
  };
}

/** Weblap-műveletváltás: csak az új művelet által megengedett paraméterek maradnak. */
export function changeWebUndoOpKind(op: OfficeUndoOp, next: WebUndoOpName): OfficeUndoOp {
  const allowed = new Set<WebField>(WEB_UNDO_OPS[next].fields);
  const keepOriginal = allowed.has('original') && canonicalWebOp(op.op) === next;
  return {
    ...op,
    op: next,
    selector: allowed.has('selector') ? op.selector ?? '' : null,
    property: allowed.has('property') ? op.property ?? '' : null,
    media: allowed.has('media') ? op.media ?? null : null,
    element: allowed.has('element') ? op.element ?? { index: null, tag: null } : null,
    attribute: allowed.has('attribute') ? op.attribute ?? '' : null,
    find: allowed.has('find') ? op.find ?? '' : null,
    original: allowed.has('original') ? (keepOriginal ? op.original ?? '' : '') : null,
  };
}

/** A szerver elem-eltérés üzenete: „az elem-horgony nem egyezik: a(z) 13. elem „<img>”, nem „<p>”” → 0-alapú sorszám + a valódi címke. */
export function parseElementMismatch(message: string | null | undefined): { index: number; tag: string } | null {
  const m = /az elem-horgony nem egyezik: a\(z\) (\d+)\. elem „<([a-z][a-z0-9-]*)>”/.exec(message ?? '');
  return m ? { index: +m[1] - 1, tag: m[2] } : null;
}
