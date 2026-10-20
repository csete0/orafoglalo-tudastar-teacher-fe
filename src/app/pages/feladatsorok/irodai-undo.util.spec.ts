import { OfficeUndoOp } from '../../models/office-task.model';
import {
  anchorPrefix,
  anchorText,
  canonicalOp,
  canonicalWordOp,
  changeUndoOpKind,
  changeWordUndoOpKind,
  describeUndoOp,
  isCellRange,
  isColumnRange,
  newUndoOp,
  newWordUndoOp,
  parseAnchorMismatch,
  validateUndoOp,
  WORD_UNDO_OP_NAMES,
  changeWebUndoOpKind,
  newWebUndoOp,
  parseElementMismatch,
  WEB_UNDO_OP_NAMES,
  changePptUndoOpKind,
  newPptUndoOp,
  parseShapeMismatch,
  PPT_UNDO_OP_NAMES,
} from './irodai-undo.util';

const op = (o: Partial<OfficeUndoOp>): OfficeUndoOp => ({ ...newUndoOp('clearFormulas', null), ...o });
const w = (o: Partial<OfficeUndoOp>): OfficeUndoOp => ({ ...newWordUndoOp('clearRunFormatting'), ...o });
const a = (index: number | null, startsWith: string | null = 'Az indulás') => ({ index, startsWith });
const vw = (o: Partial<OfficeUndoOp>) => validateUndoOp(w(o), 'word');
const dw = (o: Partial<OfficeUndoOp>) => describeUndoOp(w(o), 'word');

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

  it('Excel-jobnál a Word-paraméter és a Word-művelet hiba (a szerver OfficeUndo.Validate-je szerint)', () => {
    expect(validateUndoOp(op({ range: 'B5', from: a(1) }))).toContain('csak Word-dokumentumnál');
    expect(validateUndoOp(op({ range: 'B5', from: null, to: null, section: null }))).toBeNull();
    expect(validateUndoOp(w({ from: a(1) }))).toContain('csak Word-dokumentumnál');
    expect(validateUndoOp(w({}))).toBe('ismeretlen művelet');
    expect(validateUndoOp(op({ range: 'B5' }), 'word')).toContain('ismeretlen művelet');
  });

  describe('Word', () => {
    it('a műveletnév kis/nagybetű-független; mind a 18 művelet ismert', () => {
      expect(WORD_UNDO_OP_NAMES).toHaveLength(18);
      expect(canonicalWordOp(' REMOVETOC ')).toBe('removeToc');
      expect(canonicalWordOp('clearFormulas')).toBeNull();
    });

    it('horgony: szóközök összevonva; idézőjelpár és záró rövidítésjel levágva (WordUndo.AnchorPrefix)', () => {
      expect(anchorText('  Az\tindulás \n  2026. ')).toBe('Az indulás 2026.');
      expect(anchorPrefix(' „Az indulás 2026. május…” ')).toBe('Az indulás 2026. május');
      expect(anchorPrefix('Az indulás 2026. május...')).toBe('Az indulás 2026. május');
      expect(anchorPrefix('Az indulás 2026. május …')).toBe('Az indulás 2026. május');
      expect(anchorPrefix('„Idézet” után')).toBe('„Idézet” után');
      expect(anchorPrefix(null)).toBe('');
    });

    it('ellenőrzés: bekezdés-tartomány', () => {
      expect(vw({ from: a(3), to: a(5, 'Kérjük'), parts: ['bold', 'italic'] })).toBeNull();
      expect(vw({})).toContain('hiányzó első bekezdés');
      expect(vw({ op: 'removeHyperlinks' })).toBeNull();
      expect(vw({ op: 'removeHyperlinks', to: a(2) })).toContain('csak az elsővel');
      expect(vw({ from: a(null) })).toContain('hiányzik a bekezdés sorszáma');
      expect(vw({ from: a(5000) })).toContain('1 és 5000');
      expect(vw({ from: a(1.5) })).toContain('egész');
      expect(vw({ from: a(1, 'x'.repeat(201)) })).toContain('legfeljebb 200');
      expect(vw({ from: a(1, ' ' + 'x'.repeat(200) + '  ') })).toBeNull();
      expect(vw({ from: a(1, '„' + 'x'.repeat(200) + '…”') })).toBeNull();
      expect(vw({ from: a(5), to: a(3) })).toContain('nem lehet az első');
      expect(vw({ from: a(1), parts: ['bold', 'alignment'] })).toContain('ismeretlen rész: alignment');
      expect(vw({ from: a(1), parts: [] })).toBeNull();
      expect(vw({ op: 'resetParagraphFormatting', from: a(1), parts: ['Spacing', 'pagination'] })).toBeNull();
    });

    it('ellenőrzés: tiltott paraméterek műveletenként', () => {
      expect(vw({ from: a(1), sheet: 'Adatok' })).toContain('„sheet” nem adható meg');
      expect(vw({ from: a(1), section: 0 })).toContain('„section” nem adható meg');
      expect(vw({ op: 'removeNumbering', from: a(1), parts: ['bold'] })).toContain('„parts” nem adható meg');
      expect(vw({ op: 'removeTable', index: 0, from: a(1) })).toContain('„from” nem adható meg');
      expect(vw({ op: 'removeToc', field: 'PAGE' })).toContain('„field” nem adható meg');
      expect(vw({ op: 'removeToc' })).toBeNull();
    });

    it('ellenőrzés: sorszám, szakasz, mező, stílus', () => {
      expect(vw({ op: 'removeTable' })).toContain('hiányzó táblázat-sorszám');
      expect(vw({ op: 'removeImage', index: 1000 })).toContain('1 és 1000');
      expect(vw({ op: 'removeSectionBreak', index: 0 })).toBeNull();
      expect(vw({ op: 'removeHeader' })).toBeNull();
      expect(vw({ op: 'removeFooter', section: 100 })).toContain('1 és 100');
      expect(vw({ op: 'resetPageSetup', section: 1, parts: ['margins', 'orientation'] })).toBeNull();
      expect(vw({ op: 'resetPageSetup', parts: ['footnotes'] })).toContain('ismeretlen rész');
      expect(vw({ op: 'removeColumns', section: 1 })).toBeNull();
      expect(vw({ op: 'removeField' })).toContain('hiányzó mezőfajta');
      expect(vw({ op: 'removeField', field: 'page' })).toBeNull();
      expect(vw({ op: 'removeField', field: 'TOC' })).toContain('ismeretlen mezőfajta');
      expect(vw({ op: 'removeFootnotes', parts: ['endnotes'] })).toBeNull();
      expect(vw({ op: 'setParagraphStyle', from: a(0), name: 'Normál' })).toBeNull();
      expect(vw({ op: 'setParagraphStyle', from: a(0), name: 'Heading 1' })).toContain('csak „Normal”');
    });

    it('ellenőrzés: szöveg visszaállítása', () => {
      const ok = { op: 'replaceText', from: a(4), find: 'kulacsot és esőkabátot', original: 'kulacsot' };
      expect(vw(ok)).toBeNull();
      expect(vw({ ...ok, original: '' })).toBeNull();
      expect(vw({ ...ok, to: a(4) })).toBeNull();
      expect(vw({ ...ok, to: a(5) })).toContain('egyetlen bekezdésen');
      expect(vw({ ...ok, find: '' })).toContain('hiányzó szövegrész');
      expect(vw({ ...ok, original: null })).toContain('hiányzó eredeti szöveg');
      expect(vw({ ...ok, original: ok.find })).toContain('azonos');
      expect(vw({ ...ok, find: 'x'.repeat(501) })).toContain('legfeljebb 500');
      expect(vw({ ...ok, find: 'a\r\n'.repeat(167) })).toBeNull(); // 501 karakter, CRLF → LF után 334
      expect(vw({ op: 'replaceText', find: 'x', original: 'y' })).toContain('hiányzó első bekezdés');
      expect(vw({ ...ok, original: 'kulacsot\nés' })).toBeNull();
      expect(vw({ ...ok, original: 'kulacsot\r\nés' })).toBeNull();
      expect(vw({ ...ok, original: 'kulacsot\tés' })).toContain('vezérlőkaraktert');
      expect(vw({ ...ok, original: 'kulacsot\u0007' })).toContain('vezérlőkaraktert');
      expect(vw({ ...ok, original: 'kulacsot\u0085' })).toContain('vezérlőkaraktert');
    });

    it('magyar leírás mind a 18 műveletre (sorszámok 1-től)', () => {
      expect(dw({ from: a(3, 'Az indulás 2026. május'), to: a(5, 'Kérjük, hogy'), parts: ['bold', 'italic'] })).toBe(
        '[4]–[6] „Az indulás 2026. május” – „Kérjük, hogy”: karakterformázás törlése (félkövér, dőlt)',
      );
      expect(dw({ from: a(3, 'x'.repeat(31)) })).toBe(`[4] „${'x'.repeat(30)}…”: karakterformázás törlése (minden közvetlen karakterformázás)`);
      expect(dw({ from: a(3, '„Az indulás…”') })).toBe('[4] „Az indulás”: karakterformázás törlése (minden közvetlen karakterformázás)');
      expect(dw({ op: 'resetParagraphFormatting', from: a(2, ''), to: a(2), parts: ['alignment', 'spacing'] })).toBe(
        '[3] (üres bekezdés): bekezdésformázás alapra (igazítás, térköz/sorköz)',
      );
      expect(dw({ op: 'setParagraphStyle', from: a(0, 'Kirándulás') })).toBe('[1] „Kirándulás”: stílus „Normál”-ra');
      expect(dw({ op: 'removeNumbering', from: a(5, 'Kulacs'), to: a(7, 'Esőkabát') })).toBe('[6]–[8] „Kulacs” – „Esőkabát”: felsorolás/számozás törlése');
      expect(dw({ op: 'removeParagraphBorderShading', from: a(4, 'Fontos') })).toBe('[5] „Fontos”: bekezdésszegély és -mintázat törlése');
      expect(dw({ op: 'removeHyperlinks' })).toBe('az egész dokumentum (élőfej, élőláb, láb- és végjegyzetek is): hivatkozások törlése');
      expect(dw({ op: 'removeHyperlinks', from: a(9, 'Bővebben') })).toBe('[10] „Bővebben”: hivatkozások törlése');
      expect(dw({ op: 'replaceText', from: a(4, 'Hozz'), find: 'kulacsot és esőkabátot', original: 'kulacsot' })).toBe(
        '[5] „Hozz”: „kulacsot és esőkabátot” → „kulacsot” (szöveg visszaállítása)',
      );
      expect(dw({ op: 'replaceText', from: a(4, 'Hozz'), find: ' (kötelező)', original: '' })).toBe('[5] „Hozz”: „ (kötelező)” törlése (szöveg visszaállítása)');
      expect(dw({ op: 'removeTable', index: 0 })).toBe('a(z) 1. táblázat törlése');
      expect(dw({ op: 'convertTableToText', index: 1 })).toBe('a(z) 2. táblázat szöveggé alakítása');
      expect(dw({ op: 'removeImage', index: 2 })).toBe('a(z) 3. rajz törlése (kép/alakzat/szövegdoboz/diagram)');
      expect(dw({ op: 'removeTable' })).toBe('a(z) ?. táblázat törlése');
      expect(dw({ op: 'removeHeader', section: 0 })).toBe('élőfej törlése (1. szakasz)');
      expect(dw({ op: 'removeFooter' })).toBe('élőláb törlése (minden szakasz)');
      expect(dw({ op: 'removeToc' })).toBe('tartalomjegyzék törlése');
      expect(dw({ op: 'removeField', field: 'page' })).toBe('PAGE mező törlése (oldalszám)');
      expect(dw({ op: 'removeFootnotes' })).toBe('láb- és végjegyzetek törlése');
      expect(dw({ op: 'removeFootnotes', parts: ['footnotes'] })).toBe('lábjegyzetek törlése');
      expect(dw({ op: 'resetPageSetup', section: 1, parts: ['margins', 'orientation'] })).toBe(
        'oldalbeállítás alapra - A4, álló, 2,5 cm, 1 hasáb (2. szakasz: margók, tájolás)',
      );
      expect(dw({ op: 'resetPageSetup' })).toBe('oldalbeállítás alapra - A4, álló, 2,5 cm, 1 hasáb (minden szakasz: minden rész)');
      expect(dw({ op: 'removeColumns', section: 1 })).toBe('hasábok megszüntetése (2. szakasz)');
      expect(dw({ op: 'removeSectionBreak', index: 0 })).toBe('szakasztörés törlése a(z) 1. szakasz végén');
      expect(dw({ op: 'nope' })).toBe('ismeretlen művelet: nope');
    });

    it('műveletváltás csak a megengedett paramétereket tartja meg', () => {
      const run = w({ from: a(3), to: a(5), parts: ['bold'], enabled: false });
      expect(changeWordUndoOpKind(run, 'removeNumbering')).toMatchObject({ op: 'removeNumbering', from: a(3), to: a(5), parts: null, enabled: false });
      expect(changeWordUndoOpKind(run, 'resetParagraphFormatting').parts).toBeNull();
      expect(changeWordUndoOpKind(run, 'replaceText')).toMatchObject({ from: a(3), to: null, find: '', original: '' });
      expect(changeWordUndoOpKind(run, 'removeTable')).toMatchObject({ from: null, to: null, index: null, find: null, original: null });
      const page = changeWordUndoOpKind(w({ op: 'removeHeader', section: 1 }), 'resetPageSetup');
      expect(page).toMatchObject({ section: 1, parts: null });
      expect(validateUndoOp(changeWordUndoOpKind(run, 'removeHyperlinks'), 'word')).toBeNull();
    });

    it('a szerver horgony-eltérés üzenetéből a valódi szöveg', () => {
      expect(
        parseAnchorMismatch('a(z) „from” horgony nem egyezik: a(z) 3. bekezdés szövegének eleje „Az indulás 2026. május 21-én „reggel”, 7-kor”, nem „Kérjük”'),
      ).toEqual({ which: 'from', index: 2, actual: 'Az indulás 2026. május 21-én „reggel”, 7-kor' });
      expect(parseAnchorMismatch('a(z) „to” horgony nem egyezik: a(z) 9. bekezdés üres (a horgony szövege legyen üres), nem „X”')).toEqual({
        which: 'to',
        index: 8,
        actual: '',
      });
      // A régi (rövidítésjeles) alak már nem jön.
      expect(parseAnchorMismatch('a(z) „from” horgony nem egyezik: a(z) 3. bekezdés szövege „Az…”, nem „K”-val kezdődik')).toBeNull();
      expect(parseAnchorMismatch('nem talált hivatkozást')).toBeNull();
      expect(parseAnchorMismatch(null)).toBeNull();
    });
  });
});

describe('weblap-szókészlet (WebUndo tükre)', () => {
  const h = (o: Partial<OfficeUndoOp>): OfficeUndoOp => ({ ...newWebUndoOp('removeFile', 'index.html'), ...o });
  const v = (o: Partial<OfficeUndoOp>) => validateUndoOp(h(o), 'web');

  it('érvényes műveletek és a szerverrel azonos hibák', () => {
    expect(WEB_UNDO_OP_NAMES).toEqual(['removeCssRule', 'removeCssDeclaration', 'removeElement', 'unwrapElement', 'removeAttribute', 'renameElement', 'replaceText', 'removeFile']);
    expect(v({})).toBeNull();
    expect(v({ op: 'REMOVECSSRULE', file: 'stilus.css', selector: '#fejlec h1', media: '(max-width: 600px)' })).toBeNull();
    expect(v({ op: 'removeCssRule', file: 'index.html', selector: 'p' })).toBeNull(); // <style> blokk
    expect(v({ op: 'removeElement', file: 'index.html', element: { index: 0, tag: '<IMG>' } })).toBeNull();
    expect(v({ op: 'clearFormulas' })).toContain('ismeretlen művelet');
    expect(v({ sheet: 'A' })).toContain('„sheet” nem adható meg');
    expect(v({ file: null })).toContain('hiányzó fájl');
    expect(v({ file: 'kep.png' })).toContain('nem HTML- vagy CSS-fájl');
    expect(v({ file: 'a/index.html' })).toContain('mappa nélküli');
    expect(v({ op: 'removeElement', file: 'stilus.css', element: { index: 1, tag: 'p' } })).toContain('csak HTML-fájlon');
    expect(v({ op: 'removeElement', element: null })).toContain('hiányzó elem');
    expect(v({ op: 'removeElement', element: { index: null, tag: 'p' } })).toContain('hiányzik az elem sorszáma');
    expect(v({ op: 'removeElement', element: { index: 3000, tag: 'p' } })).toContain('1 és 3000');
    expect(v({ op: 'removeElement', element: { index: 1, tag: '' } })).toContain('címkéje');
    expect(v({ op: 'removeCssRule', file: 'stilus.css', selector: '' })).toContain('hiányzó szelektor');
    expect(v({ op: 'removeCssRule', file: 'stilus.css', selector: 'th, td' })).toContain('vessző nélküli');
    expect(v({ op: 'removeCssDeclaration', file: 'stilus.css', selector: 'p', property: '' })).toContain('hiányzó tulajdonság');
    expect(v({ op: 'removeCssDeclaration', file: 'stilus.css', selector: 'p', property: 'co lor' })).toContain('hibás CSS-tulajdonság');
    expect(v({ op: 'removeAttribute', element: { index: 1, tag: 'p' }, attribute: '' })).toContain('hiányzó attribútum');
    expect(v({ op: 'renameElement', element: { index: 1, tag: 'th' }, original: '' })).toContain('eredeti címke');
    expect(v({ op: 'renameElement', element: { index: 1, tag: 'th' }, original: 'TH' })).toContain('azonos');
    expect(v({ op: 'replaceText', element: { index: 1, tag: 'p' }, find: 'a<b', original: '' })).toContain('címke nélkül');
    expect(v({ op: 'replaceText', element: { index: 1, tag: 'p' }, find: 'a', original: 'b\tc' })).toContain('vezérlőkaraktert');
    // A weblap-paraméter Excelben / Wordben hiba.
    expect(validateUndoOp(op({ range: 'B5', file: 'x.css' }), 'excel')).toContain('csak weblapnál');
    expect(validateUndoOp(w({ from: { index: 0, startsWith: '' }, selector: 'p' }), 'word')).toContain('csak weblapnál');
  });

  it('leírás, műveletváltás, elem-eltérés', () => {
    expect(describeUndoOp(h({ op: 'removeAttribute', element: { index: 12, tag: 'img' }, attribute: 'alt' }), 'web')).toBe('index.html [13] <img>: a(z) „alt” attribútum törlése');
    const changed = changeWebUndoOpKind(h({ op: 'removeAttribute', element: { index: 12, tag: 'img' }, attribute: 'alt' }), 'renameElement');
    expect(changed).toMatchObject({ op: 'renameElement', element: { index: 12, tag: 'img' }, attribute: null, original: '', selector: null });
    expect(changeWebUndoOpKind(changed, 'removeFile')).toMatchObject({ element: null, original: null });
    expect(parseElementMismatch('az elem-horgony nem egyezik: a(z) 13. elem „<img>”, nem „<p>”')).toEqual({ index: 12, tag: 'img' });
    expect(parseElementMismatch('valami más')).toBeNull();
  });
});

describe('PowerPoint-szókészlet (PptxUndo tükre)', () => {
  const p = (o: Partial<OfficeUndoOp>): OfficeUndoOp => ({ ...newPptUndoOp('removeShape', 2), shape: { id: 4, name: 'Kép 3' }, ...o });
  const v = (o: Partial<OfficeUndoOp>) => validateUndoOp(p(o), 'powerpoint');

  it('érvényes műveletek és a szerverrel azonos hibák', () => {
    expect(PPT_UNDO_OP_NAMES).toEqual(['removeShape', 'removePicture', 'clearText', 'resetFont', 'unhideSlide', 'removeSlide', 'removeTransition', 'removeAnimation', 'resetBackground']);
    expect(v({})).toBeNull();
    expect(v({ op: 'REMOVEPICTURE' })).toBeNull();
    expect(v({ op: 'resetFont', parts: ['size', 'color'] })).toBeNull();
    expect(v({ op: 'removeAnimation', shape: null })).toBeNull();
    expect(v({ op: 'removeTransition', slide: null, shape: null })).toBeNull();
    expect(v({ op: 'unhideSlide', slide: 6, shape: null })).toBeNull();
    expect(v({ op: 'deleteSlide' })).toContain('ismeretlen művelet');
    expect(v({ op: 'unhideSlide', slide: null, shape: null })).toContain('hiányzó dia');
    expect(v({ slide: 0 })).toContain('1 és 999');
    expect(v({ shape: null })).toContain('hiányzó alakzat');
    expect(v({ shape: { id: null, name: 'Kép 3' } })).toContain('azonosítója');
    expect(v({ shape: { id: 4, name: null } })).toContain('neve');
    expect(v({ op: 'unhideSlide', slide: 6 })).toContain('„shape” nem adható meg');
    expect(v({ parts: ['size'] })).toContain('„parts” nem adható meg');
    expect(v({ op: 'resetFont', parts: ['shadow'] })).toContain('ismeretlen rész');
    expect(v({ range: 'A1' })).toContain('„range” nem adható meg');
    // PowerPoint-paraméter más fájlfajtánál hiba.
    expect(validateUndoOp(op({ slide: 1 }), 'excel')).toContain('csak PowerPoint-bemutatónál');
    expect(validateUndoOp(w({ from: { index: 0, startsWith: '' }, shape: { id: 1, name: '' } }), 'word')).toContain('csak PowerPoint-bemutatónál');
  });

  it('leírás, műveletváltás, alakzat-eltérés', () => {
    expect(describeUndoOp(p({ op: 'removePicture' }), 'powerpoint')).toBe('2. dia #4 „Kép 3”: kép törlése (a diák külön fájlként kapja)');
    expect(describeUndoOp(p({ op: 'resetFont', parts: ['color', 'size'] }), 'powerpoint')).toBe('2. dia #4 „Kép 3”: betűformázás alapra (betűméret, betűszín)');
    expect(describeUndoOp(p({ op: 'removeTransition', slide: null, shape: null }), 'powerpoint')).toBe('minden dia: áttűnés törlése');
    expect(describeUndoOp(p({ op: 'removeAnimation', shape: null }), 'powerpoint')).toBe('2. dia: a dia összes animációjának törlése');
    expect(newPptUndoOp('resetBackground', 3)).toMatchObject({ slide: null, shape: null });
    const changed = changePptUndoOpKind(p({ op: 'resetFont', parts: ['size'] }), 'unhideSlide');
    expect(changed).toMatchObject({ op: 'unhideSlide', slide: 2, shape: null, parts: null });
    expect(changePptUndoOpKind(p({}), 'removeAnimation')).toMatchObject({ shape: { id: 4, name: 'Kép 3' } });
    expect(parseShapeMismatch('az alakzat-horgony nem egyezik: a(z) 2. dia 4 azonosítójú alakzata „Kép 3”, nem „Kép 4”')).toEqual({ slide: 2, id: 4, name: 'Kép 3' });
    expect(parseShapeMismatch('valami más')).toBeNull();
  });
});
