import { TestBed } from '@angular/core/testing';
import { TeacherFileDto } from '../../../models/teacher-content.model';
import { configureTaskStates, makeDetail, task } from './task-state.testing';
import { TASK_TYPES } from './task-types';

// A tesztek többsége a feladatsor-szerkesztő specjéből költözött ide (F1, 2026-10-23): a szándékuk és az elvárásaik
// változatlanok, csak a teljes oldal renderelése helyett közvetlenül az állapotot hajtják. A gombok letiltását
// (DOM) ellenőrző tesztek a szerkesztő specjében maradtak.
describe('TaskSectionState', () => {
  it('a "Új részfeladat szövege" piszkozat feladatonként elkülönített, task-váltáskor nem szivárog át (UI-TT-66)', () => {
    const { tasks } = configureTaskStates(makeDetail([task({ id: 501, taskTypeIds: [] }), task({ id: 502, taskOrder: 2, taskTypeIds: [] })]));

    tasks().setNewSolutionDescription(501, 'A-hoz szánt piszkozat szöveg');
    tasks().setNewSolutionPoints(501, 7);

    expect(tasks().newSolutionDraft(502).description).toBe('');
    expect(tasks().newSolutionDraft(502).points).toBe(5);
    expect(tasks().newSolutionDraft(501).description).toBe('A-hoz szánt piszkozat szöveg');
    expect(tasks().newSolutionDraft(501).points).toBe(7);
  });

  describe('"Új feladat hozzáadása" draft-kezelés (UI-TT-25 / UI-TT-61)', () => {
    it('BUG UI-TT-25 javítva: sikertelen/folyamatban lévő mentésnél NEM törli a beírt cím/leírás/pont draftot, mielőtt a válasz megérkezne', () => {
      const { tasks } = configureTaskStates();

      tasks().patchNewTaskDraft(6, { title: 'Hosszan kigondolt feladatcím', description: 'Részletes leírás', maxPoints: 7 });
      // A mock addTask() alapból NEM hívja meg onSuccess-t — folyamatban lévő/sikertelen kérést szimulál.
      tasks().addTask(1, 6);

      expect(tasks().newTaskDraft(6)).toEqual({ title: 'Hosszan kigondolt feladatcím', description: 'Részletes leírás', maxPoints: 7 });
    });

    it('sikeres mentés (onSuccess meghívása) UTÁN üríti a draftot', () => {
      const { store, tasks } = configureTaskStates();
      store.addTask.mockImplementation((_taskSetId: number, _request: unknown, onSuccess?: () => void) => onSuccess?.());

      tasks().patchNewTaskDraft(6, { title: 'Hosszan kigondolt feladatcím', description: 'Részletes leírás', maxPoints: 7 });
      tasks().addTask(1, 6);

      expect(tasks().newTaskDraft(6)).toEqual({ title: '', description: '', maxPoints: 10 });
    });

    it('whitespace-only cím esetén addTask() csendben visszatér, a store-t nem hívja meg', () => {
      const { store, tasks } = configureTaskStates();

      tasks().patchNewTaskDraft(6, { title: '   ', description: '', maxPoints: 10 });
      tasks().addTask(1, 6);

      expect(store.addTask).not.toHaveBeenCalled();
    });

    // UI-TT-191: élőben megerősítve (kétszer, -5 és 5000 értékkel), hogy a backend CreateTeacherTaskRequest.MaxPoints
    // [Range(1, 1000)]-je csak a beküldés UTÁN, egy nyers angol DataAnnotations-hibaüzenettel jelentkezett.
    it('BUG UI-TT-191: tartományon kívüli (0/negatív/1000 fölötti) maxPoints esetén a "Hozzáadás" gomb letiltva marad ÉS addTask() csendben visszatér', () => {
      const { store, tasks } = configureTaskStates();

      for (const invalid of [0, -5, 5000]) {
        tasks().patchNewTaskDraft(6, { title: 'Cím', description: 'Leírás', maxPoints: invalid });
        expect(tasks().isTaskDraftMaxPointsInvalid(6)).toBe(true);

        tasks().addTask(1, 6);
        expect(store.addTask).not.toHaveBeenCalled();
      }

      tasks().patchNewTaskDraft(6, { title: 'Cím', description: 'Leírás', maxPoints: 10 });
      expect(tasks().isTaskDraftMaxPointsInvalid(6)).toBe(false);
      tasks().addTask(1, 6);
      expect(store.addTask).toHaveBeenCalled();
    });

    it('addSubTask() sikertelen/folyamatban lévő mentésnél is megőrzi a beírt leírás/pont draftot', () => {
      const { tasks } = configureTaskStates(makeDetail([task()]));

      tasks().setNewSolutionDescription(1, 'Beírt részfeladat-leírás');
      tasks().setNewSolutionPoints(1, 8);
      // A mock addSubTask() alapból NEM hívja meg onSuccess-t.
      tasks().addSubTask(1, 1);

      expect(tasks().newSolutionDraft(1)).toEqual({ description: 'Beírt részfeladat-leírás', points: 8 });
    });
  });

  // Kontraszt: a publish() és a létrehozó formok szinkron `if (store.loading()) return;` guarddal védettek. A mögöttes
  // TeacherTaskSetStore.addTask()/addSubTask() a mutateAndReload()-on át egy NEM idempotens POST-ot indít.
  describe('dupla-kattintás / idempotencia védelem hiánya (ÚJ LELET, még nincs ledger-ID)', () => {
    it('JAVÍTVA: dupla-kattintás/gyors kettős Enter az "Új feladat hozzáadása" formon CSAK EGYSZER hívja meg a store.addTask()-ot, amíg az első kérés folyamatban van (nincs duplikált feladat-sor a backenden)', () => {
      const { store, tasks } = configureTaskStates();
      tasks().patchNewTaskDraft(6, { title: 'Duplikált feladat', description: 'Duplikált leírás', maxPoints: 10 });

      // Első kattintás — a VALÓS store ilyenkor már szinkron true-ra állítaná a `loading` jelet (mutateAndReload).
      tasks().addTask(1, 6);
      store.loading.set(true);
      // Második, gyors kattintás, MÍG az első kérés még folyamatban van.
      tasks().addTask(1, 6);

      expect(store.addTask).toHaveBeenCalledTimes(1);
    });

    it('JAVÍTVA: dupla-kattintás/gyors kettős Enter az "Új részfeladat" (addSubTask) formon CSAK EGYSZER hívja meg a store.addSubTask()-t, amíg az első kérés folyamatban van (nincs duplikált részfeladat-sor a backenden)', () => {
      const { store, tasks } = configureTaskStates(makeDetail([task()]));
      tasks().setNewSolutionDescription(1, 'Duplikált részfeladat-leírás');
      tasks().setNewSolutionPoints(1, 8);

      tasks().addSubTask(1, 1);
      store.loading.set(true);
      tasks().addSubTask(1, 1);

      expect(store.addSubTask).toHaveBeenCalledTimes(1);
    });

    // BE-FELADATSORSZERKESZTO-DELETE-NO-LOADING-GUARD: a megerősítő dialógus alatt egy másik mutáció elindulhat, és a
    // mögöttes mutateAndReload() nem idempotens.
    it('JAVÍTVA: deleteTask() nem hívja meg a store.deleteTask()-t, ha egy másik mutáció már folyamatban van (store.loading()===true)', async () => {
      const { store, confirm, tasks } = configureTaskStates(makeDetail([task()]));
      confirm.ask.mockResolvedValue(true);

      store.loading.set(true);
      await tasks().deleteTask(1, 1, 'F1');

      expect(store.deleteTask).not.toHaveBeenCalled();
    });

    it('JAVÍTVA: deleteSubTask() nem hívja meg a store.deleteSubTask()-t, ha egy másik mutáció már folyamatban van (store.loading()===true)', async () => {
      const { store, confirm, tasks } = configureTaskStates(makeDetail([task({ subTasks: [{ id: 9, description: 'r', points: 5, snippets: [] }] })]));
      confirm.ask.mockResolvedValue(true);

      store.loading.set(true);
      await tasks().deleteSubTask(1, 9, 'r');

      expect(store.deleteSubTask).not.toHaveBeenCalled();
    });
  });

  // UI-TT-3: a checkbox→radio átállás előtt egy feladat KÉT típussal (SQL+Programozás) is menthető volt — a régi
  // .includes()-alapú szűrés emiatt mindkét típus-blokkban megjelenítette ugyanazt a feladatot.
  describe('typeSections() — kettős típusú feladatok (UI-TT-3)', () => {
    it('BUG UI-TT-3 javítva: egy [5,6] taskTypeIds-ű feladat NEM jelenik meg sem a Programozás, sem az SQL blokkban, hanem az Egyébben', () => {
      const { tasks } = configureTaskStates(makeDetail([task({ title: 'Kettős típusú feladat', taskTypeIds: [5, 6] })]));

      const sections = tasks().typeSections();

      expect(sections.find((s) => s.id === 6)?.tasks.some((t) => t.id === 1)).toBe(false);
      expect(sections.find((s) => s.id === 5)?.tasks.some((t) => t.id === 1)).toBe(false);
      expect(sections.find((s) => s.isOther)?.tasks.some((t) => t.id === 1)).toBe(true);
    });

    it('egyetlen típussal rendelkező feladat a saját típus-blokkjában jelenik meg, duplikáció nélkül', () => {
      const { tasks } = configureTaskStates(makeDetail([task({ title: 'Programozás feladat', taskTypeIds: [6] })]));

      const sections = tasks().typeSections();
      const totalOccurrences = sections.reduce((sum, s) => sum + s.tasks.filter((t) => t.id === 1).length, 0);

      expect(totalOccurrences).toBe(1);
      expect(sections.find((s) => s.id === 6)?.tasks.some((t) => t.id === 1)).toBe(true);
    });
  });

  it('F: a típusválasztó az irodai típusokat is kínálja; az üres irodai blokk alapból csukva, a feladatot tartalmazó nyitva', () => {
    const { tasks } = configureTaskStates(makeDetail([task({ id: 7, title: 'Meghívó', taskTypeIds: [1] })]));

    expect(TASK_TYPES.map((t) => t.label)).toEqual([
      'Programozás', 'SQL', 'Szövegszerkesztés', 'Táblázatkezelés', 'Prezentáció', 'Grafika', 'Weblap', 'Asztali alkalmazás',
    ]);
    expect(TASK_TYPES.map((t) => t.id)).toEqual([6, 5, 1, 2, 3, 4, 7, 9]);
    expect(tasks().isSectionExpanded(1)).toBe(true); // van benne feladat
    expect(tasks().isSectionExpanded(2)).toBe(false); // üres irodai blokk
    expect(tasks().isSectionExpanded(6)).toBe(true);
    tasks().toggleSection(2);
    expect(tasks().isSectionExpanded(2)).toBe(true);
  });

  describe('SQL megoldó lekérdezések MI-vel', () => {
    const sqlTask = () => task({ id: 7, title: 'Települések', taskTypeIds: [5], subTasks: [{ id: 70, label: '2.', description: 'd', snippets: [] }] });
    const liteFile = (taskId: number | null): TeacherFileDto => ({
      id: 'l', kind: 'CreateLiteSql', originalFileName: 'create_lite.sql', contentType: 'application/sql', sizeBytes: 10,
      createdAt: '2026-10-15T10:00:00Z', url: '/api/teacher-files/l', taskId,
    });

    it('a másik feladatra kötött create_lite.sql nem számít; a feladatsor-szintű és a sajátja igen', () => {
      const { store, tasks } = configureTaskStates(makeDetail([sqlTask()], { files: [liteFile(99)] }));
      expect(tasks().hasLiteSqlFor(7)).toBe(false);
      store.selectedDetail.set(makeDetail([sqlTask()], { files: [liteFile(7)] }));
      expect(tasks().hasLiteSqlFor(7)).toBe(true);
      store.selectedDetail.set(makeDetail([sqlTask()], { files: [liteFile(null)] }));
      expect(tasks().hasLiteSqlFor(7)).toBe(true);
    });

    it('mentés után újratölt, és a mentett részfeladat piszkozata a szerver állapotára áll', () => {
      const { store, tasks, drafts } = configureTaskStates(makeDetail([sqlTask()], { files: [liteFile(null)] }));
      drafts().setDraftCode(70, 6, 'régi piszkozat');
      TestBed.tick();

      tasks().onSqlQueriesSaved(1, [70]);
      store.selectedDetail.set(
        makeDetail([task({ id: 7, taskTypeIds: [5], subTasks: [{ id: 70, label: '2.', snippets: [{ programmingLanguageId: 6, code: 'SELECT 1;' }] }] })],
          { files: [liteFile(null)] }),
      );
      TestBed.tick();

      expect(store.loadDetail).toHaveBeenCalledWith(1);
      expect(drafts().draftCode(70, 6)).toBe('SELECT 1;');
    });
  });

  describe('UI-TT-238: mentetlen módosítás', () => {
    it('kitöltött „Új feladat” / „Új részfeladat” űrlap és mentetlen kódrészlet is az; az üres nem', () => {
      const detail = makeDetail([task()]);
      const { tasks, drafts } = configureTaskStates(detail);
      expect(tasks().hasUnsavedChanges(detail)).toBe(false);

      tasks().patchNewTaskDraft(1, { title: 'UNSAVED-QUICKADD' });
      expect(tasks().hasUnsavedChanges(detail)).toBe(true);
      tasks().patchNewTaskDraft(1, { title: '' });

      tasks().setNewSolutionDescription(1, 'UNSAVED-SUBTASK');
      expect(tasks().hasUnsavedChanges(detail)).toBe(true);
      tasks().setNewSolutionDescription(1, '  ');
      expect(tasks().hasUnsavedChanges(detail)).toBe(false);

      drafts().setDraftCode(1, 2, 'print(1)');
      expect(tasks().hasUnsavedChanges(detail)).toBe(true);
    });
  });
});
