import { isIconName } from './icon.component';

describe('isIconName', () => {
  it('ismert ikonnévre igaz', () => {
    expect(isIconName('database')).toBe(true);
  });

  it('ismeretlen, üres vagy prototípus-névre hamis (különben üres, helyet foglaló ikon jelenne meg)', () => {
    expect(isIconName('globe-europe')).toBe(false);
    expect(isIconName('')).toBe(false);
    expect(isIconName(null)).toBe(false);
    expect(isIconName(undefined)).toBe(false);
    expect(isIconName('toString')).toBe(false);
  });
});
