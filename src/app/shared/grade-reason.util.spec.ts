import { gradeReason } from './grade-reason.util';

describe('gradeReason', () => {
  it('az MI indoka változatlan', () => {
    expect(gradeReason('A margó 1,5 cm.', 'partial')).toEqual({ text: 'A margó 1,5 cm.', detail: null });
    expect(gradeReason(null, 'none')).toBeNull();
    expect(gradeReason('  ', 'none')).toBeNull();
  });

  it('gépi tételnél közérthető ítélet, a nyers útvonal nélkül', () => {
    expect(gradeReason('Gépi ellenőrzés: Paragraphs[?Text~^Fontos:].Runs[*].Bold: nincs adat (elvárt: true).', 'none')).toEqual({
      text: 'Gépi ellenőrzés: nem teljesült',
      detail: 'nincs adat (elvárt: true).',
    });
    expect(gradeReason('Gépi ellenőrzés: Sheets[*].Cells[?Ref~^[A-I]1$].Style.Bold: 3/9 megfelel.', 'partial')!.text).toBe(
      'Gépi ellenőrzés: részben teljesült',
    );
  });

  it('a címkés (hivatalos) szabály részlete megmarad', () => {
    expect(gradeReason('Gépi ellenőrzés: bal margó: 2 (elvárt: ≈ 2.5 ± 0.1).', 'none')).toEqual({
      text: 'Gépi ellenőrzés: nem teljesült',
      detail: 'bal margó: 2 (elvárt: ≈ 2.5 ± 0.1).',
    });
    expect(gradeReason('Gépi ellenőrzés: nincs ilyen beadott fájl.', 'none')!.detail).toBe('nincs ilyen beadott fájl.');
    expect(gradeReason('Gépi ellenőrzés: MAX: nincs adat.', 'none')!.detail).toBe('MAX: nincs adat.');
  });
});
