import { OfficeUndoOp } from '../../models/office-task.model';
import { canonicalOp, changeUndoOpKind, describeUndoOp, isCellRange, isColumnRange, newUndoOp, validateUndoOp } from './irodai-undo.util';

const op = (o: Partial<OfficeUndoOp>): OfficeUndoOp => ({ ...newUndoOp('clearFormulas', null), ...o });

describe('irodai-undo.util', () => {
  it('a műveletnév kis/nagybetű-független', () => {
    expect(canonicalOp(' CLEARFORMULAS ')).toBe('clearFormulas');
    expect(canonicalOp('deleteSheet')).toBeNull();
  });

  it('tartomány és oszloptartomány a szerverrel egyezően', () => {
    for (const ok of ['A1', 'b2:d10', '$B$5', 'XFD1048576']) expect(isCellRange(ok)).toBe(true);
    for (const bad of ['', 'B', 'B:D', 'A0', 'XFE1', 'A1:B2:C3', 'B5:', 'A1048577']) expect(isCellRange(bad)).toBe(false);
    for (const ok of ['B', 'b:d', '$C:$E']) expect(isColumnRange(ok)).toBe(true);
    for (const bad of ['', 'B1', 'B:D:E', 'XFE']) expect(isColumnRange(bad)).toBe(false);
  });

  it('ellenőrzés: kötelező és tiltott paraméterek műveletenként', () => {
    expect(validateUndoOp(op({ op: 'nope' }))).toBe('ismeretlen művelet');
    expect(validateUndoOp(op({ range: 'B5' }))).toBeNull();
    expect(validateUndoOp(op({}))).toContain('hiányzó tartomány');
    expect(validateUndoOp(op({ range: 'B5', columns: 'B' }))).toContain('nem adható meg');
    expect(validateUndoOp(op({ op: 'resetStyle', range: 'A1', parts: ['font'] }))).toBeNull();
    expect(validateUndoOp(op({ op: 'clearValues', range: 'A1', parts: ['font'] }))).toContain('nem adható meg');
    expect(validateUndoOp(op({ op: 'removeConditionalFormatting' }))).toBeNull();
    expect(validateUndoOp(op({ op: 'removeConditionalFormatting', range: 'E2:' }))).toContain('hibás tartomány');
    expect(validateUndoOp(op({ op: 'removeChart' }))).toBeNull();
    expect(validateUndoOp(op({ op: 'removeChart', name: 'D1', index: 0 }))).toContain('VAGY');
    expect(validateUndoOp(op({ op: 'removeChart', index: 100 }))).toContain('0 és 99');
    expect(validateUndoOp(op({ op: 'removeAutoFilter', sheet: 'Adatok' }))).toBeNull();
    expect(validateUndoOp(op({ op: 'removeAutoFilter', range: 'A1' }))).toContain('nem adható meg');
    expect(validateUndoOp(op({ op: 'removeDefinedName' }))).toBe('hiányzó név');
    expect(validateUndoOp(op({ op: 'removeDefinedName', name: 'Árak', sheet: 'Adatok' }))).toBeNull();
    expect(validateUndoOp(op({ op: 'resetColumnWidth', columns: 'B1' }))).toContain('oszloptartomány');
    expect(validateUndoOp(op({ op: 'unmergeCells', range: 'A1:F1', sheet: 'x'.repeat(32) }))).toContain('31');
  });

  it('magyar leírás minden műveletre', () => {
    expect(describeUndoOp(op({ sheet: 'Adatok', range: '$b$5' }))).toBe('Adatok!B5: képletek törlése (a formázás marad)');
    expect(describeUndoOp(op({ op: 'clearValues', range: 'A1:D1' }))).toBe('A1:D1: beírt értékek törlése (a formázás marad)');
    expect(describeUndoOp(op({ op: 'resetStyle', range: 'A1' }))).toBe('A1: formázás alapra (minden formázás)');
    expect(describeUndoOp(op({ op: 'resetStyle', range: 'A1', parts: ['fill', 'numberFormat'] }))).toBe('A1: formázás alapra (számformátum, kitöltés)');
    expect(describeUndoOp(op({ op: 'removeChart', sheet: 'Adatok', name: 'Eladások' }))).toBe('a(z) „Adatok” lap: a(z) „Eladások” diagram törlése');
    expect(describeUndoOp(op({ op: 'removeChart', index: 1 }))).toBe('a munkalap: a(z) 2. diagram törlése');
    expect(describeUndoOp(op({ op: 'removeConditionalFormatting', sheet: 'A' }))).toBe('a(z) „A” lap: az összes feltételes formázás törlése');
    expect(describeUndoOp(op({ op: 'removeConditionalFormatting', range: 'E2:E30' }))).toBe('E2:E30: feltételes formázás törlése');
    expect(describeUndoOp(op({ op: 'removeAutoFilter', sheet: 'A' }))).toBe('a(z) „A” lap: autoszűrő eltávolítása');
    expect(describeUndoOp(op({ op: 'removeDefinedName', name: 'Árak' }))).toBe('a(z) „Árak” név törlése');
    expect(describeUndoOp(op({ op: 'resetColumnWidth', sheet: 'A', columns: 'b:d' }))).toBe('a(z) „A” lap: B:D oszlopszélesség alapra');
    expect(describeUndoOp(op({ op: 'unmergeCells', range: 'A1:F1' }))).toBe('A1:F1: cellaegyesítés megszüntetése');
    expect(describeUndoOp(op({ op: 'removeDataValidation', range: 'C2:C40' }))).toBe('C2:C40: adatérvényesítés törlése');
  });

  it('műveletváltás csak a megengedett paramétereket tartja meg', () => {
    const changed = changeUndoOpKind(op({ sheet: 'A', range: 'B2', enabled: false }), 'removeChart');
    expect(changed).toMatchObject({ op: 'removeChart', sheet: 'A', range: null, enabled: false });
    expect(changeUndoOpKind(op({ range: 'B2' }), 'unmergeCells').range).toBe('B2');
  });
});
