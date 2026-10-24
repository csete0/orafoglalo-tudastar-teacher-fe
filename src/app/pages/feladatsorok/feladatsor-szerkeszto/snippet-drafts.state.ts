import { effect, inject, Injectable, signal } from '@angular/core';
import { SnippetDto, TeacherSubTaskDto, TeacherTaskDto } from '../../../models/teacher-content.model';
import { TeacherTaskSetStore } from '../../../services/teacher-taskset/teacher-taskset.store';
import { ToastService } from '../../../shared/toast/toast.service';

/** {solutionId vagy taskId (complete-solution-höz negatív előjellel)}: {languageId: code} */
type SnippetDraft = Record<number, Record<number, string>>;

/**
 * A kódrészlet-piszkozatok (részfeladatonként és a feladat összevont megoldása) nyelvenként. A szerkesztő komponens
 * adja (`providers`), így egy feladat bezárása / újranyitása nem dobja el a mentetlen kódot.
 */
@Injectable()
export class SnippetDraftsState {
  private readonly store = inject(TeacherTaskSetStore);
  private readonly toastService = inject(ToastService);

  readonly loading = this.store.loading;

  private readonly drafts = signal<SnippetDraft>({});
  // Azon draft-kulcsok (solutionId / completeSolutionKey), amelyeken a tanár MÉG NEM mentett módosítást gépelt be -
  // a lenti effect ezeket nem írja felül egy FÜGGETLEN, máshol lezajlott mentés utáni újratöltéskor (UI-TT-40).
  private readonly dirtyDraftKeys = signal<Set<number>>(new Set());

  constructor() {
    // A drafteket a szerver-állapotból töltjük - mentés után a store újratölti a detailt, így az ÉRINTETT draft a
    // legutóbb mentett állapotra áll. DE ez a reload MINDEN sikeres mutációra lefut, ezért a még „piszkos” kulcsokat
    // itt NEM írjuk felül, különben egy független mentés csendben eldobná egy MÁSIK, mentetlen kódrészlet-piszkozatot.
    effect(() => {
      const detail = this.store.selectedDetail();
      if (!detail) return;

      const dirty = this.dirtyDraftKeys();
      this.drafts.update((current) => {
        const next: SnippetDraft = { ...current };
        for (const task of detail.tasks) {
          for (const solution of task.subTasks) {
            if (dirty.has(solution.id)) continue;
            next[solution.id] = Object.fromEntries(solution.snippets.map((s) => [s.programmingLanguageId, s.code]));
          }
          const completeKey = this.completeSolutionKey(task.id);
          if (dirty.has(completeKey)) continue;
          next[completeKey] = Object.fromEntries(task.completeSolutionSnippets.map((s) => [s.programmingLanguageId, s.code]));
        }
        return next;
      });
    });
  }

  /** Negatív kulcs, hogy ne ütközzön a valódi (pozitív) solutionId-kal. */
  completeSolutionKey(taskId: number): number {
    return -taskId;
  }

  draftCode(key: number, languageId: number): string {
    return this.drafts()[key]?.[languageId] ?? '';
  }

  setDraftCode(key: number, languageId: number, code: string): void {
    this.drafts.update((current) => ({ ...current, [key]: { ...current[key], [languageId]: code } }));
    // A kulcs „piszkos” marad, amíg a mentése tényleg le nem fut (UI-TT-40).
    this.dirtyDraftKeys.update((current) => new Set(current).add(key));
  }

  /** A kulcsok piszkozatai a következő újratöltéskor a szerver állapotára állnak (pl. MI-vel mentett lekérdezések után). */
  release(keys: number[]): void {
    this.dirtyDraftKeys.update((current) => {
      const next = new Set(current);
      for (const key of keys) next.delete(key);
      return next;
    });
  }

  /** UI-TT-238: van-e mentetlen kódrészlet. */
  hasUnsavedChanges(): boolean {
    return this.dirtyDraftKeys().size > 0;
  }

  private clearDirtyDraft(key: number): void {
    this.dirtyDraftKeys.update((current) => {
      if (!current.has(key)) return current;
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }

  private snippetsFromDraft(key: number): SnippetDto[] {
    const entry = this.drafts()[key] ?? {};
    return Object.entries(entry)
      .filter(([, code]) => code.trim().length > 0)
      .map(([languageId, code]) => ({ programmingLanguageId: Number(languageId), code }));
  }

  saveSnippets(taskSetId: number, solution: TeacherSubTaskDto): void {
    const snippets = this.snippetsFromDraft(solution.id);
    // Ha nincs korábban mentett kódrészlet, az üres mentés no-op (UI-TT-13) - de ha VOLT, az üres mezők a tanár
    // törlési szándékát jelentik (a backend upsert teljes-csere szemantikájú, üres tömb = törlés).
    if (snippets.length === 0 && solution.snippets.length === 0) {
      this.toastService.warning('Nincs megadva kódrészlet egyik nyelven sem — nincs mit menteni.');
      return;
    }
    this.store.upsertSubTaskSnippets(taskSetId, solution.id, snippets, () => {
      this.clearDirtyDraft(solution.id);
      this.toastService.success(snippets.length === 0 ? 'Kódrészletek törölve.' : 'Kódrészletek mentve.');
    });
  }

  saveCompleteSolutionSnippets(taskSetId: number, task: TeacherTaskDto): void {
    const key = this.completeSolutionKey(task.id);
    const snippets = this.snippetsFromDraft(key);
    if (snippets.length === 0 && task.completeSolutionSnippets.length === 0) {
      this.toastService.warning('Nincs megadva kódrészlet egyik nyelven sem — nincs mit menteni.');
      return;
    }
    this.store.upsertCompleteSolutionSnippets(taskSetId, task.id, snippets, () => {
      this.clearDirtyDraft(key);
      this.toastService.success(snippets.length === 0 ? 'Összevont megoldás törölve.' : 'Összevont megoldás mentve.');
    });
  }
}
