import { TestBed } from '@angular/core/testing';
import { TaskEditorComponent } from './task-editor.component';
import { configureTaskStates, makeDetail, task } from './task-state.testing';

describe('TaskEditorComponent', () => {
  function render() {
    const t = task({ title: 'Eredeti cím', description: 'Eredeti leírás', taskTypeIds: [6] });
    const ctx = configureTaskStates(makeDetail([t]));
    ctx.edit().startEditTask(t);
    const fixture = TestBed.createComponent(TaskEditorComponent);
    fixture.componentRef.setInput('taskSetId', 1);
    fixture.componentRef.setInput('task', t);
    fixture.detectChanges();
    return { ...ctx, t, fixture, el: fixture.nativeElement as HTMLElement };
  }
  const button = (el: HTMLElement, text: string) =>
    Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

  it('a jelenlegi értékekkel töltődik; a kategória-rádió a feladat típusán áll', async () => {
    const { fixture, el } = render();
    await fixture.whenStable();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('Eredeti cím');
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Eredeti leírás');
    const checked = el.querySelector('input[type="radio"]:checked') as HTMLInputElement;
    expect(checked.parentElement!.textContent?.trim()).toBe('Programozás');
    expect(checked.name).toBe('editTaskCategory-1');
  });

  it('üres cím mellett a Mentés tiltott; kategóriaváltás és Mentés a store-t hívja; a Mégsem bezár', () => {
    const { fixture, el, edit, store } = render();
    const title = el.querySelector('input') as HTMLInputElement;
    title.value = '  ';
    title.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(button(el, 'Mentés').disabled).toBe(true);

    title.value = 'Új cím';
    title.dispatchEvent(new Event('input'));
    const sql = Array.from(el.querySelectorAll('label')).find((l) => l.textContent?.trim() === 'SQL')!.querySelector('input')!;
    sql.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    button(el, 'Mentés').click();
    expect(store.updateTask).toHaveBeenCalledWith(1, 1, expect.objectContaining({ title: 'Új cím', taskTypeIds: [5] }), expect.any(Function));

    button(el, 'Mégsem').click();
    expect(edit().editingTaskId()).toBeNull();
  });
});
