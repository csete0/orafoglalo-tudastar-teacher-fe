import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CsoportAttekintesComponent, UpcomingDeadline, upcomingDeadlines } from './csoport-attekintes.component';
import { TeacherQuizService } from '../../../services/teacher-quiz/teacher-quiz.service';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { TeacherProjectService } from '../../../services/teacher-project/teacher-project.service';

const DAY = 24 * 3600 * 1000;

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

describe('CsoportAttekintesComponent', () => {
  const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

  function setup(opts: { quizError?: boolean } = {}) {
    TestBed.configureTestingModule({
      imports: [CsoportAttekintesComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherQuizService, useValue: { getGroupAssignments: vi.fn(() => (opts.quizError
          ? throwError(() => new Error('x'))
          : of([{ assignmentId: 1, quizId: 20, quizTitle: 'Törtek kvíz', dueAt: inDays(2) }, { assignmentId: 2, quizId: 21, quizTitle: 'Határidő nélkül', dueAt: null }]))) } },
        { provide: TeacherTaskSetService, useValue: { getGroupTaskSetAssignments: vi.fn(() => of([
          { assignmentId: 5, taskSetId: 50, taskSetTitle: 'Témazáró', isTest: true, dueAt: inDays(1) },
          { assignmentId: 6, taskSetId: 60, taskSetTitle: 'Gyakorló sor', dueAt: inDays(3) },
        ])) } },
        { provide: TeacherProjectService, useValue: { forGroup: vi.fn(() => of([{ id: 9, projectTitle: 'Büfé', dueAt: inDays(30) }])) } },
      ],
    });
    const fixture = TestBed.createComponent(CsoportAttekintesComponent);
    fixture.componentRef.setInput('groupId', 1);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement };
  }

  it('a három kiadás-típus közelgő határidői időrendben, a megfelelő oldalra linkelve', () => {
    const { el } = setup();
    const rows = [...el.querySelectorAll('li')];
    expect(rows.map((r) => r.querySelector('a')?.textContent?.trim())).toEqual(['Témazáró', 'Törtek kvíz', 'Gyakorló sor']);
    expect(rows[0].textContent).toContain('Dolgozat');
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe('/dolgozatok/5');
    expect(rows[1].querySelector('a')!.getAttribute('href')).toBe('/feladatsorok/kvizek/20/eredmenyek');
    expect(rows[2].querySelector('a')!.getAttribute('href')).toBe('/feladatsorok/60/eredmenyek');
    expect(el.textContent).not.toContain('Büfé');
  });

  it('egy hívás hibája nem üríti ki a listát, csak jelzi a hiányt', () => {
    const { el } = setup({ quizError: true });
    expect(el.textContent).toContain('a lista hiányos lehet');
    expect(el.textContent).toContain('Témazáró');
  });
});
