import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import {
  activeCount, averageOfAverages, awaitingPublication, CsoportAttekintesComponent, isRunning, studentFlag, UpcomingDeadline,
  upcomingDeadlines,
} from './csoport-attekintes.component';
import { TeacherQuizService } from '../../../services/teacher-quiz/teacher-quiz.service';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { TeacherProjectService } from '../../../services/teacher-project/teacher-project.service';
import { ReportService } from '../../../services/report/report.service';
import { TeacherTeamService } from '../../../services/team/teacher-team.service';
import { StudentActivitySummaryDto } from '../../../models/report.model';
import { TeacherGroupTaskSetAssignmentDto } from '../../../models/teacher-content.model';
import { CsoportTabTarget } from './csoport-fulek';

const DAY = 24 * 3600 * 1000;

function student(userId: number, name: string, exams: number, avg: number | undefined, quizzes = 0, quizAcc?: number): StudentActivitySummaryDto {
  return {
    userId, name, completedExamsCount: exams, averageExamScorePercent: avg, totalExamTimeSpentSeconds: 0,
    completedQuizSessionsCount: quizzes, quizAccuracyPercent: quizAcc, currentStreak: 0, longestStreak: 0, badgeCount: 0,
  };
}

describe('upcomingDeadlines', () => {
  const now = Date.UTC(2026, 9, 21, 12);
  const d = (key: string, offsetDays: number): UpcomingDeadline => ({ key, kind: 'Kvíz', title: key, dueAt: now + offsetDays * DAY, link: [] });

  it('csak a következő 14 nap, időrendben; lejárt és távoli kimarad', () => {
    const result = upcomingDeadlines([d('tavoli', 15), d('holnap', 1), d('lejart', -1), d('hatar', 14), d('ma', 0.1)], now);
    expect(result.map((x) => x.key)).toEqual(['ma', 'holnap', 'hatar']);
  });

  it('legfeljebb 5 sor', () => {
    const items = Array.from({ length: 8 }, (_, i) => d(`k${i}`, i + 1));
    expect(upcomingDeadlines(items, now)).toHaveLength(5);
  });
});

describe('összesítő számítások', () => {
  const now = Date.UTC(2026, 9, 21, 12);
  const iso = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString();

  it('aktív: legalább egy vizsga VAGY kvíz', () => {
    expect(activeCount([student(1, 'A', 1, 80), student(2, 'B', 0, undefined, 2), student(3, 'C', 0, undefined)])).toBe(2);
  });

  it('átlag: csak a nem-null átlagokból, lefelé kerekítve; adat nélkül null', () => {
    expect(averageOfAverages([student(1, 'A', 1, 80), student(2, 'B', 1, 75), student(3, 'C', 0, undefined)])).toBe(77);
    expect(averageOfAverages([student(3, 'C', 0, undefined)])).toBeNull();
    expect(averageOfAverages([])).toBeNull();
  });

  it('jelzés: inaktív (se vizsga, se kvíz), lemaradt (< 50%), egyébként nincs', () => {
    expect(studentFlag(student(1, 'A', 0, undefined))).toBe('inaktív');
    expect(studentFlag(student(2, 'B', 2, 49.9))).toBe('lemaradt');
    expect(studentFlag(student(3, 'C', 2, 50))).toBeNull();
    expect(studentFlag(student(4, 'D', 0, undefined, 3, 20))).toBeNull();
  });

  it('futó kiadás: nincs határidő vagy jövőbeli; a lejárt nem', () => {
    expect(isRunning(null, now)).toBe(true);
    expect(isRunning(undefined, now)).toBe(true);
    expect(isRunning(iso(1), now)).toBe(true);
    expect(isRunning(iso(-1), now)).toBe(false);
  });

  it('közzétételre vár: lejárt, közzé nem tett dolgozat; a közzétett, a jövőbeli, a nem-dolgozat és a határidő nélküli kimarad', () => {
    const a = (assignmentId: number, extra: Partial<TeacherGroupTaskSetAssignmentDto>): TeacherGroupTaskSetAssignmentDto => ({
      assignmentId, taskSetId: 1, taskSetTitle: `D${assignmentId}`, taskCount: 1, assignedAt: iso(-10),
      completedMemberCount: 0, memberCount: 0, ...extra,
    });
    const result = awaitingPublication([
      a(1, { isTest: true, dueAt: iso(-1) }),
      a(2, { isTest: true, dueAt: iso(-3) }),
      a(3, { isTest: true, dueAt: iso(-2), resultsPublishedAt: iso(-1) }),
      a(4, { isTest: true, dueAt: iso(1) }),
      a(5, { isTest: false, dueAt: iso(-1) }),
      a(6, { isTest: true, dueAt: null }),
    ], now);
    expect(result.map((x) => x.assignmentId)).toEqual([2, 1]);
  });
});

describe('CsoportAttekintesComponent', () => {
  const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

  interface SetupOpts { quizError?: boolean; activityError?: boolean; teamsError?: number; showTerkep?: boolean }

  function setup(opts: SetupOpts = {}) {
    const fail = <T>(status = 500): Observable<T> => throwError(() => ({ status }));
    const getGroupActivity = vi.fn((_groupId: number, from: Date) => opts.activityError ? fail() : of(
      Date.now() - from.getTime() > 8 * DAY
        ? [student(1, 'Anna', 3, 82, 1, 90), student(2, 'Béla', 2, 40), student(3, 'Cili', 0, undefined)]
        : [student(1, 'Anna', 1, 82), student(2, 'Béla', 0, undefined, 1), student(3, 'Cili', 0, undefined)]));
    TestBed.configureTestingModule({
      imports: [CsoportAttekintesComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherQuizService, useValue: { getGroupAssignments: vi.fn(() => (opts.quizError ? fail() : of([
          { assignmentId: 1, quizId: 20, quizTitle: 'Törtek kvíz', dueAt: inDays(2) },
          { assignmentId: 2, quizId: 21, quizTitle: 'Határidő nélkül', dueAt: null },
          { assignmentId: 3, quizId: 22, quizTitle: 'Lejárt kvíz', dueAt: inDays(-2) },
        ]))) } },
        { provide: TeacherTaskSetService, useValue: { getGroupTaskSetAssignments: vi.fn(() => of([
          { assignmentId: 5, taskSetId: 50, taskSetTitle: 'Témazáró', isTest: true, dueAt: inDays(1) },
          { assignmentId: 6, taskSetId: 60, taskSetTitle: 'Gyakorló sor', dueAt: inDays(3) },
          { assignmentId: 7, taskSetId: 70, taskSetTitle: 'Múlt heti dolgozat', isTest: true, dueAt: inDays(-5) },
          { assignmentId: 8, taskSetId: 80, taskSetTitle: 'Közzétett dolgozat', isTest: true, dueAt: inDays(-6), resultsPublishedAt: inDays(-4) },
        ])) } },
        { provide: TeacherProjectService, useValue: { forGroup: vi.fn(() => of([{ id: 9, projectTitle: 'Büfé', dueAt: inDays(30) }])) } },
        { provide: ReportService, useValue: {
          getGroupActivity,
          getGroupWeakTopics: vi.fn(() => of([
            { topicId: 1, topicName: 'Rekurzió', successRate: 31.7 }, { topicId: 2, topicName: 'Ciklusok', successRate: 40 },
            { topicId: 3, topicName: 'Tömbök', successRate: 44 }, { topicId: 4, topicName: 'Fájlkezelés', successRate: 48 },
          ])),
        } },
        { provide: TeacherTeamService, useValue: { forGroup: vi.fn(() => opts.teamsError ? fail(opts.teamsError) : of([
          { id: 1, status: 'active' }, { id: 2, status: 'proposed' }, { id: 3, status: 'proposed' }, { id: 4, status: 'archived' },
        ])) } },
      ],
    });
    const fixture = TestBed.createComponent(CsoportAttekintesComponent);
    fixture.componentRef.setInput('groupId', 1);
    fixture.componentRef.setInput('showTerkep', opts.showTerkep ?? false);
    const opened: CsoportTabTarget[] = [];
    let csapatokUnavailable = 0;
    fixture.componentInstance.openTab.subscribe((t) => opened.push(t));
    fixture.componentInstance.csapatokUnavailable.subscribe(() => csapatokUnavailable++);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const text = (selector: string) => el.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return { el, text, opened, getGroupActivity, csapatokUnavailable: () => csapatokUnavailable };
  }

  it('az aktivitást 7 és 30 napra kéri le', () => {
    const { getGroupActivity } = setup();
    const spans = getGroupActivity.mock.calls.map(([, from]) => Math.round((Date.now() - (from as Date).getTime()) / DAY));
    expect(spans.sort((a, b) => a - b)).toEqual([7, 30]);
  });

  it('összesítő csempék: aktív / tagok, 30 napos átlag, futó kiadások, teendő', () => {
    const { el, text } = setup();
    expect(text('[data-testid="tile-active"]')).toContain('2 / 3');
    expect(text('[data-testid="tile-average"]')).toContain('61%');
    // Törtek kvíz + határidő nélküli kvíz + Témazáró + Gyakorló sor + Büfé (a lejárt kvíz és a két lejárt dolgozat nem).
    expect(text('[data-testid="tile-running"]')).toContain('5');
    expect(text('[data-testid="tile-todo"]')).toContain('1 dolgozat közzétételre vár');
    expect(el.querySelector('[data-testid="tile-todo"] a')!.getAttribute('href')).toBe('/dolgozatok/7');
  });

  it('diák-táblázat: jelzéssel rendelkezők elöl, profil-link, százalékok', () => {
    const { el } = setup();
    const rows = [...el.querySelectorAll('tbody tr')];
    expect(rows.map((r) => r.querySelector('a')?.textContent?.trim())).toEqual(['Béla', 'Cili', 'Anna']);
    expect(rows[0].textContent).toContain('lemaradt');
    expect(rows[1].textContent).toContain('inaktív');
    expect(rows[2].querySelector('.badge')).toBeNull();
    expect(rows[2].textContent).toContain('82%');
    expect(rows[2].textContent).toContain('90%');
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe('/diakok/2');
  });

  it('közelgő határidők: a három kiadás-típusból időrendben, a megfelelő oldalra linkelve', () => {
    const { el } = setup();
    const rows = [...el.querySelectorAll('section[aria-labelledby="kozelgo-hataridok"] li')];
    expect(rows.map((r) => r.querySelector('a')?.textContent?.trim())).toEqual(['Témazáró', 'Törtek kvíz', 'Gyakorló sor']);
    expect(rows[0].textContent).toContain('Dolgozat');
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe('/dolgozatok/5');
    expect(rows[1].querySelector('a')!.getAttribute('href')).toBe('/feladatsorok/kvizek/20/eredmenyek');
    expect(rows[2].querySelector('a')!.getAttribute('href')).toBe('/feladatsorok/60/eredmenyek');
  });

  it('gyenge témák: az első 3 lefelé kerekített %-kal, a gomb az Eredmények#gyenge-temak szakaszra visz', () => {
    const { el, text, opened } = setup();
    const kivonat = text('section[aria-labelledby="gyenge-temak-kivonat"]');
    expect(kivonat).toContain('Rekurzió31%');
    expect(kivonat).toContain('Tömbök44%');
    expect(kivonat).not.toContain('Fájlkezelés');
    const btn = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Gyakorló sor kiadása'))!;
    btn.click();
    expect(opened).toEqual([{ tab: 'eredmenyek', section: 'gyenge-temak' }]);
  });

  it('Technikum kártya: aktív csapatok és jóváhagyásra váró javaslatok; térkép-link csak ha elérhető', () => {
    const { el, text, opened } = setup({ showTerkep: true });
    expect(text('[data-testid="technikum-teams"]')).toBe('1 csapat · 2 javaslat vár jóváhagyásra');
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Vizsgarész-térkép'))!.click();
    expect(opened).toEqual([{ tab: 'technikum', section: 'vizsgaresz-terkep' }]);
  });

  it('kikapcsolt csapat-funkció (404) és nincs térkép: nincs Technikum kártya, a szülő értesül, nincs hibaüzenet', () => {
    const { el, csapatokUnavailable } = setup({ teamsError: 404 });
    expect(el.querySelector('section[aria-labelledby="technikum-kivonat"]')).toBeNull();
    expect(csapatokUnavailable()).toBe(1);
    expect(el.textContent).not.toContain('betöltése sikertelen');
  });

  it('részleges hiba: csak az érintett csempék „–”, a többi blokk megmarad', () => {
    const { el, text } = setup({ quizError: true, activityError: true });
    expect(el.textContent).toContain('betöltése sikertelen');
    expect(text('[data-testid="tile-active"]')).toContain('–');
    expect(text('[data-testid="tile-average"]')).toContain('–');
    expect(text('[data-testid="tile-running"]')).toContain('–');
    expect(text('[data-testid="tile-todo"]')).toContain('1 dolgozat közzétételre vár');
    expect(el.textContent).toContain('Témazáró');
  });
});
