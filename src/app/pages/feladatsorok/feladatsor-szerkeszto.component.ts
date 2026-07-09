import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { SchoolStore } from '../../services/school/school.store';
import { SnippetDto, TeacherFileKind, TeacherSolutionDto, TeacherTaskDto } from '../../models/teacher-content.model';

const LANGUAGES: { id: number; name: string }[] = [
  { id: 2, name: 'Python' },
  { id: 5, name: 'C#' },
  { id: 7, name: 'JavaScript' },
  { id: 8, name: 'C++' },
  { id: 10, name: 'Java' },
  { id: 6, name: 'SQL' },
];
const SQL_LANGUAGE_ID = 6;

const TASK_TYPES: { id: number; label: string }[] = [
  { id: 6, label: 'Programozás' },
  { id: 5, label: 'SQL' },
];

const FILE_KINDS: { kind: TeacherFileKind; label: string; accept: string }[] = [
  { kind: 'InputTxt', label: 'Bemeneti fájl (.txt)', accept: '.txt' },
  { kind: 'CreateSql', label: 'create.sql', accept: '.sql' },
  { kind: 'CreateLiteSql', label: 'create_lite.sql (SQLite)', accept: '.sql' },
  { kind: 'SolutionPdf', label: 'Megoldás PDF', accept: '.pdf' },
];

/** {solutionId vagy taskId (complete-solution-höz negatív előjellel)}: {languageId: code} */
type SnippetDraft = Record<number, Record<number, string>>;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsor-szerkeszto',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    @if (store.selectedDetail(); as detail) {
      <div class="max-w-4xl mx-auto px-4 py-10">
        <div class="flex justify-between items-start mb-6">
          <div>
            <h1 class="text-xl font-semibold">{{ detail.title }}</h1>
            <p class="text-text-muted text-sm">{{ detail.taskCount }} feladat · {{ detail.isPublished ? 'Publikált' : 'Piszkozat' }}</p>
          </div>
          <div class="flex gap-2 items-center">
            @if (detail.isPublished) {
              <a [routerLink]="['/feladatsorok', detail.id, 'eredmenyek']" class="text-sm text-primary hover:underline">Eredmények</a>
            }
            <button (click)="publish(detail.id)" [disabled]="detail.isPublished || store.loading()"
              class="rounded bg-primary hover:bg-primary-hover text-white px-4 py-2 disabled:opacity-50">
              {{ detail.isPublished ? 'Publikálva' : 'Publikálás' }}
            </button>
          </div>
        </div>

        @if (store.error()) {
          <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
        }

        @if (store.publishResult(); as result) {
          @if (!result.success) {
            <ul class="bg-bg-element border border-danger rounded-lg p-4 mb-6 text-sm text-danger space-y-1">
              @for (err of result.errors; track err) {
                <li>{{ err }}</li>
              }
            </ul>
          }
        }

        @if (!sqlFilesPaired()) {
          <p class="bg-bg-element border border-warning rounded-lg p-3 mb-6 text-sm text-warning">
            SQL-kódrészletet találtam a feladatsorban — a create.sql ÉS a create_lite.sql fájl is kötelező (a futtató
            SQLite-ot használ), publikálás előtt mindkettőt fel kell tölteni.
          </p>
        }

        <!-- ── Feladatok ────────────────────────────────────────── -->
        <section class="mb-8">
          <h2 class="font-medium mb-3">Feladatok</h2>

          @for (task of detail.tasks; track task.id) {
            <div class="bg-bg-panel border border-border-default rounded-lg p-4 mb-3">
              <div class="flex justify-between items-start">
                <button (click)="toggleTask(task.id)" class="text-left flex-1">
                  <p class="font-medium">{{ task.taskOrder }}. {{ task.title }}</p>
                  <p class="text-sm text-text-muted">{{ task.maxPoints }} pont · {{ task.solutions.length }} részfeladat</p>
                </button>
                <button (click)="deleteTask(detail.id, task.id)" class="text-sm text-danger hover:underline">Törlés</button>
              </div>

              @if (expandedTaskId() === task.id) {
                <div class="mt-4 pl-4 border-l-2 border-border-default space-y-4">
                  <!-- Részfeladatok -->
                  @for (solution of task.solutions; track solution.id) {
                    <div class="bg-bg-element rounded p-3">
                      <div class="flex justify-between items-start mb-2">
                        <p class="text-sm font-medium">{{ solution.solutionText || ('#' + solution.id) }} ({{ solution.points ?? 0 }} pont)</p>
                        <button (click)="deleteSolution(detail.id, solution.id)" class="text-sm text-danger hover:underline">Törlés</button>
                      </div>
                      <p class="text-sm text-text-muted mb-2">{{ solution.description }}</p>

                      <div class="grid grid-cols-2 gap-2">
                        @for (lang of languages; track lang.id) {
                          <div>
                            <label class="text-xs text-text-muted">{{ lang.name }}</label>
                            <textarea rows="3"
                              [ngModel]="draftCode(solution.id, lang.id)"
                              (ngModelChange)="setDraftCode(solution.id, lang.id, $event)"
                              class="w-full rounded border border-border-default bg-bg-panel px-2 py-1 text-xs font-mono"></textarea>
                          </div>
                        }
                      </div>
                      <button (click)="saveSnippets(detail.id, solution)"
                        class="mt-2 rounded bg-primary hover:bg-primary-hover text-white text-sm px-3 py-1">
                        Kódrészletek mentése
                      </button>
                    </div>
                  }

                  <form (ngSubmit)="addSolution(detail.id, task.id)" class="flex gap-2 items-end">
                    <div class="flex-1">
                      <label class="text-xs text-text-muted">Új részfeladat szövege</label>
                      <input [(ngModel)]="newSolutionDescription" name="newSolutionDescription"
                        class="w-full rounded border border-border-default bg-bg-element px-2 py-1 text-sm" />
                    </div>
                    <div class="w-20">
                      <label class="text-xs text-text-muted">Pont</label>
                      <input type="number" [(ngModel)]="newSolutionPoints" name="newSolutionPoints"
                        class="w-full rounded border border-border-default bg-bg-element px-2 py-1 text-sm" />
                    </div>
                    <button type="submit" [disabled]="!newSolutionDescription"
                      class="rounded bg-primary hover:bg-primary-hover text-white text-sm px-3 py-1.5 disabled:opacity-50">
                      Hozzáadás
                    </button>
                  </form>

                  <!-- Összevont megoldás -->
                  <div class="bg-bg-element rounded p-3">
                    <p class="text-sm font-medium mb-2">Összevont megoldás</p>
                    <div class="grid grid-cols-2 gap-2">
                      @for (lang of languages; track lang.id) {
                        <div>
                          <label class="text-xs text-text-muted">{{ lang.name }}</label>
                          <textarea rows="3"
                            [ngModel]="draftCode(completeSolutionKey(task.id), lang.id)"
                            (ngModelChange)="setDraftCode(completeSolutionKey(task.id), lang.id, $event)"
                            class="w-full rounded border border-border-default bg-bg-panel px-2 py-1 text-xs font-mono"></textarea>
                        </div>
                      }
                    </div>
                    <button (click)="saveCompleteSolutionSnippets(detail.id, task)"
                      class="mt-2 rounded bg-primary hover:bg-primary-hover text-white text-sm px-3 py-1">
                      Összevont megoldás mentése
                    </button>
                  </div>
                </div>
              }
            </div>
          } @empty {
            <p class="text-text-muted text-sm">Még nincs feladat.</p>
          }

          <form (ngSubmit)="addTask(detail.id)" class="bg-bg-panel border border-border-default rounded-lg p-4 space-y-2">
            <p class="font-medium text-sm">Új feladat</p>
            <input [(ngModel)]="newTaskTitle" name="newTaskTitle" placeholder="Cím"
              class="w-full rounded border border-border-default bg-bg-element px-2 py-1.5 text-sm" />
            <textarea [(ngModel)]="newTaskDescription" name="newTaskDescription" placeholder="Leírás" rows="2"
              class="w-full rounded border border-border-default bg-bg-element px-2 py-1.5 text-sm"></textarea>
            <div class="flex gap-2 items-end">
              <div>
                <label class="text-xs text-text-muted">Max pont</label>
                <input type="number" [(ngModel)]="newTaskMaxPoints" name="newTaskMaxPoints"
                  class="rounded border border-border-default bg-bg-element px-2 py-1.5 text-sm w-24" />
              </div>
              <div class="flex gap-3 text-sm">
                @for (type of taskTypes; track type.id) {
                  <label class="flex items-center gap-1">
                    <input type="checkbox" [checked]="newTaskTypeIds.includes(type.id)" (change)="toggleTaskType(type.id)" />
                    {{ type.label }}
                  </label>
                }
              </div>
              <button type="submit" [disabled]="!newTaskTitle"
                class="rounded bg-primary hover:bg-primary-hover text-white text-sm px-3 py-1.5 disabled:opacity-50">
                Hozzáadás
              </button>
            </div>
          </form>
        </section>

        <!-- ── Fájlok ───────────────────────────────────────────── -->
        <section>
          <h2 class="font-medium mb-3">Fájlok</h2>
          <ul class="space-y-2 mb-4">
            @for (file of detail.files; track file.id) {
              <li class="flex justify-between bg-bg-panel border border-border-default rounded-lg p-3 text-sm">
                <span>{{ file.originalFileName }} ({{ fileKindLabel(file.kind) }})</span>
                <div class="flex items-center gap-3">
                  <a [href]="apiOrigin + file.url" target="_blank" class="text-primary hover:underline">Megnyitás</a>
                  <button (click)="deleteFile(detail.id, file.id)" class="text-danger hover:underline">Törlés</button>
                </div>
              </li>
            }
          </ul>

          <div class="grid grid-cols-2 gap-3">
            @for (kindOption of fileKinds; track kindOption.kind) {
              <div class="bg-bg-panel border border-border-default rounded-lg p-3">
                <label class="text-sm block mb-1">{{ kindOption.label }}</label>
                <input type="file" [accept]="kindOption.accept"
                  (change)="uploadFile(detail.id, kindOption.kind, $event)" class="text-sm" />
              </div>
            }
          </div>
        </section>
      </div>
    } @else if (store.loading()) {
      <p class="text-text-muted text-center py-10">Betöltés…</p>
    } @else {
      <p class="text-danger text-center py-10">{{ store.error() }}</p>
    }
  `,
})
export class FeladatsorSzerkesztoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(TeacherTaskSetStore);
  private readonly schoolStore = inject(SchoolStore);

  readonly languages = LANGUAGES;
  readonly taskTypes = TASK_TYPES;
  readonly fileKinds = FILE_KINDS;
  readonly apiOrigin = new URL(location.origin).origin.replace(':4300', ':7083');

  readonly expandedTaskId = signal<number | null>(null);
  private readonly drafts = signal<SnippetDraft>({});

  newTaskTitle = '';
  newTaskDescription = '';
  newTaskMaxPoints = 10;
  newTaskTypeIds: number[] = [];

  newSolutionDescription = '';
  newSolutionPoints = 5;

  /** SQL-kódrészlet esetén a publikáláshoz create.sql + create_lite.sql pár kell. */
  readonly sqlFilesPaired = computed(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return true;

    const usesSql = detail.tasks.some((t) =>
      t.solutions.some((s) => s.snippets.some((sn) => sn.programmingLanguageId === SQL_LANGUAGE_ID)),
    );
    if (!usesSql) return true;

    const kinds = new Set(detail.files.map((f) => f.kind));
    return kinds.has('CreateSql') && kinds.has('CreateLiteSql');
  });

  constructor() {
    // A drafteket a szerver-állapotból töltjük — mentés után a store úgyis
    // újratölti a detailt, ezért a draft mindig a legutóbb mentett állapotra
    // áll vissza (ez a szándékolt, egyszerű viselkedés).
    effect(() => {
      const detail = this.store.selectedDetail();
      if (!detail) return;

      const next: SnippetDraft = {};
      for (const task of detail.tasks) {
        for (const solution of task.solutions) {
          next[solution.id] = Object.fromEntries(solution.snippets.map((s) => [s.programmingLanguageId, s.code]));
        }
        next[this.completeSolutionKey(task.id)] = Object.fromEntries(
          task.completeSolutionSnippets.map((s) => [s.programmingLanguageId, s.code]),
        );
      }
      this.drafts.set(next);
    });

    this.schoolStore.loadMine();
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.store.loadDetail(id);
  }

  toggleTask(taskId: number): void {
    this.expandedTaskId.set(this.expandedTaskId() === taskId ? null : taskId);
  }

  toggleTaskType(typeId: number): void {
    this.newTaskTypeIds = this.newTaskTypeIds.includes(typeId)
      ? this.newTaskTypeIds.filter((id) => id !== typeId)
      : [...this.newTaskTypeIds, typeId];
  }

  /** Negatív kulcs, hogy ne ütközzön a valódi (pozitív) solutionId-kal. */
  completeSolutionKey(taskId: number): number {
    return -taskId;
  }

  draftCode(key: number, languageId: number): string {
    return this.drafts()[key]?.[languageId] ?? '';
  }

  setDraftCode(key: number, languageId: number, code: string): void {
    this.drafts.update((current) => ({
      ...current,
      [key]: { ...current[key], [languageId]: code },
    }));
  }

  private snippetsFromDraft(key: number): SnippetDto[] {
    const entry = this.drafts()[key] ?? {};
    return Object.entries(entry)
      .filter(([, code]) => code.trim().length > 0)
      .map(([languageId, code]) => ({ programmingLanguageId: Number(languageId), code }));
  }

  saveSnippets(taskSetId: number, solution: TeacherSolutionDto): void {
    const snippets = this.snippetsFromDraft(solution.id);
    if (snippets.length === 0) return;
    this.store.upsertSolutionSnippets(taskSetId, solution.id, snippets);
  }

  saveCompleteSolutionSnippets(taskSetId: number, task: TeacherTaskDto): void {
    const snippets = this.snippetsFromDraft(this.completeSolutionKey(task.id));
    if (snippets.length === 0) return;
    this.store.upsertCompleteSolutionSnippets(taskSetId, task.id, snippets);
  }

  addTask(taskSetId: number): void {
    if (!this.newTaskTitle.trim()) return;
    this.store.addTask(taskSetId, {
      title: this.newTaskTitle.trim(),
      description: this.newTaskDescription.trim(),
      maxPoints: this.newTaskMaxPoints,
      taskTypeIds: this.newTaskTypeIds,
    });
    this.newTaskTitle = '';
    this.newTaskDescription = '';
    this.newTaskMaxPoints = 10;
    this.newTaskTypeIds = [];
  }

  deleteTask(taskSetId: number, taskId: number): void {
    if (!confirm('Biztosan törlöd a feladatot a részfeladataival együtt?')) return;
    this.store.deleteTask(taskSetId, taskId);
  }

  addSolution(taskSetId: number, taskId: number): void {
    if (!this.newSolutionDescription.trim()) return;
    this.store.addSolution(taskSetId, taskId, {
      description: this.newSolutionDescription.trim(),
      points: this.newSolutionPoints,
    });
    this.newSolutionDescription = '';
    this.newSolutionPoints = 5;
  }

  deleteSolution(taskSetId: number, solutionId: number): void {
    if (!confirm('Biztosan törlöd a részfeladatot?')) return;
    this.store.deleteSolution(taskSetId, solutionId);
  }

  uploadFile(taskSetId: number, kind: TeacherFileKind, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.store.uploadFile(taskSetId, kind, file);
    input.value = '';
  }

  deleteFile(taskSetId: number, fileId: string): void {
    if (!confirm('Biztosan törlöd a fájlt?')) return;
    this.store.deleteFile(taskSetId, fileId);
  }

  fileKindLabel(kind: TeacherFileKind): string {
    return this.fileKinds.find((k) => k.kind === kind)?.label ?? kind;
  }

  publish(taskSetId: number): void {
    if (this.schoolStore.schools().length > 0) {
      const confirmed = confirm(
        'Publikálás után az intézményed MINDEN iskolai csoportjának diákjai is elérik ezt a feladatsort (tartalom-megosztás). Folytatod?',
      );
      if (!confirmed) return;
    }
    this.store.publish(taskSetId);
  }
}
