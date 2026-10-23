import { TestBed } from '@angular/core/testing';
import { configureTaskStates, makeDetail, task } from './task-state.testing';

describe('SnippetDraftsState', () => {
  // A feladatsor-szerkesztő specjéből költözött (F1): a szándéka és az elvárása változatlan.
  it('egy független sikeres mentés/hozzáadás utáni újratöltés NEM dobja el egy másik, még el nem mentett kódrészlet-piszkozatot (UI-TT-40)', () => {
    const subTasks = [{ id: 101, description: 'A', snippets: [] }, { id: 102, description: 'B', snippets: [] }];
    const { store, drafts } = configureTaskStates(makeDetail([task({ taskTypeIds: [], subTasks })]));
    drafts(); // a szerkesztő a létrehozásakor példányosítja
    TestBed.tick();

    drafts().setDraftCode(101, 2, 'def sort_items(items): return sorted(items)');
    expect(drafts().draftCode(101, 2)).toContain('sort_items');

    // Egy FÜGGETLEN, sikeres mutáció (pl. egy harmadik, #103 részfeladat hozzáadása) miatt a store ÚJ selectedDetail
    // referenciát ad (mint egy loadDetail() reload után) — a #101/#102-t VÁLTOZATLANUL hagyva.
    store.selectedDetail.set(makeDetail([task({ taskTypeIds: [], subTasks: [...subTasks, { id: 103, description: 'C', snippets: [] }] })]));
    TestBed.tick();

    expect(drafts().draftCode(101, 2)).toContain('sort_items');
  });

  it('a szerver-állapotból tölt (részfeladat és összevont megoldás külön kulccsal), a nem piszkos kulcsot újratöltéskor frissíti', () => {
    const { store, drafts } = configureTaskStates(makeDetail([task({
      id: 3, completeSolutionSnippets: [{ programmingLanguageId: 2, code: 'teljes' }],
      subTasks: [{ id: 30, description: 'a', snippets: [{ programmingLanguageId: 2, code: 'rész' }] }],
    })]));
    drafts(); // a szerkesztő a létrehozásakor példányosítja
    TestBed.tick();
    expect(drafts().draftCode(30, 2)).toBe('rész');
    expect(drafts().draftCode(drafts().completeSolutionKey(3), 2)).toBe('teljes');

    store.selectedDetail.set(makeDetail([task({ id: 3, subTasks: [{ id: 30, description: 'a', snippets: [{ programmingLanguageId: 2, code: 'új' }] }] })]));
    TestBed.tick();
    expect(drafts().draftCode(30, 2)).toBe('új');
  });

  it('mentéskor csak a kitöltött nyelveket küldi; sikeres mentés után a kulcs már nem mentetlen', () => {
    const solution = { id: 30, description: 'a', snippets: [] };
    const { store, drafts } = configureTaskStates(makeDetail([task({ subTasks: [solution] })]));
    store.upsertSubTaskSnippets.mockImplementation((_s: number, _id: number, _sn: unknown, onSuccess?: () => void) => onSuccess?.());

    drafts().setDraftCode(30, 2, 'print(1)');
    drafts().setDraftCode(30, 5, '   ');
    expect(drafts().hasUnsavedChanges()).toBe(true);
    drafts().saveSnippets(1, solution);

    expect(store.upsertSubTaskSnippets).toHaveBeenCalledWith(1, 30, [{ programmingLanguageId: 2, code: 'print(1)' }], expect.any(Function));
    expect(drafts().hasUnsavedChanges()).toBe(false);
  });

  it('üres piszkozat korábbi kódrészlet nélkül: nem hív, figyelmeztet (UI-TT-13)', () => {
    const solution = { id: 30, description: 'a', snippets: [] };
    const { store, drafts } = configureTaskStates(makeDetail([task({ subTasks: [solution] })]));

    drafts().saveSnippets(1, solution);
    drafts().saveCompleteSolutionSnippets(1, task());

    expect(store.upsertSubTaskSnippets).not.toHaveBeenCalled();
    expect(store.upsertCompleteSolutionSnippets).not.toHaveBeenCalled();
  });
});
