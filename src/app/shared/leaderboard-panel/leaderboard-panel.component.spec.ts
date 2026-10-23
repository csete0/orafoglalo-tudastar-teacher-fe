import { TestBed } from '@angular/core/testing';
import { LeaderboardPanelComponent } from './leaderboard-panel.component';
import { LeaderboardEntryDto } from '../../models/leaderboard.model';

function entry(overrides: Partial<LeaderboardEntryDto> = {}): LeaderboardEntryDto {
  return { rank: 1, nickname: 'Becenév', realName: 'Valódi Név', score: 42, isCurrentUser: false, ...overrides };
}

describe('LeaderboardPanelComponent', () => {
  function setup(entries: LeaderboardEntryDto[] | undefined = [], error: string | null = null) {
    const fixture = TestBed.createComponent(LeaderboardPanelComponent);
    fixture.componentRef.setInput('entries', entries);
    fixture.componentRef.setInput('error', error);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('a választó váltása frissíti a modelt, és utána jelez a szülőnek', () => {
    const { fixture, c, el } = setup();
    const seen: string[] = [];
    c.selectionChange.subscribe(() => seen.push(`${c.category()}/${c.period()}`));

    const category = el.querySelector('select[aria-label="Ranglista kategória"]') as HTMLSelectElement;
    category.value = 'exam';
    category.dispatchEvent(new Event('change'));
    const period = el.querySelector('select[aria-label="Ranglista időszak"]') as HTMLSelectElement;
    period.value = 'alltime';
    period.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(seen).toEqual(['exam/weekly', 'exam/alltime']);
  });

  it('valódi név, eltérő becenév zárójelben, pontszám; a saját sor kiemelve, dobogó-szín', () => {
    const { el } = setup([entry(), entry({ rank: 4, nickname: 'Same', realName: 'Same', score: 7, isCurrentUser: true })]);
    const rows = el.querySelectorAll('li');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Valódi Név');
    expect(rows[0].textContent).toContain('(Becenév)');
    expect(rows[0].querySelector('span')!.className).toContain('bg-warning-subtle');
    expect(rows[0].classList.contains('!border-primary')).toBe(false);
    expect(rows[1].textContent).not.toContain('(Same)');
    expect(rows[1].querySelector('span')!.className).toContain('bg-bg-element');
    expect(rows[1].classList.contains('!border-primary')).toBe(true);
  });

  it('betöltés előtt (undefined) és üres listánál az üres állapot látszik', () => {
    expect(setup(undefined).el.textContent).toContain('Még nincs ranglista-adat.');
  });

  // UI-TT-19: a hiba nem rejtőzhet az üres állapot mögé.
  it('hiba esetén a hibaüzenet látszik az üres állapot helyett', () => {
    const { el } = setup([], 'A ranglista betöltése sikertelen.');
    expect(el.textContent).toContain('A ranglista betöltése sikertelen.');
    expect(el.textContent).not.toContain('Még nincs ranglista-adat.');
  });
});
