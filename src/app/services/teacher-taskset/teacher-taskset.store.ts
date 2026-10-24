import { Injectable, signal, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { concat, Observable } from 'rxjs';
import { finalize, take, toArray } from 'rxjs/operators';
import { TeacherTaskSetService } from './teacher-taskset.service';
import {
  CreateTeacherSubTaskRequest,
  CreateTeacherTaskRequest,
  CreateTeacherTaskSetRequest,
  PublishResultDto,
  SnippetDto,
  TeacherTaskSetDetailDto,
  TeacherTaskSetDto,
} from '../../models/teacher-content.model';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { DetailReloadTarget, mutateAndReload, publishAndReload } from '../detail-reload.util';

/**
 * A mutáló metódusok (feladat/megoldás/snippet/fájl) minden sikeres hívás
 * után a teljes feladatsor-részletet újratöltik — a fa mélyen egymásba
 * ágyazott (feladatsor→feladat→megoldás→snippet), a szerver-válaszból való
 * konzisztens újraépítés helyett ez a legkevésbé hibalehetőséges megoldás
 * egy belső, kis-adatmennyiségű eszköznél.
 */
@Injectable({ providedIn: 'root' })
export class TeacherTaskSetStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(TeacherTaskSetService);

  private readonly _taskSets = signal<TeacherTaskSetDto[]>([]);
  private readonly _selectedDetail = signal<TeacherTaskSetDetailDto | null>(null);
  private readonly _publishResult = signal<PublishResultDto | null>(null);
  private readonly _loading = signal(false);
  // UI-TT-166: a `loadMine()` (Feladatsorok LISTA oldal) korábban ugyanazt a `_loading`-ot
  // írta, mint a `loadDetail()`/mutáló metódusok (Szerkesztő oldal) - mivel a store
  // `providedIn: 'root'` (a navigáció nem szakítja meg a háttérben futó HTTP-hívást), a
  // lista oldalról a szerkesztőbe navigálva a korábbi, immár irreleváns `loadMine()`-válasz
  // idő előtt false-ra zárta a szerkesztő MÉG folyamatban lévő `loadDetail()`-jét. A
  // `loadMine()` a `_loading`-gal ellentétben nem is generáció-védett (nincs több egyidejű
  // hívása), ezért itt elég a jelzőt elkülöníteni, nem kell külön számláló.
  private readonly _mineLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  // UI-TT-105: minden sikeres mutáció a `mutateAndReload()`-on át elindít egy SAJÁT
  // `loadDetail()` GET-et. Két gyors egymás utáni mutációnál (pl. egy feladat
  // hozzáadása, majd egy MÁSIK törlése, mielőtt az első reload lefutna) két
  // párhuzamos GET verseng, és ha a RÉGEBBI válasza ér célba utoljára, csendben
  // felülírja a store-t — egy ténylegesen törölt feladat visszatér a szerkesztőbe.
  // Ugyanaz a generációs-számláló minta zárja ki, mint a ReportStore/SchoolStore
  // (UI-TT-148/149) esetében: csak a LEGUTÓBB indított `loadDetail()` válasza
  // érvényesül. A számláló a `loadDetail()`-en ül, mert minden versengő GET ott
  // indul (közvetlen navigáció, `mutateAndReload()` és `publish()` egyaránt).
  private _detailGeneration = 0;

  // UI-TT-156: a generációs-számláló KIZÁRÓLAG a "legutóbb INDÍTOTT loadDetail() nyer"
  // szabályt érvényesíti — magáról a CÉLZOTT feladatsorról semmit nem tud. Mivel a store
  // `providedIn: 'root'` és a `takeUntilDestroyed(this.destroyRef)` a STORE örökké élő
  // DestroyRef-jéhez kötött (nem a szerkesztő-komponenséhez), egy A feladatsoron indított
  // mutáció a SPA-navigáció UTÁN is befut, és a `mutateAndReload()` feltétel nélkül
  // elindítja a SAJÁT `loadDetail(A)`-ját — ami így a legmagasabb generációt kapja, tehát
  // "nyer", és csendben A adatára cseréli a közben megnyitott B feladatsor szerkesztőjét.
  // A sablon minden mutáló gombja `detail.id`-t küld, ezért onnantól MINDEN mentés/
  // publikálás/törlés ténylegesen A-t módosítaná, miközben az URL végig B-t mutatja.
  // Ez a mező tartja nyilván, melyik feladatsor a loader AKTUÁLIS célpontja, hogy egy
  // elhagyott entitás mutációja ne indíthasson újratöltést egy MÁSIK entitás nézetébe.
  private _detailTaskSetId: number | null = null;

  /** A mutáció+újratöltés közös folyamata (`detail-reload.util`) ezen a szeleten dolgozik. */
  private readonly detailReload: DetailReloadTarget = {
    destroyRef: this.destroyRef,
    loading: this._loading,
    error: this._error,
    publishResult: this._publishResult,
    currentId: () => this._detailTaskSetId,
    reload: (id, onSuccess) => this.loadDetail(id, onSuccess),
  };

  readonly taskSets = this._taskSets.asReadonly();
  readonly selectedDetail = this._selectedDetail.asReadonly();
  readonly publishResult = this._publishResult.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly mineLoading = this._mineLoading.asReadonly();
  readonly error = this._error.asReadonly();

  loadMine(): void {
    this._mineLoading.set(true);
    this._error.set(null);

    this.service
      .getMine()
      .pipe(
        take(1),
        finalize(() => this._mineLoading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (taskSets) => this._taskSets.set(taskSets),
        error: (err) => this._error.set(extractErrorMessage(err, 'A feladatsorok betöltése sikertelen.')),
      });
  }

  loadDetail(id: number, onSuccess?: () => void): void {
    // UI-TT-72: MÁSIK feladatsorra navigáláskor a korábban betöltött adatot
    // azonnal törölni kell, különben a válasz megérkezéséig az ELŐZŐ
    // feladatsor adatlapja látszik az ÚJ URL alatt. DE ugyanazon id
    // újratöltésekor (mutateAndReload()/publish() minden sikeres mentés után
    // ide fut vissza) a régi adatot szándékosan megtartjuk - a loading() a
    // UI-TT-45 fix óta ilyenkor is true marad, egy null selectedDetail a
    // sablon @else if (loading()) ágán keresztül a TELJES szerkesztő űrlapot
    // egy spinnerre cserélné minden egyes mentésnél.
    if (this._selectedDetail()?.id !== id) {
      this._selectedDetail.set(null);
    }

    const generation = ++this._detailGeneration;
    this._detailTaskSetId = id;
    this._loading.set(true);
    this._error.set(null);

    this.service
      .getDetail(id)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._detailGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => {
          // Egy elavult reload válasza sem a store-t nem frissítheti, sem az
          // `onSuccess`-t nem sütheti el (az a hívó oldalán toastot/navigációt
          // válthat ki egy már túlhaladott művelet nevében).
          if (generation !== this._detailGeneration) return;
          this._selectedDetail.set(detail);
          if (onSuccess) onSuccess();
        },
        error: (err) => {
          if (generation !== this._detailGeneration) return;
          this._error.set(extractErrorMessage(err, 'A feladatsor betöltése sikertelen.'));
        },
      });
  }

  create(request: CreateTeacherTaskSetRequest, onSuccess?: (taskSet: TeacherTaskSetDto) => void): void {
    this.mutate(this.service.create(request), (taskSet) => {
      this._taskSets.update((list) => [...list, taskSet]);
      if (onSuccess) onSuccess(taskSet);
    });
  }

  updateTaskSet(id: number, request: CreateTeacherTaskSetRequest, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.update(id, request), id, onSuccess);
  }

  deleteTaskSet(id: number, onSuccess?: () => void): void {
    this.mutate(this.service.delete(id), () => {
      this._taskSets.update((list) => list.filter((ts) => ts.id !== id));
      this._selectedDetail.set(null);
      if (onSuccess) onSuccess();
    });
  }

  /**
   * Visszavonas. A reszletet UJRA BETOLTJUK, nem lokalisan irjuk at: a szerver a
   * `publishedSchoolId`-t is nullazza, es egy kezzel frissitett allapot elcsuszna tole.
   */
  unpublish(id: number): void {
    mutateAndReload(this.detailReload, this.service.unpublish(id), id);
  }

  publish(id: number, onSuccess?: () => void): void {
    publishAndReload(this.detailReload, () => this.service.publish(id), id, onSuccess);
  }

  addTask(taskSetId: number, request: CreateTeacherTaskRequest, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.addTask(taskSetId, request), taskSetId, onSuccess);
  }

  updateTask(taskSetId: number, taskId: number, request: CreateTeacherTaskRequest, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.updateTask(taskId, request), taskSetId, onSuccess);
  }

  deleteTask(taskSetId: number, taskId: number, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.deleteTask(taskId), taskSetId, onSuccess);
  }

  addSubTask(taskSetId: number, taskId: number, request: CreateTeacherSubTaskRequest, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.addSubTask(taskId, request), taskSetId, onSuccess);
  }

  updateSubTask(taskSetId: number, solutionId: number, request: CreateTeacherSubTaskRequest, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.updateSubTask(solutionId, request), taskSetId, onSuccess);
  }

  deleteSubTask(taskSetId: number, solutionId: number, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.deleteSubTask(solutionId), taskSetId, onSuccess);
  }

  upsertSubTaskSnippets(taskSetId: number, solutionId: number, snippets: SnippetDto[], onSuccess?: () => void): void {
    if (this._loading()) return;
    mutateAndReload(this.detailReload, this.service.upsertSubTaskSnippets(solutionId, snippets), taskSetId, onSuccess);
  }

  // UI-TT-121 testvér-eset: ez a metódus - a fenti upsertSubTaskSnippets()-szel
  // ellentétben - eddig NEM kapta meg a "már folyamatban van egy kérés" guardot.
  // A guard szándékosan ITT, a mutateAndReload()-hívás ELŐTT fut (nem magába
  // mutateAndReload()-ba központosítva) - a `this.service...(...)` hívás a
  // mutateAndReload(...) argumentumaként AZONNAL, a metódus-hívás pillanatában
  // kiértékelődne (a JS az argumentumokat a hívás előtt kiértékeli), tehát egy
  // mutateAndReload()-on belüli guard már túl későn futna: a service-metódus
  // (és az általa becsomagolt HttpClient-hívás létrehozása) MÁR megtörtént
  // volna, mielőtt a guard blokkolhatná - csak a `.subscribe()` marad el, ami
  // a valós hálózati kérést ELINDÍTÓ lépés (az Angular HttpClient observable-jei
  // "cold"-ak), de a mock/teszt szintjén ez már megkülönböztethetetlen lenne
  // egy ténylegesen elindított második hívástól.
  upsertCompleteSolutionSnippets(taskSetId: number, taskId: number, snippets: SnippetDto[], onSuccess?: () => void): void {
    if (this._loading()) return;
    mutateAndReload(this.detailReload, this.service.upsertCompleteSolutionSnippets(taskId, snippets), taskSetId, onSuccess);
  }

  uploadFile(taskSetId: number, kind: string, file: File, taskId?: number, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.uploadFile(taskSetId, kind, file, taskId), taskSetId, onSuccess);
  }

  /**
   * Több fájl egy feladathoz (irodai forrásfájlok): egymás UTÁN töltjük fel, és csak a
   * végén töltjük újra a feladatsort - párhuzamos feltöltéseknél minden válasz külön
   * újratöltést indítana. Az első hibánál megáll; a már feltöltött fájlok megmaradnak.
   */
  uploadFiles(taskSetId: number, kind: string, files: File[], taskId?: number, onSuccess?: () => void): void {
    if (this._loading() || files.length === 0) return;
    const uploads = concat(...files.map((file) => this.service.uploadFile(taskSetId, kind, file, taskId)));
    mutateAndReload(this.detailReload, uploads.pipe(toArray()), taskSetId, onSuccess);
  }

  deleteFile(taskSetId: number, fileId: string, onSuccess?: () => void): void {
    mutateAndReload(this.detailReload, this.service.deleteFile(fileId), taskSetId, onSuccess);
  }

  clearError(): void {
    this._error.set(null);
  }

  clearPublishResult(): void {
    this._publishResult.set(null);
  }

  private mutate<T>(observable: Observable<T>, onSuccess: (value: T) => void): void {
    this._loading.set(true);
    this._error.set(null);

    observable
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: onSuccess,
        error: (err) => this._error.set(extractErrorMessage(err, 'A művelet sikertelen.')),
      });
  }
}
