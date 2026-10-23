import { inject, Injectable, signal } from '@angular/core';
import { TeacherSubTaskDto, TeacherTaskDto, TeacherTaskSetDetailDto } from '../../../models/teacher-content.model';
import { TeacherTaskSetStore } from '../../../services/teacher-taskset/teacher-taskset.store';
import { ToastService } from '../../../shared/toast/toast.service';

export interface EditTaskDraft { title: string; description: string; maxPoints: number; taskOrder: number; taskTypeId: number | null }
export interface EditSubTaskDraft { description: string; points: number }

// UI-TT-215: a task.taskTypeIds ELVILEG tömb, a gyakorlatban viszont minden valódi feladatnak pontosan EGY típusa van
// (ld. a típus-blokkok „Egyéb”-gyűjtőjét). A szerkesztő draft ugyanezt a leegyszerűsítést követi: egyetlen választható
// kategória, `null` ha a task kivételesen 0/2+ típusú (ilyenkor a mentés az EREDETI taskTypeIds-ét hagyja változatlanul,
// amíg a tanár tényleg nem választ egy konkrét kategóriát).
const taskTypeIdFor = (task: TeacherTaskDto): number | null => (task.taskTypeIds.length === 1 ? task.taskTypeIds[0] : null);

const taskDraftFrom = (task: TeacherTaskDto): EditTaskDraft => ({
  title: task.title,
  description: task.description ?? '',
  maxPoints: task.maxPoints,
  taskOrder: task.taskOrder,
  taskTypeId: taskTypeIdFor(task),
});

const subTaskDraftFrom = (solution: TeacherSubTaskDto): EditSubTaskDraft => ({
  description: solution.description ?? '',
  points: solution.points ?? 0,
});

/**
 * Meglévő feladat (UI-TT-214/215) és részfeladat (UI-TT-193) inline szerkesztése. Mindkettőnek eddig csak „Törlés”
 * gombja volt, a guardolt backend UpdateTaskAsync / UpdateSolutionAsync-ot semelyik komponens nem hívta - egy típó
 * javítása csak a részfeladatokat is elvesztő Törlés + újralétrehozással ment. A feladatnál a sorrend-mező
 * (`taskOrder`) a legkisebb konzisztens lépés az átrendezéshez, drag&drop nélkül. Egyszerre legfeljebb egy feladat és
 * egy részfeladat van szerkesztés alatt. A szerkesztő komponens adja (`providers`).
 */
@Injectable()
export class TaskEditState {
  private readonly store = inject(TeacherTaskSetStore);
  private readonly toastService = inject(ToastService);

  readonly loading = this.store.loading;

  // ── Feladat ────────────────────────────────────────────────────────────

  readonly editingTaskId = signal<number | null>(null);
  private readonly taskDrafts = signal<Record<number, EditTaskDraft>>({});

  /** A draft a task AKTUÁLIS (mentett) mezőivel előtöltve, amíg a szerkesztés el nem indul. */
  editTaskDraft(task: TeacherTaskDto): EditTaskDraft {
    return this.taskDrafts()[task.id] ?? taskDraftFrom(task);
  }

  startEditTask(task: TeacherTaskDto): void {
    // Minden megnyitáskor a JELENLEGI (mentett) értékekről indulunk - egy korábban elvetett szerkesztés ne ragadjon be.
    this.taskDrafts.update((current) => ({ ...current, [task.id]: taskDraftFrom(task) }));
    this.editingTaskId.set(task.id);
  }

  cancelEditTask(): void {
    this.editingTaskId.set(null);
  }

  isEditTaskDraftInvalid(taskId: number): boolean {
    const draft = this.taskDrafts()[taskId];
    if (!draft) return true;
    // BE-TEACHERCONTENT-UPDATETASK-TASKORDER-NO-LOWER-BOUND: a `min="1"` HTML-attribútum egy standalone ngModel-mezőnél
    // nem blokkolja az értékadást, ezért a Sorrend alsó korlátja is itt, a tényleges guardban van (mint a maxPoints-é).
    return !draft.title.trim() || !draft.description.trim() || draft.maxPoints < 1 || draft.maxPoints > 1000 || draft.taskOrder < 1;
  }

  setEditTaskTitle(taskId: number, value: string): void {
    this.patchTaskDraft(taskId, { title: value });
  }

  setEditTaskDescription(taskId: number, value: string): void {
    this.patchTaskDraft(taskId, { description: value });
  }

  setEditTaskMaxPoints(taskId: number, value: number): void {
    this.patchTaskDraft(taskId, { maxPoints: value });
  }

  setEditTaskOrder(taskId: number, value: number): void {
    this.patchTaskDraft(taskId, { taskOrder: value });
  }

  /** UI-TT-215: a kategória is szerkeszthető (a mentés korábban mindig az EREDETI taskTypeIds-et küldte). */
  setEditTaskCategory(taskId: number, typeId: number): void {
    this.patchTaskDraft(taskId, { taskTypeId: typeId });
  }

  private patchTaskDraft(taskId: number, patch: Partial<EditTaskDraft>): void {
    this.taskDrafts.update((current) => (current[taskId] ? { ...current, [taskId]: { ...current[taskId], ...patch } } : current));
  }

  /** A teljes DTO kell (nem csak az azonosító), mert a konkurrencia-token is megy vele. */
  saveEditTask(taskSetId: number, task: TeacherTaskDto): void {
    if (this.store.loading()) return; // UI-TT-115/123: dupla-kattintás ellen, a mögöttes mutáció nem idempotens
    const draft = this.taskDrafts()[task.id];
    if (!draft || this.isEditTaskDraftInvalid(task.id)) return;
    this.store.updateTask(
      taskSetId,
      task.id,
      {
        title: draft.title.trim(),
        description: draft.description.trim(),
        maxPoints: draft.maxPoints,
        taskOrder: draft.taskOrder,
        // UI-TT-215: konkrét választásnál az ÚJ kategória, különben (0/2+ típusú „Egyéb” feladat) az eredeti marad,
        // hogy egy meg nem érintett mező ne veszíthessen el legacy adatot.
        taskTypeIds: draft.taskTypeId != null ? [draft.taskTypeId] : task.taskTypeIds,
        // Konkurrencia-token a betöltött feladatból - ütközésnél a backend elutasít.
        rowVersion: task.rowVersion,
      },
      () => {
        this.editingTaskId.set(null);
        this.toastService.success('Feladat frissítve.');
      },
    );
  }

  // ── Részfeladat ────────────────────────────────────────────────────────

  readonly editingSolutionId = signal<number | null>(null);
  private readonly subTaskDrafts = signal<Record<number, EditSubTaskDraft>>({});

  editSolutionDraft(solution: TeacherSubTaskDto): EditSubTaskDraft {
    return this.subTaskDrafts()[solution.id] ?? subTaskDraftFrom(solution);
  }

  startEditSolution(solution: TeacherSubTaskDto): void {
    // Minden megnyitáskor a JELENLEGI (mentett) értékekről indulunk - ld. startEditTask().
    this.subTaskDrafts.update((current) => ({ ...current, [solution.id]: subTaskDraftFrom(solution) }));
    this.editingSolutionId.set(solution.id);
  }

  cancelEditSolution(): void {
    this.editingSolutionId.set(null);
  }

  isEditSolutionDraftDescriptionBlank(solutionId: number): boolean {
    return !this.subTaskDrafts()[solutionId]?.description.trim();
  }

  setEditSolutionDescription(solutionId: number, value: string): void {
    this.patchSubTaskDraft(solutionId, { description: value });
  }

  setEditSolutionPoints(solutionId: number, value: number): void {
    this.patchSubTaskDraft(solutionId, { points: value });
  }

  private patchSubTaskDraft(solutionId: number, patch: Partial<EditSubTaskDraft>): void {
    this.subTaskDrafts.update((current) =>
      current[solutionId] ? { ...current, [solutionId]: { ...current[solutionId], ...patch } } : current,
    );
  }

  saveEditSolution(taskSetId: number, solution: TeacherSubTaskDto): void {
    if (this.store.loading()) return; // ld. saveEditTask()
    const draft = this.subTaskDrafts()[solution.id];
    if (!draft || !draft.description.trim()) return;
    this.store.updateSubTask(
      taskSetId,
      solution.id,
      // Konkurrencia-token a betöltött megoldásból - ütközésnél a backend elutasít.
      { description: draft.description.trim(), points: draft.points, rowVersion: solution.rowVersion },
      () => {
        this.editingSolutionId.set(null);
        this.toastService.success('Részfeladat frissítve.');
      },
    );
  }

  /** UI-TT-238: nyitott feladat- vagy részfeladat-szerkesztés a mentett állapottól eltérő értékkel. */
  hasUnsavedChanges(detail: TeacherTaskSetDetailDto): boolean {
    const task = detail.tasks.find((t) => t.id === this.editingTaskId());
    const taskDraft = task && this.taskDrafts()[task.id];
    if (task && taskDraft && (taskDraft.title !== task.title || taskDraft.description !== (task.description ?? '')
      || taskDraft.maxPoints !== task.maxPoints || taskDraft.taskOrder !== task.taskOrder
      || taskDraft.taskTypeId !== taskTypeIdFor(task))) return true;

    const solution = detail.tasks.flatMap((t) => t.subTasks).find((s) => s.id === this.editingSolutionId());
    const solutionDraft = solution && this.subTaskDrafts()[solution.id];
    return !!solution && !!solutionDraft
      && (solutionDraft.description !== (solution.description ?? '') || solutionDraft.points !== (solution.points ?? 0));
  }
}
