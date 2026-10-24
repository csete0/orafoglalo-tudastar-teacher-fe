import { TestBed } from '@angular/core/testing';
import { TeacherTaskDto } from '../../../models/teacher-content.model';
import { SubtaskEditorComponent } from './subtask-editor.component';
import { configureTaskStates, makeDetail, task } from './task-state.testing';

describe('SubtaskEditorComponent', () => {
  const subTask = { id: 5, description: 'Eredeti leírás', points: 5, label: 'Rész1', snippets: [], rowVersion: 'v1' };

  function render(t: TeacherTaskDto = task({ subTasks: [subTask] })) {
    const ctx = configureTaskStates(makeDetail([t]));
    const fixture = TestBed.createComponent(SubtaskEditorComponent);
    fixture.componentRef.setInput('taskSetId', 1);
    fixture.componentRef.setInput('task', t);
    fixture.componentRef.setInput('subTask', subTask);
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }
  const button = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

  it('nézetben a címke, a pont és a leírás látszik; a Szerkesztés az inline szerkesztőt nyitja előtöltve', async () => {
    const { fixture, el, edit } = render();
    expect(el.textContent).toContain('Rész1 (5 pont)');
    expect(el.querySelector('p.break-words')!.textContent).toBe('Eredeti leírás');

    button(el, 'Szerkesztés').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(edit().editingSolutionId()).toBe(5);
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Eredeti leírás');
    expect((el.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('5');
  });

  it('a Törlés a címkével kér megerősítést', async () => {
    const { el, confirm } = render();
    button(el, 'Törlés').click();
    await Promise.resolve();
    expect(confirm.ask).toHaveBeenCalledWith(expect.objectContaining({ message: 'Biztosan törlöd a(z) "Rész1" részfeladatot?' }));
  });

  it('kód-feladatnál kódrészlet-szerkesztő van, irodai feladatnál nincs', () => {
    expect(render().el.textContent).toContain('Kódrészletek mentése');
    TestBed.resetTestingModule();
    expect(render(task({ taskTypeIds: [1], subTasks: [subTask] })).el.querySelector('app-snippet-editor')).toBeNull();
  });
});
