import { byteSize } from './byte-size';

describe('byteSize', () => {
  it('1 KB alatt bájtban', () => {
    expect(byteSize(0)).toBe('0 bájt');
    expect(byteSize(31)).toBe('31 bájt');
    expect(byteSize(1023)).toBe('1023 bájt');
  });

  it('1 MB alatt kerekített KB-ban', () => {
    expect(byteSize(1024)).toBe('1 KB');
    expect(byteSize(82_944)).toBe('81 KB');
    expect(byteSize(1024 * 1024 - 1)).toBe('1024 KB');
  });

  it('1 MB-tól egy tizedes MB-ban', () => {
    expect(byteSize(1024 * 1024)).toBe('1.0 MB');
    expect(byteSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});
