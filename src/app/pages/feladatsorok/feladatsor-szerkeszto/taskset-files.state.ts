import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { environment } from '../../../../environments/environment';
import { TeacherFileDto, TeacherFileKind } from '../../../models/teacher-content.model';
import { AuthorizedFileService } from '../../../services/file/authorized-file.service';
import { TeacherTaskSetStore } from '../../../services/teacher-taskset/teacher-taskset.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { isOfficeTask, isSqlTask } from './task-types';

/** Irodai feladat forrás- és megoldásfájljai (szerződés: TANARI-SZEMPONTLISTA-API.md, F). */
export const OFFICE_FILE_ACCEPT = '.docx,.xlsx,.pptx,.odt,.ods,.odp,.txt,.csv,.png,.jpg,.jpeg,.gif,.svg,.html,.css';
const OFFICE_FILE_MAX_BYTES = 20 * 1024 * 1024;

export const FILE_KINDS: { kind: TeacherFileKind; label: string; accept: string }[] = [
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

export function isSchemaKind(kind: TeacherFileKind): boolean {
  return kind === 'CreateSql' || kind === 'CreateLiteSql';
}

/**
 * A feladatsor-szerkesztő „Fájlok” része: a fájllisták, a feladatonkénti séma célfeladata, a feltöltés / törlés és a
 * letöltő linkek blob URL-jei. A szerkesztő komponens adja (`providers`), mert a „Hiányzó SQL-fájl elkészítése” (a
 * szerkesztőben) is a séma célfeladatából és a feladatsor-szintű fájlokból dolgozik.
 */
@Injectable()
export class TaskSetFilesState {
  private readonly store = inject(TeacherTaskSetStore);
  private readonly authorizedFileService = inject(AuthorizedFileService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = this.store.loading;

  // UI-TT-27: az API origóját a ténylegesen konfigurált environment.apiUrl-ból kell
  // levezetni, nem a jelenlegi böngésző-origóból "sejteni" — utóbbi csak véletlenül
  // esett egybe a backenddel azokon a topológiákon, ahol az /api/ proxyzva van.
  readonly apiOrigin = new URL(environment.apiUrl).origin;

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

  readonly sqlTasks = computed(() => (this.store.selectedDetail()?.tasks ?? []).filter((t) => isSqlTask(t)));

  /** Van feladathoz kötött create.sql / create_lite.sql: ekkor a séma feladatonként él, a feltöltésnek feladatot kell céloznia
   *  (feladatsor-szintű feltöltés az összes azonos fajtájú sémát lecserélné). Egy sémás feladatsoron minden marad a régiben. */
  readonly taskBoundSchema = computed(() => {
    const detail = this.store.selectedDetail();
    if (!detail) return false;
    const taskIds = new Set(detail.tasks.map((t) => t.id));
    return detail.files.some((f) => isSchemaKind(f.kind) && f.taskId != null && taskIds.has(f.taskId));
  });

  /** Feladatonkénti sémánál a feltöltés / elkészítés célfeladata (egyetlen SQL-feladatnál automatikusan az). */
  readonly schemaTaskChoice = signal<number | null>(null);
  readonly schemaTaskId = computed(() => {
    const chosen = this.schemaTaskChoice();
    const tasks = this.sqlTasks();
    if (chosen !== null && tasks.some((t) => t.id === chosen)) return chosen;
    return tasks.length === 1 ? tasks[0].id : null;
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

    this.destroyRef.onDestroy(() => {
      for (const url of Object.values(this.resolvedDownloadUrls())) {
        this.authorizedFileService.revoke(url);
      }
    });
  }

  taskFiles(taskId: number, kind: TeacherFileKind): TeacherFileDto[] {
    return (this.store.selectedDetail()?.files ?? []).filter((f) => f.taskId === taskId && f.kind === kind);
  }

  fileTaskLabel(file: TeacherFileDto): string {
    const task = file.taskId == null ? null : this.store.selectedDetail()?.tasks.find((t) => t.id === file.taskId);
    return task ? ` · ${task.taskOrder}. feladat` : '';
  }

  fileKindLabel(kind: TeacherFileKind): string {
    return FILE_KINDS.find((k) => k.kind === kind)?.label ?? OTHER_FILE_KIND_LABELS[kind] ?? kind;
  }

  /** A PDF a böngészőben nyílik meg (új lapon, előnézetnek), minden más fájl az eredeti nevén töltődik le. */
  isPdf(file: TeacherFileDto): boolean {
    return file.originalFileName.toLowerCase().endsWith('.pdf');
  }

  downloadHref(file: TeacherFileDto): string {
    return this.resolvedDownloadUrls()[file.id] ?? this.apiOrigin + file.url;
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
    const taskId = isSchemaKind(kind) && this.taskBoundSchema() ? this.schemaTaskId() : null;
    if (isSchemaKind(kind) && this.taskBoundSchema() && taskId === null) {
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
    // UI-TT-140 (UI-TT-29 testvér-előfordulása): megerősítés a véletlen kattintás ellen.
    const ok = await this.confirmService.ask({
      message: `Biztosan törlöd a(z) "${fileName}" fájlt?`,
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    // UI-TT-115/123 testvér-hiánya: a megerősítő dialógus alatt egy másik mutáció elindulhatott.
    if (this.store.loading()) return;
    this.store.deleteFile(taskSetId, fileId, () => this.toastService.success('Fájl törölve.'));
  }
}
