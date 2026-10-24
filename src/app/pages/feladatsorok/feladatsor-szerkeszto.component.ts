import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnInit, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, filter, firstValueFrom, forkJoin, of, take } from 'rxjs';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { SchoolStore } from '../../services/school/school.store';
import { OfficeFileKind } from '../../models/office-task.model';
import { TeacherTaskDto, TeacherTaskSetDetailDto } from '../../models/teacher-content.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { gradingCheckHint, gradingQualityHeadline } from './automatikus-javitas.component';
import { SqlGeneralasComponent } from './sql-generalas.component';
import { FREE_ACCESS_TEXT, isPaidAccess, PAID_ACCESS_TEXT } from './hozzaferes.util';
import { AiFeladatComponent } from './ai-feladat.component';
import { IrodaiMegoldasbolComponent } from './irodai-megoldasbol.component';
import { AsztaliFeladatComponent } from './asztali-feladat.component';
import { AssignSectionComponent } from './feladatsor-szerkeszto/assign-section.component';
import { FeladatVazlatComponent } from './feladatsor-szerkeszto/feladat-vazlat.component';
import { FilesSectionComponent } from './feladatsor-szerkeszto/files-section.component';
import { MetadataDraft, MetadataSectionComponent } from './feladatsor-szerkeszto/metadata-section.component';
import { SnippetDraftsState } from './feladatsor-szerkeszto/snippet-drafts.state';
import { TaskEditState } from './feladatsor-szerkeszto/task-edit.state';
import { TaskSectionComponent } from './feladatsor-szerkeszto/task-section.component';
import { TaskSectionState } from './feladatsor-szerkeszto/task-section.state';
import { TaskSetFilesState } from './feladatsor-szerkeszto/taskset-files.state';
import { isProgrammingTask, isSqlTask, SQL_LANGUAGE_ID, SQL_TASK_TYPE_ID } from './feladatsor-szerkeszto/task-types';
import { MiSegitoPanelComponent, MiSegitoSelection } from './mi-segito-panel.component';
import { VideoHelpComponent } from '../../shared/video-help/video-help.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsor-szerkeszto',
  standalone: true,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  // A „Feladatok” rész állapota a szerkesztőé: a csukott blokkok / feladatok piszkozatai így nem vesznek el.
  // A „Fájlok” állapota is: a „Hiányzó SQL-fájl elkészítése” a séma célfeladatából és a feladatsor-szintű fájlokból dolgozik.
  providers: [TaskSectionState, TaskEditState, SnippetDraftsState, TaskSetFilesState],
  imports: [RouterLink, IconComponent, LocalSpinnerComponent, SqlGeneralasComponent, AiFeladatComponent, IrodaiMegoldasbolComponent,
    AsztaliFeladatComponent, FeladatVazlatComponent, TaskSectionComponent, MetadataSectionComponent, FilesSectionComponent,
    AssignSectionComponent, MiSegitoPanelComponent, VideoHelpComponent],
  template: `
    @if (store.selectedDetail(); as detail) {
      <div class="page-wide max-w-[100rem] mx-auto">
        <!-- Mobilon a műveletek a cím alá törnek (platform-teszt D, 2026-10-08): a shrink-0 gombsor 375 px-en a címet
             teljesen kiszorította, és a sor 160 px-szel kilógott. -->
        <div class="flex flex-wrap justify-between items-start mb-6 gap-3" data-testid="taskset-header">
          <div class="min-w-0 flex-[1_1_16rem]">
            <nav aria-label="Morzsa" class="text-xs text-text-muted">
              <a routerLink="/feladatsorok" class="hover:underline">Feladatsorok</a>
              <span aria-hidden="true"> › </span>
              <span aria-current="page">{{ detail.title }}</span>
            </nav>
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-2xl font-black tracking-tight truncate min-w-0" data-testid="taskset-title">{{ detail.title }}</h1>
              <span class="badge" [class]="taskSetBadgeClass(detail)">
                {{ taskSetBadgeLabel(detail) }}</span>
            </div>
            <p class="text-text-muted text-sm mt-1">{{ detail.taskCount }} feladat</p>
          </div>
          <div class="flex flex-wrap gap-2 items-center" data-testid="taskset-actions">
            @if (detail.isPublished) {
              <a [routerLink]="['/feladatsorok', detail.id, 'eredmenyek']" class="text-sm text-primary hover:underline">Eredmények</a>
            }
            <button (click)="publish(detail.id)" [disabled]="detail.isPublished || !!detail.takedownAt || store.loading()"
              data-testid="publish-button" class="btn btn-primary">
              {{ detail.isPublished ? 'Publikálva' : 'Publikálás' }}
            </button>
            <!--
              A publikálás eddig EGYIRÁNYÚ utca volt: visszavonni nem lehetett, és mivel
              publikált feladatsort törölni sem, a tanár a saját tartalmát sem tudta
              eltávolítani - csak adminon keresztül.
              Admin-takedown alatt a gomb REJTVE marad: azt az állapotot csak admin oldhatja fel.
            -->
            @if (detail.isPublished && !detail.takedownAt) {
              <button (click)="unpublish(detail.id)" [disabled]="store.loading()"
                data-testid="unpublish-button" class="btn btn-ghost">Visszavonás</button>
            }
            <!--
              A törlésnek KÉT tiltó esete van, és mindkettőt ITT mutatjuk, nem egy elutasított
              kérés hibaüzenetében: publikált feladatsor (előbb vissza kell vonni), illetve ha
              már van rajta vizsga-munkamenet - ilyet SOHA nem törlünk, mert a diákok
              eredményei és statisztikái hozzá kötődnek.
            -->
            @if (detail.hasExamSessions) {
              <span class="text-xs text-text-muted" data-testid="delete-blocked-exam">
                Vizsga készült rajta - nem törölhető
              </span>
            } @else if (!detail.isPublished) {
              <button (click)="deleteTaskSet(detail.id, detail.title)" [disabled]="store.loading()"
                data-testid="delete-taskset-button" class="btn btn-ghost text-danger">Törlés</button>
            }
          </div>
        </div>

        <!--
          UI-TT-172: a takedownAt-tal rendelkező feladatsor SAJÁT publikálása szerveroldalon
          mindig elhasal ("csak admin publikálhatja újra") - korábban a tanár erről csak a
          megerősítő dialógus UTÁN, egy sikertelen kérésből szerzett tudomást. A gomb fent
          már letiltva, ez a szöveg megmagyarázza, miért.
        -->
        @if (detail.takedownAt) {
          <p class="bg-danger-subtle border border-danger/40 rounded-xl p-3 mb-6 text-sm text-danger flex items-start gap-2">
            <app-icon name="warning-triangle" class="w-5 h-5 block shrink-0" />
            <span>Ezt a feladatsort a platform-admin adminisztratív okból visszavonta — a tartalma nem publikálható újra, amíg
            az admin fel nem oldja a visszavonást.</span>
          </p>
        }

        <!-- Katalógus-másolat: a diákok a forrás hivatalos sor hozzáférési szintjével nyithatják meg. -->
        @if (detail.copiedFromTaskSetId != null) {
          <p class="rounded-xl p-3 mb-6 text-sm flex items-start gap-2 border" data-testid="copied-access"
            [class]="isPaidAccess(detail) ? 'bg-warning-subtle border-warning/40 text-warning' : 'bg-success-subtle border-success/40 text-success'">
            <app-icon name="clipboard-list" class="w-5 h-5 block shrink-0" />
            <span>Katalógusból másolt feladatsor, a hivatalos sor hozzáférését örökli. {{ isPaidAccess(detail) ? paidAccessText : freeAccessText }}</span>
          </p>
        }

        @if (store.error()) {
          <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
        }

        @if (schoolStore.error()) {
          <p class="text-danger text-sm mb-4">{{ schoolStore.error() }}</p>
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
          <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 mb-6 text-sm text-warning flex items-start gap-2" data-testid="sql-files-warning">
            <app-icon name="warning-triangle" class="w-5 h-5 block shrink-0" />
            <span>SQL-kódrészletet találtam a feladatsorban — a create.sql ÉS a create_lite.sql fájl is kötelező (a futtató
            SQLite-ot használ), publikálás előtt mindkettőt fel kell tölteni.
            <button type="button" class="underline font-semibold disabled:no-underline disabled:opacity-60" [disabled]="!!detail.takedownAt"
              (click)="openSqlGeneration(null)" data-testid="sql-files-warning-generate">Hiányzó SQL-fájl elkészítése</button></span>
          </p>
        }

        <!-- Háromhasábos szerkesztő xl-től (vázlat · tartalom · MI-segítő); alatta egy oszlop, a vázlat felül. -->
        <div class="grid grid-cols-1 gap-6 xl:grid-cols-[15rem_minmax(0,1fr)_18rem] xl:items-start">
        <app-feladat-vazlat [sections]="tasks.typeSections()" [selectedTaskId]="tasks.expandedTaskId()"
          (taskSelected)="selectTask($event)" (addTaskRequested)="focusNewTask($event)" />

        <div class="min-w-0">
        <!-- ── Feladatok, típusonként összecsukható blokkokban ─────── -->
        <section class="mb-8">
          <h2 class="font-bold mb-3">Feladatok</h2>
          @for (section of tasks.typeSections(); track section.id) {
            <app-task-section [section]="section" [taskSetId]="detail.id"
              (rubricChanged)="aiPanel.reload()" (sqlFilesRequested)="openSqlGeneration($event)" />
          }
        </section>

        <!-- ── Alapadatok ──────────────────────────────────────── -->
        @if (metadataDraft(); as draft) {
          <section class="card p-5 mb-8">
            <h2 class="font-bold mb-3">Alapadatok</h2>
            <app-metadata-section [draft]="draft" (draftChange)="metadataDraft.set($event)" [busy]="store.loading()"
              (save)="updateMetadata(detail.id)" />
          </section>
        }

        <!-- ── Fájlok ───────────────────────────────────────────── -->
        <section>
          <h2 class="font-bold mb-3">Fájlok</h2>
          <app-files-section [taskSetId]="detail.id" />

          <!-- Az MI-dialógusok külön, lusta chunkban: az első megnyitáskor töltődnek be (tétlen időben előre letöltve). -->
          @defer (when sqlGenerationOpen(); prefetch on idle) {
            @if (sqlGenerationOpen()) {
              <app-sql-generalas [taskSetId]="detail.id" [files]="sqlGenerationFiles()" [taskId]="sqlGenerationTaskId()"
                (closed)="sqlGenerationOpen.set(false)" (saved)="store.loadDetail(detail.id)" />
            }
          }
          @defer (when aiTaskDialog(); prefetch on idle) {
            @if (aiTaskDialog(); as ai) {
              <app-ai-feladat [taskSetId]="detail.id" [startMode]="ai.mode" [task]="ai.task" [tasks]="detail.tasks"
                (closed)="aiTaskDialog.set(null)" (saved)="onAiTaskSaved(detail.id, $event)" />
            }
          }
          @defer (when officeTaskDialog(); prefetch on idle) {
            @if (officeTaskDialog(); as kind) {
              <app-irodai-megoldasbol [taskSetId]="detail.id" [kindHint]="kind" [lastSaved]="lastOfficeSave()?.taskSetId === detail.id ? lastOfficeSave() : null"
                (closed)="officeTaskDialog.set(null)" (saved)="onAiTaskSaved(detail.id, $event)" (savedTask)="lastOfficeSave.set({ taskSetId: detail.id, taskId: $event.taskId, title: $event.title })"
                (openTask)="openSavedTask($event)" />
            }
          }
          @defer (when desktopTaskDialog(); prefetch on idle) {
            @if (desktopTaskDialog()) {
              <app-asztali-feladat [taskSetId]="detail.id" (closed)="desktopTaskDialog.set(false)" (saved)="onAiTaskSaved(detail.id, $event)" />
            }
          }
        </section>

        <!-- ── Kiadás csoportnak ──────────────────────────────── -->
        <section id="kiadas" aria-label="Kiadás csoportnak" class="card p-5 mt-8">
          <div class="flex items-center gap-1 mb-3">
            <h2 class="font-bold">Kiadás csoportnak</h2>
            <app-video-help video="kiadas" />
          </div>
          <app-assign-section [taskSetId]="detail.id" [isPublished]="detail.isPublished" />
        </section>
        </div>

        <app-mi-segito-panel #aiPanel [takedown]="!!detail.takedownAt" [selection]="panelSelection()" [dialogOpen]="aiDialogOpen()" [busy]="store.loading()"
          [sqlAvailable]="showSqlGeneration()"
          (rubricRequested)="openRubric()" (aiTaskRequested)="openAiTask($event, $event === 'complete' ? selectedTask() : null)"
          (sqlQueriesRequested)="openSqlQueries()" (sqlFilesRequested)="openSqlGeneration(panelSelection()?.sql ? tasks.expandedTaskId() : null)"
          (officeTaskRequested)="officeTaskDialog.set($event)" (desktopTaskRequested)="desktopTaskDialog.set(true)" />
        </div>
      </div>
    } @else if (store.loading()) {
      <app-local-spinner />
    } @else {
      <p class="text-danger text-center py-10">{{ store.error() }}</p>
    }
  `,
})
export class FeladatsorSzerkesztoComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  readonly store = inject(TeacherTaskSetStore);
  readonly schoolStore = inject(SchoolStore);
  private readonly rubricService = inject(TeacherRubricService);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  readonly tasks = inject(TaskSectionState);
  readonly files = inject(TaskSetFilesState);
  // A publish()-nek meg kell várnia, hogy a schoolStore.loading() lezáruljon, mielőtt
  // a schools() alapján dönt a megerősítő dialógusról (UI-TT-47 load-order race).
  private readonly schoolStoreLoading$ = toObservable(this.schoolStore.loading);

  // UI-TT-118: a publish() saját, a store.loading()-tól független re-entrancy guardja —
  // ld. publish() metódus komment. Biztonsági háló, hogy ez a flag SOHA ne ragadjon be
  // "true"-n (pl. egy sikertelen store.publish() után, aminek nincs onError callback
  // paramétere): amint a store.loading() lezárul (siker VAGY hiba), visszaáll false-ra.
  private _publishing = false;
  private readonly resetPublishingOnLoadEnd = effect(() => {
    if (!this.store.loading()) {
      this._publishing = false;
    }
  });

  readonly metadataDraft = signal<MetadataDraft | null>(null);

  private readonly initMetadataDraft = effect(() => {
    const detail = this.store.selectedDetail();
    if (detail && this.metadataDraft() === null) {
      this.metadataDraft.set({
        title: detail.title,
        description: detail.description,
        levelId: detail.levelId,
        subjectCategoryId: detail.subjectCategoryId ?? null,
        requiredSkillIds: detail.requiredSkillIds ?? [],
      });
    }
  });

  /** A „Hiányzó SQL-fájl elkészítése” párbeszédablak; feladatonkénti sémánál a célfeladattal. */
  readonly sqlGenerationOpen = signal(false);
  readonly sqlGenerationTaskId = signal<number | null>(null);

  /** A generátor a célfeladat fájljait látja (feladatsor-szintű + a feladathoz kötött); egy sémás feladatsoron a régi listát. */
  readonly sqlGenerationFiles = computed(() => {
    const taskId = this.sqlGenerationTaskId();
    if (taskId === null) return this.files.taskSetFiles();
    return (this.store.selectedDetail()?.files ?? []).filter((f) => f.taskId == null || f.taskId === taskId);
  });

  /** `contextTaskId`: egy feladatból (pl. az SQL-lekérdezések ablakából) nyitva annak a feladatnak a sémája készül. */
  openSqlGeneration(contextTaskId: number | null): void {
    if (!this.files.taskBoundSchema()) {
      this.sqlGenerationTaskId.set(null);
    } else {
      const taskId = contextTaskId ?? this.files.schemaTaskId();
      if (taskId === null) {
        this.toastService.warning('Ebben a feladatsorban feladatonként külön séma van - előbb jelöld ki az SQL-feladatot a vázlatban, vagy válaszd ki a Fájlok résznél, melyik feladathoz készüljön.');
        return;
      }
      this.sqlGenerationTaskId.set(taskId);
    }
    this.sqlGenerationOpen.set(true);
  }

  readonly isPaidAccess = isPaidAccess;
  readonly paidAccessText = PAID_ACCESS_TEXT;
  readonly freeAccessText = FREE_ACCESS_TEXT;

  /** Az „AI programozási feladat” párbeszédablak: meglévő feladat kiegészítése vagy új feladat. */
  readonly aiTaskDialog = signal<{ mode: 'complete' | 'new'; task: TeacherTaskDto | null } | null>(null);
  /** „Asztali feladatsor témából” párbeszédablak. */
  readonly desktopTaskDialog = signal(false);
  /** „Irodai feladat a megoldott fájlból” párbeszédablak; az érték a megnyitó blokk fajtája (a feltöltött fájl dönt). */
  readonly officeTaskDialog = signal<OfficeFileKind | null>(null);
  /** Az irodai ablakból legutóbb mentett feladat (feladatsoronként) - újranyitáskor az ablak jelzi, és oda lehet ugrani. */
  readonly lastOfficeSave = signal<{ taskSetId: number; taskId: number; title: string } | null>(null);

  openAiTask(mode: 'complete' | 'new', task: TeacherTaskDto | null): void {
    this.aiTaskDialog.set({ mode, task });
  }

  /** Mentés után friss feladatsor; az érintett (új) feladat kinyílik. */
  onAiTaskSaved(taskSetId: number, taskId: number): void {
    this.store.loadDetail(taskSetId);
    this.tasks.expandedTaskId.set(taskId);
  }

  /** „Ugrás a feladathoz” az irodai ablakból: bezárás, a feladat kinyílik, és odagörgetünk. */
  openSavedTask(taskId: number): void {
    this.officeTaskDialog.set(null);
    this.selectTask(taskId);
  }

  /** A vázlatban kijelölt feladat = a kinyitott feladat; a MI-segítő panel feladatszintű segítségei erre vonatkoznak. */
  readonly selectedTask = computed(() => this.store.selectedDetail()?.tasks.find((t) => t.id === this.tasks.expandedTaskId()) ?? null);

  readonly panelSelection = computed<MiSegitoSelection | null>(() => {
    const task = this.selectedTask();
    if (!task) return null;
    return { label: `${task.taskOrder}. ${task.title}`, programming: isProgrammingTask(task), sql: isSqlTask(task) };
  });

  /** Nyitva van-e valamelyik MI-dialógus - a panel a bezáráskor újratölti a kereteket. */
  readonly aiDialogOpen = computed(
    () =>
      this.aiTaskDialog() !== null ||
      this.officeTaskDialog() !== null ||
      this.desktopTaskDialog() ||
      this.sqlGenerationOpen() ||
      this.tasks.sqlQueriesTaskId() !== null,
  );

  /** Kijelölés a vázlatból: a típus-blokk és a feladat kinyílik, és odagörgetünk. */
  selectTask(taskId: number): void {
    const section = this.tasks.typeSections().find((s) => s.tasks.some((t) => t.id === taskId));
    if (section) this.tasks.expandSection(section.id);
    this.tasks.expandedTaskId.set(taskId);
    this.scrollTo(`task-${taskId}`);
  }

  /** „+ Új feladat” a vázlatból: a típus-blokk kinyílik, a blokk „Új feladat” űrlapjához görgetünk, és a címre fókuszálunk. */
  focusNewTask(sectionId: number): void {
    this.tasks.expandSection(sectionId);
    this.scrollTo(`new-task-${sectionId}`, `new-task-title-${sectionId}`);
  }

  /** Szempontlista-vázlat a panelről: a kijelölt (már kinyitott) feladat szempontlista-blokkjához görgetünk. */
  openRubric(): void {
    const task = this.selectedTask();
    if (task) this.scrollTo(`task-${task.id}`, null, 'app-szempontlista');
  }

  openSqlQueries(): void {
    const task = this.selectedTask();
    if (task && isSqlTask(task)) this.tasks.sqlQueriesTaskId.set(task.id);
  }

  /**
   * A görgetés a következő renderelés után fut (a blokk / feladat épp most nyílt ki); a cél a szerkesztő saját nézetében van.
   * setTimeout (nem afterNextRender): egy már kinyitott feladatnál (szempontlista-ugrás) nincs új renderelés, amire várni lehetne.
   */
  private scrollTo(elementId: string, focusId: string | null = null, inner: string | null = null): void {
    setTimeout(() => {
      const root = this.host.nativeElement;
      const container = root.querySelector<HTMLElement>(`#${elementId}`);
      const target = (inner ? container?.querySelector<HTMLElement>(inner) : null) ?? container;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (focusId) root.querySelector<HTMLElement>(`#${focusId}`)?.focus({ preventScroll: true });
    });
  }

  /** SQL-feladat vagy SQL-fájl esetén kínáljuk fel a hiányzó create.sql / create_lite.sql elkészítését. */
  readonly showSqlGeneration = computed(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return false;
    return (
      !this.sqlFilesPaired() ||
      detail.tasks.some((t) => t.taskTypeIds.includes(SQL_TASK_TYPE_ID)) ||
      detail.files.some((f) => f.kind === 'CreateSql' || f.kind === 'CreateLiteSql')
    );
  });

  /** SQL-kódrészlet esetén a publikáláshoz create.sql + create_lite.sql pár kell. */
  readonly sqlFilesPaired = computed(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return true;

    // Az "Összevont megoldás" (completeSolutionSnippets) egy külön mező a részfeladatonkénti
    // kódrészletektől - ha az SQL-kód kizárólag ide kerül, a régi ellenőrzés a figyelmeztető
    // sárga bannert sem jelenítette meg (UI-TT-30, BE-oldali tükre ugyanennek a hibának).
    const usesSql = detail.tasks.some(
      (t) =>
        t.subTasks.some((s) => s.snippets.some((sn) => sn.programmingLanguageId === SQL_LANGUAGE_ID)) ||
        t.completeSolutionSnippets.some((sn) => sn.programmingLanguageId === SQL_LANGUAGE_ID),
    );
    if (!usesSql) return true;

    const kinds = new Set(detail.files.map((f) => f.kind));
    return kinds.has('CreateSql') && kinds.has('CreateLiteSql');
  });

  constructor() {
    this.schoolStore.loadMine();
  }

  /** A feladatsor törlése után a lista felé navigálás nem kérdez rá a (már értelmetlen) piszkozatokra. */
  private leaveWithoutAsking = false;

  /**
   * UI-TT-238: van-e mentetlen módosítás - Alapadatok, vagy a „Feladatok” rész (nyitott feladat- vagy részfeladat-szerkesztés,
   * kitöltött „Új feladat” / „Új részfeladat” űrlap, mentetlen kódrészlet).
   */
  hasUnsavedChanges(): boolean {
    const detail = this.store.selectedDetail();
    if (!detail) return false;
    const meta = this.metadataDraft();
    if (meta && (meta.title !== detail.title || meta.description !== detail.description || meta.levelId !== detail.levelId
      || meta.subjectCategoryId !== (detail.subjectCategoryId ?? null)
      || [...meta.requiredSkillIds].sort().join() !== [...(detail.requiredSkillIds ?? [])].sort().join())) return true;

    return this.tasks.hasUnsavedChanges(detail);
  }

  /** Route canDeactivate: mentetlen módosításnál megerősítés (SPA-navigáció). */
  canLeave(): boolean | Promise<boolean> {
    if (this.leaveWithoutAsking || !this.hasUnsavedChanges()) return true;
    return this.confirmService.ask({
      title: 'Elveted a módosításokat?',
      message: 'A feladatsoron mentetlen módosításaid vannak. Ha most továbblépsz, elvesznek.',
      confirmLabel: 'Elvetem',
      cancelLabel: 'Maradok',
      danger: true,
    });
  }

  /** Újratöltés / lap bezárása: a böngésző saját megerősítése. */
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.leaveWithoutAsking || !this.hasUnsavedChanges()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.store.loadDetail(id);
  }

  /** Visszavonás: a publikálás párja. Megerősítést kér - a diákok elvesztik a hozzáférést. */
  async unpublish(id: number): Promise<void> {
    const ok = await this.confirmService.ask({
      message: 'Biztosan visszavonod a publikálást? A feladatsor ezután nem lesz elérhető a diákoknak.',
      confirmLabel: 'Visszavonás',
    });
    if (!ok) return;
    // Ugyanaz a dupla-kattintás guard, mint a törléseknél: a megerősítő dialógus alatt egy
    // másik mutáció elindulhatott, a mögöttes mutateAndReload() pedig nem idempotens.
    if (this.store.loading()) return;
    this.store.unpublish(id);
  }

  updateMetadata(taskSetId: number): void {
    const draft = this.metadataDraft();
    if (!draft || !draft.title.trim() || !draft.description.trim() || this.store.loading()) return;
    this.store.updateTaskSet(
      taskSetId,
      {
        title: draft.title,
        description: draft.description,
        levelId: draft.levelId,
        subjectCategoryId: draft.subjectCategoryId ?? undefined,
        requiredSkillIds: draft.requiredSkillIds,
        // BE-TEACHERCONTENT-UPDATETASKSET-LOSTUPDATE: egy másik fülön közben elmentett változást ne írjuk felül némán.
        rowVersion: this.store.selectedDetail()?.rowVersion,
      },
      () => this.toastService.success('Mentve.'),
    );
  }

  /**
   * A feladatsor törlése. A gomb CSAK akkor látszik, ha ténylegesen törölhető; ez a
   * megerősítés a véletlen kattintás ellen véd. A cím is szerepel benne, mert a tanárnak
   * a dialógusból kell tudnia ellenőrizni, hogy a jó feladatsorra vonatkozik.
   */
  async deleteTaskSet(id: number, title: string): Promise<void> {
    const ok = await this.confirmService.ask({
      message: `Biztosan törlöd a(z) "${title}" feladatsort a benne lévő összes feladattal és megoldással együtt? Ez nem vonható vissza.`,
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    if (this.store.loading()) return;
    this.store.deleteTaskSet(id, () => {
      this.toastService.success('Feladatsor törölve.');
      // A szerkesztő-oldal egy már nem létező feladatsorra mutatna - vissza a listára.
      this.leaveWithoutAsking = true;
      this.router.navigate(['/feladatsorok']);
    });
  }

  /**
   * UI-TT-172: az admin-nézet (`admin-tanarok.component.ts`) mintáját követve a
   * takedownAt-tal rendelkező feladatsor megkülönböztetve jelenik meg a sima
   * piszkozattól.
   */
  taskSetBadgeLabel(taskSet: { isPublished: boolean; takedownAt: string | null }): string {
    if (taskSet.takedownAt) return 'Admin visszavonta';
    return taskSet.isPublished ? 'Publikált' : 'Piszkozat';
  }

  taskSetBadgeClass(taskSet: { isPublished: boolean; takedownAt: string | null }): string {
    if (taskSet.takedownAt) return 'badge-danger';
    return taskSet.isPublished ? 'badge-success' : 'badge-warning';
  }

  /**
   * Publikálás a megerősítések után. Az ellenőrzések sorrendje és szinkronitása szándékos:
   * - UI-TT-172: admin-takedown alatt a gomb le van tiltva, de billentyűzet/programozott hívás ellen itt is védünk - a
   *   szerveroldali publish ezen az állapoton MINDIG elhasalna, feleslegesen mutatva a megerősítő dialógust.
   * - UI-TT-118: a gomb `[disabled]="... || store.loading()"` kötése csak akkor véd, ha a két kattintás ESEMÉNYE közt
   *   lefut a change detection - egy ugyanabban a JS-tickben lezajló szinkron dupla-hívás ellen nem. Intézményhez NEM
   *   kötött tanárnál a ConfirmService.ask()-ág (ami a resolver null-ozása miatt „véletlenül” is véd) ki van hagyva, ezért
   *   saját, a store-tól független re-entrancy guard kell (a store.publish() loading-guardja adja a HTTP-szintű védelmet;
   *   ez a guard a korai-visszatérési ágakat is lefedi). Ezért nincs `await` a szinkron úton (nincs betöltés alatti
   *   intézménylista, nincs feladat, nincs intézmény): a store.publish() ugyanabban a tickben indul.
   * - UI-TT-47: a schoolStore.loadMine() a konstruktorban indul, a detail betöltésétől FÜGGETLENÜL - a még be nem töltött
   *   (üres) schools()-on dönteni megerősítés NÉLKÜLI publikálást jelentene egy intézményi tanárnál. Ezért megvárjuk.
   * - UI-TT-110: egy sikertelen loadMine() ugyanúgy üres schools()-t hagy, mint egy intézmény nélküli tanárnál - amíg a
   *   tagság nem eldönthető, NEM publikálunk automatikusan, hanem hibát mutatunk.
   * - Hiányos automatikus javítás: figyelmeztetünk, de nem tiltjuk a publikálást.
   */
  async publish(taskSetId: number): Promise<void> {
    const detail = this.store.selectedDetail();
    if (detail?.takedownAt) return;

    if (this._publishing) return;
    this._publishing = true;

    if (this.schoolStore.loading()) {
      await firstValueFrom(this.schoolStoreLoading$.pipe(filter((loading) => !loading), take(1)));
    }

    const schoolError = this.schoolStore.error();
    if (schoolError) {
      this.toastService.danger(schoolError);
      this._publishing = false;
      return;
    }

    // Feladat nélkül nincs mit ellenőrizni - ilyenkor await sincs, a fenti szinkron út megmarad.
    if (detail && detail.tasks.length > 0 && !(await this.confirmGradingGaps(detail))) {
      this._publishing = false;
      return;
    }

    if (this.schoolStore.schools().length > 0 && !(await this.confirmInstitutionShare())) {
      this._publishing = false;
      return;
    }
    this.store.publish(taskSetId, () => {
      this._publishing = false;
      this.toastService.success('Feladatsor publikálva.');
    });
  }

  private confirmInstitutionShare(): Promise<boolean> {
    return this.confirmService.ask({
      message:
        'Publikálás után az intézményed MINDEN iskolai csoportjának diákjai is elérik ezt a feladatsort (tartalom-megosztás). Folytatod?',
      confirmLabel: 'Publikálás',
    });
  }

  /**
   * Publikálás előtt friss állapotot kér MINDEN feladat automatikus javításáról; ha bármelyik
   * sárga vagy piros, megerősítő ablakban felsorolja a hiányokat. Nem tilt: a tanár tudatosan
   * dönthet úgy, hogy így adja ki (pl. maga javítja). Egy sikertelen lekérést kihagyunk - a
   * figyelmeztetés hiánya nem akadályozhatja a publikálást.
   */
  private async confirmGradingGaps(detail: TeacherTaskSetDetailDto): Promise<boolean> {
    const qualities = await firstValueFrom(
      forkJoin(
        detail.tasks.map((task) =>
          this.rubricService.getGradingQuality(detail.id, task.id).pipe(catchError(() => of(null))),
        ),
      ),
    );
    const lines = detail.tasks.flatMap((task, i) => {
      const quality = qualities[i];
      if (!quality || quality.level === 'green') return [];
      const todos = quality.checks
        .map((c) => gradingCheckHint(c) ?? (c.ok ? null : c.label))
        .filter((t): t is string => !!t)
        .map((t) => `   – ${t}`);
      return [[`• ${task.taskOrder}. ${task.title}: ${gradingQualityHeadline(quality)}`, ...todos].join('\n')];
    });
    if (lines.length === 0) return true;

    return this.confirmService.ask({
      title: 'Hiányos automatikus javítás',
      message:
        'Néhány feladatnál a diákok beadásainak gépi javítása pontatlanabb lesz, vagy el is marad:\n\n' +
        lines.join('\n') +
        '\n\nA hiányokat a feladatkártyák „Automatikus javítás” részén pótolhatod. Publikálod mégis?',
      confirmLabel: 'Publikálás mégis',
      cancelLabel: 'Vissza',
    });
  }
}
