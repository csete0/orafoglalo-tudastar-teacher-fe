import { TestBed } from '@angular/core/testing';
import { TeacherTaskDto } from '../../models/teacher-content.model';
import { allocatedPoints, FeladatVazlatComponent, FeladatVazlatSection, pointIssue } from './feladat-vazlat.component';

const task = (overrides: Partial<TeacherTaskDto> = {}): TeacherTaskDto => ({
  id: 1, title: 'Lekérdezések', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [5], completeSolutionSnippets: [],
  subTasks: [{ id: 11, description: 'a', points: 10, snippets: [] }], ...overrides,
});

const sections = (): FeladatVazlatSection[] => [
  { id: 5, label: 'SQL', icon: 'database', isOther: false, tasks: [task(), task({ id: 2, taskOrder: 2, title: 'Hiányos', maxPoints: 15 })] },
  { id: 2, label: 'Táblázatkezelés', icon: 'chart', isOther: false, tasks: [] },
  { id: 0, label: 'Egyéb', icon: 'clipboard-list', isOther: true, tasks: [task({ id: 3, taskOrder: 3, title: 'Régi', taskTypeIds: [] })] },
];

describe('FeladatVazlatComponent', () => {
  function render(selectedTaskId: number | null = null) {
    const fixture = TestBed.createComponent(FeladatVazlatComponent);
    fixture.componentRef.setInput('sections', sections());
    fixture.componentRef.setInput('selectedTaskId', selectedTaskId);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('típus-csoportonként „N. cím · X p” sorokat mutat, pont-eltérésnél figyelmeztető pöttyel', () => {
    const { el } = render();
    expect(el.querySelector('[data-testid="outline-task-1"]')!.textContent).toContain('1. Lekérdezések');
    expect(el.querySelector('[data-testid="outline-task-1"]')!.textContent).toContain('10 p');
    expect(el.querySelector('[data-testid="outline-task-1"] [data-testid="outline-points-warning"]')).toBeNull();
    expect(el.querySelector('[data-testid="outline-task-2"] [data-testid="outline-points-warning"]')!.getAttribute('aria-label'))
      .toBe('A részfeladatok pontjai eltérnek');
    expect(el.querySelector('[data-testid="outline-section-0"]')!.textContent).toContain('Egyéb');
  });

  it('a kijelölt feladat aria-current jelölést kap', () => {
    const { el } = render(2);
    expect(el.querySelector('[data-testid="outline-task-2"]')!.getAttribute('aria-current')).toBe('true');
    expect(el.querySelector('[data-testid="outline-task-1"]')!.hasAttribute('aria-current')).toBe(false);
  });

  it('kattintásra jelzi a kijelölést és az új feladat kérését; az Egyéb blokkhoz nincs „+ Új feladat”', () => {
    const { fixture, el } = render();
    const selected: number[] = [];
    const added: number[] = [];
    fixture.componentInstance.taskSelected.subscribe((id) => selected.push(id));
    fixture.componentInstance.addTaskRequested.subscribe((id) => added.push(id));

    (el.querySelector('[data-testid="outline-task-2"]') as HTMLButtonElement).click();
    (el.querySelector('[data-testid="outline-add-2"]') as HTMLButtonElement).click();
    expect(selected).toEqual([2]);
    expect(added).toEqual([2]);
    expect(el.querySelector('[data-testid="outline-add-0"]')).toBeNull();
  });

  it('keskeny nézetben (xl alatt) csukva indul, a fejléc-gomb kinyitja/összecsukja, aria-expanded-del', () => {
    const { fixture, el } = render();
    const toggle = el.querySelector('[data-testid="task-outline-toggle"]') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('#task-outline-list')!.classList).toContain('hidden');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(el.querySelector('#task-outline-list')!.classList).not.toContain('hidden');
  });

  it('pont-gond: részfeladat nélkül saját felirattal, eltérő részpont-összegnél az eltérés-felirattal', () => {
    expect(allocatedPoints(task())).toBe(task().maxPoints);
    expect(pointIssue(task())).toBeNull();
    expect(pointIssue(task({ subTasks: [] }))!.label).toBe('Nincs részfeladat – nem pontozható');
    expect(pointIssue(task({ maxPoints: 12 }))!.label).toBe('A részfeladatok pontjai eltérnek');
  });
});
