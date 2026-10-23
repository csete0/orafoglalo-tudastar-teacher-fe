import { TestBed } from '@angular/core/testing';
import { HetiAktivitasComponent } from './heti-aktivitas.component';
import { TeamActivity } from '../../models/team.model';

const activity: TeamActivity = {
  hasRepo: true, pendingPushes: 0, branches: [{ name: 'main', sha: 'a' }, { name: 'feature/login', sha: 'b' }],
  weeks: [
    { weekStart: '2027-03-01', commits: { '1': 4, '2': 1 } },
    { weekStart: '2027-03-08', commits: { '2': 2, import: 3 } },
  ],
  members: [
    { userId: 1, name: 'Kiss Anna', active: true, commits: 4, additions: 90, deletions: 10, merges: 1, lastPushAt: '2027-03-09T10:15:00' },
    { userId: 2, name: 'Nagy Béla', active: false, commits: 3, additions: 20, deletions: 5, merges: 0, lastPushAt: null },
  ],
};

describe('HetiAktivitasComponent', () => {
  function setup(data: TeamActivity = activity) {
    TestBed.configureTestingModule({ imports: [HetiAktivitasComponent] });
    const fixture = TestBed.createComponent(HetiAktivitasComponent);
    fixture.componentRef.setInput('data', data);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('tagonkénti sor a commitokkal, sorokkal, merge-dzsel és az utolsó pusholással; a kilépett tag jelölve', () => {
    const { el } = setup();
    const anna = el.querySelector('[data-testid="activity-row-1"]')!;
    const cells = [...anna.querySelectorAll('td')].map((td) => td.textContent!.trim());
    expect(anna.querySelector('th')!.textContent).toContain('Kiss Anna');
    expect(cells).toEqual(['4', '+90', '−10', '1', '2027.03.09. 10:15']);
    const bela = el.querySelector('[data-testid="activity-row-2"]')!;
    expect(bela.querySelector('th')!.textContent).toContain('Nagy Béla (már nem tag)');
    expect(bela.querySelectorAll('td')[4].textContent!.trim()).toBe('–');
  });

  it('a heti kulcsok a tagok sorrendjében, utána a csak a heti adatban szereplők (import) a saját feliratukkal', () => {
    const { c, el } = setup();
    expect(c.keys()).toEqual(['1', '2', 'import']);
    const legend = [...el.querySelectorAll('ul[aria-hidden="true"] li')].map((li) => li.textContent!.trim());
    expect(legend).toEqual(['Kiss Anna', 'Nagy Béla', 'Importált (GitHub)']);
    const headers = [...el.querySelectorAll('details thead th')].map((th) => th.textContent!.trim());
    expect(headers).toEqual(['Hét', 'Kiss Anna', 'Nagy Béla', 'Importált (GitHub)']);
  });

  it('halmozott oszlopok hetenként (csak a nem nulla szakaszok), a színek a kulcsok sorrendjében; az adat-táblában a hiányzó érték 0', () => {
    const { c, el } = setup();
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toBe('Commitok heti bontásban, tagonként (2 hét)');
    expect(svg.querySelectorAll('rect').length).toBe(4);
    expect(c.color('1')).toBe('var(--color-primary)');
    expect(c.color('import')).toBe('var(--color-warning)');
    const rows = [...el.querySelectorAll('details tbody tr')].map((tr) => [...tr.querySelectorAll('th, td')].map((x) => x.textContent!.trim()));
    expect(rows).toEqual([['2027.03.01.', '4', '1', '0'], ['2027.03.08.', '0', '2', '3']]);
  });

  it('a nem tag sorok kulcsa a név szerint: „Törölt felhasználó” → deleted, minden más → import', () => {
    const { c } = setup();
    const row = { userId: null, active: false, commits: 1, additions: 0, deletions: 0, merges: 0, lastPushAt: null };
    expect(c.key({ ...row, name: 'Törölt felhasználó' })).toBe('deleted');
    expect(c.key({ ...row, name: 'Importált (GitHub)' })).toBe('import');
    expect(c.key({ ...row, userId: 7, name: 'Bárki' })).toBe('7');
  });

  it('push nélkül: üres sor, nincs oszlopdiagram; a feldolgozás alatti pushok jelezve; az ágak listája', () => {
    const { el } = setup({ hasRepo: true, pendingPushes: 2, branches: [], weeks: [], members: [] });
    expect(el.querySelector('tbody')!.textContent).toContain('Még nincs push.');
    expect(el.querySelector('svg')).toBeNull();
    expect(el.querySelector('[role="status"]')!.textContent).toContain('2 push feldolgozása folyamatban');
    expect(el.textContent).toContain('még nincs ág');
  });

  it('az ágak vesszővel elválasztva', () => {
    const { el } = setup();
    expect(el.textContent!.replace(/\s+/g, ' ')).toContain('Ágak: main, feature/login');
  });
});
