import { configureTaskStates, makeDetail, task } from './task-state.testing';

// A tesztek a feladatsor-szerkesztő specjéből költöztek ide (F1, 2026-10-23): a szándékuk és az elvárásaik változatlanok,
// csak a teljes oldal renderelése helyett közvetlenül az állapotot hajtják. A DOM-oldali (Szerkesztés gomb → inline
// szerkesztő) ellenőrzés a szerkesztő specjében maradt.
describe('TaskEditState', () => {
  // UI-TT-193: egy MEGLÉVŐ részfeladat pontszámának/leírásának eddig NEM volt UI-belépési pontja - kizárólag "Törlés"
  // gomb volt, a teljesen kiépített és guardolt backend UpdateSolutionAsync-ot semelyik komponens nem hívta.
  describe('meglévő részfeladat inline szerkesztése (UI-TT-193)', () => {
    const solution = { id: 5, description: 'Eredeti leírás', points: 5, snippets: [], rowVersion: 'v-sol-1' };
    const configureWithSolution = () =>
      configureTaskStates(makeDetail([task({ subTasks: [{ id: 5, description: 'Eredeti leírás', points: 5, label: 'Rész1', snippets: [] }] })]));

    it('"Mégsem" visszazárja a szerkesztőt mentés NÉLKÜL', () => {
      const { store, edit } = configureWithSolution();
      edit().startEditSolution(solution);
      expect(edit().editingSolutionId()).toBe(5);

      edit().cancelEditSolution();

      expect(edit().editingSolutionId()).toBeNull();
      expect(store.updateSubTask).not.toHaveBeenCalled();
    });

    it('whitespace-only leírással a "Mentés" gomb letiltva marad, saveEditSolution() csendben visszatér', () => {
      const { store, edit } = configureWithSolution();
      edit().startEditSolution(solution);
      edit().setEditSolutionDescription(5, '   ');

      expect(edit().isEditSolutionDraftDescriptionBlank(5)).toBe(true);
      edit().saveEditSolution(1, solution);
      expect(store.updateSubTask).not.toHaveBeenCalled();
    });

    it('érvényes szerkesztés esetén store.updateSubTask()-t hívja a helyes (trimmelt leírás + pont) request-tel, siker esetén bezárja a szerkesztőt', () => {
      const { store, edit } = configureWithSolution();
      store.updateSubTask.mockImplementation(
        (_taskSetId: number, _solutionId: number, _request: unknown, onSuccess?: () => void) => onSuccess?.(),
      );
      edit().startEditSolution(solution);
      edit().setEditSolutionDescription(5, '  Frissített leírás  ');
      edit().setEditSolutionPoints(5, 3);

      edit().saveEditSolution(1, solution);

      expect(store.updateSubTask).toHaveBeenCalledWith(
        1, 5, { description: 'Frissített leírás', points: 3, rowVersion: 'v-sol-1' }, expect.any(Function),
      );
      expect(edit().editingSolutionId()).toBeNull();
    });

    it('folyamatban lévő mentésnél (store.loading()===true) saveEditSolution() nem hívja meg a store-t', () => {
      const { store, edit } = configureWithSolution();
      edit().startEditSolution(solution);
      edit().setEditSolutionDescription(5, 'Új leírás');
      store.loading.set(true);

      edit().saveEditSolution(1, solution);

      expect(store.updateSubTask).not.toHaveBeenCalled();
    });
  });

  describe('UI-TT-214: meglévő feladat inline szerkesztése', () => {
    const original = () => task({ title: 'Eredeti cím', description: 'Eredeti leírás' });
    const configureWithTask = () => configureTaskStates(makeDetail([original()]));

    it('"Mégsem" visszazárja a szerkesztőt mentés NÉLKÜL', () => {
      const { store, edit } = configureWithTask();
      edit().startEditTask(original());
      expect(edit().editingTaskId()).toBe(1);

      edit().cancelEditTask();

      expect(edit().editingTaskId()).toBeNull();
      expect(store.updateTask).not.toHaveBeenCalled();
    });

    it('üres cím/leírással vagy tartományon kívüli max ponttal a draft érvénytelen, saveEditTask() csendben visszatér', () => {
      const { store, edit } = configureWithTask();
      const t = original();
      edit().startEditTask(t);
      edit().setEditTaskTitle(1, '   ');

      expect(edit().isEditTaskDraftInvalid(1)).toBe(true);
      edit().saveEditTask(1, t);
      expect(store.updateTask).not.toHaveBeenCalled();
    });

    // Lost update (BE-TASKEDIT-LOSTUPDATE): a token a betöltött feladatból megy vissza.
    it('saveEditTask() visszaküldi a betöltött feladat konkurrencia-tokenjét', () => {
      const { store, edit } = configureWithTask();
      const t = { ...original(), rowVersion: 'AAAAAAAAB9k=' };
      edit().startEditTask(t);

      edit().saveEditTask(1, t);

      const request = store.updateTask.mock.calls[0][2] as { rowVersion?: string };
      expect(request.rowVersion).toBe('AAAAAAAAB9k=');
    });

    it('érvényes szerkesztés esetén store.updateTask()-t hívja a helyes (trimmelt cím/leírás + pont + sorrend) request-tel, siker esetén bezárja a szerkesztőt', () => {
      const { store, edit } = configureWithTask();
      store.updateTask.mockImplementation(
        (_taskSetId: number, _taskId: number, _request: unknown, onSuccess?: () => void) => onSuccess?.(),
      );
      const t = original();
      edit().startEditTask(t);
      edit().setEditTaskTitle(1, '  Frissített cím  ');
      edit().setEditTaskDescription(1, '  Frissített leírás  ');
      edit().setEditTaskMaxPoints(1, 7);
      edit().setEditTaskOrder(1, 2);

      edit().saveEditTask(1, t);

      expect(store.updateTask).toHaveBeenCalledWith(
        1, 1,
        { title: 'Frissített cím', description: 'Frissített leírás', maxPoints: 7, taskOrder: 2, taskTypeIds: [6] },
        expect.any(Function),
      );
      expect(edit().editingTaskId()).toBeNull();
    });

    it('UI-TT-215: a kategória (taskTypeIds) is szerkeszthető, a mentés az ÚJ kategóriát küldi, nem a task eredetijét', () => {
      const { store, edit } = configureWithTask();
      store.updateTask.mockImplementation(
        (_taskSetId: number, _taskId: number, _request: unknown, onSuccess?: () => void) => onSuccess?.(),
      );
      const t = original();
      edit().startEditTask(t);

      // A draft eredetileg a task jelenlegi (Programozás=6) kategóriáját tükrözi.
      expect(edit().editTaskDraft(t).taskTypeId).toBe(6);

      // A tanár SQL-re (5) váltja - korábban ez sehol nem volt elérhető, a mentés mindig a task EREDETI taskTypeIds-ét küldte.
      edit().setEditTaskCategory(1, 5);
      edit().saveEditTask(1, t);

      expect(store.updateTask).toHaveBeenCalledWith(1, 1, expect.objectContaining({ taskTypeIds: [5] }), expect.any(Function));
    });

    it('folyamatban lévő mentésnél (store.loading()===true) saveEditTask() nem hívja meg a store-t', () => {
      const { store, edit } = configureWithTask();
      const t = original();
      edit().startEditTask(t);
      edit().setEditTaskTitle(1, 'Új cím');
      store.loading.set(true);

      edit().saveEditTask(1, t);

      expect(store.updateTask).not.toHaveBeenCalled();
    });

    it('BE-TEACHERCONTENT-UPDATETASK-TASKORDER-NO-LOWER-BOUND: 0/negatív Sorrend értékkel a draft érvénytelen, mint a tartományhoz kötött maxPoints-nál', () => {
      const { store, edit } = configureWithTask();
      const t = original();
      edit().startEditTask(t);
      edit().setEditTaskOrder(1, -3);

      expect(edit().isEditTaskDraftInvalid(1)).toBe(true);
      edit().saveEditTask(1, t);
      expect(store.updateTask).not.toHaveBeenCalled();
    });
  });

  it('UI-TT-238: csak megnyitott (nem módosított) szerkesztés nem mentetlen módosítás; a módosított igen', () => {
    const t = task({ id: 4, description: 'Eredeti leírás', taskTypeIds: [1] });
    const { edit } = configureTaskStates(makeDetail([t]));
    edit().startEditTask(t);
    expect(edit().hasUnsavedChanges(makeDetail([t]))).toBe(false);
    edit().setEditTaskDescription(4, 'Eredeti leírás - UNSAVED-TASKEDIT');
    expect(edit().hasUnsavedChanges(makeDetail([t]))).toBe(true);
  });
});
