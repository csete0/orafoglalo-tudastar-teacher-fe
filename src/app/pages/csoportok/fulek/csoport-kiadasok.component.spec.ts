import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { CsoportKiadasokComponent, isDueSoon } from './csoport-kiadasok.component';
import { TeacherQuizService } from '../../../services/teacher-quiz/teacher-quiz.service';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { TeacherProjectService } from '../../../services/teacher-project/teacher-project.service';
import { KahootHostService } from '../../../services/kahoot-host/kahoot-host.service';
import { TeacherGroupAssignmentDto } from '../../../models/teacher-quiz.model';
import { TeacherGroupTaskSetAssignmentDto } from '../../../models/teacher-content.model';
import { HttpErrorResponse } from '@angular/common/http';
import { TeacherOralExamService } from '../../../services/teacher-oral-exam/teacher-oral-exam.service';
import { TeacherOralAssignmentDto } from '../../../models/teacher-oral-exam.model';

const hours = (h: number) => new Date(Date.now() + h * 3600 * 1000).toISOString();

describe('isDueSoon', () => {
  it('igaz < 48 órán belül, hamis 48 órán túl és lejárt határidőnél', () => {
    expect(isDueSoon(hours(24))).toBe(true);
    expect(isDueSoon(hours(49))).toBe(false);
    expect(isDueSoon(hours(-1))).toBe(false);
  });
});

describe('CsoportKiadasokComponent', () => {
  function makeTaskSet(overrides: Partial<TeacherGroupTaskSetAssignmentDto> = {}): TeacherGroupTaskSetAssignmentDto {
    return { assignmentId: 1, taskSetId: 10, taskSetTitle: 'Algebrai alapok', taskCount: 5, assignedAt: new Date().toISOString(), dueAt: null, completedMemberCount: 0, memberCount: 3, ...overrides };
  }
  const quiz: TeacherGroupAssignmentDto = {
    assignmentId: 2, quizId: 20, quizTitle: 'Törtek', questionCount: 8, assignedAt: '', completedMemberCount: 1, memberCount: 3, hasActiveLiveRoom: false,
  };

  const oral: TeacherOralAssignmentDto = {
    id: 9, topicId: 3, profileSlug: null, title: 'A fotoszintézis', groupId: 1, groupName: '9.A', mode: 'exam', voiceMinutes: 10,
    opensAt: null, dueAt: null, createdAt: '2026-10-22T08:00:00', revokedAt: null, resultsPublishedAt: null, studentCount: 2,
  };

  function setup(taskSets: TeacherGroupTaskSetAssignmentDto[] = [], opts: { quizError?: boolean; oral?: unknown } = {}) {
    const kahoot = { createRoom: vi.fn(() => of({ kahootSessionId: 77 })) };
    const oralApi = { assignments: vi.fn(() => opts.oral ?? of([oral])) };
    TestBed.configureTestingModule({
      imports: [CsoportKiadasokComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherQuizService, useValue: { getGroupAssignments: vi.fn(() => (opts.quizError ? throwError(() => new Error('x')) : of([quiz]))) } },
        { provide: TeacherTaskSetService, useValue: { getGroupTaskSetAssignments: vi.fn(() => of(taskSets)) } },
        { provide: TeacherProjectService, useValue: { forGroup: vi.fn(() => of([])) } },
        { provide: KahootHostService, useValue: kahoot },
        { provide: TeacherOralExamService, useValue: oralApi },
      ],
    });
    const fixture = TestBed.createComponent(CsoportKiadasokComponent);
    fixture.componentRef.setInput('groupId', 1);
    fixture.detectChanges();
    return { fixture, c: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, kahoot, oralApi };
  }

  it('B4: a feladatsor-kiadások listája megjelenik; a Kvízek szakasz #kvizek horgonnyal', () => {
    const { el } = setup([makeTaskSet({ dueAt: hours(100) })]);
    expect(el.textContent).toContain('Algebrai alapok');
    expect(el.querySelector('#kvizek')?.textContent).toContain('Kvízek');
    expect(el.textContent).toContain('Törtek');
  });

  it('B4: üres feladatsor-kiadás listánál nincs hiba', () => {
    const { c, el } = setup([]);
    expect(c.groupTaskSetAssignments()).toHaveLength(0);
    expect(c.taskSetAssignmentsError()).toBeNull();
    expect(el.textContent).toContain('Nincs kiadott feladatsor.');
  });

  it('a kvíz-kiadások hibája csak a saját szakaszát érinti', () => {
    const { el } = setup([makeTaskSet()], { quizError: true });
    expect(el.textContent).toContain('A kiadások betöltése sikertelen.');
    expect(el.textContent).toContain('Algebrai alapok');
  });

  it('„Élő indítás” szobát nyit a csoportnak és a vezérlőre navigál', () => {
    const { el, kahoot } = setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    ([...el.querySelectorAll('button')] as HTMLButtonElement[]).find((b) => b.textContent?.includes('Élő indítás'))!.click();
    expect(kahoot.createRoom).toHaveBeenCalledWith(20, 1);
    expect(navigate).toHaveBeenCalledWith(['/feladatsorok', 'kvizek', 20, 'elo', 77]);
  });

  it('Szóbeli szakasz: a csoport szóbeli-kiadásai móddal és „Eredmények” linkkel', () => {
    const { el, oralApi } = setup();
    expect(oralApi.assignments).toHaveBeenCalledWith(1);
    const section = el.querySelector('[data-testid="group-oral-assignments"]')!;
    expect(section.textContent).toContain('A fotoszintézis');
    expect(section.textContent).toContain('Szóbeli dolgozat');
    expect(section.textContent).toContain('2 diák indította');
    expect(section.querySelector('a')!.getAttribute('href')).toBe('/feladatsorok/szobeli/kiadas/9');
  });

  it('kikapcsolt szóbelinél (404 FeatureDisabled) nincs Szóbeli szakasz; más hibánál hibaüzenet', () => {
    const disabled = new HttpErrorResponse({ status: 404, error: { errorType: 'FeatureDisabled' } });
    const { el } = setup([], { oral: throwError(() => disabled) });
    expect(el.querySelector('[data-testid="group-oral-assignments"]')).toBeNull();
    expect(el.textContent).not.toContain('Szóbeli');

    TestBed.resetTestingModule();
    const failing = setup([], { oral: throwError(() => new HttpErrorResponse({ status: 500 })) });
    expect(failing.el.textContent).toContain('A szóbeli kiadások betöltése sikertelen.');
  });

  it('a Szóbeli szakasz a válaszig nem látszik (kikapcsolt funkciónál nem villan fel)', () => {
    const pending = new Subject<TeacherOralAssignmentDto[]>();
    const { el, fixture } = setup([], { oral: pending });
    expect(el.textContent).not.toContain('Szóbeli');
    pending.next([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Nincs kiadott szóbeli.');
  });
});
