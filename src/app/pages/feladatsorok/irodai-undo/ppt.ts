import { OfficeUndoOp, PptUndoOpName } from '../../../models/office-task.model';
import { cut, disallowedFieldError, isInt, presentBaseFields, WEB_ONLY_KEYS, WORD_ONLY_KEYS } from './common';

// ═════════════════════════════════════════════ PowerPoint (PptxUndo) ═════════════════════════════════════════════

interface PptOpSpec {
  label: string;
  /** A szerver Allowed-listája. */
  fields: ('slide' | 'shape' | 'parts')[];
  /** A dia elhagyható (= minden dia). */
  allSlides?: boolean;
  /** Az alakzat kötelező (különben, ha megengedett, elhagyható). */
  needsShape?: boolean;
}

export const PPT_UNDO_OPS: Record<PptUndoOpName, PptOpSpec> = {
  removeShape: { label: 'Alakzat törlése (az animációival)', fields: ['slide', 'shape'], needsShape: true },
  removePicture: { label: 'Kép törlése (a diák külön fájlként kapja)', fields: ['slide', 'shape'], needsShape: true },
  clearText: { label: 'Szöveg törlése (az alakzat marad)', fields: ['slide', 'shape'], needsShape: true },
  resetFont: { label: 'Betűformázás alapra', fields: ['slide', 'shape', 'parts'], needsShape: true },
  unhideSlide: { label: 'Rejtett dia felfedése', fields: ['slide'] },
  removeSlide: { label: 'Dia törlése', fields: ['slide'] },
  removeTransition: { label: 'Áttűnés törlése', fields: ['slide'], allSlides: true },
  removeAnimation: { label: 'Animáció törlése', fields: ['slide', 'shape'] },
  resetBackground: { label: 'Dia háttere alapra (a mintáé)', fields: ['slide'], allSlides: true },
};

export const PPT_UNDO_OP_NAMES = Object.keys(PPT_UNDO_OPS) as PptUndoOpName[];

/** A resetFont részei (PptxUndo.FontParts sorrendjében). */
export const PPT_FONT_PARTS: { key: string; label: string }[] = [
  { key: 'size', label: 'betűméret' },
  { key: 'color', label: 'betűszín' },
  { key: 'bold', label: 'félkövér' },
  { key: 'italic', label: 'dőlt' },
  { key: 'underline', label: 'aláhúzás' },
  { key: 'font', label: 'betűtípus' },
];

/** PptxUndo.MaxSlide */
const MAX_SLIDE = 999;

export function canonicalPptOp(op: string | null | undefined): PptUndoOpName | null {
  const t = (op ?? '').trim().toLowerCase();
  return PPT_UNDO_OP_NAMES.find((n) => n.toLowerCase() === t) ?? null;
}

export function pptOpSpec(op: string): PptOpSpec | null {
  const name = canonicalPptOp(op);
  return name ? PPT_UNDO_OPS[name] : null;
}

/** A PowerPoint-művelet hibája magyarul (a szerver PptxUndo.Validate-jével egyezően), vagy null. */
export function validatePptUndoOp(op: OfficeUndoOp): string | null {
  const name = canonicalPptOp(op.op);
  if (!name) return 'ismeretlen művelet (PowerPointnál csak PowerPoint-művelet használható)';
  const spec = PPT_UNDO_OPS[name];
  const present = presentBaseFields(op);
  for (const key of [...WORD_ONLY_KEYS, ...WEB_ONLY_KEYS]) if (op[key] != null) present.push(key);
  if (op.slide != null) present.push('slide');
  if (op.shape != null) present.push('shape');
  const extra = disallowedFieldError(present, spec.fields);
  if (extra) return extra;
  if (op.slide == null && !spec.allSlides) return 'hiányzó dia (válaszd ki)';
  if (op.slide != null && (!isInt(op.slide) || op.slide < 1 || op.slide > MAX_SLIDE)) return `a dia sorszáma 1 és ${MAX_SLIDE} közötti egész szám`;
  if (op.shape == null && spec.needsShape) return 'hiányzó alakzat (válaszd ki a listából)';
  if (op.shape) {
    if (op.shape.id == null || !isInt(op.shape.id) || op.shape.id < 0) return 'hiányzik az alakzat azonosítója';
    if (op.shape.name == null) return 'hiányzik az alakzat neve';
    if (op.shape.name.trim().length > 255) return 'az alakzat neve legfeljebb 255 karakter';
  }
  if (op.parts?.length) {
    const unknown = op.parts.filter((p) => !PPT_FONT_PARTS.some((k) => k.key === (p ?? '').trim().toLowerCase()));
    if (unknown.length) return `ismeretlen rész: ${unknown.join(', ')}`;
  }
  return null;
}

/** „2. dia #4 „Kép 3”” */
export function describeShape(op: OfficeUndoOp): string {
  const where = op.slide != null ? `${op.slide}. dia` : 'minden dia';
  return op.shape ? `${where} #${op.shape.id ?? '?'} „${cut(op.shape.name ?? '', 40)}”` : where;
}

/** A PowerPoint-művelet magyar leírása, pl. „2. dia #4 „Kép 3”: kép törlése”. */
export function describePptUndoOp(op: OfficeUndoOp): string {
  const name = canonicalPptOp(op.op);
  switch (name) {
    case 'removeShape':
      return `${describeShape(op)}: alakzat törlése (az animációival)`;
    case 'removePicture':
      return `${describeShape(op)}: kép törlése (a diák külön fájlként kapja)`;
    case 'clearText':
      return `${describeShape(op)}: szöveg törlése`;
    case 'resetFont': {
      const selected = op.parts;
      const parts = selected?.length ? PPT_FONT_PARTS.filter((p) => selected.includes(p.key)).map((p) => p.label).join(', ') : 'minden közvetlen betűformázás';
      return `${describeShape(op)}: betűformázás alapra (${parts})`;
    }
    case 'unhideSlide':
      return `${describeShape(op)}: rejtett dia felfedése`;
    case 'removeSlide':
      return `${describeShape(op)}: dia törlése`;
    case 'removeTransition':
      return `${describeShape(op)}: áttűnés törlése`;
    case 'removeAnimation':
      return op.shape ? `${describeShape(op)}: az alakzat animációinak törlése` : `${describeShape(op)}: a dia összes animációjának törlése`;
    case 'resetBackground':
      return `${describeShape(op)}: háttér alapra (a mintáé)`;
    default:
      return `ismeretlen művelet: ${op.op}`;
  }
}

/** Új PowerPoint-művelet (az első diával; az alakzatot a tanár választja ki). */
export function newPptUndoOp(op: PptUndoOpName, slide: number | null): OfficeUndoOp {
  return {
    op, sheet: null, range: null, name: null, index: null, columns: null, parts: null,
    slide: PPT_UNDO_OPS[op].allSlides ? null : slide,
    shape: null,
    enabled: true, result: null, message: null,
  };
}

/** PowerPoint-műveletváltás: a dia marad (ha kell), az alakzat csak alakzatos műveletnél, a részek csak a resetFontnál. */
export function changePptUndoOpKind(op: OfficeUndoOp, next: PptUndoOpName): OfficeUndoOp {
  const spec = PPT_UNDO_OPS[next];
  return {
    ...op,
    op: next,
    slide: op.slide ?? (spec.allSlides ? null : 1),
    shape: spec.fields.includes('shape') ? op.shape ?? null : null,
    parts: spec.fields.includes('parts') ? op.parts : null,
  };
}

/** A szerver alakzat-eltérés üzenete: „az alakzat-horgony nem egyezik: a(z) 2. dia 4 azonosítójú alakzata „Kép 3”, nem „Kép 4”” → a valódi név. */
export function parseShapeMismatch(message: string | null | undefined): { slide: number; id: number; name: string } | null {
  const m = /az alakzat-horgony nem egyezik: a\(z\) (\d+)\. dia (\d+) azonosítójú alakzata „([\s\S]*?)”, nem „/.exec(message ?? '');
  return m ? { slide: +m[1], id: +m[2], name: m[3] } : null;
}
