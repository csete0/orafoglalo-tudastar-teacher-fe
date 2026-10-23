import { TestBed } from '@angular/core/testing';
import { ariaSort, SortHeaderComponent, SortState, sortRows } from './sort-header.component';

describe('SortHeaderComponent', () => {
  function setup(state: SortState | null) {
    const fixture = TestBed.createComponent(SortHeaderComponent);
    fixture.componentRef.setInput('key', 'score');
    fixture.componentRef.setInput('state', state);
    fixture.detectChanges();
    const emitted: SortState[] = [];
    fixture.componentInstance.sortChange.subscribe((s) => emitted.push(s));
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    return { button, emitted };
  }

  it('nem rendezett oszlop: nincs nyíl, első kattintásra csökkenő', () => {
    const { button, emitted } = setup({ key: 'name', dir: 'asc' });
    expect(button.getAttribute('aria-label')).toBe('Rendezés ezen oszlop szerint');
    expect(button.querySelector('span')!.textContent).toBe('');
    button.click();
    expect(emitted).toEqual([{ key: 'score', dir: 'desc' }]);
  });

  it('csökkenőből növekvőbe, növekvőből csökkenőbe vált; a nyíl és a felirat az állapotot mondja', () => {
    const desc = setup({ key: 'score', dir: 'desc' });
    expect(desc.button.querySelector('span')!.textContent).toBe('▼');
    expect(desc.button.getAttribute('aria-label')).toBe('Rendezés: csökkenő — kattints a váltáshoz');
    desc.button.click();
    expect(desc.emitted).toEqual([{ key: 'score', dir: 'asc' }]);

    const asc = setup({ key: 'score', dir: 'asc' });
    expect(asc.button.querySelector('span')!.textContent).toBe('▲');
    asc.button.click();
    expect(asc.emitted).toEqual([{ key: 'score', dir: 'desc' }]);
  });
});

describe('ariaSort / sortRows', () => {
  it('az aria-sort csak a rendezett oszlopon van', () => {
    expect(ariaSort(null, 'a')).toBeNull();
    expect(ariaSort({ key: 'b', dir: 'asc' }, 'a')).toBeNull();
    expect(ariaSort({ key: 'a', dir: 'asc' }, 'a')).toBe('ascending');
    expect(ariaSort({ key: 'a', dir: 'desc' }, 'a')).toBe('descending');
  });

  it('számot és szöveget (magyar ábécé) rendez, a null mindig a végére kerül; ismeretlen kulcsnál változatlan', () => {
    const rows = [{ n: 'Zoltán', p: 2 }, { n: 'Ádám', p: null }, { n: 'Béla', p: 5 }];
    const sel = { n: (r: typeof rows[0]) => r.n, p: (r: typeof rows[0]) => r.p };
    expect(sortRows(rows, { key: 'p', dir: 'desc' }, sel).map((r) => r.p)).toEqual([5, 2, null]);
    expect(sortRows(rows, { key: 'p', dir: 'asc' }, sel).map((r) => r.p)).toEqual([2, 5, null]);
    expect(sortRows(rows, { key: 'n', dir: 'asc' }, sel).map((r) => r.n)).toEqual(['Ádám', 'Béla', 'Zoltán']);
    expect(sortRows(rows, null, sel)).toBe(rows);
    expect(sortRows(rows, { key: 'x', dir: 'asc' }, sel)).toBe(rows);
    expect(rows.map((r) => r.n)).toEqual(['Zoltán', 'Ádám', 'Béla']);
  });
});
