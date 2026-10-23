import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, filter, firstValueFrom, forkJoin, of, take } from 'rxjs';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { SkillPickerComponent } from '../../shared/skill-picker/skill-picker.component';
import { GroupStore } from '../../services/group/group.store';
import { SchoolStore } from '../../services/school/school.store';
import { AuthorizedFileService } from '../../services/file/authorized-file.service';
import { CategoryService } from '../../services/category/category.service';
import { PublicCategoryDto } from '../../models/category.model';
import { OfficeFileKind } from '../../models/office-task.model';
import { TaskSetAssignmentDto, TeacherFileDto, TeacherFileKind, TeacherSkillDto, TeacherTaskDto, TeacherTaskSetDetailDto } from '../../models/teacher-content.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { environment } from '../../../environments/environment';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { gradingCheckHint, gradingQualityHeadline } from './automatikus-javitas.component';
import { SqlGeneralasComponent } from './sql-generalas.component';
import { FREE_ACCESS_TEXT, isPaidAccess, PAID_ACCESS_TEXT } from './hozzaferes.util';
import { AiFeladatComponent } from './ai-feladat.component';
import { IrodaiMegoldasbolComponent } from './irodai-megoldasbol.component';
import { AsztaliFeladatComponent } from './asztali-feladat.component';
import { FeladatVazlatComponent } from './feladatsor-szerkeszto/feladat-vazlat.component';
import { SnippetDraftsState } from './feladatsor-szerkeszto/snippet-drafts.state';
import { TaskEditState } from './feladatsor-szerkeszto/task-edit.state';
import { TaskSectionComponent } from './feladatsor-szerkeszto/task-section.component';
import { TaskSectionState } from './feladatsor-szerkeszto/task-section.state';
import { isOfficeTask, isProgrammingTask, isSqlTask, SQL_LANGUAGE_ID, SQL_TASK_TYPE_ID } from './feladatsor-szerkeszto/task-types';
import { MiSegitoPanelComponent, MiSegitoSelection } from './mi-segito-panel.component';
import { VideoHelpComponent } from '../../shared/video-help/video-help.component';

const LEVELS: { id: number; label: string }[] = [
  { id: 1, label: 'Kezdő' },
  { id: 2, label: 'Középhaladó' },
  { id: 3, label: 'Haladó' },
];

/** Irodai feladat forrás- és megoldásfájljai (szerződés: TANARI-SZEMPONTLISTA-API.md, F). */
const OFFICE_FILE_ACCEPT = '.docx,.xlsx,.pptx,.odt,.ods,.odp,.txt,.csv,.png,.jpg,.jpeg,.gif,.svg,.html,.css';
const OFFICE_FILE_MAX_BYTES = 20 * 1024 * 1024;

const FILE_KINDS: { kind: TeacherFileKind; label: string; accept: string }[] = [
  { kind: 'InputTxt', label: 'Bemeneti fájl (.txt)', accept: '.txt' },
  { kind: 'CreateSql', label: 'create.sql', accept: '.sql' },
  { kind: 'CreateLiteSql', label: 'create_lite.sql (SQLite)', accept: '.sql' },
  { kind: 'SolutionPdf', label: 'Megoldás PDF', accept: '.pdf' },
];

/** Csak a fájllistában megjelenő címkék (ezekhez nincs feladatsor-szintű feltöltő kártya). */
const OTHER_FILE_KIND_LABELS: Partial<Record<TeacherFileKind, string>> = {
  OfficeSource: 'Forrásfájl',
  OfficeSolution: 'Megoldásod',
  Image: 'Kép',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsor-szerkeszto',
  standalone: true,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  // A „Feladatok” rész állapota a szerkesztőé: a csukott blokkok / feladatok piszkozatai így nem vesznek el.
  providers: [TaskSectionState, TaskEditState, SnippetDraftsState],
  imports: [FormsModule, ReactiveFormsModule, RouterLink, IconComponent, LocalSpinnerComponent, DatePipe, SkillPickerComponent, SqlGeneralasComponent, AiFeladatComponent, IrodaiMegoldasbolComponent, AsztaliFeladatComponent, FeladatVazlatComponent, TaskSectionComponent, MiSegitoPanelComponent, VideoHelpComponent],
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
            <div class="space-y-3">
              <label class="block">
                <span class="text-sm text-text-muted">Cím</span>
                <input
                  [ngModel]="draft.title"
                  (ngModelChange)="metadataDraft.update(d => d ? { ...d, title: $event } : d)"
                  [ngModelOptions]="{ standalone: true }"
                  maxlength="250"
                  class="input mt-1"
                />
              </label>
              <label class="block">
                <span class="text-sm text-text-muted">Leírás</span>
                <textarea
                  rows="3"
                  [ngModel]="draft.description"
                  (ngModelChange)="metadataDraft.update(d => d ? { ...d, description: $event } : d)"
                  [ngModelOptions]="{ standalone: true }"
                  class="input mt-1"
                ></textarea>
              </label>
              <label class="block">
                <span class="text-sm text-text-muted">Szint</span>
                <select
                  [ngModel]="draft.levelId"
                  (ngModelChange)="metadataDraft.update(d => d ? { ...d, levelId: +$event } : d)"
                  [ngModelOptions]="{ standalone: true }"
                  class="input mt-1"
                >
                  @for (level of levels; track level.id) {
                    <option [value]="level.id">{{ level.label }}</option>
                  }
                </select>
              </label>
              <label class="block">
                <span class="text-sm text-text-muted">Tantárgy (elhagyható)</span>
                <select
                  [ngModel]="draft.subjectCategoryId"
                  (ngModelChange)="metadataDraft.update(d => d ? { ...d, subjectCategoryId: $event ? +$event : null } : d)"
                  [ngModelOptions]="{ standalone: true }"
                  class="input mt-1"
                >
                  <option [value]="null">—</option>
                  @for (cat of selectableCategories(); track cat.id) {
                    <option [value]="cat.id">{{ cat.name }}</option>
                  }
                </select>
              </label>
              @if (skills().length) {
                <app-skill-picker
                  [skills]="skills()"
                  [selected]="draft.requiredSkillIds"
                  (selectedChange)="metadataDraft.update(d => d ? { ...d, requiredSkillIds: $event } : d)"
                />
              }
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="!draft.title.trim() || !draft.description.trim() || store.loading()"
                (click)="updateMetadata(detail.id)"
              >
                Mentés
              </button>
            </div>
          </section>
        }

        <!-- ── Fájlok ───────────────────────────────────────────── -->
        <section>
          <h2 class="font-bold mb-3">Fájlok</h2>
          <ul class="space-y-2 mb-4">
            @for (file of listedFiles(); track file.id) {
              <li class="flex justify-between items-center card !rounded-xl p-3 text-sm" [attr.data-testid]="'file-row-' + file.id">
                <span class="flex items-center gap-2 min-w-0">
                  <app-icon name="document" class="w-4 h-4 block text-text-muted shrink-0" />
                  <span class="truncate">{{ file.originalFileName }} ({{ fileKindLabel(file.kind) }}{{ fileTaskLabel(file) }})</span>
                </span>
                <div class="flex items-center gap-3 shrink-0">
                  @if (isPdf(file)) {<a [href]="downloadHref(file)" target="_blank" rel="noopener" class="text-primary hover:underline">Megnyitás</a>} @else {<a [href]="downloadHref(file)" [attr.download]="file.originalFileName" class="text-primary hover:underline">Letöltés</a>}
                  <button (click)="deleteFile(detail.id, file.id, file.originalFileName)" class="text-danger hover:underline">Törlés</button>
                </div>
              </li>
            }
          </ul>

          <!-- UI-TT-173: a natív input type=file intrinsic szélessége (Choose File gomb +
               No file chosen felirat, mérve ~286px) meghaladta a feltétel nélküli
               grid-cols-2 mobil-szélességen (375px viewporton) számított ~165.5px-es oszlop-
               szélességét - az input nem zsugorodott, hanem kilógott a kártyájából, és a TELJES
               oldal vízszintesen túlcsordult (493px). grid-cols-1 sm:grid-cols-2-re cserélve
               mobilon (<640px) egymás alatt, egy oszlopban jelennek meg a kártyák (bőven elfér a
               natív vezérlő), sm:-től (≥640px) változatlanul 2 oszlop. A w-full/max-w-full
               az inputon extra védőháló, hogy a natív vezérlő MINDIG a szülő kártya tényleges
               szélességét tisztelje, ne a saját intrinsic méretét. -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            @for (kindOption of fileKinds; track kindOption.kind) {
              <div class="card !rounded-xl p-3">
                <label class="text-sm block mb-1">{{ kindOption.label }}</label>
                <!-- Feladatonkénti séma (pl. két SQL-feladatos katalógus-másolat): a feltöltés csak a kiválasztott feladat fájlját cseréli. -->
                @if (isSchemaKind(kindOption.kind) && taskBoundSchema()) {
                  <label class="block text-xs text-text-muted mb-1">
                    Melyik feladathoz?
                    <select class="input !px-2 !py-1 mt-1" [ngModel]="schemaTaskId()" (ngModelChange)="schemaTaskChoice.set($event)"
                      [ngModelOptions]="{ standalone: true }" [attr.data-testid]="'schema-task-' + kindOption.kind">
                      <option [ngValue]="null" disabled>Válassz feladatot…</option>
                      @for (t of sqlTasks(); track t.id) { <option [ngValue]="t.id">{{ t.taskOrder }}. {{ t.title }}</option> }
                    </select>
                  </label>
                }
                <input type="file" [accept]="kindOption.accept"
                  [disabled]="store.loading() || (isSchemaKind(kindOption.kind) && taskBoundSchema() && schemaTaskId() === null)"
                  [attr.data-testid]="'file-input-' + kindOption.kind"
                  (change)="uploadFile(detail.id, kindOption.kind, $event)"
                  class="w-full max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-hover file:cursor-pointer cursor-pointer" />
              </div>
            }
          </div>

          @if (sqlGenerationOpen()) {
            <app-sql-generalas [taskSetId]="detail.id" [files]="sqlGenerationFiles()" [taskId]="sqlGenerationTaskId()"
              (closed)="sqlGenerationOpen.set(false)" (saved)="store.loadDetail(detail.id)" />
          }
          @if (aiTaskDialog(); as ai) {
            <app-ai-feladat [taskSetId]="detail.id" [startMode]="ai.mode" [task]="ai.task" [tasks]="detail.tasks"
              (closed)="aiTaskDialog.set(null)" (saved)="onAiTaskSaved(detail.id, $event)" />
          }
          @if (officeTaskDialog(); as kind) {
            <app-irodai-megoldasbol [taskSetId]="detail.id" [kindHint]="kind" [lastSaved]="lastOfficeSave()?.taskSetId === detail.id ? lastOfficeSave() : null"
              (closed)="officeTaskDialog.set(null)" (saved)="onAiTaskSaved(detail.id, $event)" (savedTask)="lastOfficeSave.set({ taskSetId: detail.id, taskId: $event.taskId, title: $event.title })"
              (openTask)="openSavedTask($event)" />
          }
          @if (desktopTaskDialog()) {
            <app-asztali-feladat [taskSetId]="detail.id" (closed)="desktopTaskDialog.set(false)" (saved)="onAiTaskSaved(detail.id, $event)" />
          }

          <!--
            Irodai feladatonként: forrásfájlok (amit a diák megkap) és a tanár saját megoldása.
            A megoldásból készül a szempontlista, és a kapu ezen ellenőrzi a gépi szabályokat.
          -->
          @if (officeTasks().length > 0) {
            <div class="mt-6 space-y-3" data-testid="office-task-files">
              <h3 class="font-semibold">Irodai feladatok fájljai</h3>
              <p class="text-xs text-text-muted">
                Elfogadott fájlok: {{ officeFileAcceptLabel }} · legfeljebb 20 MB / fájl.
              </p>
              @for (task of officeTasks(); track task.id) {
                <div class="card !rounded-xl p-3 space-y-3" [attr.data-testid]="'office-files-' + task.id">
                  <p class="font-medium text-sm">{{ task.taskOrder }}. {{ task.title }}</p>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    @for (slot of officeFileSlots; track slot.kind) {
                      <div class="min-w-0" [attr.data-testid]="'office-slot-' + slot.kind">
                        <label class="text-sm font-medium block">{{ slot.label }}</label>
                        <p class="text-xs text-text-muted mb-2">{{ slot.help }}</p>
                        <ul class="space-y-1 mb-2">
                          @for (file of taskFiles(task.id, slot.kind); track file.id) {
                            <li class="flex justify-between items-center gap-2 text-sm bg-bg-element rounded-lg px-2 py-1">
                              <span class="truncate min-w-0">{{ file.originalFileName }}</span>
                              <span class="flex items-center gap-3 shrink-0">
                                @if (isPdf(file)) {<a [href]="downloadHref(file)" target="_blank" rel="noopener" class="text-primary hover:underline">Megnyitás</a>} @else {<a [href]="downloadHref(file)" [attr.download]="file.originalFileName" class="text-primary hover:underline">Letöltés</a>}
                                <button (click)="deleteFile(detail.id, file.id, file.originalFileName)" class="text-danger hover:underline">Törlés</button>
                              </span>
                            </li>
                          }
                        </ul>
                        <input type="file" multiple [accept]="officeFileAccept" [disabled]="store.loading()"
                          (change)="uploadOfficeFiles(detail.id, task.id, slot.kind, $event)"
                          class="w-full max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-hover file:cursor-pointer cursor-pointer" />
                      </div>
                    }
                  </div>
                  @if (taskFiles(task.id, 'OfficeSolution').length === 0) {
                    <p class="text-sm text-warning flex items-start gap-2" data-testid="office-solution-missing">
                      <app-icon name="warning-triangle" class="w-4 h-4 block mt-0.5 shrink-0" />
                      <span>Töltsd fel a saját megoldásodat – ebből készül a szempontlista.</span>
                    </p>
                  }
                </div>
              }
            </div>
          }
        </section>

        <!-- ── Kiadás csoportnak ──────────────────────────────── -->
        <section id="kiadas" aria-label="Kiadás csoportnak" class="card p-5 mt-8">
          <div class="flex items-center gap-1 mb-3">
            <h2 class="font-bold">Kiadás csoportnak</h2>
            <app-video-help video="kiadas" />
          </div>

          @if (assignmentsError()) {
            <p class="text-sm text-danger mb-3">{{ assignmentsError() }}</p>
          }

          <ul class="space-y-2 mb-4">
            @for (assignment of activeAssignments(); track assignment.id) {
              <li class="flex items-center gap-2 text-sm">
                <app-icon name="users" class="w-4 h-4 block text-text-muted" />
                <span class="flex-1">
                  {{ groupLabel(assignment.groupId, assignment.groupName) }}
                  @if (assignment.isTest) {
                    <span class="badge badge-warning">Dolgozat · {{ (assignment.timeLimitSeconds ?? 0) / 60 }} perc</span>
                    <a class="text-primary font-semibold" [routerLink]="['/dolgozatok', assignment.id]">Áttekintés</a>
                  }
                  @if (assignment.opensAt) {
                    <span class="text-text-muted">· nyílik: {{ assignment.opensAt | date: 'yyyy.MM.dd. HH:mm' }}</span>
                  }
                  @if (assignment.dueAt) {
                    <span class="text-text-muted">· határidő: {{ assignment.dueAt | date: 'yyyy.MM.dd. HH:mm' }}</span>
                  }
                </span>
                <button type="button" class="btn btn-ghost text-danger" (click)="revokeAssignment(assignment.id)">
                  Visszavonás
                </button>
              </li>
            } @empty {
              @if (!assignmentsLoading()) {
                <li class="text-sm text-text-muted">Még nincs kiadva egyetlen csoportnak sem.</li>
              }
            }
          </ul>

          @if (!detail.isPublished) {
            <p class="text-sm text-text-muted">Előbb publikáld a feladatsort, utána adhatod ki csoportoknak.</p>
          } @else {
            <form [formGroup]="assignForm" (ngSubmit)="assign(detail.id)" class="space-y-3 border-t border-border-default pt-4">
              <label class="block">
                <span class="text-sm text-text-muted">Csoport</span>
                <select formControlName="groupId" class="input mt-1">
                  @for (group of assignableGroups(); track group.id) {
                    <option [value]="group.id">{{ groupLabel(group.id, group.name) }}</option>
                  }
                </select>
              </label>

              <label class="flex items-start gap-2">
                <input formControlName="isTest" type="checkbox" class="mt-1" />
                <span>
                  <span class="font-semibold">Dolgozatként adom ki</span>
                  <span class="block text-sm text-text-muted">
                    Egyszer írható meg, szünet nélkül, a megadott időkorláttal. A feladatok a kezdésig rejtve maradnak,
                    a rendszer automatikusan pontoz, az eredményt te teszed közzé. Minden feladattípus belekerül (programozás, SQL, szövegszerkesztés, táblázatkezelés, prezentáció, grafika, weblap).
                  </span>
                </span>
              </label>

              @if (assignForm.controls.isTest.value) {
                <label class="block">
                  <span class="text-sm text-text-muted">Időkorlát (perc)</span>
                  <input formControlName="timeLimitMinutes" type="number" min="5" max="240" class="input mt-1" />
                </label>
              }

              <label class="block">
                <span class="text-sm text-text-muted">
                  {{ assignForm.controls.isTest.value ? 'Megírható ettől' : 'Nyitás dátuma (nem kötelező)' }}
                </span>
                <input formControlName="opensAt" type="datetime-local" class="input mt-1" />
              </label>

              <label class="block">
                <span class="text-sm text-text-muted">
                  {{ assignForm.controls.isTest.value ? 'Megírható eddig (utána a rendszer beadja)' : 'Határidő (nem kötelező)' }}
                </span>
                <input formControlName="dueAt" type="datetime-local" class="input mt-1" />
              </label>

              @if (assignForm.errors?.['opensAtAfterDueAt']) {
                <p class="text-sm text-danger">A nyitás dátuma nem lehet a határidő után.</p>
              }
              @if (assignForm.errors?.['testWindowRequired']) {
                <p class="text-sm text-text-muted">Dolgozatnál add meg, mettől meddig írható meg.</p>
              }
              @if (assignForm.errors?.['testDueInPast']) {
                <p class="text-sm text-danger">A dolgozat határideje már elmúlt - adj meg egy jövőbeli időpontot.</p>
              }
              @if (assignForm.errors?.['testTimeLimit']) {
                <p class="text-sm text-danger">Az időkorlát 5 és 240 perc között lehet.</p>
              }
              @if (assignForm.errors?.['testWindowTooShort']) {
                <p class="text-sm text-danger">A megírható időszak legyen legalább olyan hosszú, mint az időkorlát.</p>
              }

              <button
                type="submit"
                class="btn btn-primary"
                [disabled]="assignForm.invalid || store.loading() || assignableGroups().length === 0"
              >
                Kiadás
              </button>
              @if (assignableGroups().length === 0 && groupStore.activeGroups().length > 0) {
                <p class="text-sm text-text-muted">Minden csoportod megkapta már ezt a feladatsort.</p>
              }
            </form>
          }
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
export class FeladatsorSzerkesztoComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  readonly store = inject(TeacherTaskSetStore);
  readonly schoolStore = inject(SchoolStore);
  private readonly authorizedFileService = inject(AuthorizedFileService);
  private readonly taskSetService = inject(TeacherTaskSetService);
  private readonly rubricService = inject(TeacherRubricService);
  readonly groupStore = inject(GroupStore);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  readonly tasks = inject(TaskSectionState);
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

  private readonly categoryService = inject(CategoryService);

  readonly levels = LEVELS;
  readonly fileKinds = FILE_KINDS;
  readonly officeFileAccept = OFFICE_FILE_ACCEPT;
  readonly officeFileAcceptLabel = OFFICE_FILE_ACCEPT.split(',').join(', ');
  readonly officeFileSlots: { kind: TeacherFileKind; label: string; help: string }[] = [
    { kind: 'OfficeSource', label: 'Forrásfájlok', help: 'Amit a diák a feladathoz megkap (pl. nyers szöveg, adatfájl, képek).' },
    { kind: 'OfficeSolution', label: 'Megoldásod', help: 'A kész, hibátlan megoldásod – a diákok nem látják, ehhez méri a rendszer a beadásokat.' },
  ];

  readonly selectableCategories = toSignal(
    this.categoryService.getAll().pipe(catchError(() => of([] as PublicCategoryDto[]))),
    { initialValue: [] as PublicCategoryDto[] },
  );

  /** Az „Ajánlott előtte” témaválasztó listája - hiba esetén a választó egyszerűen nem jelenik meg. */
  readonly skills = toSignal(
    this.taskSetService.getSkills().pipe(catchError(() => of([] as TeacherSkillDto[]))),
    { initialValue: [] as TeacherSkillDto[] },
  );

  readonly metadataDraft = signal<{
    title: string;
    description: string;
    levelId: number;
    subjectCategoryId: number | null;
    requiredSkillIds: number[];
  } | null>(null);

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
  // UI-TT-27: az API origóját a ténylegesen konfigurált environment.apiUrl-ból kell
  // levezetni, nem a jelenlegi böngésző-origóból "sejteni" — utóbbi csak véletlenül
  // esett egybe a backenddel azokon a topológiákon, ahol az /api/ proxyzva van.
  readonly apiOrigin = new URL(environment.apiUrl).origin;

  // ── Kiadás csoportnak ────────────────────────────────────────────
  private readonly assignments = signal<TaskSetAssignmentDto[]>([]);
  readonly assignmentsLoading = signal(false);
  readonly assignmentsError = signal<string | null>(null);

  readonly activeAssignments = computed(() => this.assignments().filter((a) => !a.revokedAt));

  readonly assignableGroups = computed(() => {
    const assigned = new Set(this.activeAssignments().map((a) => a.groupId));
    return this.groupStore.activeGroups().filter((g) => !assigned.has(g.id));
  });

  private readonly duplicateGroupNameCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const g of this.groupStore.groups()) {
      counts.set(g.name, (counts.get(g.name) ?? 0) + 1);
    }
    return counts;
  });

  groupLabel(groupId: number, groupName: string): string {
    if ((this.duplicateGroupNameCounts().get(groupName) ?? 0) <= 1) return groupName;
    const full = this.groupStore.groups().find((g) => g.id === groupId);
    return full ? `${groupName} (kód: ${full.inviteCode})` : groupName;
  }

  readonly assignForm = this.fb.nonNullable.group(
    {
      groupId: this.fb.control<number | null>(null, Validators.required),
      opensAt: [''],
      dueAt: [''],
      // Dolgozat mód: időkorlát + kötelező időablak (a szerver is ellenőrzi).
      isTest: [false],
      timeLimitMinutes: [45],
    },
    {
      validators: (group) => {
        const opensAt = group.get('opensAt')?.value;
        const dueAt = group.get('dueAt')?.value;
        if (opensAt && dueAt && new Date(opensAt) > new Date(dueAt)) {
          return { opensAtAfterDueAt: true };
        }
        if (group.get('isTest')?.value) {
          const minutes = Number(group.get('timeLimitMinutes')?.value);
          if (!opensAt || !dueAt) return { testWindowRequired: true };
          if (new Date(dueAt).getTime() <= Date.now()) return { testDueInPast: true };
          if (!(minutes >= 5 && minutes <= 240)) return { testTimeLimit: true };
          if ((new Date(dueAt).getTime() - new Date(opensAt).getTime()) / 60000 < minutes) return { testWindowTooShort: true };
        }
        return null;
      },
    },
  );
  // ────────────────────────────────────────────────────────────────

  // A "Megnyitás" link sima <a href> lenne, a token viszont localStorage-ban
  // van (nem cookie-ban) — nyers navigáció nem viszi magával, 401-et adna.
  // Ezért bearer tokennel lekért blob URL-re oldjuk fel, fileId -> blob URL.
  private readonly resolvedDownloadUrls = signal<Record<string, string>>({});
  // UI-TT-163: a fenti signal önmagában csak azt tudja, van-e MÁR KÉSZ eredmény
  // egy fájl-kulcshoz - nem azt, hogy fut-e rá már egy resolveUrl() HTTP-hívás.
  // Ha a selectedDetail() két gyors, egymástól független mentés/reload miatt
  // kétszer frissül, mielőtt az ELSŐ resolveUrl() válasza megérkezne, enélkül a
  // lenti effect ÚJRA elindítana egy resolveUrl()-t ugyanarra a fájlra - a
  // vesztes blob URL-t soha senki nem revoke()-olná (permanens szivárgás).
  private readonly inFlightResolveKeys = new Set<string>();

  readonly officeTasks = computed(() => (this.store.selectedDetail()?.tasks ?? []).filter((t) => isOfficeTask(t)));

  /** A feladatsor-szintű fájlok; egy (még meglévő) feladathoz kötött fájl a feladat saját blokkjában jelenik meg. */
  readonly taskSetFiles = computed(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return [];
    const taskIds = new Set(detail.tasks.map((t) => t.id));
    return detail.files.filter((f) => f.taskId == null || !taskIds.has(f.taskId));
  });

  /** A „Fájlok” lista: a feladatsor-szintűek + a nem irodai feladatokhoz kötöttek (pl. katalógus-másolat feladatonkénti sémája) -
   *  ezeknek nincs saját blokkja, különben láthatatlanok lennének. */
  readonly listedFiles = computed(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return [];
    const officeIds = new Set(this.officeTasks().map((t) => t.id));
    return detail.files.filter((f) => f.taskId == null || !officeIds.has(f.taskId));
  });

  fileTaskLabel(file: TeacherFileDto): string {
    const task = file.taskId == null ? null : this.store.selectedDetail()?.tasks.find((t) => t.id === file.taskId);
    return task ? ` · ${task.taskOrder}. feladat` : '';
  }

  readonly sqlTasks = computed(() => (this.store.selectedDetail()?.tasks ?? []).filter((t) => isSqlTask(t)));

  isSchemaKind(kind: TeacherFileKind): boolean {
    return kind === 'CreateSql' || kind === 'CreateLiteSql';
  }

  /** Van feladathoz kötött create.sql / create_lite.sql: ekkor a séma feladatonként él, a feltöltésnek feladatot kell céloznia
   *  (feladatsor-szintű feltöltés az összes azonos fajtájú sémát lecserélné). Egy sémás feladatsoron minden marad a régiben. */
  readonly taskBoundSchema = computed(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return false;
    const taskIds = new Set(detail.tasks.map((t) => t.id));
    return detail.files.some((f) => this.isSchemaKind(f.kind) && f.taskId != null && taskIds.has(f.taskId));
  });

  /** Feladatonkénti sémánál a feltöltés / elkészítés célfeladata (egyetlen SQL-feladatnál automatikusan az). */
  readonly schemaTaskChoice = signal<number | null>(null);
  readonly schemaTaskId = computed(() => {
    const chosen = this.schemaTaskChoice();
    const tasks = this.sqlTasks();
    if (chosen !== null && tasks.some((t) => t.id === chosen)) return chosen;
    return tasks.length === 1 ? tasks[0].id : null;
  });

  taskFiles(taskId: number, kind: TeacherFileKind): TeacherFileDto[] {
    return (this.store.selectedDetail()?.files ?? []).filter((f) => f.taskId === taskId && f.kind === kind);
  }

  /** A „Hiányzó SQL-fájl elkészítése” párbeszédablak; feladatonkénti sémánál a célfeladattal. */
  readonly sqlGenerationOpen = signal(false);
  readonly sqlGenerationTaskId = signal<number | null>(null);

  /** A generátor a célfeladat fájljait látja (feladatsor-szintű + a feladathoz kötött); egy sémás feladatsoron a régi listát. */
  readonly sqlGenerationFiles = computed(() => {
    const taskId = this.sqlGenerationTaskId();
    if (taskId === null) return this.taskSetFiles();
    return (this.store.selectedDetail()?.files ?? []).filter((f) => f.taskId == null || f.taskId === taskId);
  });

  /** `contextTaskId`: egy feladatból (pl. az SQL-lekérdezések ablakából) nyitva annak a feladatnak a sémája készül. */
  openSqlGeneration(contextTaskId: number | null): void {
    if (!this.taskBoundSchema()) {
      this.sqlGenerationTaskId.set(null);
    } else {
      const taskId = contextTaskId ?? this.schemaTaskId();
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

  /** A görgetés a következő renderelés után fut (a blokk / feladat épp most nyílt ki). */
  private scrollTo(elementId: string, focusId: string | null = null, inner: string | null = null): void {
    setTimeout(() => {
      const container = document.getElementById(elementId);
      const target = (inner ? container?.querySelector(inner) : null) ?? container;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
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
        if (this.inFlightResolveKeys.has(key)) continue;

        this.inFlightResolveKeys.add(key);
        this.authorizedFileService.resolveUrl(this.apiOrigin + file.url).pipe(takeUntilDestroyed(this.destroyRef)).subscribe((url) => {
          this.inFlightResolveKeys.delete(key);
          this.resolvedDownloadUrls.update((current) => ({ ...current, [key]: url }));
        });
      }
    });

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

  ngOnDestroy(): void {
    for (const url of Object.values(this.resolvedDownloadUrls())) {
      this.authorizedFileService.revoke(url);
    }
  }

  /** A PDF a böngészőben nyílik meg (új lapon, előnézetnek), minden más fájl az eredeti nevén töltődik le. */
  isPdf(file: TeacherFileDto): boolean {
    return file.originalFileName.toLowerCase().endsWith('.pdf');
  }

  downloadHref(file: TeacherFileDto): string {
    return this.resolvedDownloadUrls()[file.id] ?? this.apiOrigin + file.url;
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.store.loadDetail(id);
    this.groupStore.loadMine();
    this.loadAssignments(id);
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

  private loadAssignments(taskSetId: number): void {
    this.assignmentsLoading.set(true);
    this.assignmentsError.set(null);
    this.taskSetService.getTaskSetAssignments(taskSetId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.assignments.set(list);
        this.assignmentsLoading.set(false);
      },
      error: (err) => {
        this.assignmentsError.set(extractErrorMessage(err));
        this.assignmentsLoading.set(false);
      },
    });
  }

  assign(taskSetId: number): void {
    if (this.assignForm.invalid || this.store.loading()) return;

    const raw = this.assignForm.getRawValue();
    this.taskSetService
      .assignToGroup(taskSetId, {
        groupId: Number(raw.groupId),
        opensAt: raw.opensAt ? new Date(raw.opensAt).toISOString() : null,
        dueAt: raw.dueAt ? new Date(raw.dueAt).toISOString() : null,
        isTest: raw.isTest,
        timeLimitMinutes: raw.isTest ? Number(raw.timeLimitMinutes) : null,
      })
      .subscribe({
        next: (dto) => {
          this.assignments.update((list) => [dto, ...list]);
          this.assignForm.reset();
          this.toastService.success(dto.isTest ? 'Dolgozat kiadva.' : 'Feladatsor kiadva.');
        },
        error: (err) => this.toastService.danger(extractErrorMessage(err)),
      });
  }

  async revokeAssignment(assignmentId: number): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Kiadás visszavonása',
      message: 'A diákok nem indíthatják többé. A már megkezdett vizsgamunkamenetek megmaradnak.',
      confirmLabel: 'Visszavonás',
      cancelLabel: 'Mégsem',
      danger: true,
    });
    if (!confirmed) return;

    this.taskSetService.revokeAssignment(assignmentId).subscribe({
      next: () => {
        this.assignments.update((list) =>
          list.map((a) => (a.id === assignmentId ? { ...a, revokedAt: new Date().toISOString() } : a)),
        );
        this.toastService.success('Kiadás visszavonva.');
      },
      error: (err) => this.toastService.danger(extractErrorMessage(err)),
    });
  }

  uploadFile(taskSetId: number, kind: TeacherFileKind, event: Event): void {
    // UI-TT-123: az addTask()/addSubTask() UI-TT-115 mintáját követve — dupla-kattintás/
    // gyors egymás-utáni fájlválasztás elleni idempotencia guard, amíg az első feltöltés
    // még folyamatban van (store.loading()).
    if (this.store.loading()) return;

    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // Feladatonkénti sémánál a feltöltés a kiválasztott feladaté (különben minden feladat azonos fajtájú sémája lecserélődne).
    const taskId = this.isSchemaKind(kind) && this.taskBoundSchema() ? this.schemaTaskId() : null;
    if (this.isSchemaKind(kind) && this.taskBoundSchema() && taskId === null) {
      this.toastService.warning('Előbb válaszd ki, melyik feladathoz tartozik a fájl.');
      input.value = '';
      return;
    }
    this.store.uploadFile(taskSetId, kind, file, taskId ?? undefined, () => this.toastService.success('Fájl feltöltve.'));
    input.value = '';
  }

  /**
   * Irodai forrás-/megoldásfájlok egy feladathoz. A kiterjesztést és a méretet itt is
   * ellenőrizzük (a backend is), hogy a tanár ne egy elutasított kérésből tudja meg - a nem
   * megfelelő fájlokat kihagyjuk és megnevezzük, a többit feltöltjük.
   */
  uploadOfficeFiles(taskSetId: number, taskId: number, kind: TeacherFileKind, event: Event): void {
    if (this.store.loading()) return;
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0) return;

    const allowed = new Set(OFFICE_FILE_ACCEPT.split(','));
    const extension = (name: string) => (name.includes('.') ? name.slice(name.lastIndexOf('.')).toLowerCase() : '');
    const rejected = files.filter((f) => !allowed.has(extension(f.name)) || f.size > OFFICE_FILE_MAX_BYTES);
    if (rejected.length > 0) {
      this.toastService.warning(
        `Kihagyva (nem elfogadott típus vagy 20 MB fölött): ${rejected.map((f) => f.name).join(', ')}`,
        6000,
      );
    }
    const accepted = files.filter((f) => !rejected.includes(f));
    if (accepted.length === 0) return;
    this.store.uploadFiles(taskSetId, kind, accepted, taskId, () =>
      this.toastService.success(accepted.length === 1 ? 'Fájl feltöltve.' : `${accepted.length} fájl feltöltve.`),
    );
  }

  async deleteFile(taskSetId: number, fileId: string, fileName: string): Promise<void> {
    // UI-TT-140 (UI-TT-29 testvér-előfordulása) — ld. deleteTask() fenti kommentje.
    const ok = await this.confirmService.ask({
      message: `Biztosan törlöd a(z) "${fileName}" fájlt?`,
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    // UI-TT-115/123 testvér-hiánya — ld. deleteTask() fenti kommentje.
    if (this.store.loading()) return;
    this.store.deleteFile(taskSetId, fileId, () => this.toastService.success('Fájl törölve.'));
  }

  fileKindLabel(kind: TeacherFileKind): string {
    return this.fileKinds.find((k) => k.kind === kind)?.label ?? OTHER_FILE_KIND_LABELS[kind] ?? kind;
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

  async publish(taskSetId: number): Promise<void> {
    // UI-TT-172: a gomb fent már [disabled]-ként letiltva, de billentyűzet/programozott
    // hívás ellen (ugyanaz az elv, mint a fenti _publishing re-entrancy guard) itt is
    // védünk - a szerveroldali publish ezen az állapoton MINDIG elhasalna, feleslegesen
    // mutatva a megerősítő dialógust egy eleve értelmetlen művelet előtt.
    const detail = this.store.selectedDetail();
    if (detail?.takedownAt) return;

    // UI-TT-118: a "Publikálás" gomb [disabled]="... || store.loading()" kötése csak
    // akkor véd, ha Angular change detection lefut a két kattintás ESEMÉNYE közt — egy
    // ugyanabban a JS-tickben lezajló szinkron dupla-hívás ellen nem. Intézményhez NEM
    // kötött tanárnál (schools()===[]) a ConfirmService.ask()-ág (ami a resolver
    // null-ozása miatt "véletlenül" is véd egy átfedő második hívás ellen) teljesen ki
    // van hagyva, ezért itt egy saját, a store-tól független re-entrancy guardra van
    // szükség, hogy egy ilyen szinkron dupla-kattintás ne indítson két store.publish()
    // hívást (ld. TeacherTaskSetStore.publish() saját loading-guardja is, ami a
    // "valódi" HTTP-szintű védelmet adja — ez a guard a fenti korai-visszatérési ágakat
    // is lefedi, amiket a store guardja önmagában nem érne el).
    if (this._publishing) return;
    this._publishing = true;

    // A schoolStore.loadMine() a konstruktorban indul, a taskset-detail betöltésétől
    // FÜGGETLENÜL — ha a publish() a schools() még be-nem-töltött (üres) kezdőállapotán
    // dönt, egy ténylegesen intézményi tagságú tanár megerősítés NÉLKÜL publikálna
    // (UI-TT-47 load-order race). Ezért itt mindig megvárjuk a betöltés lezárását.
    if (this.schoolStore.loading()) {
      await firstValueFrom(this.schoolStoreLoading$.pipe(filter((loading) => !loading), take(1)));
    }

    // UI-TT-110: egy sikertelen schoolStore.loadMine() a loading()-ot ugyanúgy false-ra
    // zárja, mint egy sikeres, de üres eredményű betöltés — a schools() mindkét esetben
    // [] marad. E nélkül az ellenőrzés nélkül ez a két eset MEGKÜLÖNBÖZTETHETETLEN lenne,
    // és egy ténylegesen intézményi tagságú tanár egy átmeneti hiba esetén megerősítés
    // ÉS bármilyen hibajelzés NÉLKÜL azonnal publikálna — pont azt, amit a UI-TT-47 fix
    // meg akart előzni. Amíg a tagság nem eldönthető, NEM publikálunk automatikusan.
    if (this.schoolStore.error()) {
      this.toastService.danger(this.schoolStore.error()!);
      this._publishing = false;
      return;
    }

    // Hiányos automatikus javítás: figyelmeztetünk, de nem tiltjuk a publikálást. Feladat
    // nélkül nincs mit ellenőrizni - ilyenkor await sincs, a fenti szinkron út megmarad.
    if (detail && detail.tasks.length > 0 && !(await this.confirmGradingGaps(detail))) {
      this._publishing = false;
      return;
    }

    if (this.schoolStore.schools().length > 0) {
      const confirmed = await this.confirmService.ask({
        message:
          'Publikálás után az intézményed MINDEN iskolai csoportjának diákjai is elérik ezt a feladatsort (tartalom-megosztás). Folytatod?',
        confirmLabel: 'Publikálás',
      });
      if (!confirmed) {
        this._publishing = false;
        return;
      }
    }
    this.store.publish(taskSetId, () => {
      this._publishing = false;
      this.toastService.success('Feladatsor publikálva.');
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
    const gaps = detail.tasks
      .map((task, i) => ({ task, quality: qualities[i] }))
      .filter((x) => x.quality && x.quality.level !== 'green');
    if (gaps.length === 0) return true;

    const lines = gaps.map(({ task, quality }) => {
      const todos = quality!.checks
        .map((c) => gradingCheckHint(c) ?? (c.ok ? null : c.label))
        .filter((t): t is string => !!t)
        .map((t) => `   – ${t}`);
      return [`• ${task.taskOrder}. ${task.title}: ${gradingQualityHeadline(quality!)}`, ...todos].join('\n');
    });
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
