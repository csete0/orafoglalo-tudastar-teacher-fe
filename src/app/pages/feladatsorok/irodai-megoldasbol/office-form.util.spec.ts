import { emptyToNull, oneBasedToIndex, toggledParts, toInt } from './office-form.util';

describe('office-form.util', () => {
  it('toInt: üres mező NaN, különben szám', () => {
    expect(toInt(null)).toBeNaN();
    expect(toInt('')).toBeNaN();
    expect(toInt(undefined)).toBeNaN();
    expect(toInt('7')).toBe(7);
    expect(toInt(3)).toBe(3);
  });

  it('emptyToNull: csak szóközös szöveg → null, egyébként változatlan', () => {
    expect(emptyToNull('  ')).toBeNull();
    expect(emptyToNull(' B2 ')).toBe(' B2 ');
  });

  it('oneBasedToIndex: 1-től számozott → 0-alapú, üres → null', () => {
    expect(oneBasedToIndex(3)).toBe(2);
    expect(oneBasedToIndex('1')).toBe(0);
    expect(oneBasedToIndex('')).toBeNull();
    expect(oneBasedToIndex(null)).toBeNull();
  });

  it('toggledParts: a megadott sorrendben, ismeretlen kulcs nélkül; üres → null', () => {
    const order = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
    expect(toggledParts(null, 'c', order)).toEqual(['c']);
    expect(toggledParts(['c'], 'a', order)).toEqual(['a', 'c']);
    expect(toggledParts(['a', 'c'], 'a', order)).toEqual(['c']);
    expect(toggledParts(['c'], 'c', order)).toBeNull();
    expect(toggledParts(['x'], 'b', order)).toEqual(['b']);
  });
});
