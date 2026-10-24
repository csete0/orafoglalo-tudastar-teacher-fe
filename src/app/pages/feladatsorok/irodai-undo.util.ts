import { OfficeFileKind, OfficeUndoOp } from '../../models/office-task.model';
import { WEB_ONLY_KEYS, WORD_ONLY_KEYS } from './irodai-undo/common';
import { describeExcelUndoOp, validateExcelUndoOp } from './irodai-undo/excel';
import { describePptUndoOp, validatePptUndoOp } from './irodai-undo/ppt';
import { describeWebUndoOp, validateWebUndoOp } from './irodai-undo/web';
import { describeWordUndoOp, validateWordUndoOp } from './irodai-undo/word';

/**
 * Az irodai „visszacsinálási” szókészlet a kliensen (Excel, Word, weblap, PowerPoint): magyar leírás, paraméter-szerkezet és ugyanaz az
 * ellenőrzés, mint a szerveren (OfficeUndo.Validate → ExcelUndo / WordUndo / WebUndo / PptxUndo) - hogy a tanár az Újraellenőrzés előtt
 * lássa a hibát, ne egy 400-as választ kapjon. A formátumonkénti szabályok az `irodai-undo/` mappában vannak; ez a fájl gyűjti össze őket.
 */

export { MAX_REPLACE, ordinal } from './irodai-undo/common';
export * from './irodai-undo/excel';
export * from './irodai-undo/ppt';
export * from './irodai-undo/web';
export * from './irodai-undo/word';

/**
 * A művelet hibája magyarul (a szerver OfficeUndo.Validate-jével egyezően, a fájl fajtája szerint), vagy null. A kikapcsolt műveletet
 * is ellenőrzi a szerver.
 */
export function validateUndoOp(op: OfficeUndoOp, kind: OfficeFileKind = 'excel'): string | null {
  if (kind === 'powerpoint') return validatePptUndoOp(op);
  if (op.slide != null || op.shape != null) return 'a „slide” és a „shape” csak PowerPoint-bemutatónál adható meg';
  if (kind === 'web') return validateWebUndoOp(op);
  if (WEB_ONLY_KEYS.some((k) => op[k] != null)) return 'a „file”, „selector”, „property”, „media”, „element” és „attribute” csak weblapnál adható meg';
  if (kind === 'word') return validateWordUndoOp(op);
  if (WORD_ONLY_KEYS.some((k) => op[k] != null)) return 'a „from”, „to”, „section”, „field”, „find” és „original” csak Word-dokumentumnál adható meg';
  return validateExcelUndoOp(op);
}

/** Ember által olvasható leírás a fájl fajtája szerint, pl. „Adatok!B5: képletek törlése (a formázás marad)”. */
export function describeUndoOp(op: OfficeUndoOp, kind: OfficeFileKind = 'excel'): string {
  if (kind === 'powerpoint') return describePptUndoOp(op);
  if (kind === 'web') return describeWebUndoOp(op);
  if (kind === 'word') return describeWordUndoOp(op);
  return describeExcelUndoOp(op);
}
