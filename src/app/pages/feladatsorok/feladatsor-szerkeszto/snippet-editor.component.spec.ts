import { TestBed } from '@angular/core/testing';
import { SnippetEditorComponent } from './snippet-editor.component';
import { configureTaskStates, makeDetail, task } from './task-state.testing';
import { LANGUAGES } from './task-types';

describe('SnippetEditorComponent', () => {
  function render() {
    const ctx = configureTaskStates(makeDetail([task({ subTasks: [{ id: 11, description: 'r', snippets: [{ programmingLanguageId: 2, code: 'print(1)' }] }] })]));
    const fixture = TestBed.createComponent(SnippetEditorComponent);
    fixture.componentRef.setInput('draftKey', 11);
    fixture.componentRef.setInput('saveLabel', 'Kódrészletek mentése');
    fixture.detectChanges();
    return { ...ctx, fixture, el: fixture.nativeElement as HTMLElement };
  }

  // UI-TT-114 (a szerkesztő specjéből költözött): a C nyelv (backend id 12) is választható, a többi 6 Judge0-nyelv mellett.
  it('BUG UI-TT-114: a nyelvlista tartalmazza a C nyelvet (érvényes backend id: 12), és mind a 7 nyelvnek van mezője', () => {
    expect(LANGUAGES.find((l) => l.id === 12)).toBeDefined();
    const { el } = render();
    const labels = Array.from(el.querySelectorAll('label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual(['Python', 'C#', 'JavaScript', 'C++', 'Java', 'SQL', 'C']);
  });

  it('a piszkozatot mutatja; gépeléskor a kulcs piszkozata frissül; a gomb a mentést kéri', async () => {
    const { fixture, el, drafts } = render();
    await fixture.whenStable();
    const python = el.querySelectorAll('textarea')[0] as HTMLTextAreaElement;
    expect(python.value).toBe('print(1)');

    python.value = 'print(2)';
    python.dispatchEvent(new Event('input'));
    expect(drafts().draftCode(11, 2)).toBe('print(2)');

    const save = vi.fn();
    fixture.componentInstance.save.subscribe(save);
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(save).toHaveBeenCalledTimes(1);
    expect(el.querySelector('button')!.textContent).toContain('Kódrészletek mentése');
  });

  it('UI-TT-141: folyamatban lévő művelet alatt a mentés gomb letiltott', () => {
    const { fixture, el, store } = render();
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(false);
    store.loading.set(true);
    fixture.detectChanges();
    expect((el.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });
});
