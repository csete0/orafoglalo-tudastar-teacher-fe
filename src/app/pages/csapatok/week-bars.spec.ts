import { weekBars } from './week-bars';

describe('weekBars', () => {
  it('halmozott sávok: tagonként egy szakasz, a legnagyobb hét 100 egység, üres hét 0', () => {
    const bars = weekBars([
      { weekStart: '2027-03-01', commits: { '1': 3, '2': 1 } },
      { weekStart: '2027-03-08', commits: {} },
      { weekStart: '2027-03-15', commits: { '2': 2, import: 2 } },
    ], ['1', '2', 'import']);
    expect(bars.map((b) => b.total)).toEqual([4, 0, 4]);
    expect(bars[0].segments.map((s) => [s.key, s.h])).toEqual([['1', 75], ['2', 25]]);
    expect(bars[0].segments[1].y).toBe(0);
    expect(bars[0].segments[0].y).toBe(25);
    expect(bars[1].segments).toEqual([]);
  });
});
