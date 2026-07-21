import { ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { SchoolStore } from '../../services/school/school.store';
import { AuthorizedFileService } from '../../services/file/authorized-file.service';
import { SnippetDto, TeacherFileDto, TeacherFileKind, TeacherSolutionDto, TeacherTaskDto } from '../../models/teacher-content.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { environment } from '../../../environments/environment';

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
  imports: [FormsModule, RouterLink, IconComponent, LocalSpinnerComponent],
  template: `
    @if (store.selectedDetail(); as detail) {
      <div class="max-w-4xl mx-auto px-4 py-10">
        <div class="flex justify-between items-start mb-6 gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-2xl font-black tracking-tight truncate min-w-0">{{ detail.title }}</h1>
              <span class="badge" [class]="detail.isPublished ? 'badge-success' : 'badge-warning'">
                {{ detail.isPublished ? 'Publikált' : 'Piszkozat' }}</span>
            </div>
            <p class="text-text-muted text-sm mt-1">{{ detail.taskCount }} feladat</p>
          </div>
          <div class="flex gap-2 items-center shrink-0">
            @if (detail.isPublished) {
              <a [routerLink]="['/feladatsorok', detail.id, 'eredmenyek']" class="text-sm text-primary hover:underline">Eredmények</a>
            }
            <button (click)="publish(detail.id)" [disabled]="detail.isPublished || store.loading()"
              data-testid="publish-button" class="btn btn-primary">
              {{ detail.isPublished ? 'Publikálva' : 'Publikálás' }}
            </button>
          </div>
        </div>

        @if (store.error()) {
          <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
        }

        @if (store.publishResult(); as result) {
          @if (!result.success) {
            <ul class="bg-danger-subtle border border-danger/40 rounded-xl p-4 mb-6 text-sm text-danger space-y-1">
              @for (err of result.errors; track err) {
                <li>{{ err }}</li>
              }
            </ul>
          }
        }

        @if (!sqlFilesPaired()) {
          <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 mb-6 text-sm text-warning flex items-start gap-2">
            <app-icon name="warning-triangle" class="w-5 h-5 block shrink-0" />
            <span>SQL-kódrészletet találtam a feladatsorban — a create.sql ÉS a create_lite.sql fájl is kötelező (a futtató
            SQLite-ot használ), publikálás előtt mindkettőt fel kell tölteni.</span>
          </p>
        }

        <!-- ── Feladatok, típusonként összecsukható blokkokban ─────── -->
        <section class="mb-8">
          <h2 class="font-bold mb-3">Feladatok</h2>

          @for (section of typeSections(); track section.id) {
            <div class="card !rounded-xl mb-4 overflow-hidden">
              <button (click)="toggleSection(section.id)"
                class="w-full flex items-center justify-between gap-2 p-4 text-left group">
                <span class="flex items-center gap-3 min-w-0">
                  <div class="icon-tile shrink-0"
                    [class]="section.isOther ? 'icon-tile-neutral' : (section.id === 6 ? 'icon-tile-primary' : 'icon-tile-secondary')">
                    <app-icon [name]="section.icon" class="w-5 h-5 block" />
                  </div>
                  <span class="font-bold group-hover:text-primary transition-colors truncate">{{ section.label }}</span>
                  <span class="badge badge-neutral shrink-0">{{ section.tasks.length }} db</span>
                </span>
                <app-icon name="chevron-down" class="w-5 h-5 block text-text-muted transition-transform shrink-0"
                  [class.-rotate-90]="!isSectionExpanded(section.id)" />
              </button>

              @if (isSectionExpanded(section.id)) {
                <div class="px-4 pb-4 space-y-3">
                  @for (task of section.tasks; track task.id) {
                    <div class="bg-bg-element rounded-xl p-4">
                      <div class="flex justify-between items-start gap-2">
                        <button (click)="toggleTask(task.id)" class="text-left flex-1 flex items-start gap-2 group">
                          <app-icon name="chevron-down" class="w-4 h-4 block mt-1 shrink-0 text-text-muted transition-transform"
                            [class.-rotate-90]="expandedTaskId() !== task.id" />
                          <span class="min-w-0 flex-1">
                            <p class="font-medium group-hover:text-primary transition-colors truncate">{{ task.taskOrder }}. {{ task.title }}</p>
                            <p class="text-sm text-text-muted">{{ task.maxPoints }} pont · {{ task.solutions.length }} részfeladat</p>
                          </span>
                        </button>
                        <button (click)="deleteTask(detail.id, task.id)" class="text-sm text-danger hover:underline shrink-0">Törlés</button>
                      </div>

                      @if (expandedTaskId() === task.id) {
                        <div class="mt-4 pl-4 border-l-2 border-border-default space-y-4">
                          <!-- Részfeladatok -->
                          @for (solution of task.solutions; track solution.id) {
                            <div class="bg-bg-panel rounded-xl p-3">
                              <div class="flex justify-between items-start gap-2 mb-2">
                                <p class="text-sm font-medium min-w-0 flex-1 truncate">{{ solution.solutionText || ('#' + solution.id) }} ({{ solution.points ?? 0 }} pont)</p>
                                <button (click)="deleteSolution(detail.id, solution.id)" class="text-sm text-danger hover:underline shrink-0">Törlés</button>
                              </div>
                              <p class="text-sm text-text-muted mb-2 break-words">{{ solution.description }}</p>

                              <div class="grid grid-cols-2 gap-2">
                                @for (lang of languages; track lang.id) {
                                  <div>
                                    <label class="text-xs text-text-muted">{{ lang.name }}</label>
                                    <textarea rows="3"
                                      [ngModel]="draftCode(solution.id, lang.id)"
                                      (ngModelChange)="setDraftCode(solution.id, lang.id, $event)"
                                      class="input !bg-bg-element !px-2 !py-1 !text-xs font-mono"></textarea>
                                  </div>
                                }
                              </div>
                              <button (click)="saveSnippets(detail.id, solution)"
                                class="btn btn-primary mt-2 !px-3 !py-1">
                                Kódrészletek mentése
                              </button>
                            </div>
                          }

                          <form (ngSubmit)="addSolution(detail.id, task.id)" class="flex gap-2 items-end">
                            <div class="flex-1">
                              <label class="text-xs text-text-muted">Új részfeladat szövege</label>
                              <input [ngModel]="newSolutionDraft(task.id).description"
                                (ngModelChange)="setNewSolutionDescription(task.id, $event)" name="newSolutionDescription"
                                class="input !px-2 !py-1" />
                            </div>
                            <div class="w-20">
                              <label class="text-xs text-text-muted">Pont</label>
                              <input type="number" [ngModel]="newSolutionDraft(task.id).points"
                                (ngModelChange)="setNewSolutionPoints(task.id, $event)" name="newSolutionPoints"
                                class="input !px-2 !py-1" />
                            </div>
                            <button type="submit" [disabled]="isSolutionDraftDescriptionBlank(task.id)"
                              class="btn btn-primary !px-3 !py-1.5">
                              Hozzáadás
                            </button>
                          </form>

                          <!-- Összevont megoldás -->
                          <div class="bg-bg-panel rounded-xl p-3">
                            <p class="text-sm font-medium mb-2">Összevont megoldás</p>
                            <div class="grid grid-cols-2 gap-2">
                              @for (lang of languages; track lang.id) {
                                <div>
                                  <label class="text-xs text-text-muted">{{ lang.name }}</label>
                                  <textarea rows="3"
                                    [ngModel]="draftCode(completeSolutionKey(task.id), lang.id)"
                                    (ngModelChange)="setDraftCode(completeSolutionKey(task.id), lang.id, $event)"
                                    class="input !bg-bg-element !px-2 !py-1 !text-xs font-mono"></textarea>
                                </div>
                              }
                            </div>
                            <button (click)="saveCompleteSolutionSnippets(detail.id, task)"
                              class="btn btn-primary mt-2 !px-3 !py-1">
                              Összevont megoldás mentése
                            </button>
                          </div>
                        </div>
                      }
                    </div>
                  } @empty {
                    <p class="text-sm text-text-muted">Még nincs ilyen típusú feladat.</p>
                  }

                  @if (!section.isOther) {
                    <form (ngSubmit)="addTask(detail.id, section.id)" class="bg-bg-element rounded-xl p-4 space-y-2">
                      <p class="font-semibold text-sm">Új {{ section.label }} feladat</p>
                      <input [(ngModel)]="newTaskDrafts[section.id].title" [attr.name]="'newTaskTitle-' + section.id"
                        [ngModelOptions]="{standalone: true}" placeholder="Cím" class="input !bg-bg-panel !px-2 !py-1.5" />
                      <textarea [(ngModel)]="newTaskDrafts[section.id].description" [attr.name]="'newTaskDescription-' + section.id"
                        [ngModelOptions]="{standalone: true}" placeholder="Leírás" rows="2" class="input !bg-bg-panel !px-2 !py-1.5"></textarea>
                      <div class="flex gap-2 items-end">
                        <div>
                          <label class="text-xs text-text-muted">Max pont</label>
                          <input type="number" [(ngModel)]="newTaskDrafts[section.id].maxPoints" [attr.name]="'newTaskMaxPoints-' + section.id"
                            [ngModelOptions]="{standalone: true}" class="input !bg-bg-panel !px-2 !py-1.5 !w-24" />
                        </div>
                        <button type="submit" [disabled]="isTaskDraftTitleBlank(section.id)"
                          class="btn btn-primary !px-3 !py-1.5">
                          Hozzáadás
                        </button>
                      </div>
                    </form>
                  }
                </div>
              }
            </div>
          }
        </section>

        <!-- ── Fájlok ───────────────────────────────────────────── -->
        <section>
          <h2 class="font-bold mb-3">Fájlok</h2>
          <ul class="space-y-2 mb-4">
            @for (file of detail.files; track file.id) {
              <li class="flex justify-between items-center card !rounded-xl p-3 text-sm">
                <span class="flex items-center gap-2 min-w-0">
                  <app-icon name="document" class="w-4 h-4 block text-text-muted shrink-0" />
                  <span class="truncate">{{ file.originalFileName }} ({{ fileKindLabel(file.kind) }})</span>
                </span>
                <div class="flex items-center gap-3 shrink-0">
                  <a [href]="downloadHref(file)" target="_blank" class="text-primary hover:underline">Megnyitás</a>
                  <button (click)="deleteFile(detail.id, file.id)" class="text-danger hover:underline">Törlés</button>
                </div>
              </li>
            }
          </ul>

          <div class="grid grid-cols-2 gap-3">
            @for (kindOption of fileKinds; track kindOption.kind) {
              <div class="card !rounded-xl p-3">
                <label class="text-sm block mb-1">{{ kindOption.label }}</label>
                <input type="file" [accept]="kindOption.accept"
                  (change)="uploadFile(detail.id, kindOption.kind, $event)"
                  class="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-hover file:cursor-pointer cursor-pointer" />
              </div>
            }
          </div>
        </section>
      </div>
    } @else if (store.loading()) {
      <app-local-spinner />
    } @else {
      <p class="text-danger text-center py-10">{{ store.error() }}</p>
    }
  `,
})
export class FeladatsorSzerkesztoComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  readonly store = inject(TeacherTaskSetStore);
  private readonly schoolStore = inject(SchoolStore);
  private readonly authorizedFileService = inject(AuthorizedFileService);
  // A publish()-nek meg kell várnia, hogy a schoolStore.loading() lezáruljon, mielőtt
  // a schools() alapján dönt a megerősítő dialógusról (UI-TT-47 load-order race).
  private readonly schoolStoreLoading$ = toObservable(this.schoolStore.loading);

  readonly languages = LANGUAGES;
  readonly taskTypes = TASK_TYPES;
  readonly fileKinds = FILE_KINDS;
  // UI-TT-27: az API origóját a ténylegesen konfigurált environment.apiUrl-ból kell
  // levezetni, nem a jelenlegi böngésző-origóból "sejteni" — utóbbi csak véletlenül
  // esett egybe a backenddel azokon a topológiákon, ahol az /api/ proxyzva van.
  readonly apiOrigin = new URL(environment.apiUrl).origin;

  readonly expandedTaskId = signal<number | null>(null);
  private readonly drafts = signal<SnippetDraft>({});
  // Azon draft-kulcsok (solutionId / completeSolutionKey), amelyeken a tanár MÉG NEM
  // mentett módosítást gépelt be — az effect() ezeket nem írja felül egy FÜGGETLEN,
  // máshol lezajlott sikeres mentés/hozzáadás utáni újratöltéskor (UI-TT-40).
  private readonly dirtyDraftKeys = signal<Set<number>>(new Set());
  // A "Megnyitás" link sima <a href> lenne, a token viszont localStorage-ban
  // van (nem cookie-ban) — nyers navigáció nem viszi magával, 401-et adna.
  // Ezért bearer tokennel lekért blob URL-re oldjuk fel, fileId -> blob URL.
  private readonly resolvedDownloadUrls = signal<Record<string, string>>({});

  /** Típusonként (Programozás/SQL) külön "Új feladat" űrlap-draft — a szerkesztő a feladatokat
   *  típus szerint csoportosítja, összecsukható blokkokban (nincs jelenleg vegyes-típusú
   *  feladatsor-igény, ezért a típus a blokk szintjén implicit, nem választógomb). */
  newTaskDrafts: Record<number, { title: string; description: string; maxPoints: number }> = Object.fromEntries(
    TASK_TYPES.map((t) => [t.id, { title: '', description: '', maxPoints: 10 }]),
  );

  /** Alapból mind kinyitva — a tanár azonnal lássa a meglévő feladatait, ne kelljen
   *  minden megnyitáskor kattintania. */
  readonly expandedSections = signal<Set<number>>(new Set([...TASK_TYPES.map((t) => t.id), 0]));

  /** Feladatonként (task.id) külön "Új részfeladat" űrlap-draft — enélkül a mentetlen
   *  szöveg/pont a task-váltáskor csendben átkerülne az újonnan kiválasztott feladathoz
   *  (UI-TT-66). Lazy-létrehozott bejegyzések, sima objektum (a newTaskDrafts mintáját
   *  követve — OnPush mellett is frissül, mert a bekötő esemény ebben a komponensben
   *  keletkezik). */
  private readonly newSolutionDrafts: Record<number, { description: string; points: number }> = {};

  /** A feladatokat típusonként (Programozás/SQL) csoportosítja a blokkos megjelenítéshez.
   *  A "Egyéb" (id=0) csoport a korábbi, több/nulla típussal mentett feladatoknak ad helyet
   *  (pl. a checkbox→radio váltás előtti adatok) — ezekhez nincs típus-scope-olt hozzáadó űrlap. */
  readonly typeSections = computed(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return [];

    // UI-TT-3: a checkbox→radio átállás előtt KÉT típussal (SQL+Programozás) is
    // menthető volt egy feladat — az .includes()-alapú szűrés ilyenkor mindkét
    // típus-blokkba besorolta ugyanazt a feladatot (duplikáció). Csak a PONTOSAN
    // egy típussal rendelkező feladatok kerülnek a saját típus-blokkjukba; minden
    // más (0 vagy 2+ típus) az "Egyéb" gyűjtő-blokkba esik, ahogy azt már a fenti
    // komment is dokumentálja.
    const sections = this.taskTypes.map((type) => ({
      id: type.id,
      label: type.label,
      icon: (type.id === 6 ? 'code' : 'database') as IconName,
      isOther: false,
      tasks: detail.tasks.filter((t) => t.taskTypeIds.length === 1 && t.taskTypeIds[0] === type.id),
    }));

    const categorizedTaskIds = new Set(sections.flatMap((s) => s.tasks.map((t) => t.id)));
    const otherTasks = detail.tasks.filter((t) => !categorizedTaskIds.has(t.id));
    if (otherTasks.length > 0) {
      sections.push({
        id: 0,
        label: 'Egyéb',
        icon: 'clipboard-list' as IconName,
        isOther: true,
        tasks: otherTasks,
      });
    }

    return sections;
  });

  toggleSection(id: number): void {
    this.expandedSections.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  isSectionExpanded(id: number): boolean {
    return this.expandedSections().has(id);
  }

  /** SQL-kódrészlet esetén a publikáláshoz create.sql + create_lite.sql pár kell. */
  readonly sqlFilesPaired = computed(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return true;

    // Az "Összevont megoldás" (completeSolutionSnippets) egy külön mező a részfeladatonkénti
    // kódrészletektől - ha az SQL-kód kizárólag ide kerül, a régi ellenőrzés a figyelmeztető
    // sárga bannert sem jelenítette meg (UI-TT-30, BE-oldali tükre ugyanennek a hibának).
    const usesSql = detail.tasks.some(
      (t) =>
        t.solutions.some((s) => s.snippets.some((sn) => sn.programmingLanguageId === SQL_LANGUAGE_ID)) ||
        t.completeSolutionSnippets.some((sn) => sn.programmingLanguageId === SQL_LANGUAGE_ID),
    );
    if (!usesSql) return true;

    const kinds = new Set(detail.files.map((f) => f.kind));
    return kinds.has('CreateSql') && kinds.has('CreateLiteSql');
  });

  constructor() {
    // A drafteket a szerver-állapotból töltjük — mentés után a store úgyis
    // újratölti a detailt, ezért az ÉRINTETT draft a legutóbb mentett állapotra
    // áll vissza (ez a szándékolt, egyszerű viselkedés). DE ez a reload MINDEN
    // sikeres mutációra lefut (nemcsak az érintett solution/task-éra) — ezért
    // a még "piszkos" (mentetlen) kulcsokat itt NEM írjuk felül, különben egy
    // teljesen független mentés/hozzáadás csendben eldobná egy MÁSIK, még el
    // nem mentett kódrészlet-piszkozatot ugyanazon az oldalon (UI-TT-40).
    effect(() => {
      const detail = this.store.selectedDetail();
      if (!detail) return;

      const dirty = this.dirtyDraftKeys();
      this.drafts.update((current) => {
        const next: SnippetDraft = { ...current };
        for (const task of detail.tasks) {
          for (const solution of task.solutions) {
            if (dirty.has(solution.id)) continue;
            next[solution.id] = Object.fromEntries(solution.snippets.map((s) => [s.programmingLanguageId, s.code]));
          }
          const completeKey = this.completeSolutionKey(task.id);
          if (dirty.has(completeKey)) continue;
          next[completeKey] = Object.fromEntries(
            task.completeSolutionSnippets.map((s) => [s.programmingLanguageId, s.code]),
          );
        }
        return next;
      });
    });

    effect(() => {
      const files = this.store.selectedDetail()?.files ?? [];
      const currentIds = new Set(files.map((f) => String(f.id)));

      // Egy fájl törlésekor/lecserélésekor (kind-onkénti csere) az adott file.id
      // eltűnik a listából — a hozzá tartozó blob object URL-t itt kell felszabadítani,
      // nem csak a komponens megsemmisülésekor (UI-TT-68 memóriaszivárgás egy hosszabb
      // szerkesztési munkamenetben).
      const resolved = this.resolvedDownloadUrls();
      const staleKeys = Object.keys(resolved).filter((key) => !currentIds.has(key));
      if (staleKeys.length > 0) {
        for (const key of staleKeys) {
          this.authorizedFileService.revoke(resolved[key]);
        }
        this.resolvedDownloadUrls.update((current) => {
          const next = { ...current };
          for (const key of staleKeys) delete next[key];
          return next;
        });
      }

      for (const file of files) {
        const key = String(file.id);
        if (this.resolvedDownloadUrls()[key] !== undefined) continue;

        this.authorizedFileService.resolveUrl(this.apiOrigin + file.url).subscribe((url) => {
          this.resolvedDownloadUrls.update((current) => ({ ...current, [key]: url }));
        });
      }
    });

    this.schoolStore.loadMine();
  }

  ngOnDestroy(): void {
    for (const url of Object.values(this.resolvedDownloadUrls())) {
      this.authorizedFileService.revoke(url);
    }
  }

  downloadHref(file: TeacherFileDto): string {
    return this.resolvedDownloadUrls()[file.id] ?? this.apiOrigin + file.url;
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.store.loadDetail(id);
  }

  toggleTask(taskId: number): void {
    this.expandedTaskId.set(this.expandedTaskId() === taskId ? null : taskId);
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
    // A kulcs "piszkos" marad, amíg a mentése tényleg le nem fut — enélkül egy
    // MÁSIK, független mutáció utáni újratöltés csendben eldobná ezt a mentetlen
    // szerkesztést (UI-TT-40).
    this.dirtyDraftKeys.update((current) => new Set(current).add(key));
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

  saveSnippets(taskSetId: number, solution: TeacherSolutionDto): void {
    const snippets = this.snippetsFromDraft(solution.id);
    // Ha nincs is korábban mentett kódrészlet, egy üres mentés valóban no-op (UI-TT-13) —
    // de ha VOLT, az üres nyelv-mezők a tanár törlési szándékát jelentik, ezt tényleg
    // el kell küldeni (a backend upsert teljes-csere szemantikájú, üres tömb = törlés).
    if (snippets.length === 0 && solution.snippets.length === 0) {
      this.toastService.warning('Nincs megadva kódrészlet egyik nyelven sem — nincs mit menteni.');
      return;
    }
    this.store.upsertSolutionSnippets(taskSetId, solution.id, snippets, () => {
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

  addTask(taskSetId: number, typeId: number): void {
    const draft = this.newTaskDrafts[typeId];
    // UI-TT-90: a backend CreateTeacherTaskRequest.Description mezője [Required] -
    // a leírás nélküli beküldés korábban csak egy 400-zal derült ki, mert ez a guard
    // (és az alábbi isTaskDraftTitleBlank()) kizárólag a címet ellenőrizte.
    if (!draft?.title.trim() || !draft?.description.trim()) return;
    this.store.addTask(
      taskSetId,
      {
        title: draft.title.trim(),
        description: draft.description.trim(),
        maxPoints: draft.maxPoints,
        taskTypeIds: [typeId],
      },
      () => {
        // UI-TT-25: a draftot csak SIKERES mentés után ürítjük — korábban ez a hívás ELŐTT,
        // optimistán futott le, így egy lassú/sikertelen kérésnél a tanár visszavonhatatlanul
        // elveszítette a begépelt cím/leírás/pontszám szöveget.
        this.newTaskDrafts[typeId] = { title: '', description: '', maxPoints: 10 };
        this.toastService.success('Feladat hozzáadva.');
      },
    );
  }

  /** UI-TT-61: a "Hozzáadás" gomb [disabled] állapotának is trim-elnie kell, hogy ne
   *  maradjon kattintható whitespace-only cím mellett — a mögöttes addTask() guard-ja
   *  már helyesen trim-el, csendben visszatérne, a gomb tehát néma no-opot mutatna.
   *  UI-TT-90: a backend a leírást is kötelezővé teszi ([Required] Description), ezért
   *  ez a gomb-gate innentől azt is ellenőrzi — enélkül a tanár csak a 400-as
   *  válaszból tudta meg, hogy leírás nélkül nem menthető a feladat. */
  isTaskDraftTitleBlank(typeId: number): boolean {
    const draft = this.newTaskDrafts[typeId];
    return !draft?.title.trim() || !draft?.description.trim();
  }

  async deleteTask(taskSetId: number, taskId: number): Promise<void> {
    const ok = await this.confirmService.ask({
      message: 'Biztosan törlöd a feladatot a részfeladataival együtt?',
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    this.store.deleteTask(taskSetId, taskId, () => this.toastService.success('Feladat törölve.'));
  }

  /** Lazy-létrehozott, task.id-vel kulcsolt draft — így a "Új részfeladat szövege" mező
   *  sosem "szivárog át" egy másik feladatra task-váltáskor (UI-TT-66). */
  newSolutionDraft(taskId: number): { description: string; points: number } {
    return (this.newSolutionDrafts[taskId] ??= { description: '', points: 5 });
  }

  /** UI-TT-81: a UI-TT-61 addTask-fixének testvér-hiánya - a "Hozzáadás" (addSolution)
   *  gomb [disabled] állapotának is trim-elnie kell, különben whitespace-only leírás
   *  mellett is kattintható marad, miközben a mögöttes addSolution() guard-ja már
   *  helyesen trim-el és csendben visszatér - néma no-op. */
  isSolutionDraftDescriptionBlank(taskId: number): boolean {
    return !this.newSolutionDraft(taskId).description.trim();
  }

  setNewSolutionDescription(taskId: number, value: string): void {
    this.newSolutionDraft(taskId).description = value;
  }

  setNewSolutionPoints(taskId: number, value: number): void {
    this.newSolutionDraft(taskId).points = value;
  }

  addSolution(taskSetId: number, taskId: number): void {
    const draft = this.newSolutionDraft(taskId);
    if (!draft.description.trim()) return;
    this.store.addSolution(
      taskSetId,
      taskId,
      {
        description: draft.description.trim(),
        points: draft.points,
      },
      () => {
        // UI-TT-25 testvér-előfordulása: ugyanaz a fix, a draftot csak sikeres mentés után ürítjük.
        this.newSolutionDrafts[taskId] = { description: '', points: 5 };
        this.toastService.success('Részfeladat hozzáadva.');
      },
    );
  }

  async deleteSolution(taskSetId: number, solutionId: number): Promise<void> {
    const ok = await this.confirmService.ask({
      message: 'Biztosan törlöd a részfeladatot?',
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    this.store.deleteSolution(taskSetId, solutionId, () => this.toastService.success('Részfeladat törölve.'));
  }

  uploadFile(taskSetId: number, kind: TeacherFileKind, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.store.uploadFile(taskSetId, kind, file, undefined, () => this.toastService.success('Fájl feltöltve.'));
    input.value = '';
  }

  async deleteFile(taskSetId: number, fileId: string): Promise<void> {
    const ok = await this.confirmService.ask({
      message: 'Biztosan törlöd a fájlt?',
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    this.store.deleteFile(taskSetId, fileId, () => this.toastService.success('Fájl törölve.'));
  }

  fileKindLabel(kind: TeacherFileKind): string {
    return this.fileKinds.find((k) => k.kind === kind)?.label ?? kind;
  }

  async publish(taskSetId: number): Promise<void> {
    // A schoolStore.loadMine() a konstruktorban indul, a taskset-detail betöltésétől
    // FÜGGETLENÜL — ha a publish() a schools() még be-nem-töltött (üres) kezdőállapotán
    // dönt, egy ténylegesen intézményi tagságú tanár megerősítés NÉLKÜL publikálna
    // (UI-TT-47 load-order race). Ezért itt mindig megvárjuk a betöltés lezárását.
    if (this.schoolStore.loading()) {
      await firstValueFrom(this.schoolStoreLoading$.pipe(filter((loading) => !loading), take(1)));
    }

    if (this.schoolStore.schools().length > 0) {
      const confirmed = await this.confirmService.ask({
        message:
          'Publikálás után az intézményed MINDEN iskolai csoportjának diákjai is elérik ezt a feladatsort (tartalom-megosztás). Folytatod?',
        confirmLabel: 'Publikálás',
      });
      if (!confirmed) return;
    }
    this.store.publish(taskSetId, () => this.toastService.success('Feladatsor publikálva.'));
  }
}
