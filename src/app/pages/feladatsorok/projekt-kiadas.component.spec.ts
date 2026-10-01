import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ProjektKiadasComponent } from './projekt-kiadas.component';
import { TeacherProjectService } from '../../services/teacher-project/teacher-project.service';
import { ProjectAssignmentStudentDto, ProjectAssignmentStudentsDto } from '../../models/teacher-project.model';

const step = (orderNo: number, passed: boolean, independence: 'onallo' | 'kis-segitseggel' | 'segitseggel' | null = null) =>
  ({ orderNo, passed, passedAt: null, independence, checks: passed ? 2 : 0, hint1: independence === 'kis-segitseggel' ? 1 : 0, hint2: 0, hint3: 0 });
const student = (userId: number, name: string, current: number | null, steps: ReturnType<typeof step>[], full = true): ProjectAssignmentStudentDto =>
  ({ userId, name, runtime: current === null ? null : 'browser-python', currentMilestoneOrder: current, completedAt: null, lastActivityAt: null,
     hasFullAccess: full, aiTokens30: 120, steps });

const view: ProjectAssignmentStudentsDto = {
  assignment: { id: 7, projectSlug: 'bufe', projectTitle: 'Büfé-rendelő', groupId: 1, groupName: '11.B', assignedAt: '', opensAt: null, dueAt: null,
    runtime: null, memberCount: 3, startedCount: 2, completedCount: 0, membersWithoutFullAccess: 1, milestoneCount: 3, freeMilestoneCount: 2 },
  milestones: [1, 2, 3].map((o) => ({ orderNo: o, title: `Lépés ${o}`, kind: 'build', estimatedMinutes: 30, examAreas: [] })),
  students: [
    student(1, 'Anna', 3, [step(1, true, 'onallo'), step(2, true, 'kis-segitseggel'), step(3, false)]),
    student(2, 'Bence', 2, [step(1, true, 'segitseggel'), step(2, false), step(3, false)], false),
    student(3, 'Csilla', null, [step(1, false), step(2, false), step(3, false)]),
  ],
};

describe('ProjektKiadasComponent (osztály-nézet)', () => {
  async function setup() {
    const api = { students: vi.fn(() => of(view)), studentCode: vi.fn(() => of({ projectTitle: 'Büfé', runtime: 'browser-python', files: { 'backend/app.py': 'print(1)' }, readOnlyPaths: [], createdAt: '' })) };
    TestBed.configureTestingModule({ imports: [ProjektKiadasComponent], providers: [provideRouter([]), { provide: TeacherProjectService, useValue: api }] });
    const fixture = TestBed.createComponent(ProjektKiadasComponent);
    fixture.componentRef.setInput('id', '7');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, api };
  }

  it('mátrix az önállósággal, folyamatban és még-nem állapottal; összesítő és a legnagyobb lemorzsolódás', async () => {
    const { el } = await setup();
    const cells = (id: number) => [...el.querySelectorAll(`[data-testid="student-${id}"] .cell-dot`)].map((c) => c.className.replace('cell-dot ', ''));
    expect(cells(1)).toEqual(['cell--onallo', 'cell--kis-segitseggel', 'cell--folyamatban']);
    expect(cells(2)).toEqual(['cell--segitseggel', 'cell--folyamatban', 'cell--nincs']);
    expect(cells(3)).toEqual(['cell--nincs', 'cell--nincs', 'cell--nincs']);
    expect(el.querySelector('[data-testid="student-2"]')?.textContent).toContain('ingyenes lépésekig');
    expect([...el.querySelectorAll('tfoot td')].slice(1, 4).map((td) => td.textContent!.trim())).toEqual(['2/3', '1/3', '0/3']);
    expect(el.querySelector('[data-testid="worst-drop"]')?.textContent).toContain('2. lépésnél');
  });

  it('a diák nevére kattintva a kódja csak olvasva', async () => {
    const { fixture, el, api } = await setup();
    [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Anna')!.click();
    fixture.detectChanges();
    expect(api.studentCode).toHaveBeenCalledWith(7, 1);
    expect(el.querySelector('[data-testid="student-code"] pre')?.textContent).toContain('print(1)');
  });
});
