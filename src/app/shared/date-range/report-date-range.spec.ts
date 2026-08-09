import { DEFAULT_RANGE_KEY, resolveRange, semesterStart, toDateInputValueExclusiveEnd, validateRange } from './report-date-range';

// 7. fázis: a riport dátumszűrő EGYETLEN forrása. A "félév" definíciója üzleti
// döntés — ha ez elcsúszik, három oldal mutat egyszerre más időszakot.
describe('report-date-range', () => {
  describe('semesterStart', () => {
    it('szeptemberben az idei szeptember 1-jét adja', () => {
      const start = semesterStart(new Date(2026, 8, 15)); // 2026. szept. 15.
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(8);
      expect(start.getDate()).toBe(1);
    });

    it('januárban MÉG az első félév — az ELŐZŐ év szeptember 1-je', () => {
      const start = semesterStart(new Date(2026, 0, 20)); // 2026. jan. 20.
      expect(start.getFullYear()).toBe(2025);
      expect(start.getMonth()).toBe(8);
    });

    it('februártól a második félév — idei február 1.', () => {
      const start = semesterStart(new Date(2026, 3, 10)); // 2026. ápr. 10.
      expect(start.getFullYear()).toBe(2026);
      expect(start.getMonth()).toBe(1);
      expect(start.getDate()).toBe(1);
    });
  });

  describe('resolveRange', () => {
    it('az alapértelmezés "all", és üres tartományt ad (a mai viselkedés)', () => {
      expect(DEFAULT_RANGE_KEY).toBe('all');
      expect(resolveRange('all')).toEqual({});
    });

    it('a "last30" 30 nappal korábbi kezdetet ad, felső korlát nélkül', () => {
      const now = new Date(2026, 5, 20);
      const range = resolveRange('last30', undefined, now);
      expect(range.to).toBeUndefined();
      expect(range.from!.getTime()).toBe(new Date(2026, 4, 21).getTime());
    });

    it('a "semester" a félév kezdetét adja, felső korlát nélkül', () => {
      const range = resolveRange('semester', undefined, new Date(2026, 9, 5));
      expect(range.to).toBeUndefined();
      expect(range.from!.getMonth()).toBe(8);
    });

    it('a "custom" a megadott értékeket adja vissza', () => {
      const from = new Date(2026, 0, 1);
      const to = new Date(2026, 1, 1);
      expect(resolveRange('custom', { from, to })).toEqual({ from, to });
    });
  });

  describe('validateRange', () => {
    it('a fordított tartományt elutasítja', () => {
      const error = validateRange({ from: new Date(2026, 5, 1), to: new Date(2026, 4, 1) });
      expect(error).toContain('kezdő dátum');
    });

    it('az 5 évnél hosszabb tartományt elutasítja', () => {
      const to = new Date(2026, 5, 1);
      const from = new Date(2020, 0, 1);
      expect(validateRange({ from, to })).toContain('5 évnél');
    });

    it('a fél-nyitott tartomány megengedett (a "Teljes időszak" is az)', () => {
      expect(validateRange({ from: new Date(1900, 0, 1) })).toBeNull();
      expect(validateRange({})).toBeNull();
    });

    it('az érvényes tartományt elfogadja', () => {
      expect(validateRange({ from: new Date(2026, 0, 1), to: new Date(2026, 5, 1) })).toBeNull();
    });
  });

  describe('toDateInputValueExclusiveEnd', () => {
    // UI-TT-180: a `DateRangeFilterComponent.applyCustom()` a "Vége" mezőbe
    // beírt záró nap UTÁNI nap helyi éjfelét adja ki `to`-ként (kizáró felső
    // határ a backend lekérdezéshez). Egy szülő oldal (`csoport-reszletek`/
    // `intezmeny-reszletek`), ami ezt az értéket fülváltás utáni
    // újra-mountoláskor vissza akarja tölteni a "Vége" mezőbe, ennek a
    // függvénynek kell használnia (NEM a puszta `toDateInputValue`-t), hogy a
    // tanár által ténylegesen beírt napot lássa, ne az eggyel későbbit.
    it('egy nappal korábbi dátumot ad vissza, mint a bemenet (a kizáró felső határ visszafordítása az eredeti, beírt záró napra)', () => {
      const exclusiveUpperBound = new Date(2026, 7, 6); // applyCustom() kimenete "2026-08-05" beírása után
      expect(toDateInputValueExclusiveEnd(exclusiveUpperBound)).toBe('2026-08-05');
    });

    it('undefined bemenetre üres stringet ad (nincs "Vége" dátum beállítva)', () => {
      expect(toDateInputValueExclusiveEnd(undefined)).toBe('');
    });

    it('hónaphatáron át is helyesen forgat vissza (szeptember 1. → augusztus 31.)', () => {
      const exclusiveUpperBound = new Date(2026, 8, 1); // "2026-08-31" beírása után
      expect(toDateInputValueExclusiveEnd(exclusiveUpperBound)).toBe('2026-08-31');
    });
  });
});
