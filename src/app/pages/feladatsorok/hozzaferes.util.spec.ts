import { FREE_ACCESS_TEXT, isPaidAccess, PAID_ACCESS_TEXT } from './hozzaferes.util';

describe('hozzaferes.util', () => {
  it('ingyenes, ha egyik fizetős jelző sincs beállítva és az isFree nem hamis', () => {
    expect(isPaidAccess({})).toBe(false);
    expect(isPaidAccess({ isFree: true })).toBe(false);
    expect(isPaidAccess({ isFree: null, isPremium: null, isPremiumOnly: null })).toBe(false);
    expect(isPaidAccess({ isFree: true, isPremium: false, isPremiumOnly: false })).toBe(false);
  });

  it('fizetős, ha isPremium vagy isPremiumOnly igaz', () => {
    expect(isPaidAccess({ isPremium: true })).toBe(true);
    expect(isPaidAccess({ isPremiumOnly: true })).toBe(true);
    // A prémium jelző erősebb egy (ellentmondó) isFree: true-nál.
    expect(isPaidAccess({ isFree: true, isPremium: true })).toBe(true);
  });

  it('fizetős, ha az isFree kifejezetten hamis (a null/hiányzó nem az)', () => {
    expect(isPaidAccess({ isFree: false })).toBe(true);
    expect(isPaidAccess({ isFree: null })).toBe(false);
  });

  it('a két felirat a tanárnak szóló, változatlan szöveg', () => {
    expect(PAID_ACCESS_TEXT).toBe(
      'Fizetős – a diákjaidnak előfizetés vagy iskolai licenc kell hozzá; dolgozatban mindenki elérheti.',
    );
    expect(FREE_ACCESS_TEXT).toBe('Ingyenes – minden diákod eléri.');
  });
});
