import { computed, inject, Injectable, signal } from '@angular/core';
import { TeacherTaskSetDetailDto } from '../../../models/teacher-content.model';
import { TeacherTaskSetStore } from '../../../services/teacher-taskset/teacher-taskset.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { IconName } from '../../../shared/icon/icon.component';
import { ToastService } from '../../../shared/toast/toast.service';
import { FeladatVazlatSection } from './feladat-vazlat.component';
import { SnippetDraftsState } from './snippet-drafts.state';
import { TaskEditState } from './task-edit.state';
import { isOfficeType, TASK_TYPES } from './task-types';

export interface NewTaskDraft { title: string; description: string; maxPoints: number }
export interface NewSubTaskDraft { description: string; points: number }

const emptyNewTaskDraft = (): NewTaskDraft => ({ title: '', description: '', maxPoints: 10 });
const EMPTY_SUBTASK_DRAFT: Readonly<NewSubTaskDraft> = { description: '', points: 5 };

/**
 * A feladatsor-szerkesztő „Feladatok” része: típus-blokkok, kinyitott feladat, „Új feladat” / „Új részfeladat”
 * piszkozatok, törlés. A szerkesztő komponens adja (`providers`), így a csukott blokkok és feladatok (és az
 * alkomponenseik) piszkozatai nem vesznek el.
 */
@Injectable()
export class TaskSectionState {
  private readonly store = inject(TeacherTaskSetStore);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly edit = inject(TaskEditState);
  private readonly snippets = inject(SnippetDraftsState);

  readonly loading = this.store.loading;

  // ── Típus-blokkok, kijelölés ───────────────────────────────────────────

  readonly expandedTaskId = signal<number | null>(null);

  /** A tanár által kézzel nyitott/zárt típus-blokkok. Alapból nyitva (a tanár azonnal lássa a meglévő feladatait) -
   *  kivéve az ÜRES irodai blokkokat: hét nyitott „Új feladat” űrlap egymás alatt áttekinthetetlen lenne. */
  private readonly sectionToggles = signal<Record<number, boolean>>({});

  /** Melyik SQL-feladat „SQL megoldó lekérdezések MI-vel” ablaka van nyitva. */
  readonly sqlQueriesTaskId = signal<number | null>(null);

  /** A feladatokat típusonként csoportosítja a blokkos megjelenítéshez. Az „Egyéb” (id=0) csoport a korábbi, több/nulla
   *  típussal mentett feladatoknak ad helyet - ezekhez nincs típus-scope-olt hozzáadó űrlap. */
  readonly typeSections = computed<FeladatVazlatSection[]>(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return [];

    // UI-TT-3: a checkbox→radio átállás előtt KÉT típussal (SQL+Programozás) is menthető volt egy feladat - az
    // .includes()-alapú szűrés ilyenkor mindkét blokkba besorolta (duplikáció). Csak a PONTOSAN egy típusú feladatok
    // kerülnek a saját blokkjukba; minden más (0 vagy 2+ típus) az „Egyéb” gyűjtő-blokkba esik.
    const sections = TASK_TYPES.map((type) => ({
      id: type.id,
      label: type.label,
      icon: type.icon,
      isOther: false,
      tasks: detail.tasks.filter((t) => t.taskTypeIds.length === 1 && t.taskTypeIds[0] === type.id),
    }));

    const categorizedTaskIds = new Set(sections.flatMap((s) => s.tasks.map((t) => t.id)));
    const otherTasks = detail.tasks.filter((t) => !categorizedTaskIds.has(t.id));
    if (otherTasks.length > 0) {
      sections.push({ id: 0, label: 'Egyéb', icon: 'clipboard-list' as IconName, isOther: true, tasks: otherTasks });
    }
    return sections;
  });

  toggleSection(id: number): void {
    const open = this.isSectionExpanded(id);
    this.sectionToggles.update((current) => ({ ...current, [id]: !open }));
  }

  expandSection(id: number): void {
    this.sectionToggles.update((current) => ({ ...current, [id]: true }));
  }

  isSectionExpanded(id: number): boolean {
    const toggled = this.sectionToggles()[id];
    if (toggled !== undefined) return toggled;
    if (!isOfficeType(id)) return true;
    return (this.typeSections().find((s) => s.id === id)?.tasks.length ?? 0) > 0;
  }

  toggleTask(taskId: number): void {
    this.expandedTaskId.set(this.expandedTaskId() === taskId ? null : taskId);
  }

  /** A futtató a feladatra kötött, különben a feladatsor-szintű create_lite.sql-t használja. */
  hasLiteSqlFor(taskId: number): boolean {
    return (this.store.selectedDetail()?.files ?? []).some((f) => f.kind === 'CreateLiteSql' && (f.taskId == null || f.taskId === taskId));
  }

  /** Mentés után a mentett részfeladatok kódrészlet-piszkozatai a szerver állapotára állnak (a tanár ezt választotta). */
  onSqlQueriesSaved(taskSetId: number, subTaskIds: number[]): void {
    this.snippets.release(subTaskIds);
    this.store.loadDetail(taskSetId);
  }

  // ── „Új feladat” (típus-blokkonként) ───────────────────────────────────

  /** Típusonként külön „Új feladat” űrlap-draft - a típus a blokk szintjén implicit, nem választógomb. */
  private readonly newTaskDrafts = signal<Record<number, NewTaskDraft>>(
    Object.fromEntries(TASK_TYPES.map((t) => [t.id, emptyNewTaskDraft()])),
  );

  newTaskDraft(typeId: number): NewTaskDraft | undefined {
    return this.newTaskDrafts()[typeId];
  }

  patchNewTaskDraft(typeId: number, patch: Partial<NewTaskDraft>): void {
    this.newTaskDrafts.update((current) => ({ ...current, [typeId]: { ...(current[typeId] ?? emptyNewTaskDraft()), ...patch } }));
  }

  /** UI-TT-61: a „Hozzáadás” gomb [disabled]-je is trim-el, különben whitespace-only cím mellett néma no-op lenne.
   *  UI-TT-90: a backend a leírást is kötelezővé teszi ([Required] Description), ezért azt is ellenőrzi. */
  isTaskDraftTitleBlank(typeId: number): boolean {
    const draft = this.newTaskDraft(typeId);
    return !draft?.title.trim() || !draft?.description.trim();
  }

  // UI-TT-191: a backend CreateTeacherTaskRequest.MaxPoints [Range(1, 1000)]-jét tükrözi kliens-oldalon, hogy a
  // „Hozzáadás” ne küldjön garantáltan 400-at (nyers, angol DataAnnotations-szöveggel) eredményező értéket.
  isTaskDraftMaxPointsInvalid(typeId: number): boolean {
    const maxPoints = this.newTaskDraft(typeId)?.maxPoints;
    return maxPoints == null || maxPoints < 1 || maxPoints > 1000;
  }

  addTask(taskSetId: number, typeId: number): void {
    // UI-TT-115: dupla-kattintás / gyors kettős Enter ellen, amíg az első kérés fut - a mögöttes POST nem idempotens.
    if (this.store.loading()) return;
    const draft = this.newTaskDraft(typeId);
    if (!draft?.title.trim() || !draft?.description.trim()) return; // UI-TT-90
    if (this.isTaskDraftMaxPointsInvalid(typeId)) return; // UI-TT-191
    this.store.addTask(
      taskSetId,
      { title: draft.title.trim(), description: draft.description.trim(), maxPoints: draft.maxPoints, taskTypeIds: [typeId] },
      () => {
        // UI-TT-25: a draftot csak SIKERES mentés után ürítjük, különben egy lassú/sikertelen kérésnél elveszne.
        this.newTaskDrafts.update((current) => ({ ...current, [typeId]: emptyNewTaskDraft() }));
        this.toastService.success('Feladat hozzáadva.');
      },
    );
  }

  async deleteTask(taskSetId: number, taskId: number, taskTitle: string): Promise<void> {
    // UI-TT-140: a megerősítés megnevezi a feladatot - az ÖSSZES részfeladatát is törli.
    const ok = await this.confirmService.ask({
      message: `Biztosan törlöd a(z) "${taskTitle}" feladatot a részfeladataival együtt?`,
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    // UI-TT-115/123: a dialógus alatt egy másik mutáció elindulhatott, a mögöttes mutateAndReload() nem idempotens.
    if (this.store.loading()) return;
    this.store.deleteTask(taskSetId, taskId, () => this.toastService.success('Feladat törölve.'));
  }

  // ── „Új részfeladat” (feladatonként) ───────────────────────────────────

  /** Feladatonként (task.id) külön draft - különben a mentetlen szöveg/pont task-váltáskor csendben átkerülne
   *  az újonnan kiválasztott feladathoz (UI-TT-66). */
  private readonly newSubTaskDrafts = signal<Record<number, NewSubTaskDraft>>({});

  newSolutionDraft(taskId: number): Readonly<NewSubTaskDraft> {
    return this.newSubTaskDrafts()[taskId] ?? EMPTY_SUBTASK_DRAFT;
  }

  /** UI-TT-81: a „Hozzáadás” gomb [disabled]-je is trim-el (különben néma no-op). */
  isSolutionDraftDescriptionBlank(taskId: number): boolean {
    return !this.newSolutionDraft(taskId).description.trim();
  }

  setNewSolutionDescription(taskId: number, value: string): void {
    this.patchNewSubTaskDraft(taskId, { description: value });
  }

  setNewSolutionPoints(taskId: number, value: number): void {
    this.patchNewSubTaskDraft(taskId, { points: value });
  }

  private patchNewSubTaskDraft(taskId: number, patch: Partial<NewSubTaskDraft>): void {
    this.newSubTaskDrafts.update((current) => ({ ...current, [taskId]: { ...(current[taskId] ?? EMPTY_SUBTASK_DRAFT), ...patch } }));
  }

  addSubTask(taskSetId: number, taskId: number): void {
    if (this.store.loading()) return; // UI-TT-115, ld. addTask()
    const draft = this.newSolutionDraft(taskId);
    if (!draft.description.trim()) return;
    this.store.addSubTask(taskSetId, taskId, { description: draft.description.trim(), points: draft.points }, () => {
      // UI-TT-25 testvér-esete: a draftot csak sikeres mentés után ürítjük.
      this.newSubTaskDrafts.update((current) => ({ ...current, [taskId]: { ...EMPTY_SUBTASK_DRAFT } }));
      this.toastService.success('Részfeladat hozzáadva.');
    });
  }

  async deleteSubTask(taskSetId: number, solutionId: number, solutionLabel: string): Promise<void> {
    const ok = await this.confirmService.ask({
      message: `Biztosan törlöd a(z) "${solutionLabel}" részfeladatot?`,
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    if (this.store.loading()) return; // ld. deleteTask()
    this.store.deleteSubTask(taskSetId, solutionId, () => this.toastService.success('Részfeladat törölve.'));
  }

  /** UI-TT-238: van-e mentetlen módosítás a feladatokon - nyitott (módosított) feladat- vagy részfeladat-szerkesztés,
   *  kitöltött „Új feladat” / „Új részfeladat” űrlap, mentetlen kódrészlet. */
  hasUnsavedChanges(detail: TeacherTaskSetDetailDto): boolean {
    return this.edit.hasUnsavedChanges(detail)
      || Object.values(this.newTaskDrafts()).some((d) => d.title.trim() || d.description.trim())
      || Object.values(this.newSubTaskDrafts()).some((d) => d.description.trim())
      || this.snippets.hasUnsavedChanges();
  }
}
