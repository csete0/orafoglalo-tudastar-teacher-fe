import { tablistKeyTarget } from './tablist-keys';

describe('tablistKeyTarget', () => {
  it('jobbra nyíl a következő fülre lép, az utolsóról az elsőre', () => {
    expect(tablistKeyTarget('ArrowRight', 0, 3)).toBe(1);
    expect(tablistKeyTarget('ArrowRight', 2, 3)).toBe(0);
  });

  it('balra nyíl az előző fülre lép, az elsőről az utolsóra', () => {
    expect(tablistKeyTarget('ArrowLeft', 2, 3)).toBe(1);
    expect(tablistKeyTarget('ArrowLeft', 0, 3)).toBe(2);
  });

  it('más billentyűre és üres fülsorra null', () => {
    expect(tablistKeyTarget('Enter', 1, 3)).toBeNull();
    expect(tablistKeyTarget('Tab', 1, 3)).toBeNull();
    expect(tablistKeyTarget('ArrowRight', 0, 0)).toBeNull();
  });
});
