import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { CsoportEredmenyekComponent } from './csoport-eredmenyek.component';
import { ReportStore } from '../../../services/report/report.store';
import { ReportService } from '../../../services/report/report.service';
import { LeaderboardStore } from '../../../services/leaderboard/leaderboard.store';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { TeacherQuizService } from '../../../services/teacher-quiz/teacher-quiz.service';

describe('CsoportEredmenyekComponent', () => {
  let reportStore: { groupActivity: ReturnType<typeof signal<unknown[]>>; error: ReturnType<typeof signal<string | null>>; loadGroupActivity: ReturnType<typeof vi.fn> };
  let leaderboard: { leaderboard: ReturnType<typeof signal<unknown>>; error: ReturnType<typeof signal<string | null>>; loadGroupLeaderboard: ReturnType<typeof vi.fn> };
  let reportService: { getGroupWeakTopics: ReturnType<typeof vi.fn>; getGroupWeakTopicSummary: ReturnType<typeof vi.fn> };

  function setup(weakTopics: unknown[] = [], error: string | null = null) {
    reportStore = { groupActivity: signal([]), error: signal(error), loadGroupActivity: vi.fn() };
    leaderboard = { leaderboard: signal(null), error: signal(null), loadGroupLeaderboard: vi.fn() };
    reportService = {
      getGroupWeakTopics: vi.fn(() => of(weakTopics)),
      getGroupWeakTopicSummary: vi.fn(() => of({ groupId: 1, groupName: 'x', threshold: 50, canAssign: true, sentences: ['Összefoglaló.'], topics: [] })),
    };
    TestBed.configureTestingModule({
      imports: [CsoportEredmenyekComponent],
      providers: [
        provideRouter([]),
        { provide: ReportStore, useValue: reportStore },
        { provide: LeaderboardStore, useValue: leaderboard },
        { provide: ReportService, useValue: reportService },
        { provide: TeacherTaskSetService, useValue: {} },
        { provide: TeacherQuizService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(CsoportEredmenyekComponent);
    fixture.componentRef.setInput('groupId', 1);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('a három szakasz (Összesítő, Ranglista, Gyenge témák) horgonnyal, mindhárom adata betöltődik', () => {
    const { el } = setup();
    expect(el.querySelector('#osszesito')).not.toBeNull();
    expect(el.querySelector('#ranglista')).not.toBeNull();
    expect(el.querySelector('#gyenge-temak')).not.toBeNull();
    expect(reportStore.loadGroupActivity).toHaveBeenCalledWith(1, undefined, undefined);
    expect(leaderboard.loadGroupLeaderboard).toHaveBeenCalledWith(1, 'quiz', 'weekly');
    expect(reportService.getGroupWeakTopics).toHaveBeenCalledWith(1);
  });

  it('a ranglista szűrőjének váltása újratölt a választott kategóriával', () => {
    const { fixture, el } = setup();
    const select = el.querySelector('select[aria-label="Ranglista kategória"]') as HTMLSelectElement;
    select.value = 'exam';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(leaderboard.loadGroupLeaderboard).toHaveBeenLastCalledWith(1, 'exam', 'weekly');
  });

  it('a dátumszűrő a modelt (szülő-állapotot) és a lekérdezést is frissíti', () => {
    const { c } = setup();
    const from = new Date(2026, 7, 1);
    c.applyRange({ key: 'last30', range: { from } });
    expect(c.rangeKey()).toBe('last30');
    expect(c.range()).toEqual({ from });
    expect(reportStore.loadGroupActivity).toHaveBeenLastCalledWith(1, from, undefined);
  });

  // UI-TT-18: a ReportStore valódi hibája nem rejtőzhet a „Nincs adat.” mögé.
  it('UI-TT-18: az Összesítőben a ReportStore hibája látszik „Nincs adat.” helyett', () => {
    const { el } = setup([], 'A csoport-aktivitás betöltése sikertelen.');
    expect(el.textContent).toContain('A csoport-aktivitás betöltése sikertelen.');
    expect(el.textContent).not.toContain('Nincs adat.');
  });

  // UI-TT-54: a táblázat wrapperje vízszintesen görgethető (.data-table-scroll = overflow-auto).
  it('UI-TT-54: az összesítő tábla görgethető .data-table-scroll-ban van', () => {
    const { el } = setup();
    expect(el.querySelector('table.data-table')!.closest('.data-table-scroll')).not.toBeNull();
  });

  it('gyenge téma nélkül csak egy üres állapot látszik (nincs összefoglaló, nincs külön lista-címsor)', () => {
    const { el } = setup([]);
    expect(el.textContent).toContain('Nincs gyenge téma.');
    expect(el.querySelector('app-gyenge-temak-javaslatok')).toBeNull();
    expect(el.textContent).not.toContain('Minden gyenge téma');
    expect(reportService.getGroupWeakTopicSummary).not.toHaveBeenCalled();
  });

  it('gyenge témáknál az összefoglaló a lista felett', () => {
    const { el } = setup([{ topicId: 1, topicName: 'SQL', studentCount: 3, totalAnswered: 20, totalCorrect: 4, successRate: 20 }]);
    expect(el.querySelector('app-gyenge-temak-javaslatok')).not.toBeNull();
    expect(el.textContent).toContain('Minden gyenge téma');
    expect(el.textContent).not.toContain('Nincs gyenge téma.');
  });
});
